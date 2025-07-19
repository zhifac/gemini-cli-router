import { loadConfig } from './config.js';
import { logRequestDetails } from './logger.js';
import { encode } from 'gpt-tokenizer';

const config = loadConfig();

function convertSchemaTypesToLowercase(schema) {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map(item => convertSchemaTypesToLowercase(item));
  }

  const newSchema = { ...schema };

  if (typeof newSchema.type === 'string') {
    newSchema.type = newSchema.type.toLowerCase();
  }

  if (newSchema.properties) {
    const newProperties = {};
    for (const key in newSchema.properties) {
      newProperties[key] = convertSchemaTypesToLowercase(newSchema.properties[key]);
    }
    newSchema.properties = newProperties;
  }

  if (newSchema.items) {
    newSchema.items = convertSchemaTypesToLowercase(newSchema.items);
  }

  if (newSchema.parameters) {
      newSchema.parameters = convertSchemaTypesToLowercase(newSchema.parameters);
  }

  return newSchema;
}

function isGeminiAPI(url) {
  return url.includes('generativelanguage.googleapis.com');
}

function transformToOpenAI(geminiRequest, isStream) {
    const messages = geminiRequest.contents.flatMap(content => {
        const role = content.role === 'model' ? 'assistant' : 'user';
        const parts = content.parts;

        // Case 1: The user is providing the result of a tool call.
        const functionResponsePart = parts.find(p => p.functionResponse);
        if (role === 'user' && functionResponsePart) {
            return {
                role: 'tool',
                tool_call_id: functionResponsePart.functionResponse.id,
                name: functionResponsePart.functionResponse.name,
                content: JSON.stringify(functionResponsePart.functionResponse.response),
            };
        }

        // Case 2: The model is requesting a tool call.
        const functionCallParts = parts.filter(p => p.functionCall);
        if (role === 'assistant' && functionCallParts.length > 0) {
            return {
                role: 'assistant',
                content: null,
                tool_calls: functionCallParts.map(p => ({
                    id: p.functionCall.id || `tool_call_${Date.now()}`,
                    type: 'function',
                    function: {
                        name: p.functionCall.name,
                        arguments: JSON.stringify(p.functionCall.args || {}),
                    },
                })),
            };
        }

        // Case 3: Standard text/image message.
        const openAIContent = parts.map(part => {
            if (part.text) {
                return { type: 'text', text: part.text };
            }
            if (part.inlineData) {
                return {
                    type: 'image_url',
                    image_url: {
                        url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                    },
                };
            }
            return null;
        }).filter(Boolean);

        if (openAIContent.length === 0) {
            return { role, content: "" };
        }

        return {
            role,
            content: openAIContent.length === 1 && openAIContent[0].type === 'text' ? openAIContent[0].text : openAIContent,
        };
    });

    if (geminiRequest.systemInstruction) {
        const systemText = geminiRequest.systemInstruction.parts.map(p => p.text).join('\n');
        if (false && config.is_claude) {
            geminiRequest.system = systemText;
        } else {
            messages.unshift({ role: 'system', content: systemText });
        }
    }

    const openAIRequest = {
        model: config.model,
        messages: messages,
        stream: isStream,
    };

    if (geminiRequest.generationConfig) {
        const gc = geminiRequest.generationConfig;
        if (gc.maxOutputTokens) openAIRequest.max_tokens = gc.maxOutputTokens;
        if (gc.temperature) openAIRequest.temperature = gc.temperature;
        if (gc.topP) openAIRequest.top_p = gc.topP;
        if (gc.topK) openAIRequest.top_k = gc.topK;
        if (gc.responseMimeType === 'application/json' && gc.responseSchema) {
            openAIRequest.response_format = { type: 'json_object' };
            const convertedSchema = convertSchemaTypesToLowercase(gc.responseSchema);
            openAIRequest.tools = [{
                type: 'function',
                function: {
                    name: 'json_output',
                    description: 'Format the output as a JSON object matching the provided schema.',
                    parameters: convertedSchema
                }
            }];
            openAIRequest.tool_choice = { type: 'function', function: { name: 'json_output' } };
        }
    }

    if (geminiRequest.tools) {
        if (false && config.is_claude) {
            openAIRequest.tools = geminiRequest.tools.flatMap(tool => 
                tool.functionDeclarations.map(declaration => ({
                    name: declaration.name,
                    description: declaration.description,
                    input_schema: convertSchemaTypesToLowercase(declaration.parameters)
                }))
            );
        } else {
            const convertedTools = geminiRequest.tools.flatMap(tool => 
                tool.functionDeclarations.map(declaration => ({
                    type: 'function',
                    function: convertSchemaTypesToLowercase(declaration)
                }))
            );
            openAIRequest.tools = (openAIRequest.tools || []).concat(convertedTools);
        }
    }
    
    if (geminiRequest.tool_config) {
        openAIRequest.tool_choice = geminiRequest.tool_config.mode;
    }

    if (config.enable_thinking) {
        openAIRequest.thinking = true;
    }

    return openAIRequest;
}

function transformToGemini(openAIResponse) {
    const choice = openAIResponse.choices && openAIResponse.choices[0] ? openAIResponse.choices[0] : null;
    const message = choice ? (choice.message || choice.delta) : null;
    let finishReason = openAIResponse.StopReason || (choice ? choice.finish_reason : 'STOP');

    let parts = [];

    // Check for the special json_output tool call case first
    if (choice && choice.finish_reason === 'tool_calls' && message && message.tool_calls) {
        const jsonOutputCall = message.tool_calls.find(tc => tc.function.name === 'json_output');
        if (jsonOutputCall) {
            // This is a forced JSON response. Extract the arguments as the text content.
            parts.push({ text: jsonOutputCall.function.arguments });
            // The actual finish reason should be STOP, as we've fulfilled the JSON requirement.
            finishReason = 'STOP';
        } else {
            // This is a regular tool call, not for JSON output.
            message.tool_calls.forEach(toolCall => {
                parts.push({
                    functionCall: {
                        id: toolCall.id,
                        name: toolCall.function.name,
                        args: JSON.parse(toolCall.function.arguments || '{}')
                    }
                });
            });
        }
    } else if (message && message.content) {
        // Standard text response
        parts.push({ text: message.content });
    }

    // If after all checks, parts is still empty, ensure a valid structure.
    if (parts.length === 0) {
        parts.push({ text: '' });
    }

    const geminiResponse = {
        candidates: [{
            content: {
                parts: parts,
                role: 'model'
            },
            finishReason: finishReason,
        }]
    };

    if (openAIResponse.usage) {
        geminiResponse.usageMetadata = {
            promptTokenCount: openAIResponse.usage.prompt_tokens,
            candidatesTokenCount: openAIResponse.usage.completion_tokens,
            totalTokenCount: openAIResponse.usage.total_tokens
        };
    }

    return geminiResponse;
}

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
    const openAIRequest = transformToOpenAI(geminiRequest, isStream);

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
        logRequestDetails('OpenAI API Error Response', {
            status: response.status,
            statusText: response.statusText,
            body: errorBody
        });
        console.error(`[Proxy] Error from downstream API: ${response.status} ${response.statusText}`);
        console.error(`[Proxy] See openai-proxy-debug.log for full error details.`);
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
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