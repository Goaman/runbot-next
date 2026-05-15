import { links, pageTitle, stripTags, stripTagsPreserveLines } from "./html";

export interface RunbotProject {
  name: string;
  path: string;
}

export interface RunbotBuildRef {
  id: number;
  name: string;
  path: string;
  runUrl?: string;
  status?: RunbotStatus;
  statusLabel?: string;
  statusClass?: string;
}

export interface RunbotBatchSummary {
  id: number;
  label: string;
  path: string;
  buildIds: number[];
  status?: RunbotStatus;
  statusLabel?: string;
  statusClass?: string;
  bundle?: string;
  bundlePath?: string;
}

export interface RunbotBranchBatches {
  name: string;
  path: string;
  batches: RunbotBatchSummary[];
}

export interface RunbotCommitRef {
  repository: string;
  sha: string;
  subject?: string;
  githubUrl?: string;
  runbotPath?: string;
  branch?: string;
}

export interface RunbotBatch {
  id: number;
  title?: string;
  bundle?: string;
  version?: string;
  createDate?: string;
  branches: RunbotBatchBranchRef[];
  commits: RunbotCommitRef[];
  builds: RunbotBuildRef[];
}

export interface RunbotBatchBranchRef {
  repository: string;
  devBranch?: string;
  devUrl?: string;
  mainBranch?: string;
  mainUrl?: string;
}

export interface RunbotBuildLink {
  kind: "run" | "base" | "database_selector" | "log" | "artifact" | "mailhog" | "other";
  label: string;
  url: string;
}

export interface RunbotBuild {
  id: number;
  status?: RunbotStatus;
  statusLabel?: string;
  statusClass?: string;
  title?: string;
  commit?: string;
  subject?: string;
  author?: string;
  buildTime?: string;
  waitTime?: string;
  loadTime?: string;
  links: RunbotBuildLink[];
  children: RunbotChildBuild[];
  visibleLogs: RunbotVisibleLogLine[];
  batchContexts: Array<{ batchId: number; path: string }>;
}

export type RunbotStatus = "success" | "error" | "warning" | "pending" | "unknown";

export interface RunbotVisibleLogLine {
  date: string;
  level: string;
  message: string;
  isError: boolean;
  className?: string;
}

export interface RunbotChildBuild {
  id: number;
  name: string;
  status: "success" | "error" | "warning" | "unknown";
  path: string;
  duration?: string;
  links: RunbotBuildLink[];
}

