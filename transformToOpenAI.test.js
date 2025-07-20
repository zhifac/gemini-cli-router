import { describe, it, expect } from 'vitest';
import { transformToOpenAI } from './transformToOpenAI.js';

describe('transformToOpenAI', () => {
  const defaultConfig = {
    model: 'gpt-4',
  };

  it('should transform a simple text message', () => {
    const geminiRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello, world!' }],
        },
      ],
    };

    const openAIRequest = transformToOpenAI(geminiRequest, false, defaultConfig);

    expect(openAIRequest.messages).toEqual([
      {
        role: 'user',
        content: 'Hello, world!',
      },
    ]);
    expect(openAIRequest.model).toBe('gpt-4');
  });

  it('should handle multiple messages and roles', () => {
    const geminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: 'First message' }] },
        { role: 'model', parts: [{ text: 'Second message' }] },
      ],
    };

    const openAIRequest = transformToOpenAI(geminiRequest, false, defaultConfig);

    expect(openAIRequest.messages).toEqual([
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Second message' },
    ]);
  });

  it('should handle system instructions', () => {
    const geminiRequest = {
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello!' }],
        },
      ],
    };

    const openAIRequest = transformToOpenAI(geminiRequest, false, defaultConfig);

    expect(openAIRequest.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(openAIRequest.messages[1]).toEqual({
      role: 'user',
      content: 'Hello!',
    });
  });
});