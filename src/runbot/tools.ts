import { z } from "zod";
import { RunbotClient } from "./client";
import { parseBatch, parseBatchSummaries, parseBranchBatches, parseBuild, parseProjects } from "./parsers";
import { parseRunbotTestFailures, parseUnparsedRunbotTestFailures, type RunbotTestLogEntry } from "./testFailures";

export interface ToolContext {
  client: RunbotClient;
}

export interface ToolDefinition<Name extends string = string, Input = any, Output = unknown> {
  name: Name;
  summary: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler(input: Input, context: ToolContext): Promise<Output>;
}

const projectPath = z.string().default("/runbot/rd-1");

async function resolveBuildId(input: { buildId?: number; batchId?: number; buildName?: string; exact?: boolean }, client: RunbotClient): Promise<{ buildId: number; batchId?: number; buildName?: string }> {
  if (input.buildId) return { buildId: input.buildId };
  if (!input.batchId || !input.buildName) {
    throw new Error("Expected either buildId or both batchId and buildName.");
  }
  const batch = parseBatch(await client.getHtml(`/runbot/batch/${input.batchId}`), input.batchId);
  const needle = input.buildName.toLowerCase();
  const build = batch.builds.find((candidate) =>
    input.exact ? candidate.name.toLowerCase() === needle : candidate.name.toLowerCase().includes(needle),
  );
  if (!build) {
    throw new Error(`No build slot matching "${input.buildName}" found in batch ${input.batchId}.`);
  }
  return { buildId: build.id, batchId: input.batchId, buildName: build.name };
}

