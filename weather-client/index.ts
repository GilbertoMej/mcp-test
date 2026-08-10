import OpenAI from "openai";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources.js";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  throw new Error(
    "OPENROUTER_API_KEY no esta configurada en las variables de entorno.",
  );
}

class MCPClient {
  private mcp: Client;
  private openrouter: OpenAI;
  private transport: StdioClientTransport | null = null;
  private tools: ChatCompletionTool[] = [];

  constructor() {
    this.openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: OPENROUTER_API_KEY,
    });

    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  // Methods will go here

  async connectToServer(serverScriptPath: string) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;

      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description ?? "",
            parameters: tool.inputSchema,
          },
        };
      });
      console.log(
        "Conectado el servidor con las herramientas: ",
        toolsResult.tools.map((tool) => tool.name),
      );
    } catch (e) {
      console.log("La conexion con el servidor MCP ha fallado: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: query,
      },
    ];

    // 1. Initial call to the model
    const response = await this.openrouter.chat.completions.create({
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      messages,
      // Only pass the tools array if it's not empty to avoid API errors
      ...(this.tools.length > 0 && { tools: this.tools }),
    });

    const message = response.choices[0]?.message;
    if (!message) {
      throw new Error("No message returned from the model.");
    }

    const finalText: string[] = [];

    // If the model included any direct text response, save it
    if (message.content) {
      finalText.push(message.content);
    }

    // 2. Check if the model decided to use any tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      // CRITICAL: OpenAI requires appending the assistant's tool_call message
      // to the conversation history before appending the results.
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }

        const toolName = toolCall.function.name;
        // OpenAI returns arguments as a JSON string, not a parsed object
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

        // Execute the tool via MCP
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`,
        );

        // Extract the text from the MCP tool result
        const toolResultText = result.content
          .filter((block: any) => block.type === "text")
          .map((block: any) => block.text)
          .join("\n");

        // 3. Append the tool result using the "tool" role
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResultText,
        });
      }

      // 4. Make a second call so the model can read the tool result and answer the user
      const finalResponse = await this.openrouter.chat.completions.create({
        model: "nvidia/nemotron-3-super-120b-a12b:free",
        messages,
      });

      const finalMessage = finalResponse.choices[0]?.message;
      if (finalMessage?.content) {
        finalText.push(finalMessage.content);
      }
    }

    return finalText.join("\n");
  }
}
