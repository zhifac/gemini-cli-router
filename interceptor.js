import { loadConfig } from './config.js';
import { logRequestDetails, logError } from './logger.js';
import { encode } from 'gpt-tokenizer';
import { transformToOpenAI } from './transformToOpenAI.js';
import { transformToGemini } from './transformToGemini.js';
import { isGeminiAPI } from './utils.js';

const config = loadConfig();

async function* streamGenerator(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedToolCalls = {}; // State for accumulating tool call chunks
    let rawOpenAIStreamResponse = '';
    let transformedGeminiStreamResponse = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        rawOpenAIStreamResponse += chunk;
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.substring(6);
                if (data.trim() === '[DONE]') {
                    logRequestDetails('Raw OpenAI Stream Response', { body: rawOpenAIStreamResponse });
                    logRequestDetails('Transformed Gemini Stream Response', { body: transformedGeminiStreamResponse });

                    if (exitAfterStream) {
                        console.log('[Proxy] First stream complete. Exiting as requested.');
                        process.exit(0);
                    }
                    return;
                }

                try {
                    const json = JSON.parse(data);
                    const delta = json.choices && json.choices[0] ? json.choices[0].delta : null;

                    if (!delta) continue;

                    let geminiChunk = null;

                    // Handle regular text content
                    if (delta.content) {
                        geminiChunk = transformToGemini(json);
                    }

                    // Accumulate tool call chunks
                    if (delta.tool_calls) {
                        for (const toolCallDelta of delta.tool_calls) {
                            const index = toolCallDelta.index;
                            if (!accumulatedToolCalls[index]) {
                                accumulatedToolCalls[index] = { function: {} };
                            }
                            if (toolCallDelta.id) {
                                accumulatedToolCalls[index].id = toolCallDelta.id;
                            }
                            if (toolCallDelta.function.name) {
                                accumulatedToolCalls[index].function.name = toolCallDelta.function.name;
                            }
                            if (toolCallDelta.function.arguments) {
                                if (!accumulatedToolCalls[index].function.arguments) {
                                    accumulatedToolCalls[index].function.arguments = '';
                                }
                                accumulatedToolCalls[index].function.arguments += toolCallDelta.function.arguments;
                            }
                        }
                    }

                    // Check if the final message with tool_calls is received
                    const finishReason = json.choices && json.choices[0] ? json.choices[0].finish_reason : null;
                    if (finishReason === 'tool_calls') {
                        const parts = Object.values(accumulatedToolCalls).map(completeToolCall => ({
                            functionCall: {
                                id: completeToolCall.id,
                                name: completeToolCall.function.name,
                                args: JSON.parse(completeToolCall.function.arguments || '{}')
                            }
                        }));

                        geminiChunk = {
                            candidates: [{
                                content: {
                                    parts: parts,
                                    role: 'model'
                                },
                                finishReason: 'TOOL_CALLS'
                            }]
                        };
                        accumulatedToolCalls = {}; // Reset for next message
                    }

                    if (geminiChunk) {
                        const geminiString = `data: ${JSON.stringify(geminiChunk)}\n\n`;
                        transformedGeminiStreamResponse += geminiString;
                        yield geminiString;
                    }

                } catch (error) {
                    console.error('Error parsing OpenAI stream data:', error);
                }
            }
        }
    }
}

const passthrough = process.env.GEMINI_PROXY_PASSTHROUGH === 'true';
const exitAfterStream = process.env.GEMINI_PROXY_EXIT_AFTER_STREAM === 'true';

function instrumentFetch() {
  if (!global.fetch || global.fetch.__geminiOpenAIProxyInstrumented) return;

  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!isGeminiAPI(url)) {
      return originalFetch(input, init);
    }

    // Passthrough mode: log and forward without transformation
    if (passthrough) {
        logRequestDetails('Original Gemini Request (Passthrough)', { url, headers: init.headers, body: init.body });
        const response = await originalFetch(input, init);
        const responseClone = response.clone();
        const responseBody = await responseClone.text();
        logRequestDetails('Raw Gemini Response (Passthrough)', { headers: response.headers, body: responseBody });
        return response;
    }

    // Gracefully bypass the countTokens endpoint
    if (url.endsWith(':countTokens')) {
        console.warn('[Proxy] The countTokens endpoint is not supported, providing an estimated token count.');
        const geminiRequest = JSON.parse(init.body);
        const textToTokenize = geminiRequest.contents.map(c => c.parts.map(p => p.text || '').join('')).join('\n');
        const tokenCount = encode(textToTokenize).length;
        logRequestDetails('estimated token counts', { body: { totalTokens: tokenCount } });
        return new Response(JSON.stringify({ totalTokens: tokenCount }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const isStream = url.includes(':streamGenerateContent');

    console.log('Intercepted Gemini API request:', url);

    logRequestDetails('Original Gemini Request', { url, headers: init.headers, body: init.body });

    const geminiRequest = JSON.parse(init.body);
    const openAIRequest = transformToOpenAI(geminiRequest, isStream, config);

    let requestUrl;
    let headers;

    if (config.is_azure) {
        // Azure OpenAI uses a different URL structure and auth header
        const baseUrl = config.base_url.endsWith('/') ? config.base_url.slice(0, -1) : config.base_url;
        requestUrl = `${baseUrl}/openai/deployments/${config.azure_deployment_name}/chat/completions?api-version=${config.azure_api_version}`;
        headers = {
            'Content-Type': 'application/json',
            'api-key': config.api_key,
        };
    } else {
        // Standard OpenAI/compatible API
        requestUrl = config.base_url;
        headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.api_key}`,
        };
    }

    logRequestDetails('Transformed OpenAI Request', { url: requestUrl, headers, body: openAIRequest });

    const response = await originalFetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(openAIRequest),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        logError('OpenAI API Error Response', {
            status: response.status,
            statusText: response.statusText,
            body: errorBody,
            request_body: openAIRequest
        });
        console.error(`[Proxy] Error from downstream API: ${response.status} ${response.statusText}`);
        console.error(`[Proxy] See gemini-cli-router.log for full error details.`);
        throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }

    if (isStream) {
        const transformedStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                for await (const chunk of streamGenerator(response.body)) {
                    controller.enqueue(encoder.encode(chunk));
                }
                controller.close();
            }
        });

        return new Response(transformedStream, {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
        });

    } else {
        const openAIResponse = await response.json();
        logRequestDetails('Raw OpenAI Response', { body: openAIResponse });

        const geminiResponse = transformToGemini(openAIResponse);
        logRequestDetails('Transformed Gemini Response', { body: geminiResponse });

        return new Response(JSON.stringify(geminiResponse), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
        });
    }
  };
  global.fetch.__geminiOpenAIProxyInstrumented = true;
}

instrumentFetch();