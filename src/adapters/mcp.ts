import { toolDefinitions, type ToolContext } from "../runbot/tools";

export interface McpToolShape {
  name: string;
  description: string;
  inputSchema: unknown;
  call(input: unknown, context: ToolContext): Promise<unknown>;
}

export function toMcpTools(): McpToolShape[] {
  return toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    async call(input, context) {
      return tool.handler(tool.inputSchema.parse(input), context);
    },
  }));
}