export const toolDefinitions = [
  {
    name: "search_branches",
    summary: "Search branches and list their visible batches.",
    description: "Parses a Runbot project page into branch/bundle groups with batches under each branch.",
    inputSchema: z.object({
      path: projectPath.describe("Runbot project path, for example /runbot/rd-1."),
      search: z.string().optional().describe("Branch name or other Runbot search term."),
      hasPr: z.boolean().default(false),
    }),
    async handler(input, { client }) {
      const url = new URL(client.url(input.path));
      if (input.search) url.searchParams.set("search", input.search);
      if (input.hasPr) url.searchParams.set("has_pr", "1");
      return parseBranchBatches(await client.getHtml(url.toString()), input.search);
    },
  },
  {
    name: "list_projects",
    summary: "List public Runbot projects.",
    description: "Fetches the Runbot landing page and returns public project navigation links.",
    inputSchema: z.object({}),
    async handler(_input, { client }) {
      return parseProjects(await client.getHtml("/"));
    },
  },
  {
    name: "list_build_names",
    summary: "List build slot names for a batch.",
    description: "Fetches a batch and returns the distinct build names available in that batch, such as Community Run or Enterprise Tests.",
    inputSchema: z.object({ batchId: z.number().int().positive() }),
    async handler(input, { client }) {
      const batch = parseBatch(await client.getHtml(`/runbot/batch/${input.batchId}`), input.batchId);
      return {
        batchId: input.batchId,
        buildNames: [...new Set(batch.builds.map((build) => build.name))],
        builds: batch.builds,
      };
    },
  },
  {
    name: "get_batch_build_by_name",
    summary: "Get a specific build in a batch by slot name.",
    description: "Finds a build by name inside a batch, then returns its build details. Useful for names like Enterprise Tests.",
    inputSchema: z.object({
      batchId: z.number().int().positive(),
      buildName: z.string().min(1),
      exact: z.boolean().default(false),
    }),
    async handler(input, { client }) {
      const batch = parseBatch(await client.getHtml(`/runbot/batch/${input.batchId}`), input.batchId);
      const needle = input.buildName.toLowerCase();
      const ref = batch.builds.find((build) =>
        input.exact ? build.name.toLowerCase() === needle : build.name.toLowerCase().includes(needle),
      );
      if (!ref) return { batchId: input.batchId, buildName: input.buildName, build: undefined, details: undefined };
      const details = parseBuild(await client.getHtml(`/runbot/build/${ref.id}`), ref.id);
      return { batchId: input.batchId, buildName: input.buildName, build: ref, details };
    },
  },
  {
    name: "get_child_logs",
    summary: "Fetch logs for every child build of a parent build.",
    description: "For parent builds such as Parallel testing, parses child builds and fetches each child log.",
    inputSchema: z.object({
      buildId: z.number().int().positive(),
      logMatch: z.string().default("").describe("Optional substring to match child log labels or URLs."),
      maxBytesPerLog: z.number().int().positive().max(1_000_000).default(40_000),
    }),
    async handler(input, { client }) {
      const build = parseBuild(await client.getHtml(`/runbot/build/${input.buildId}`), input.buildId);
      const entries = [];
      for (const child of build.children) {
        const childBuild = parseBuild(await client.getHtml(child.path), child.id);
        if (childBuild.visibleLogs.length === 0) {
          entries.push({ parentBuildId: input.buildId, child, status: "missing_visible_log", logs: [] });
          continue;
        }
        entries.push({
          parentBuildId: input.buildId,
          child: { ...child, links: childBuild.links.length > 0 ? childBuild.links : child.links },
          status: child.status,
          logs: childBuild.visibleLogs,
        });
      }
      const tests = parseRunbotTestFailures(entries);
      const summaries = parseRunbotTestFailures(entries, { includeSummary: true }).filter((test) => test.kind === "summary");
      return {
        buildId: input.buildId,
        children: build.children,
        entries,
        tests,
        summaries,
        unparsed: parseUnparsedRunbotTestFailures(entries),
      };
    },
  },
  {
    name: "get_build_tests",
    summary: "Fetch and parse failed tests for every child build of a parent build.",
    description: "Returns structured Python, tour, and Hoot test failures from visible Runbot log lines. Accepts either a build id or a batch id plus build slot name, and can include unparsed error chunks.",
    inputSchema: z.object({
      buildId: z.number().int().positive().optional(),
      batchId: z.number().int().positive().optional(),
      buildName: z.string().min(1).optional().describe("Build slot name or substring, for example Enterprise Tests."),
      exact: z.boolean().default(false).describe("Match buildName exactly when resolving a build from a batch."),
      includeSummary: z.boolean().default(false),
      unparsed: z.boolean().default(false),
    }),
    async handler(input, { client }) {
      const childLogsTool = getTool("get_child_logs");
      if (!childLogsTool) throw new Error("get_child_logs tool is not registered.");
      const resolved = await resolveBuildId(input, client);
      const childLogs = await childLogsTool.handler(
        { buildId: resolved.buildId, logMatch: "", maxBytesPerLog: 40_000 },
        { client },
      ) as { entries: RunbotTestLogEntry[] };
      return {
        ...resolved,
        tests: parseRunbotTestFailures(childLogs.entries, { includeSummary: input.includeSummary }),
        ...(input.unparsed ? { unparsed: parseUnparsedRunbotTestFailures(childLogs.entries) } : {}),
      };
    },
  },
  {
    name: "get_combined_logs",
    summary: "Fetch combined logs for builds across batches.",
    description: "Fetches batches, resolves matching builds/log links, and returns combined log text with per-entry truncation.",
    inputSchema: z.object({
      batchIds: z.array(z.number().int().positive()).min(1).max(20),
      buildName: z.string().default("Community Run").describe("Substring to match build slot names."),
      logMatch: z.string().default("run").describe("Substring to match log labels or URLs."),
      maxBytesPerLog: z.number().int().positive().max(1_000_000).default(80_000),
    }),
    async handler(input, { client }) {
      const entries = [];
      for (const batchId of input.batchIds) {
        const batch = parseBatch(await client.getHtml(`/runbot/batch/${batchId}`), batchId);
        const buildRef = batch.builds.find((build) =>
          build.name.toLowerCase().includes(input.buildName.toLowerCase()),
        );
        if (!buildRef) {
          entries.push({ batchId, status: "missing_build", buildName: input.buildName });
          continue;
        }
        const build = parseBuild(await client.getHtml(`/runbot/build/${buildRef.id}`), buildRef.id);
        const logNeedle = input.logMatch.toLowerCase();
        const matchingLogs = build.links.filter((link) =>
          link.kind === "log" && `${link.label} ${link.url}`.toLowerCase().includes(logNeedle),
        );
        const log =
          matchingLogs.find((link) => link.label.toLowerCase() === `full ${logNeedle} logs`) ??
          matchingLogs.find((link) => link.url.toLowerCase().endsWith(`/${logNeedle}.txt`)) ??
          matchingLogs[0];
        if (!log) {
          entries.push({ batchId, buildId: buildRef.id, buildName: buildRef.name, status: "missing_log", logMatch: input.logMatch });
          continue;
        }
        const content = await client.getText(log.url, input.maxBytesPerLog);
        entries.push({
          batchId,
          buildId: buildRef.id,
          buildName: buildRef.name,
          logLabel: log.label,
          logUrl: log.url,
          status: "ok",
          content,
        });
      }
      return { buildName: input.buildName, logMatch: input.logMatch, entries };
    },
  },
  {
    name: "list_batches",
    summary: "List batches visible on a project or bundle page.",
    description: "Parses public Runbot HTML and returns batch ids, labels, paths, and referenced build ids.",
    inputSchema: z.object({
      path: projectPath.describe("Runbot project or bundle path, for example /runbot/rd-1 or /runbot/bundle/1."),
      search: z.string().optional(),
      hasPr: z.boolean().default(false),
    }),
    async handler(input, { client }) {
      const url = new URL(client.url(input.path));
      if (input.search) url.searchParams.set("search", input.search);
      if (input.hasPr) url.searchParams.set("has_pr", "1");
      return parseBatchSummaries(await client.getHtml(url.toString()));
    },
  },
  {
    name: "get_batch",
    summary: "Get batch commits and builds.",
    description: "Fetches /runbot/batch/<id> and returns bundle metadata, commits, and build references.",
    inputSchema: z.object({ batchId: z.number().int().positive() }),
    async handler(input, { client }) {
      return parseBatch(await client.getHtml(`/runbot/batch/${input.batchId}`), input.batchId);
    },
  },
  {
    name: "get_build",
    summary: "Get build details and useful links.",
    description: "Fetches /runbot/build/<id> and returns commit metadata plus run, log, artifact, database, and Mailhog links.",
    inputSchema: z.object({ buildId: z.number().int().positive() }),
    async handler(input, { client }) {
      return parseBuild(await client.getHtml(`/runbot/build/${input.buildId}`), input.buildId);
    },
  },
  {
    name: "get_build_in_batch",
    summary: "Get build details in a batch context.",
    description: "Fetches /runbot/batch/<batch_id>/build/<build_id>; useful when a build is discovered from a batch.",
    inputSchema: z.object({
      batchId: z.number().int().positive(),
      buildId: z.number().int().positive(),
    }),
    async handler(input, { client }) {
      return parseBuild(
        await client.getHtml(`/runbot/batch/${input.batchId}/build/${input.buildId}`),
        input.buildId,
      );
    },
  },
  {
    name: "resolve_build_link",
    summary: "Resolve a specific build link.",
    description: "Returns one URL of a requested kind from a build page, such as run, base, database selector, Mailhog, log, or artifact.",
    inputSchema: z.object({
      buildId: z.number().int().positive(),
      kind: z.enum(["run", "base", "database_selector", "mailhog", "log", "artifact"]),
      match: z.string().optional().describe("Optional substring filter for log/artifact labels or URLs."),
    }),
    async handler(input, { client }) {
      const build = parseBuild(await client.getHtml(`/runbot/build/${input.buildId}`), input.buildId);
      const link = build.links.find((candidate) => {
        if (candidate.kind !== input.kind) return false;
        if (!input.match) return true;
        return `${candidate.label} ${candidate.url}`.toLowerCase().includes(input.match.toLowerCase());
      });
      return { buildId: input.buildId, kind: input.kind, match: input.match, url: link?.url, link };
    },
  },
] satisfies ToolDefinition[];

export type RunbotToolName = (typeof toolDefinitions)[number]["name"];

export function createToolContext(options: { baseUrl?: string; fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } = {}): ToolContext {
  return { client: new RunbotClient(options) };
}

export function getTool(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((tool) => tool.name === name);
}
