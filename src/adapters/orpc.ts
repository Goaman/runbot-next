import { toolDefinitions, type ToolContext } from "../runbot/tools";

export type OrpcProcedureMap = Record<string, {
  input: unknown;
  handler(input: unknown, context: ToolContext): Promise<unknown>;
}>;

export function toOrpcProcedures(): OrpcProcedureMap {
  return Object.fromEntries(
    toolDefinitions.map((tool) => [
      tool.name,
      {
        input: tool.inputSchema,
        async handler(input: unknown, context: ToolContext) {
          return tool.handler(tool.inputSchema.parse(input), context);
        },
      },
    ]),
  );
}
