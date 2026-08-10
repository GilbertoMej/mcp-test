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
  private transport: StdioClientTransport;
  private tools: ChatCompletionTool[] = [];

  constructor() {
    this.openrouter = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: OPENROUTER_API_KEY,
    });

    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  // Methods will go here
}