export function parseProjects(html: string): RunbotProject[] {
  const seen = new Set<string>();
  return links(html)
    .filter((link) => /^\/runbot\/[a-z][a-z0-9-]*-\d+(?:[?].*)?$/.test(link.href))
    .map((link) => ({ name: link.text, path: link.href }))
    .filter((project) => {
      const key = `${project.name}:${project.path}`;
      if (!project.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseBatchSummaries(html: string): RunbotBatchSummary[] {
  const byId = new Map<number, RunbotBatchSummary>();
  const statusById = new Map<number, Pick<RunbotBatchSummary, "status" | "statusLabel" | "statusClass">>();
  const cardRe = /<div\b([^>]*class=(["'])[^"']*\bcard\b[^"']*\2[^>]*)>([\s\S]*?)(?=<div\b[^>]*class=(["'])[^"']*\bcard\b|<nav\b|<\/main>|<\/body>)/gi;
  let card: RegExpExecArray | null;

  while ((card = cardRe.exec(html))) {
    const attrs = card[1] ?? "";
    const body = card[3] ?? "";
    const batchMatch = body.match(/href="(\/runbot\/batch\/(\d+))(?:["?#/])/i);
    if (!batchMatch) continue;
    const id = Number(batchMatch[2]);
    const className = attrs.match(/\sclass=(["'])(.*?)\1/i)?.[2];
    if (!className) continue;
    const status = statusFromClass(className);
    if (status === "unknown") continue;
    statusById.set(id, { status, statusLabel: status, statusClass: className });
  }

  for (const link of links(html)) {
    const match = link.href.match(/^\/runbot\/batch\/(\d+)(?:$|[/?#])/);
    if (!match) continue;
    const id = Number(match[1]);
    const existing = byId.get(id);
    if (existing) continue;
    const status = statusById.get(id);
    const summary: RunbotBatchSummary = {
      id,
      label: link.text || `batch-${id}`,
      path: `/runbot/batch/${id}`,
      buildIds: [],
    };
    if (status?.status !== undefined) summary.status = status.status;
    if (status?.statusLabel !== undefined) summary.statusLabel = status.statusLabel;
    if (status?.statusClass !== undefined) summary.statusClass = status.statusClass;
    byId.set(id, summary);
  }
  for (const link of links(html)) {
    const match = link.href.match(/^\/runbot\/batch\/(\d+)\/build\/(\d+)/);
    if (!match) continue;
    const batchId = Number(match[1]);
    const buildId = Number(match[2]);
    const batch = byId.get(batchId);
    if (batch && !batch.buildIds.includes(buildId)) batch.buildIds.push(buildId);
  }
  return [...byId.values()];
}

export function parseBranchBatches(html: string, search?: string): RunbotBranchBatches[] {
  const branches = new Map<string, RunbotBranchBatches>();
  let current: RunbotBranchBatches | undefined;
  const seenBatchIds = new Set<number>();
  const linkRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRe.exec(html))) {
    const attrs = match[1] ?? "";
    const href = attrs.match(/\shref=(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/g, "&");
    const text = stripTags(match[2] ?? "");
    if (!href) continue;

    const bundleMatch = href.match(/^\/runbot\/bundle\/(\d+)/);
    if (bundleMatch && text) {
      const key = href.split("?")[0] ?? href;
      current = branches.get(key);
      if (!current) {
        current = { name: text, path: key, batches: [] };
        branches.set(key, current);
      }
      continue;
    }

    const batchMatch = href.match(/^\/runbot\/batch\/(\d+)(?:$|[/?#])/);
    if (!batchMatch || !current) continue;
    const id = Number(batchMatch[1]);
    if (seenBatchIds.has(id)) continue;
    seenBatchIds.add(id);
    const batch: RunbotBatchSummary = {
      id,
      label: text || `batch-${id}`,
      path: `/runbot/batch/${id}`,
      buildIds: [],
      bundle: current.name,
      bundlePath: current.path,
    };
    current.batches.push(batch);
  }

  for (const summary of parseBatchSummaries(html)) {
    for (const branch of branches.values()) {
      const target = branch.batches.find((batch) => batch.id === summary.id);
      if (target) {
        target.buildIds = summary.buildIds;
        if (summary.status !== undefined) target.status = summary.status;
        if (summary.statusLabel !== undefined) target.statusLabel = summary.statusLabel;
        if (summary.statusClass !== undefined) target.statusClass = summary.statusClass;
      }
    }
  }

  const needle = search?.trim().toLowerCase();
  return [...branches.values()].filter((branch) => {
    if (!needle) return branch.batches.length > 0;
    return branch.name.toLowerCase().includes(needle) || branch.batches.length > 0;
  });
}

export function parseBatch(html: string, batchId: number): RunbotBatch {
  const pageLinks = links(html);
  const buildsById = new Map<number, RunbotBuildRef>();
  const groupRe = /<div\b([^>]*class=(["'])[^"']*\bslot_button_group\b[^"']*\2[^>]*)>([\s\S]*?)(?=<div\b[^>]*class=(["'])[^"']*\bslot_button_group\b|<\/td>|<\/table>)/gi;
  let group: RegExpExecArray | null;
  while ((group = groupRe.exec(html))) {
    const body = group[3] ?? "";
    const buildMatch = body.match(/href="(\/runbot\/batch\/(\d+)\/build\/(\d+))"[^>]*class="[^"]*\bslot_name\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!buildMatch || Number(buildMatch[2]) !== batchId) continue;
    const statusMatch = body.match(/<span\b([^>]*)>\s*<i\b/i);
    const statusAttrs = statusMatch?.[1] ?? "";
    const statusClass = statusAttrs.match(/\sclass=(["'])(.*?)\1/i)?.[2];
    const statusLabel = statusAttrs.match(/\stitle=(["'])(.*?)\1/i)?.[2];
    const id = Number(buildMatch[3]);
    const build: RunbotBuildRef = {
      id,
      name: stripTags(buildMatch[4] ?? "") || `build-${id}`,
      path: buildMatch[1] ?? `/runbot/batch/${batchId}/build/${id}`,
    };
    if (statusClass !== undefined) {
      build.statusClass = statusClass;
      build.status = statusFromClass(statusClass);
    }
    if (statusLabel !== undefined) build.statusLabel = statusLabel;
    buildsById.set(id, build);
  }
  for (const link of pageLinks) {
    const match = link.href.match(/^\/runbot\/run\/(\d+)(?:$|[/?#])/);
    if (!match) continue;
    const id = Number(match[1]);
    const build = buildsById.get(id);
    if (build) build.runUrl = link.href;
  }

  const commits: RunbotCommitRef[] = [];
  for (const link of pageLinks) {
    const match = link.text.match(/^([a-z0-9_.-]+):([a-f0-9]{7,40})$/i);
    if (!match) continue;
    const github = pageLinks.find((candidate) => candidate.href.includes("/commit/") && candidate.href.includes(match[2] ?? ""));
    const branch = branchForCommit(html, match[1] ?? "", match[2] ?? "");
    const commit: RunbotCommitRef = {
      repository: match[1] ?? "",
      sha: match[2] ?? "",
      runbotPath: link.href,
    };
    if (github?.href !== undefined) commit.githubUrl = github.href;
    if (branch !== undefined) commit.branch = branch;
    commits.push(commit);
  }

  const text = stripTags(html);
  const bundle = text.match(/Bundle\s+([^\s]+)/)?.[1];
  const batch: RunbotBatch = {
    id: batchId,
    branches: batchBranches(commits, bundle),
    commits,
    builds: [...buildsById.values()],
  };
  const title = pageTitle(html);
  const version = text.match(/Version\s+([^\s]+)/)?.[1];
  const createDate = text.match(/Create date\s+([0-9:.\-\s]+)/)?.[1]?.trim();
  if (title !== undefined) batch.title = title;
  if (bundle !== undefined) batch.bundle = bundle;
  if (version !== undefined) batch.version = version;
  if (createDate !== undefined) batch.createDate = createDate;
  return batch;
}

function branchForCommit(html: string, repository: string, sha: string): string | undefined {
  const escapedRepo = escapeRegExp(repository);
  const escapedSha = escapeRegExp(sha.slice(0, 8));
  const commitRe = new RegExp(`${escapedRepo}:${escapedSha}[\\s\\S]*?found in branch\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`, "i");
  return stripTags(html.match(commitRe)?.[1] ?? "").trim() || undefined;
}

function batchBranches(commits: RunbotCommitRef[], bundle?: string): RunbotBatchBranchRef[] {
  const branches = new Map<string, RunbotBatchBranchRef>();
  for (const commit of commits) {
    const ref: RunbotBatchBranchRef = {
      repository: commit.repository,
    };
    if (bundle !== undefined) {
      ref.devBranch = bundle;
      ref.devUrl = githubBranchUrl("odoo-dev", commit.repository, bundle);
    }
    if (commit.branch !== undefined) {
      ref.mainBranch = commit.branch;
      ref.mainUrl = githubBranchUrl("odoo", commit.repository, commit.branch);
    }
    branches.set(commit.repository, ref);
  }
  return [...branches.values()];
}

function githubBranchUrl(owner: string, repository: string, branch: string): string {
  const branchPath = branch.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${owner}/${repository}/tree/${branchPath}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseBuild(html: string, buildId: number): RunbotBuild {
  const pageLinks = links(html);
  const linkItems: RunbotBuildLink[] = [];
  const seen = new Set<string>();
  for (const link of pageLinks) {
    const label = link.title || link.text || link.href;
    let kind: RunbotBuildLink["kind"] = "other";
    if (link.href.match(/^\/runbot\/run\/\d+$/)) kind = "run";
    else if (link.href.match(/^\/runbot\/run\/\d+\/base$/)) kind = "base";
    else if (link.href.includes("/web/database/selector")) kind = "database_selector";
    else if (link.href.endsWith(".txt")) kind = "log";
    else if (link.href.endsWith(".zip")) kind = "artifact";
    else if (/^https?:\/\/mail\.runbot/i.test(link.href)) kind = "mailhog";
    if (kind === "other") continue;
    const key = `${kind}:${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    linkItems.push({ kind, label, url: link.href });
  }

  const text = stripTags(html);
  const batchContexts = pageLinks
    .map((link) => link.href.match(/^\/runbot\/batch\/(\d+)(?:$|[/?#])/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ batchId: Number(match[1]), path: `/runbot/batch/${match[1]}` }));

  const build: RunbotBuild = {
    id: buildId,
    links: linkItems,
    children: parseChildBuilds(html),
    visibleLogs: parseVisibleLogs(html),
    batchContexts,
  };
  const buildStatus = parseBuildStatus(html);
  build.status = buildStatus.status;
  build.statusLabel = buildStatus.label;
  build.statusClass = buildStatus.className;
  const title = pageTitle(html);
  const commit = text.match(/Commit:\s+([a-z0-9_.-]+:[a-f0-9]{7,40})/i)?.[1];
  const subject = text.match(/Subject:\s+(.+?)(?:\s+Author:|$)/)?.[1]?.trim();
  const author = text.match(/Author:\s+(.+?)(?:\s+Build time:|$)/)?.[1]?.trim();
  const buildTime = text.match(/Build time:\s+([^\s]+)/)?.[1];
  const waitTime = text.match(/Wait time:\s+([^\s]+)/)?.[1];
  const loadTime = text.match(/Load time:\s+([^\s]+)/)?.[1];
  if (title !== undefined) build.title = title;
  if (commit !== undefined) build.commit = commit;
  if (subject !== undefined) build.subject = subject;
  if (author !== undefined) build.author = author;
  if (buildTime !== undefined) build.buildTime = buildTime;
  if (waitTime !== undefined) build.waitTime = waitTime;
  if (loadTime !== undefined) build.loadTime = loadTime;
  return build;
}

function statusFromClass(className: string): RunbotStatus {
  if (/\b(?:btn-|bg-)success\b|\bsuccess-subtle\b/.test(className)) return "success";
  if (/\b(?:btn-|bg-)danger\b|\bdanger-subtle\b/.test(className)) return "error";
  if (/\b(?:btn-|bg-)warning\b|\bwarning-subtle\b/.test(className)) return "warning";
  if (/\b(?:btn-|bg-)info\b|\bsecondary\b|\bdefault\b/.test(className)) return "pending";
  return "unknown";
}

function parseBuildStatus(html: string): { status: RunbotStatus; label: string; className: string } {
  const icon = html.match(/icon_([a-z]+)\.(?:png|svg)/i)?.[1];
  if (icon === "ko") return { status: "error", label: "ko", className: "icon_ko" };
  if (icon === "ok") return { status: "success", label: "ok", className: "icon_ok" };
  const detailsClass = html.match(/<div class="([^"]*\bbg-[a-z]+-subtle\b[^"]*)">\s*<div class="build_details/i)?.[1];
  if (detailsClass) return { status: statusFromClass(detailsClass), label: statusFromClass(detailsClass), className: detailsClass };
  return { status: "unknown", label: "unknown", className: "" };
}

export function parseChildBuilds(html: string): RunbotChildBuild[] {
  const children: RunbotChildBuild[] = [];
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const attrs = row[1] ?? "";
    const body = row[2] ?? "";
    if (!/bg-(success|danger|warning)-subtle/.test(attrs)) continue;
    const buildMatch = body.match(/href="(\/runbot\/build\/(\d+))"[^>]*>([\s\S]*?)<\/a>/i);
    if (!buildMatch) continue;
    const id = Number(buildMatch[2]);
    const rowLinks = links(body);
    const buildLinkText = stripTags(buildMatch[3] ?? "");
    const text = stripTags(body);
    const name = text
      .replace(buildLinkText, "")
      .replace(/\b\d+[hms]+\b/g, "")
      .replace(/Build options|Build details|Full|logs|Mailhog/g, "")
      .trim() || `Build ${id}`;
    const className = attrs.match(/\sclass=(["'])(.*?)\1/i)?.[2] ?? "";
    const status = className.includes("danger")
      ? "error"
      : className.includes("warning")
        ? "warning"
        : className.includes("success")
          ? "success"
          : "unknown";
    const duration = text.match(/\b\d+[hms](?:\d+[ms])?\b/)?.[0];
    children.push({
      id,
      name,
      status,
      path: buildMatch[1] ?? `/runbot/build/${id}`,
      ...(duration ? { duration } : {}),
      links: rowLinks
        .filter((link) => link.href.endsWith(".txt") || /^https?:\/\/mail\.runbot/i.test(link.href))
        .map((link) => ({
          kind: link.href.endsWith(".txt") ? "log" : "mailhog",
          label: link.title || link.text || link.href,
          url: link.href,
        })),
    });
  }
  return children;
}

export function parseVisibleLogs(html: string): RunbotVisibleLogLine[] {
  const rows: RunbotVisibleLogLine[] = [];
  const rowRe = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(html))) {
    const attrs = row[1] ?? "";
    const body = row[2] ?? "";
    if (!/\b(?:log-|separator)\b/.test(attrs)) continue;
    const cells = [...body.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 3) continue;
    const className = `${attrs} ${cells.map((cell) => cell[1] ?? "").join(" ")}`;
    const date = stripTags(cells[0]?.[2] ?? "");
    const level = stripTags(cells[1]?.[2] ?? "");
    const message = stripTagsPreserveLines(cells[2]?.[2] ?? "");
    if (!date && !level && !message) continue;
    const isError = /\b(?:bg-danger|text-danger|danger-subtle)\b/i.test(className) || /\b(?:ERROR|CRITICAL)\b/i.test(level);
    const line: RunbotVisibleLogLine = { date, level, message, isError };
    const cleanedClass = stripTags(className);
    if (cleanedClass) line.className = cleanedClass;
    rows.push(line);
  }
  return rows;
}
