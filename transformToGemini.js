export function transformToGemini(openAIResponse) {
    const choice = openAIResponse.choices && openAIResponse.choices[0] ? openAIResponse.choices[0] : null;
    const message = choice ? (choice.message || choice.delta) : null;
    let finishReason = openAIResponse.StopReason || (choice ? choice.finish_reason : 'stop');
    if (finishReason === 'stop') {
      finishReason = 'STOP';
    }

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