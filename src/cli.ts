#!/usr/bin/env bun
import { createToolContext, getTool, toolDefinitions } from "./runbot/tools";

function usage(): string {
  const commands = [
    "runbot projects [--json]",
    "runbot batches [path] [--search text] [--pr] [--json]",
    "runbot batch <batch-id> [--json]",
    "runbot build-names <batch-id> [--json]",
    "runbot batch-build <batch-id> <build-name> [--exact] [--json]",
    "runbot build <build-id> [--json]",
    "runbot tests <build-id> [--summary] [--unparsed] [--json]",
    "runbot tests --batch <batch-id> --slot <build-name> [--exact] [--summary] [--unparsed] [--json]",
    "runbot build-in-batch <batch-id> <build-id> [--json]",
    "runbot link <build-id> <run|base|database_selector|mailhog|log|artifact> [match] [--json]",
    "runbot tools [--json]",
  ];
  return `Usage:\n  ${commands.join("\n  ")}`;
}

function takeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function takeOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function numberArg(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer for ${label}.`);
  }
  return parsed;
}

async function callTool(name: string, input: unknown) {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.handler(tool.inputSchema.parse(input), createToolContext());
}

function printHuman(command: string, result: unknown): void {
  if (command === "link" && result && typeof result === "object" && "url" in result) {
    console.log((result as { url?: string }).url ?? "No matching link found.");
    return;
  }
  if (command === "tests" && result && typeof result === "object" && "unparsed" in result) {
    const tests = result as { buildId?: number; batchId?: number; buildName?: string; unparsed?: Array<{ child: { id: number; name: string; status: string }; message: string }> };
    const header = [
      `build ${tests.buildId ?? "unknown"}`,
      tests.batchId ? `batch ${tests.batchId}` : undefined,
      tests.buildName ? `slot "${tests.buildName}"` : undefined,
    ].filter(Boolean).join(", ");
    const unparsed = tests.unparsed ?? [];
    console.log(`Unparsed test log chunks for ${header}: ${unparsed.length}`);
    for (const item of unparsed) {
      console.log(`\n[${item.child.id}] ${item.child.name} (${item.child.status})`);
      console.log(item.message);
    }
    return;
  }
  console.dir(result, { depth: null, colors: true });
}

async function main() {
  const args = Bun.argv.slice(2);
  const json = takeFlag(args, "--json");
  const command = args.shift();
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  let result: unknown;
  switch (command) {
    case "projects":
      result = await callTool("list_projects", {});
      break;
    case "batches":
      result = await callTool("list_batches", {
        path: args[0] && !args[0].startsWith("--") ? args.shift() : "/runbot/rd-1",
        search: takeOption(args, "--search"),
        hasPr: takeFlag(args, "--pr"),
      });
      break;
    case "batch":
      result = await callTool("get_batch", { batchId: numberArg(args.shift(), "batch-id") });
      break;
    case "build-names":
      result = await callTool("list_build_names", { batchId: numberArg(args.shift(), "batch-id") });
      break;
    case "batch-build":
      result = await callTool("get_batch_build_by_name", {
        batchId: numberArg(args.shift(), "batch-id"),
        buildName: args.shift(),
        exact: takeFlag(args, "--exact"),
      });
      break;
    case "build":
      result = await callTool("get_build", { buildId: numberArg(args.shift(), "build-id") });
      break;
    case "tests":
      {
        const batchId = takeOption(args, "--batch");
        const buildName = takeOption(args, "--slot") ?? takeOption(args, "--build-name");
        const exact = takeFlag(args, "--exact");
        result = await callTool("get_build_tests", {
          ...(batchId || buildName
            ? { batchId: numberArg(batchId, "batch-id"), buildName }
            : { buildId: numberArg(args.shift(), "build-id") }),
          exact,
          includeSummary: takeFlag(args, "--summary"),
          unparsed: takeFlag(args, "--unparsed"),
        });
      }
      break;
    case "build-in-batch":
      result = await callTool("get_build_in_batch", {
        batchId: numberArg(args.shift(), "batch-id"),
        buildId: numberArg(args.shift(), "build-id"),
      });
      break;
    case "link":
      result = await callTool("resolve_build_link", {
        buildId: numberArg(args.shift(), "build-id"),
        kind: args.shift(),
        match: args.shift(),
      });
      break;
    case "tools":
      result = toolDefinitions.map((tool) => ({
        name: tool.name,
        summary: tool.summary,
        description: tool.description,
        inputSchema: tool.inputSchema.toString(),
      }));
      break;
    default:
      throw new Error(`Unknown command: ${command}\n${usage()}`);
  }

  if (json) console.log(JSON.stringify(result, null, 2));
  else printHuman(command, result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
