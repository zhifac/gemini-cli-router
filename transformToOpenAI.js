import { convertSchemaTypesToLowercase } from "./utils.js";

export function transformToOpenAI(geminiRequest, isStream, config) {
  const messages = geminiRequest.contents.flatMap((content) => {
    const role = content.role === "model" ? "assistant" : "user";
    const parts = content.parts;

    // Case 1: The user is providing the result of a tool call.
    const functionResponsePart = parts.find((p) => p.functionResponse);
    if (role === "user" && functionResponsePart) {
      return {
        role: "tool",
        tool_call_id: functionResponsePart.functionResponse.id,
        name: functionResponsePart.functionResponse.name,
        content: JSON.stringify(functionResponsePart.functionResponse.response),
      };
    }

    // Case 2: The model is requesting a tool call.
    const functionCallParts = parts.filter((p) => p.functionCall);
    if (role === "assistant" && functionCallParts.length > 0) {
      return {
        role: "assistant",
        content: null,
        tool_calls: functionCallParts.map((p) => ({
          id: p.functionCall.id || `tool_call_${Date.now()}`,
          type: "function",
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(p.functionCall.args || {}),
          },
        })),
      };
    }

    // Case 3: Standard text/image message.
    const openAIContent = parts
      .map((part) => {
        if (part.text) {
          return { type: "text", text: part.text };
        }
        if (part.inlineData) {
          return {
            type: "image_url",
            image_url: {
              url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            },
          };
        }
        return null;
      })
      .filter(Boolean);

    if (openAIContent.length === 0) {
      return { role, content: "" };
    }

    return {
      role,
      content:
        openAIContent.length === 1 && openAIContent[0].type === "text"
          ? openAIContent[0].text
          : openAIContent,
    };
  });

  if (geminiRequest.systemInstruction) {
    const systemText = geminiRequest.systemInstruction.parts
      .map((p) => p.text)
      .join("\n");
    messages.unshift({ role: "system", content: systemText });
  }

  const openAIRequest = {
    model: config.model,
    messages: messages,
    stream: isStream,
  };

  if (geminiRequest.generationConfig) {
    const gc = geminiRequest.generationConfig;
    if (gc.maxOutputTokens) openAIRequest.max_tokens = gc.maxOutputTokens;
    if (gc.temperature) {
        openAIRequest.temperature = gc.temperature;
    } else if (gc.temperature === 0) {
        openAIRequest.temperature = 0;
    }
    if (gc.topP) {
        openAIRequest.top_p = gc.topP;
    } else if (gc.topP === 0) {
        openAIRequest.top_p = 0;
    }
    if (gc.topK) {
        openAIRequest.top_k = gc.topK;
    } else if (gc.topK === 0) {
        openAIRequest.top_k = 0;
    }
    if (gc.responseMimeType === "application/json" && gc.responseSchema) {
      openAIRequest.response_format = { type: "json_object" };
      const convertedSchema = convertSchemaTypesToLowercase(gc.responseSchema);
      openAIRequest.tools = [
        {
          type: "function",
          function: {
            name: "json_output",
            description:
              "Format the output as a JSON object matching the provided schema.",
            parameters: convertedSchema,
          },
        },
      ];
      openAIRequest.tool_choice = {
        type: "function",
        function: { name: "json_output" },
      };
    }
  }

  if (geminiRequest.tools) {
    const convertedTools = geminiRequest.tools.flatMap((tool) =>
      tool.functionDeclarations.map((declaration) => ({
        type: "function",
        function: convertSchemaTypesToLowercase(declaration),
      }))
    );
    openAIRequest.tools = (openAIRequest.tools || []).concat(convertedTools);
  }

  if (geminiRequest.tool_config) {
    openAIRequest.tool_choice = geminiRequest.tool_config.mode;
  }

  if (config.enable_thinking) {
    openAIRequest.thinking = true;
  }

  return openAIRequest;
}