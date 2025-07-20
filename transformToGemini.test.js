import { describe, it, expect } from 'vitest';
import { transformToGemini } from './transformToGemini.js';

describe('transformToGemini', () => {
  it('should transform a simple text response', () => {
    const openAIResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello from OpenAI!',
          },
          finish_reason: 'stop',
        },
      ],
    };

    const geminiResponse = transformToGemini(openAIResponse);

    expect(geminiResponse.candidates[0].content.parts).toEqual([
      { text: 'Hello from OpenAI!' },
    ]);
    expect(geminiResponse.candidates[0].finishReason).toBe('STOP');
  });

  it('should handle tool calls', () => {
    const openAIResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'tool123',
                type: 'function',
                function: {
                  name: 'my_function',
                  arguments: '{"arg1": "value1"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };

    const geminiResponse = transformToGemini(openAIResponse);

    expect(geminiResponse.candidates[0].content.parts[0].functionCall).toEqual({
      id: 'tool123',
      name: 'my_function',
      args: { arg1: 'value1' },
    });
    expect(geminiResponse.candidates[0].finishReason).toBe('tool_calls');
  });

  it('should handle JSON output from a tool call', () => {
    const openAIResponse = {
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            tool_calls: [
              {
                function: {
                  name: 'json_output',
                  arguments: '{"key": "value"}',
                },
              },
            ],
          },
        },
      ],
    };

    const geminiResponse = transformToGemini(openAIResponse);

    expect(geminiResponse.candidates[0].content.parts).toEqual([
      { text: '{"key": "value"}' },
    ]);
    expect(geminiResponse.candidates[0].finishReason).toBe('STOP');
  });
});