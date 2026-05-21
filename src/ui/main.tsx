import { createEffect, createMemo, createResource, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import { RunbotChameleonConfigurator } from "./chameleon/RunbotChameleonConfigurator";
import "./styles.css";

type Project = { name: string; path: string };
type BatchSummary = {
  id: number;
  label: string;
  path: string;
  buildIds: number[];
  status?: string;
  statusLabel?: string;
  statusClass?: string;
};
type BranchBatches = { name: string; path: string; batches: BatchSummary[] };
type PinnedBranch = Pick<BranchBatches, "name" | "path"> & { batches?: BatchSummary[] };
type Batch = {
  id: number;
  bundle?: string;
  version?: string;
  createDate?: string;
  branches: Array<{ repository: string; devBranch?: string; devUrl?: string; mainBranch?: string; mainUrl?: string }>;
  commits: Array<{ repository: string; sha: string; githubUrl?: string; branch?: string }>;
  builds: Array<{ id: number; name: string; path: string; runUrl?: string; status?: string; statusLabel?: string; statusClass?: string }>;
};
type Build = {
  id: number;
  status?: string;
  statusLabel?: string;
  statusClass?: string;
  title?: string;
  commit?: string;
  subject?: string;
  author?: string;
  buildTime?: string;
  waitTime?: string;
  loadTime?: string;
  links: Array<{ kind: string; label: string; url: string }>;
  children: Array<{ id: number; name: string; status: string; path: string; duration?: string; links: Array<{ kind: string; label: string; url: string }> }>;
  visibleLogs: LogLine[];
};
type ChildLogs = {
  buildId: number;
  children: Build["children"];
  entries: Array<{
    child: Build["children"][number];
    status: string;
    logLabel?: string;
    logUrl?: string;
    logs?: LogLine[];
  }>;
  tests?: ParsedTest[];
  summaries?: ParsedTest[];
  unparsed?: ParsedUnparsedTest[];
};
type LogLine = { date: string; level: string; message: string; isError: boolean; className?: string };
type ParsedCrash = { title: string; message: string; line: LogLine; sourceLine: LogLine };
type ParsedUnparsedTest = {
  id: string;
  child: Build["children"][number];
  message: string;
  line: LogLine;
  sourceLine: LogLine;
};
type ParsedTest = {
  id: string;
  kind: "python" | "tour" | "hoot" | "summary" | "unknown";
  title: string;
  runner?: string;
  pythonTest?: string;
  pythonFile?: string;
  jsTest?: string;
  tourName?: string;
  preset?: string;
  tags: string[];
  command?: string;
  crashes?: ParsedCrash[];
  child: Build["children"][number];
  lines: LogLine[];
  sourceLines?: LogLine[];
};
type TrafficEntry = {
  id: number;
  time: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  contentType?: string;
  contentLength?: string;
  error?: string;
};
type TrafficSnapshot = { recording: boolean; entries: TrafficEntry[] };

async function readJsonResponse(response: Response, fallback: string): Promise<any> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${fallback}: expected JSON, got ${response.status} ${response.statusText}`);
  }
}

async function orpc<T>(name: string, input: unknown): Promise<T> {
  const response = await fetch(`/orpc/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await readJsonResponse(response, `oRPC call failed: ${name}`);
  if (!response.ok || payload.error) throw new Error(payload.error ?? `oRPC call failed: ${name}`);
  return payload.data;
}

async function trafficRequest(path = "", method = "GET"): Promise<TrafficSnapshot> {
  const response = await fetch(`/traffic${path}`, { method });
  if (!response.ok) throw new Error(`Traffic request failed: ${response.status}`);
  return readJsonResponse(response, "Traffic request failed");
}

function lineKey(childId: number, line: LogLine): string {
  return [childId, line.date, line.level, line.message].join("\u001f");
}

function parsedTestKey(test: ParsedTest): string {
  return [test.child.id, test.kind, test.id, test.pythonTest ?? "", test.jsTest ?? "", test.tourName ?? "", test.title].join("\u001f");
}

function CheckboxComponent(props: { checked: boolean; label: string; title?: string; onChange: (checked: boolean) => void }) {
  return (
    <label class="theme-checkbox" title={props.title}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span class="theme-checkbox-box" aria-hidden="true" />
      <span class="theme-checkbox-label">{props.label}</span>
    </label>
  );
}

function ExternalLink(props: { href: string; children: any }) {
  const href = createMemo(() => props.href.startsWith("/") ? `https://runbot.odoo.com${props.href}` : props.href);
  return <a href={href()} target="_blank" rel="noreferrer">{props.children}</a>;
}

function StatusBadge(props: { status?: string; label?: string }) {
  const status = createMemo(() => props.status ?? "unknown");
  const label = createMemo(() => props.label ?? status());
  return <span class={`status is-${status()}`}>{label()}</span>;
}

function BranchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M4 3v5a3 3 0 0 0 3 3h1" />
      <path d="M12 4v8" />
      <circle cx="4" cy="3" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function PullRequestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <circle cx="4" cy="4" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M4 6v4" />
      <path d="M6 4h2a4 4 0 0 1 4 4v2" />
    </svg>
  );
}

function Icon(props: { name: "search" | "refresh" | "traffic" | "open" | "copy" | "layers" | "branch" | "list" | "bell" | "settings" | "more" | "pet" | "star" | "expand" | "collapse"; size?: number }) {
  const paths: Record<typeof props.name, string> = {
    search: "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16ZM21 21l-3.5-3.5",
    refresh: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
    traffic: "M5 6h14M9 12h10M13 18h6",
    open: "M14 3h7v7M21 3l-9 9M5 5h6M5 19h14v-6",
    copy: "M9 9h11v11H9zM5 5h11v3M5 5v11h3",
    layers: "M2 12 12 17l10-5M2 7l10 5 10-5L12 2 2 7Zm0 10 10 5 10-5",
    branch: "M6 3v12M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4V3M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M14 21a2 2 0 1 1-4 0",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a8 8 0 0 0-.1-1.3l2-1.6-2-3.4-2.4.9a8 8 0 0 0-2.3-1.3L14 2h-4l-.6 2.3a8 8 0 0 0-2.3 1.3l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-.9a8 8 0 0 0 2.3 1.3L10 22h4l.6-2.3a8 8 0 0 0 2.3-1.3l2.4.9 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    pet: "M6.5 10.5c0-3 2.3-5.5 5.2-5.5 3.2 0 5.8 2.6 5.8 5.8 0 4.2-3.5 7.2-7.6 6.3M7 8.5 4 6M6.5 13.5 3 15M15.2 8.4h.01M11.5 13.2c-1.4.2-2.9.8-4 1.9-1.4 1.4-2 3.2-1.6 4.7 1.5.4 3.3-.2 4.7-1.6 1.1-1.1 1.8-2.6 1.9-4",
    star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z",
    expand: "M8 3H3v5M3 3l6 6M16 3h5v5M21 3l-6 6M8 21H3v-5M3 21l6-6M16 21h5v-5M21 21l-6-6",
    collapse: "M9 9H4V4M4 9l6-6M15 9h5V4M20 9l-6-6M9 15H4v5M4 15l6 6M15 15h5v5M20 15l-6 6",
  };
  return (
    <svg aria-hidden="true" width={props.size ?? 13} height={props.size ?? 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d={paths[props.name]} />
    </svg>
  );
}

function batchStatus(batch: BatchSummary | undefined, details?: Batch): string | undefined {
  if (batch?.status) return batch.status;
  const builds = details?.builds ?? [];
  const statuses = builds.map((build) => build.status).filter(Boolean);
  if (statuses.includes("error")) return "error";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("success")) return "success";
  if (batch && batch.buildIds.length === 0) return "pending";
  if (details && builds.length === 0) return "pending";
  return undefined;
}

function statusBg(status?: string): string {
  return status ? `status-bg-${status}` : "";
}

function uiStatus(status?: string): string {
  if (status === "warning") return "warn";
  if (status === "pending") return "running";
  return status ?? "unknown";
}

function statusLabel(status?: string): string {
  if (status === "success") return "PASS";
  if (status === "error") return "FAIL";
  if (status === "warning") return "WARN";
  if (status === "pending") return "RUN";
  return (status ?? "UNKNOWN").toUpperCase();
}

function StatusGlyph(props: { status?: string; pill?: boolean }) {
  const status = createMemo(() => uiStatus(props.status));
  if (props.pill) return <span class="pill" data-status={status()}>{statusLabel(props.status)}</span>;
  return <span class="status-dot" data-status={status()} />;
}

function branchStatus(branch: BranchBatches): string | undefined {
  return batchStatus(branch.batches[0]);
}

function buildLabel(build: Batch["builds"][number]): string {
  return build.name?.trim() || `Build ${build.id}`;
}

function batchLabel(label: string): string {
  return label.replace(/\s*View batch\.{0,3}\s*$/i, "").trim();
}

function runbotPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function branchForCommit(batch: Batch, commit: Batch["commits"][number]) {
  return batch.branches.find((branch) => branch.repository === commit.repository);
}

function prNumber(branch?: { mainBranch?: string }) {
  const value = branch?.mainBranch?.trim();
  return value && /^\d+$/.test(value) ? value : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileSearch(input: string, options: { matchCase: boolean; wholeWord: boolean; regex: boolean }): RegExp | undefined {
  if (!input) return undefined;
  const source = options.regex ? input : escapeRegExp(input);
  const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    return new RegExp(bounded, options.matchCase ? "g" : "gi");
  } catch {
    return undefined;
  }
}

function lineMatches(line: LogLine, search: RegExp | undefined): boolean {
  if (!search) return true;
  search.lastIndex = 0;
  return search.test(`${line.date} ${line.level} ${line.message}`);
}

function loadState() {
  const raw = new URLSearchParams(location.search).get("state");
  if (!raw) return {};
  try {
    return JSON.parse(decodeURIComponent(atob(raw))) as Partial<{
      projectPath: string;
      search: string;
      hasPr: boolean;
      selectedBranchPath: string;
      selectedBatchId: number;
      selectedBuildId: number;
      selectedBuildName: string;
      buildName: string;
      logMatch: string;
      trafficOpen: boolean;
      activeView: "runbot" | "configurator";
      headerOpen: boolean;
      statusBarOpen: boolean;
    }>;
  } catch {
    return {};
  }
}

function saveState(state: Record<string, unknown>) {
  const params = new URLSearchParams(location.search);
  params.set("state", btoa(encodeURIComponent(JSON.stringify(state))));
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

type BuildView = "builds" | "tests" | "failed";
type TestViewMode = "all" | "parsed" | "unparsed" | "raw";
type AppView = "runbot" | "configurator";

type UiPrefs = Partial<{
  buildView: BuildView;
  failedMatchCase: boolean;
  failedWholeWord: boolean;
  failedRegex: boolean;
  failedShowTime: boolean;
  showRawTests: boolean;
  showSummaryTests: boolean;
  groupTestsByType: boolean;
  testViewMode: TestViewMode;
  testMatchCase: boolean;
  testWholeWord: boolean;
  testRegex: boolean;
  headerOpen: boolean;
  sidebarOpen: boolean;
  statusBarOpen: boolean;
  pinnedBranchesOpen: boolean;
  branchesOpen: boolean;
  batchesOpen: boolean;
  pinnedBranchPaths: string[];
  pinnedBranches: PinnedBranch[];
}>;

const uiPrefsKey = "runbot-ui-prefs";

function loadUiPrefs(): UiPrefs {
  try {
    return JSON.parse(localStorage.getItem(uiPrefsKey) ?? "{}") as UiPrefs;
  } catch {
    return {};
  }
}

function saveUiPrefs(prefs: UiPrefs) {
  localStorage.setItem(uiPrefsKey, JSON.stringify(prefs));
}

function App() {
  const initialState = loadState();
  const initialUiPrefs = loadUiPrefs();
  const [projectPath, setProjectPath] = createSignal(initialState.projectPath ?? "/runbot/rd-1");
  const [search, setSearch] = createSignal(initialState.search ?? "");
  const [hasPr, setHasPr] = createSignal(initialState.hasPr ?? false);
  const [selectedBranchPath, setSelectedBranchPath] = createSignal<string | undefined>(initialState.selectedBranchPath);
  const [selectedBatchId, setSelectedBatchId] = createSignal<number | undefined>(initialState.selectedBatchId);
  const [selectedBuildId, setSelectedBuildId] = createSignal<number | undefined>(initialState.selectedBuildId);
  const [selectedBuildName, setSelectedBuildName] = createSignal(initialState.selectedBuildName ?? initialState.buildName ?? "Community Run");
  const [lastBatchByBranch, setLastBatchByBranch] = createSignal<Record<string, number>>({});
  const [expandedBatchBranches, setExpandedBatchBranches] = createSignal<Record<string, boolean>>({});
  const [expandedLogBuildId, setExpandedLogBuildId] = createSignal<number | undefined>();
  const [childLogCache, setChildLogCache] = createSignal<Record<number, ChildLogs>>({});
  const [childLogRequest, setChildLogRequest] = createSignal<{ buildId: number; logMatch: string }>();
  const [trafficTick, setTrafficTick] = createSignal(0);
  const [trafficRecording, setTrafficRecording] = createSignal(false);
  const [trafficOpen, setTrafficOpen] = createSignal(initialState.trafficOpen ?? false);
  const [headerOpen, setHeaderOpen] = createSignal(initialUiPrefs.headerOpen ?? initialState.headerOpen ?? true);
  const [sidebarOpen, setSidebarOpen] = createSignal(initialUiPrefs.sidebarOpen ?? true);
  const [activeView, setActiveView] = createSignal<AppView>(initialState.activeView ?? "runbot");
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [statusBarOpen, setStatusBarOpen] = createSignal(initialUiPrefs.statusBarOpen ?? initialState.statusBarOpen ?? true);
  const [pinnedBranchesOpen, setPinnedBranchesOpen] = createSignal(initialUiPrefs.pinnedBranchesOpen ?? true);
  const [branchesOpen, setBranchesOpen] = createSignal(initialUiPrefs.branchesOpen ?? true);
  const [batchesOpen, setBatchesOpen] = createSignal(initialUiPrefs.batchesOpen ?? true);
  const initialPinnedBranches = () => {
    const isBundlePath = (path: string) => /^\/runbot\/bundle\/\d{5,}$/.test(path);
    const branches = (initialUiPrefs.pinnedBranches ?? []).filter((branch) => isBundlePath(branch.path));
    const known = new Set(branches.map((branch) => branch.path));
    const pathOnlyBranches = (initialUiPrefs.pinnedBranchPaths ?? [])
      .filter(isBundlePath)
      .filter((path) => !known.has(path))
      .map((path) => ({ path, name: path }));
    return [...branches, ...pathOnlyBranches];
  };
  const [pinnedBranchRecords, setPinnedBranchRecords] = createSignal<PinnedBranch[]>(initialPinnedBranches());
  const [buildView, setBuildView] = createSignal<BuildView>(initialUiPrefs.buildView === "failed" ? "tests" : initialUiPrefs.buildView ?? "builds");
  const [failedSearch, setFailedSearch] = createSignal("");
  const [failedMatchCase, setFailedMatchCase] = createSignal(initialUiPrefs.failedMatchCase ?? false);
  const [failedWholeWord, setFailedWholeWord] = createSignal(initialUiPrefs.failedWholeWord ?? false);
  const [failedRegex, setFailedRegex] = createSignal(initialUiPrefs.failedRegex ?? false);
  const [failedShowTime, setFailedShowTime] = createSignal(initialUiPrefs.failedShowTime ?? false);
  const [showRawTests, setShowRawTests] = createSignal(initialUiPrefs.showRawTests ?? false);
  const [showSummaryTests, setShowSummaryTests] = createSignal(initialUiPrefs.showSummaryTests ?? false);
  const [groupTestsByType, setGroupTestsByType] = createSignal(initialUiPrefs.groupTestsByType ?? false);
  const [collapsedTestGroups, setCollapsedTestGroups] = createSignal<Record<string, boolean>>({});
  const [collapsedTests, setCollapsedTests] = createSignal<Record<string, boolean>>({});
  const [testViewMode, setTestViewMode] = createSignal<TestViewMode>(initialUiPrefs.testViewMode ?? "all");
  const [testSearch, setTestSearch] = createSignal("");
  const [testMatchCase, setTestMatchCase] = createSignal(initialUiPrefs.testMatchCase ?? false);
  const [testWholeWord, setTestWholeWord] = createSignal(initialUiPrefs.testWholeWord ?? false);
  const [testRegex, setTestRegex] = createSignal(initialUiPrefs.testRegex ?? false);

  const [projects] = createResource(() => orpc<Project[]>("list_projects", {}));
  const [branches, { refetch: refetchBranches }] = createResource(
    () => ({ path: projectPath(), search: search() || undefined, hasPr: hasPr() }),
    (input) => orpc<BranchBatches[]>("search_branches", input),
  );
  const selectedBranch = createMemo(() => {
    const list = branches() ?? [];
    const pinned = pinnedBranchRecords();
    const selectedPath = selectedBranchPath();
    if (selectedPath) {
      const current = list.find((branch) => branch.path === selectedPath);
      if (current) return current;
      const pinnedMatch = pinned.find((branch) => branch.path === selectedPath);
      if (pinnedMatch) return { ...pinnedMatch, batches: pinnedMatch.batches ?? [] };
    }
    const fallbackPinned = pinned[0];
    return list[0] ?? (fallbackPinned ? { ...fallbackPinned, batches: fallbackPinned.batches ?? [] } : undefined);
  });
  const [batch] = createResource(selectedBatchId, (batchId) => orpc<Batch>("get_batch", { batchId }));
  const [build] = createResource(selectedBuildId, (buildId) => orpc<Build>("get_build", { buildId }));
  const [branchBatches] = createResource(
    () => selectedBranch()?.path,
    (path) => orpc<BatchSummary[]>("list_batches", { path }),
  );
  const [childLogs] = createResource(childLogRequest, (input) =>
    orpc<ChildLogs>("get_child_logs", { ...input, maxBytesPerLog: 40_000 }),
  );
  const [traffic, { refetch: refetchTraffic }] = createResource(trafficTick, () => trafficRequest());

  const pinnedBranchSet = createMemo(() => new Set(pinnedBranchRecords().map((branch) => branch.path)));
  const pinnedBranches = createMemo(() => {
    const currentBranches = new Map((branches() ?? []).map((branch) => [branch.path, branch]));
    return pinnedBranchRecords().map((branch) => currentBranches.get(branch.path) ?? { ...branch, batches: branch.batches ?? [] });
  });
  const unpinnedBranches = createMemo(() => (branches() ?? []).filter((branch) => !pinnedBranchSet().has(branch.path)));

  const ensureChildLogs = (buildId: number) => {
    if (childLogCache()[buildId]) return;
    const pending = childLogRequest();
    if (childLogs.loading && pending?.buildId === buildId) return;
    setChildLogRequest({ buildId, logMatch: "" });
  };

  const currentChildLogs = createMemo(() => {
    const buildId = selectedBuildId();
    if (!buildId) return undefined;
    const cached = childLogCache()[buildId];
    if (cached) return cached;
    const pending = childLogRequest();
    const loaded = childLogs();
    if (pending?.buildId === buildId && loaded) return loaded;
    return undefined;
  });

  const isLoadingChildLogs = (buildId: number) => childLogs.loading && !childLogCache()[buildId] && childLogRequest()?.buildId === buildId;

  createEffect(() => {
    const loaded = childLogs();
    if (!loaded) return;
    setChildLogCache((cache) => ({ ...cache, [loaded.buildId]: loaded }));
  });

  createEffect(() => {
    const currentBranches = new Map((branches() ?? []).map((branch) => [branch.path, branch]));
    if (currentBranches.size === 0) return;
    setPinnedBranchRecords((records) =>
      records.map((record) => {
        const current = currentBranches.get(record.path);
        return current ? { name: current.name, path: current.path, batches: current.batches } : record;
      }),
    );
  });

  createEffect(() => {
    const snapshot = traffic();
    if (snapshot) setTrafficRecording(snapshot.recording);
  });

  createEffect(() => {
    if (!trafficRecording()) return;
    const timer = window.setInterval(() => setTrafficTick((tick) => tick + 1), 1000);
    onCleanup(() => window.clearInterval(timer));
  });

  const startTraffic = async () => {
    const snapshot = await trafficRequest("/start", "POST");
    setTrafficRecording(snapshot.recording);
    refetchTraffic();
  };

  const stopTraffic = async () => {
    const snapshot = await trafficRequest("/stop", "POST");
    setTrafficRecording(snapshot.recording);
    refetchTraffic();
  };

  const clearTraffic = async () => {
    const snapshot = await trafficRequest("/clear", "POST");
    setTrafficRecording(snapshot.recording);
    refetchTraffic();
  };

  const refreshAll = () => {
    setChildLogCache({});
    setChildLogRequest(undefined);
    setExpandedLogBuildId(undefined);
    refetchBranches();
  };

  createEffect(() => {
    saveState({
      projectPath: projectPath(),
      search: search(),
      hasPr: hasPr(),
      selectedBranchPath: selectedBranchPath(),
      selectedBatchId: selectedBatchId(),
      selectedBuildId: selectedBuildId(),
      selectedBuildName: selectedBuildName(),
      trafficOpen: trafficOpen(),
      activeView: activeView(),
    });
  });

  createEffect(() => {
    saveUiPrefs({
      buildView: buildView(),
      failedMatchCase: failedMatchCase(),
      failedWholeWord: failedWholeWord(),
      failedRegex: failedRegex(),
      failedShowTime: failedShowTime(),
      showRawTests: showRawTests(),
      showSummaryTests: showSummaryTests(),
      groupTestsByType: groupTestsByType(),
      testViewMode: testViewMode(),
      testMatchCase: testMatchCase(),
      testWholeWord: testWholeWord(),
      testRegex: testRegex(),
      headerOpen: headerOpen(),
      sidebarOpen: sidebarOpen(),
      statusBarOpen: statusBarOpen(),
      pinnedBranchesOpen: pinnedBranchesOpen(),
      branchesOpen: branchesOpen(),
      batchesOpen: batchesOpen(),
      pinnedBranchPaths: pinnedBranchRecords().map((branch) => branch.path),
      pinnedBranches: pinnedBranchRecords(),
    });
  });

  const selectBranch = (branch: BranchBatches) => {
    setSelectedBranchPath(branch.path);
    const remembered = lastBatchByBranch()[branch.path];
    const nextBatch = branch.batches.find((batch) => batch.id === remembered) ?? branch.batches[0];
    setSelectedBatchId(nextBatch?.id);
  };

  const togglePinnedBranch = (branch: BranchBatches) => {
    setPinnedBranchRecords((branches) => {
      if (branches.some((item) => item.path === branch.path)) return branches.filter((item) => item.path !== branch.path);
      return [...branches, { name: branch.name, path: branch.path, batches: branch.batches }];
    });
  };

  const selectBatch = (batchId: number) => {
    setSelectedBatchId(batchId);
    setSelectedBuildId(undefined);
    const branch = selectedBranch();
    if (branch) {
      setLastBatchByBranch((current) => ({ ...current, [branch.path]: batchId }));
    }
  };

  const visibleBatches = createMemo(() => {
    const branch = selectedBranch();
    if (!branch) return [];
    const batches = branchBatches() && branchBatches()!.length > 0 ? branchBatches()! : branch.batches;
    return expandedBatchBranches()[branch.path] ? batches : batches.slice(0, 10);
  });

  createEffect(() => {
    const branch = selectedBranch();
    const batches = branchBatches();
    if (!branch || !batches || batches.length === 0) return;
    const remembered = lastBatchByBranch()[branch.path];
    const selectedStillExists = batches.some((item) => item.id === selectedBatchId());
    if (selectedStillExists) return;
    const nextBatch = batches.find((item) => item.id === remembered) ?? batches[0];
    setSelectedBatchId(nextBatch?.id);
  });

  const logEntriesByChild = createMemo(() => {
    const groups = new Map<number, ChildLogs["entries"]>();
    for (const entry of currentChildLogs()?.entries ?? []) {
      groups.set(entry.child.id, [...(groups.get(entry.child.id) ?? []), entry]);
    }
    return groups;
  });
  const failedSearchRegex = createMemo(() => compileSearch(failedSearch(), {
    matchCase: failedMatchCase(),
    wholeWord: failedWholeWord(),
    regex: failedRegex(),
  }));
  const failedLogEntries = createMemo(() => {
    const regex = failedSearchRegex();
    return (currentChildLogs()?.entries ?? [])
      .map((entry) => {
        const logs = (entry.logs ?? []).filter((line) => line.isError).filter((line) => lineMatches(line, regex));
        return { ...entry, logs };
      })
      .filter((entry) => entry.logs.length > 0);
  });
  const testSearchRegex = createMemo(() => compileSearch(testSearch(), {
    matchCase: testMatchCase(),
    wholeWord: testWholeWord(),
    regex: testRegex(),
  }));
  const parsedTests = createMemo(() => {
    const regex = testSearchRegex();
    const items = showSummaryTests()
      ? [...(currentChildLogs()?.tests ?? []), ...(currentChildLogs()?.summaries ?? [])]
      : (currentChildLogs()?.tests ?? []);
    return items
      .filter((item) => {
        if (!regex) return true;
        regex.lastIndex = 0;
        return regex.test([
          item.kind,
          item.title,
          item.runner,
          item.pythonTest,
          item.pythonFile,
          item.jsTest,
          item.tourName,
          item.preset,
          item.command,
          ...item.tags,
          ...item.lines.map((line) => line.message),
          ...(item.sourceLines ?? []).map((line) => line.message),
          ...(item.crashes ?? []).flatMap((crash) => [crash.title, crash.message]),
        ].filter(Boolean).join(" "));
      });
  });
  const groupedParsedTests = createMemo(() => {
    const labels: Record<string, string> = {
      hoot: "Hoot",
      tour: "Tours",
      python: "Python",
      summary: "Summary",
      unknown: "Unknown",
    };
    const order = ["python", "hoot", "tour", "summary", "unknown"];
    const groups = new Map<string, { kind: string; label: string; tests: ParsedTest[] }>();
    for (const test of parsedTests()) {
      const group = groups.get(test.kind) ?? { kind: test.kind, label: labels[test.kind] ?? test.kind, tests: [] };
      group.tests.push(test);
      groups.set(test.kind, group);
    }
    return [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  });
  const expandAllTests = () => {
    setCollapsedTestGroups({});
    setCollapsedTests({});
  };
  const collapseAllTests = () => {
    setCollapsedTestGroups(Object.fromEntries(groupedParsedTests().map((group) => [group.kind, true])));
    setCollapsedTests(Object.fromEntries(parsedTests().map((test) => [parsedTestKey(test), true])));
  };
  const areGroupTestsCollapsed = (tests: ParsedTest[]) => tests.every((test) => collapsedTests()[parsedTestKey(test)]);
  const setGroupTestsCollapsed = (tests: ParsedTest[], collapsed: boolean) => {
    setCollapsedTests((state) => {
      const next = { ...state };
      for (const test of tests) {
        next[parsedTestKey(test)] = collapsed;
      }
      return next;
    });
  };
  const rawTestLogEntries = createMemo(() => {
    const regex = testSearchRegex();
    return (currentChildLogs()?.entries ?? [])
      .map((entry) => {
        const logs = (entry.logs ?? []).filter((line) => line.isError).filter((line) => lineMatches(line, regex));
        return { ...entry, logs };
      })
      .filter((entry) => entry.logs.length > 0);
  });
  const unparsedTestLogEntries = createMemo(() => {
    const regex = testSearchRegex();
    const groups = new Map<number, ChildLogs["entries"][number]>();
    for (const item of currentChildLogs()?.unparsed ?? []) {
      if (!lineMatches(item.line, regex)) continue;
      const existing = groups.get(item.child.id);
      if (existing) {
        existing.logs = [...(existing.logs ?? []), item.line];
        continue;
      }
      groups.set(item.child.id, {
        child: item.child,
        status: item.child.status,
        logs: [item.line],
      });
    }
    return [...groups.values()]
      .filter((entry) => entry.logs.length > 0);
  });

  const selectBuildSlot = (item: Batch["builds"][number]) => {
    setSelectedBuildName(item.name);
    setSelectedBuildId(item.id);
    setExpandedLogBuildId(undefined);
  };

  createEffect(() => {
    const currentBatch = batch();
    if (!currentBatch) return;
    const needle = selectedBuildName().toLowerCase();
    const currentBuildId = selectedBuildId();
    if (currentBuildId && currentBatch.builds.some((item) => item.id === currentBuildId)) return;
    const match =
      currentBatch.builds.find((item) => item.name.toLowerCase() === needle) ??
      currentBatch.builds.find((item) => item.name.toLowerCase().includes(needle)) ??
      currentBatch.builds[0];
    if (!match) return;
    setSelectedBuildName(match.name);
    setSelectedBuildId(match.id);
  });

  createEffect(() => {
    const buildId = selectedBuildId();
    if (!buildId || buildView() === "builds") return;
    ensureChildLogs(buildId);
  });

  return (
    <div class="app">
      <aside class="activity">
        <button class="activity-btn" classList={{ active: activeView() === "runbot" }} title="Runbot" aria-label="Runbot" onClick={() => {
          setActiveView("runbot");
          setSidebarOpen(true);
        }}>
          <Icon name="list" size={16} />
        </button>
        <button class="activity-btn" classList={{ active: activeView() === "configurator" }} title="Chameleon configurator" aria-label="Chameleon configurator" onClick={() => setActiveView("configurator")}>
          <Icon name="pet" size={17} />
        </button>
        <div class="spacer" />
        <button class="activity-btn" classList={{ active: settingsOpen() }} title="Settings" aria-label="Settings" onClick={() => setSettingsOpen((open) => !open)}>
          <Icon name="settings" size={16} />
        </button>
      </aside>

      <div class="appmain">
        <header class="topbar">
          <div class="crumbs">
            <span class="proj"><span class="mark">R</span> {projects()?.find((project) => project.path === projectPath())?.name ?? "R&D"}</span>
            <span class="sep">/</span>
            <span class="cur">{selectedBranch()?.name ?? "branch"}</span>
            <span class="sep">·</span>
            <span class="mono muted">{selectedBatchId() ?? "batch"}</span>
          </div>
          <div class="topbar-spacer" />
          <label class="project-select" title="Project">
            <select value={projectPath()} onInput={(event) => setProjectPath(event.currentTarget.value)}>
              <Show when={projects()} fallback={<option value="/runbot/rd-1">R&D</option>}>
                <For each={projects()}>{(project) => <option value={project.path}>{project.name}</option>}</For>
              </Show>
            </select>
          </label>
          <div class="searchwrap">
            <Icon name="search" size={12} />
            <input value={search()} onInput={(event) => setSearch(event.currentTarget.value)} placeholder="branch, sha, module, PR" />
            <span class="kbd">/</span>
          </div>
          <button class="filter-chip" data-on={hasPr() ? "1" : "0"} onClick={() => setHasPr((value) => !value)}>
            <PullRequestIcon /> PRs
          </button>
          <button class="icon-btn" classList={{ active: trafficOpen() }} title="Traffic" onClick={() => setTrafficOpen((open) => !open)}>
            <Icon name="traffic" size={13} />
            Traffic
          </button>
          <button class="icon-btn primary" title="Refresh" onClick={refreshAll}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        </header>

        <Show when={activeView() === "configurator"} fallback={
        <div class="main" classList={{ "traffic-open": trafficOpen(), "sidebar-hidden": !sidebarOpen() }}>
          <Show when={sidebarOpen()}>
          <aside class="col sidebar scroll">
            <Show when={pinnedBranches().length > 0}>
              <button class="section-head section-toggle" aria-expanded={pinnedBranchesOpen()} onClick={() => setPinnedBranchesOpen((open) => !open)}>
                <div class="lhs"><span class="chev sidebar-chev">›</span><span>Pinned branches</span></div>
                <span class="count">{pinnedBranches().length}</span>
              </button>
              <Show when={pinnedBranchesOpen()}>
              <div class="list">
                <For each={pinnedBranches()}>
                  {(branch) => (
                    <div class="list-row">
                      <button class="list-item" data-status={uiStatus(branchStatus({ ...branch, batches: branch.batches ?? [] }))} data-selected={selectedBranch()?.path === branch.path ? "1" : "0"} onClick={() => selectBranch({ ...branch, batches: branch.batches ?? [] })}>
                        <StatusGlyph status={branchStatus({ ...branch, batches: branch.batches ?? [] })} />
                        <span class="name">{branch.name}</span>
                      </button>
                      <button class="row-action pinned" title="Unstar branch" aria-label={`Unstar ${branch.name}`} onClick={() => togglePinnedBranch({ ...branch, batches: branch.batches ?? [] })}>
                        <Icon name="star" size={11} />
                      </button>
                    </div>
                  )}
                </For>
              </div>
              </Show>
            </Show>

            <button class="section-head section-toggle" aria-expanded={branchesOpen()} onClick={() => setBranchesOpen((open) => !open)}>
              <div class="lhs"><span class="chev sidebar-chev">›</span><span>Branches</span></div>
              <span class="count">{branches()?.length ?? 0}</span>
            </button>
            <Show when={branchesOpen()}>
            <Switch>
              <Match when={branches.loading}><div class="empty">Loading branches</div></Match>
              <Match when={branches.error}><div class="message-error">{String(branches.error)}</div></Match>
              <Match when={branches()}>
                <div class="list">
                  <For each={unpinnedBranches()}>
                    {(branch) => (
                      <div class="list-row">
                        <button class="list-item" data-status={uiStatus(branchStatus(branch))} data-selected={selectedBranch()?.path === branch.path ? "1" : "0"} onClick={() => selectBranch(branch)}>
                          <StatusGlyph status={branchStatus(branch)} />
                          <span class="name">{branch.name}</span>
                        </button>
                        <button class="row-action" title="Star branch" aria-label={`Star ${branch.name}`} onClick={() => togglePinnedBranch(branch)}>
                          <Icon name="star" size={11} />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Match>
            </Switch>
            </Show>

            <button class="section-head section-toggle" aria-expanded={batchesOpen()} onClick={() => setBatchesOpen((open) => !open)}>
              <div class="lhs"><span class="chev sidebar-chev">›</span><span>Batches</span><span class="pill-name mono">{selectedBranch()?.name}</span></div>
              <span class="count">{branchBatches()?.length ?? selectedBranch()?.batches.length ?? 0}</span>
            </button>
            <Show when={batchesOpen()}>
            <Show when={selectedBranch()} fallback={<div class="empty">Search for a branch</div>}>
              {(branch) => (
                <>
                  <div class="list">
                    <For each={visibleBatches()}>
                      {(item) => (
                        <button class="list-item" data-status={uiStatus(batchStatus(item))} data-selected={selectedBatchId() === item.id ? "1" : "0"} onClick={() => selectBatch(item.id)}>
                          <StatusGlyph status={batchStatus(item)} />
                          <span class="name mono">{item.id}</span>
                          <span class="meta">{batchLabel(item.label)}</span>
                        </button>
                      )}
                    </For>
                    <Show when={(branchBatches()?.length ?? branch().batches.length) > 10}>
                      <button class="show-more" onClick={() => setExpandedBatchBranches((current) => ({ ...current, [branch().path]: !current[branch().path] }))}>
                        {expandedBatchBranches()[branch().path] ? "Show less" : `Show more (${(branchBatches()?.length ?? branch().batches.length) - 10})`}
                      </button>
                    </Show>
                  </div>
                </>
              )}
            </Show>
            </Show>
          </aside>
          </Show>

          <section class="detail">
            <Show when={build()} fallback={<div class="empty">{selectedBuildId() || build.loading ? "Loading build" : "Select a build"}</div>}>
              {(data) => {
                const successCount = createMemo(() => data().children.filter((child) => child.status === "success").length);
                const errorCount = createMemo(() => data().children.filter((child) => child.status === "error").length);
                const runningCount = createMemo(() => data().children.filter((child) => child.status === "pending").length);
                return (
                  <>
                      <Show when={batch()}>
                        {(batchData) => (
                          <details class="detail-head" open={headerOpen()} onToggle={(event) => setHeaderOpen(event.currentTarget.open)}>
                            <summary>
                              <div class="row1">
                                <span class="chev">›</span>
                                <StatusGlyph status={batchStatus(
                                  branchBatches()?.find((item) => item.id === batchData().id)
                                  ?? selectedBranch()?.batches.find((item) => item.id === batchData().id),
                                  batchData(),
                                )} />
                                <span class="branch-name">{batchData().bundle ?? selectedBranch()?.name}</span>
                                <span class="batch-chip">Batch {batchData().id}</span>
                                <span class="batch-chip">{batchData().version ?? "version ?"}</span>
                                <label class="slot-select" onClick={(event) => event.stopPropagation()}>
                                  <select
                                    value={selectedBuildId() ?? ""}
                                    onChange={(event) => {
                                      const id = Number(event.currentTarget.value);
                                      const item = batchData().builds.find((build) => build.id === id);
                                      if (item) selectBuildSlot(item);
                                    }}
                                  >
                                    <For each={batchData().builds}>
                                      {(item) => <option value={item.id}>{buildLabel(item)} · {item.id} · {statusLabel(item.status)}</option>}
                                    </For>
                                  </select>
                                </label>
                                <div class="head-actions">
                                  <ExternalLink href={`/runbot/build/${data().id}`}><Icon name="open" size={12} /> Open</ExternalLink>
                                  <button class="icon-btn" title="More"><Icon name="more" size={14} /></button>
                                </div>
                              </div>
                            </summary>
                            <div class="batch-panel">
                              <div class="batch-panel-head">
                                <span>{batchData().createDate ?? "date ?"}</span>
                                <ExternalLink href={`/runbot/batch/${batchData().id}`}>Open batch</ExternalLink>
                              </div>
                              <BatchColumns batch={batchData()} selectedBuildId={selectedBuildId()} selectedBuildName={selectedBuildName()} selectBuildSlot={selectBuildSlot} />
                              <div class="build-meta-row">
                                <span class="metrics">
                                  <span><span class="metric-label">build</span> <span class="metric-value">{data().buildTime ?? "?"}</span></span>
                                  <span><span class="metric-label">wait</span> <span class="metric-value">{data().waitTime ?? "?"}</span></span>
                                  <span><span class="metric-label">load</span> <span class="metric-value">{data().loadTime ?? "?"}</span></span>
                                  <span><span class="metric-value">{successCount()}/{data().children.length}</span> <span class="metric-label">pass</span></span>
                                  <span><span class="metric-error">{errorCount()} fail</span> · <span class="metric-value">{runningCount()}</span> <span class="metric-label">run</span></span>
                                </span>
                              </div>
                            </div>
                          </details>
                        )}
                      </Show>

                    <div class="detail-body">
                      <div class="build-tabs">
                        <div class="tabbar">
                          <button classList={{ active: buildView() === "builds" }} onClick={() => setBuildView("builds")}>Builds</button>
                          <button classList={{ active: buildView() === "tests" }} onClick={() => {
                            setBuildView("tests");
                            ensureChildLogs(data().id);
                          }}>
                            Tests <span>{parsedTests().length}/{unparsedTestLogEntries().reduce((total, entry) => total + entry.logs.length, 0)}</span>
                          </button>
                        </div>
                        <Switch>
                          <Match when={buildView() === "builds"}>
                            <div class="builds">
                              <button class="load-logs" onClick={() => {
                                setExpandedLogBuildId(data().id);
                                ensureChildLogs(data().id);
                              }}>
                                <Icon name="layers" size={11} /> Expand All Logs
                              </button>
                              <For each={data().children}>
                                {(child) => (
                                  <details class="build-node" data-status={uiStatus(child.status)} open={expandedLogBuildId() === data().id}>
                                    <summary class="build-row">
                                      <span class="tree" />
                                      <span class="chev">›</span>
                                      <div class="bname"><span class="bid">{child.id}</span><span class="label">{child.name}</span></div>
                                      <span class="timing">{child.duration ?? ""}</span>
                                      <StatusGlyph status={child.status} pill />
                                      <LinkMenu links={child.links} />
                                    </summary>
                                    <Show when={isLoadingChildLogs(data().id)}>
                                      <div class="log-loading">Loading logs</div>
                                    </Show>
                                    <For each={logEntriesByChild().get(child.id) ?? []}>
                                      {(entry) => <LogTable entry={entry} />}
                                    </For>
                                  </details>
                                )}
                              </For>
                            </div>
                          </Match>
                          <Match when={buildView() === "tests"}>
                            <div class="failed-view tests-view">
                              <div class="failed-toolbar">
                                <select class="test-kind" value={testViewMode()} onChange={(event) => setTestViewMode(event.currentTarget.value as TestViewMode)}>
                                  <option value="all">All</option>
                                  <option value="parsed">Parsed</option>
                                  <option value="unparsed">Unparsed</option>
                                  <option value="raw">Raw</option>
                                </select>
                                <div class="failed-search">
                                  <Icon name="search" size={11} />
                                  <input value={testSearch()} onInput={(event) => setTestSearch(event.currentTarget.value)} placeholder="Search tests" />
                                </div>
                                <button title="Match case" classList={{ active: testMatchCase() }} onClick={() => setTestMatchCase((value) => !value)}>Aa</button>
                                <button title="Match whole word" classList={{ active: testWholeWord() }} onClick={() => setTestWholeWord((value) => !value)}>ab</button>
                                <button title="Use regular expression" classList={{ active: testRegex() }} onClick={() => setTestRegex((value) => !value)}>.*</button>
                                <span class="toolbar-separator" aria-hidden="true" />
                                <CheckboxComponent checked={showRawTests()} label="Raw" title="Show original raw log lines under parsed tests" onChange={setShowRawTests} />
                                <CheckboxComponent checked={showSummaryTests()} label="Summary" title="Show summary log lines in parsed tests" onChange={setShowSummaryTests} />
                                <CheckboxComponent checked={groupTestsByType()} label="Group" title="Group parsed tests by type" onChange={setGroupTestsByType} />
                                <button title="Expand all groups and tests" aria-label="Expand all groups and tests" onClick={expandAllTests}><Icon name="expand" size={12} /></button>
                                <button title="Collapse all groups and tests" aria-label="Collapse all groups and tests" onClick={collapseAllTests}><Icon name="collapse" size={12} /></button>
                                <button title="Show time in raw log lines" classList={{ active: failedShowTime() }} onClick={() => setFailedShowTime((value) => !value)}>time</button>
                              </div>
                              <Show when={isLoadingChildLogs(data().id)}>
                                <div class="log-loading">Loading tests</div>
                              </Show>
                              <Show when={testSearch() && testRegex() && !testSearchRegex()}>
                                <div class="message-error compact">Invalid regular expression</div>
                              </Show>
                              <div class="test-results">
                                <Show when={(testViewMode() === "all" || testViewMode() === "parsed") && parsedTests().length > 0}>
                                  <Show when={groupTestsByType()} fallback={
                                    <div class="test-list">
                                      <For each={parsedTests()}>
                                        {(test) => (
                                          <ParsedTestCard
                                            test={test}
                                            showRaw={showRawTests()}
                                            collapsed={Boolean(collapsedTests()[parsedTestKey(test)])}
                                            onToggleCollapsed={() => setCollapsedTests((state) => ({ ...state, [parsedTestKey(test)]: !state[parsedTestKey(test)] }))}
                                          />
                                        )}
                                      </For>
                                    </div>
                                  }>
                                    <div class="test-group-list">
                                      <For each={groupedParsedTests()}>
                                        {(group) => (
                                          <section class="test-group">
                                            <div
                                              class="test-group-head"
                                              role="button"
                                              tabIndex={0}
                                              aria-expanded={!collapsedTestGroups()[group.kind]}
                                              onClick={() => setCollapsedTestGroups((state) => ({ ...state, [group.kind]: !state[group.kind] }))}
                                              onKeyDown={(event) => {
                                                if (event.key !== "Enter" && event.key !== " ") return;
                                                event.preventDefault();
                                                setCollapsedTestGroups((state) => ({ ...state, [group.kind]: !state[group.kind] }));
                                              }}
                                              title={`${collapsedTestGroups()[group.kind] ? "Expand" : "Collapse"} ${group.label}`}
                                            >
                                              <span class="chev">›</span>
                                              <span>{group.label} ({group.tests.length})</span>
                                              <button
                                                class="test-group-action"
                                                title={`${areGroupTestsCollapsed(group.tests) ? "Expand" : "Collapse"} tests in ${group.label}`}
                                                aria-label={`${areGroupTestsCollapsed(group.tests) ? "Expand" : "Collapse"} tests in ${group.label}`}
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setGroupTestsCollapsed(group.tests, !areGroupTestsCollapsed(group.tests));
                                                }}
                                              >
                                                <Icon name={areGroupTestsCollapsed(group.tests) ? "expand" : "collapse"} size={11} />
                                              </button>
                                            </div>
                                            <Show when={!collapsedTestGroups()[group.kind]}>
                                              <div class="test-list">
                                                <For each={group.tests}>
                                                  {(test) => (
                                                    <ParsedTestCard
                                                      test={test}
                                                      showRaw={showRawTests()}
                                                      collapsed={Boolean(collapsedTests()[parsedTestKey(test)])}
                                                      onToggleCollapsed={() => setCollapsedTests((state) => ({ ...state, [parsedTestKey(test)]: !state[parsedTestKey(test)] }))}
                                                    />
                                                  )}
                                                </For>
                                              </div>
                                            </Show>
                                          </section>
                                        )}
                                      </For>
                                    </div>
                                  </Show>
                                </Show>
                                <Show when={(testViewMode() === "all" || testViewMode() === "unparsed") && unparsedTestLogEntries().length > 0}>
                                  <div class="test-section-head">Unparsed</div>
                                  <div class="failed-list">
                                    <For each={unparsedTestLogEntries()}>
                                      {(entry) => <LogTable entry={entry} showHeader={false} showLevel={false} showTime={failedShowTime()} compact />}
                                    </For>
                                  </div>
                                </Show>
                                <Show when={testViewMode() === "raw" && rawTestLogEntries().length > 0}>
                                  <div class="failed-list">
                                    <For each={rawTestLogEntries()}>
                                      {(entry) => <LogTable entry={entry} showHeader={false} showLevel={false} showTime={failedShowTime()} compact />}
                                    </For>
                                  </div>
                                </Show>
                                <Show when={!isLoadingChildLogs(data().id) && (
                                  (testViewMode() === "parsed" && parsedTests().length === 0) ||
                                  (testViewMode() === "unparsed" && unparsedTestLogEntries().length === 0) ||
                                  (testViewMode() === "raw" && rawTestLogEntries().length === 0) ||
                                  (testViewMode() === "all" && parsedTests().length === 0 && unparsedTestLogEntries().length === 0)
                                )}>
                                  <div class="empty compact-empty">No tests for this filter</div>
                                </Show>
                              </div>
                            </div>
                          </Match>
                        </Switch>
                      </div>
                    </div>
                  </>
                );
              }}
            </Show>
          </section>

          <Show when={trafficOpen()}>
            <aside class="traffic-pane">
              <div class="traffic-head">
                <h2>Server Traffic</h2>
                <div class="traffic-actions">
                  <button class="record" disabled={trafficRecording()} onClick={startTraffic}>Record</button>
                  <button disabled={!trafficRecording()} onClick={stopTraffic}>Stop</button>
                  <button onClick={clearTraffic}>Clear</button>
                </div>
              </div>
              <Switch>
                <Match when={traffic.error}><div class="message-error">{String(traffic.error)}</div></Match>
                <Match when={traffic()}>
                  <div class="traffic-list">
                    <Show when={(traffic()?.entries.length ?? 0) > 0} fallback={<div class="empty compact-empty">No recorded traffic</div>}>
                      <For each={traffic()?.entries}>
                        {(entry) => (
                          <article class="traffic-entry" classList={{ failed: Boolean(entry.error) || (entry.status ?? 200) >= 400 }}>
                            <span>{entry.status ?? "ERR"}</span>
                            <strong>{entry.method}</strong>
                            <a class="traffic-url" href={entry.url} title={entry.url} target="_blank" rel="noreferrer">{runbotPath(entry.url)}</a>
                            <small>{entry.durationMs ?? "?"}ms</small>
                            <time>{new Date(entry.time).toLocaleTimeString()}</time>
                          </article>
                        )}
                      </For>
                    </Show>
                  </div>
                </Match>
              </Switch>
            </aside>
          </Show>
        </div>
        }>
          <section class="configurator-view" aria-label="Chameleon configurator">
            <RunbotChameleonConfigurator
              title="Chameleon Configurator"
              description="Tune the runbot pet atlas, animation state, timing, and exported Solid snippet."
            />
          </section>
        </Show>
      </div>

      <Show when={settingsOpen()}>
        <aside class="settings-popover">
          <div class="section-head"><div class="lhs"><span>Settings</span></div></div>
          <label class="setting-row">
            <input type="checkbox" checked={statusBarOpen()} onInput={(event) => setStatusBarOpen(event.currentTarget.checked)} />
            <span>Show status bar</span>
          </label>
        </aside>
      </Show>

      <Show when={statusBarOpen()}>
        <footer class="statusbar">
          <span class="sb-item"><Icon name="branch" size={11} />{selectedBranch()?.name ?? "branch"}</span>
          <span class="sb-item muted mono">{build()?.commit ?? ""}</span>
          <span class="sb-item">Batch {selectedBatchId() ?? "?"}</span>
          <span class="spacer" />
          <span class="sb-item muted">build {build()?.buildTime ?? "?"}</span>
          <span class="sb-item muted">wait {build()?.waitTime ?? "?"}</span>
          <span class="sb-item">odoo.runbot</span>
        </footer>
      </Show>
    </div>
  );
}

function LinkMenu(props: { links: Build["links"] }) {
  const linksByKind = createMemo(() => {
    const groups = new Map<string, Build["links"]>();
    for (const link of props.links) groups.set(link.kind, [...(groups.get(link.kind) ?? []), link]);
    return [...groups.entries()].filter(([kind]) => kind !== "other");
  });
  return (
    <details class="link-menu" onClick={(event) => event.stopPropagation()}>
      <summary>Links</summary>
      <div>
        <For each={linksByKind()}>
          {([kind, items]) => (
            <section>
              <strong>{kind}</strong>
              <For each={items}>{(link) => <ExternalLink href={link.url}>{link.label}</ExternalLink>}</For>
            </section>
          )}
        </For>
      </div>
    </details>
  );
}

function BatchColumns(props: {
  batch: Batch;
  selectedBuildId?: number;
  selectedBuildName: string;
  selectBuildSlot: (item: Batch["builds"][number]) => void;
}) {
  return (
    <div class="batch-columns">
      <section>
        <h3>Links</h3>
        <div class="commits">
          <For each={props.batch.commits}>
            {(commit) => {
              const branch = createMemo(() => branchForCommit(props.batch, commit));
              return (
                <div class="commit">
                  <span>{commit.repository}:</span>
                  <Show when={commit.githubUrl} fallback={<span>{commit.sha}</span>}>
                    <ExternalLink href={commit.githubUrl!}>{commit.sha}</ExternalLink>
                  </Show>
                  <Show when={branch()?.devUrl && branch()?.devBranch} fallback={<span />}>
                    <a class="commit-ref branch-link" href={branch()!.devUrl} target="_blank" rel="noreferrer" title={`Branch ${branch()!.devBranch}`}><span class="ref-icon"><BranchIcon /></span></a>
                  </Show>
                  <Show when={branch()?.mainUrl && prNumber(branch())} fallback={<span />}>
                    <a class="commit-ref pr-link" href={branch()!.mainUrl} target="_blank" rel="noreferrer" title={`PR ${prNumber(branch())}`}><span class="ref-icon"><PullRequestIcon /></span><span>{prNumber(branch())}</span></a>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </section>
      <section>
        <h3>Build slots</h3>
        <div class="build-grid">
          <For each={props.batch.builds}>
            {(item) => (
              <div
                class="build-card"
                data-status={uiStatus(item.status)}
                data-selected={props.selectedBuildId === item.id || props.selectedBuildName === item.name ? "1" : "0"}
                title={`${buildLabel(item)} ${item.id} ${item.statusLabel ?? item.status ?? ""}`.trim()}
              >
                <button class="build-select" onClick={() => props.selectBuildSlot(item)} title={`Select ${buildLabel(item)}`}>
                  <span class="build-name">{buildLabel(item)}</span>
                </button>
                <span class="build-id" title={`Build ${item.id}`}>{item.id}</span>
                <StatusGlyph status={item.status} pill />
                <Show when={item.runUrl}>
                  {(runUrl) => (
                    <ExternalLink href={runUrl()}>
                      <span class="run-link" title={`Open run ${item.id}`} aria-label={`Open run ${item.id}`}>
                        <Icon name="open" size={11} />
                      </span>
                    </ExternalLink>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}

function ParsedTestCard(props: { test: ParsedTest; showRaw?: boolean; collapsed?: boolean; onToggleCollapsed?: () => void }) {
  const [showLocalRaw, setShowLocalRaw] = createSignal(false);
  const rawLines = createMemo(() => {
    const seen = new Set<string>();
    const lines = [...(props.test.sourceLines ?? props.test.lines), ...(props.test.crashes ?? []).map((crash) => crash.sourceLine)];
    return lines.filter((line) => {
      const key = lineKey(props.test.child.id, line);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const showRaw = createMemo(() => props.showRaw || showLocalRaw());
  const copyCommand = async () => {
    if (!props.test.command) return;
    await navigator.clipboard?.writeText(props.test.command);
  };
  return (
    <article class="test-card" data-kind={props.test.kind}>
      <div
        class="test-main"
        title={props.collapsed ? "Expand test" : "Collapse test"}
        onClick={props.onToggleCollapsed}
      >
        <button
          class="test-card-toggle"
          classList={{ expanded: !props.collapsed }}
          title={props.collapsed ? "Expand test" : "Collapse test"}
          aria-label={props.collapsed ? "Expand test" : "Collapse test"}
          aria-expanded={!props.collapsed}
        >
          <span class="chev">›</span>
        </button>
        <span class="test-kind-pill">{props.test.kind}</span>
        <span class="test-title">{props.test.title}</span>
        <span class="test-child">{props.test.child.id}</span>
        <Show when={props.test.preset}><span class="test-tag">{props.test.preset}</span></Show>
        <Show when={rawLines().length > 0}>
          <button
            class="test-raw-toggle"
            classList={{ active: showRaw() }}
            title="Show raw log lines parsed for this test"
            onClick={(event) => {
              event.stopPropagation();
              setShowLocalRaw((value) => !value);
            }}
          >
            raw
          </button>
        </Show>
      </div>
      <Show when={!props.collapsed}>
        <Show when={props.test.pythonTest}>
          <div class="test-runner">
            <span>{props.test.runner === "start_tour" ? "tour runner" : props.test.runner === "browser_js" ? "browser runner" : "python"}</span>
            <code>{props.test.pythonTest}</code>
          </div>
        </Show>
        <Show when={props.test.tourName && props.test.title !== props.test.tourName}>
          <div class="test-sub">tour <code>{props.test.tourName}</code></div>
        </Show>
        <Show when={props.test.pythonFile}>
          <div class="test-sub">file <code>{props.test.pythonFile}</code></div>
        </Show>
        <Show when={props.test.command}>
          {(command) => (
            <div class="test-command">
              <code>{command()}</code>
              <button title="Copy command" onClick={copyCommand}><Icon name="copy" size={11} /></button>
            </div>
          )}
        </Show>
        <div class="test-lines">
          <For each={props.test.lines}>
            {(line) => <pre class="test-message">{line.message}</pre>}
          </For>
        </div>
        <Show when={(props.test.crashes ?? []).length > 0}>
          <div class="test-crashes">
            <div class="test-source-head">Browser crash</div>
            <For each={props.test.crashes}>
              {(crash) => <pre class="test-message crash">{crash.message}</pre>}
            </For>
          </div>
        </Show>
        <Show when={showRaw() && rawLines().length > 0}>
          <div class="test-source">
            <div class="test-source-head">Parsed from</div>
            <For each={rawLines()}>
              {(line) => <pre class="test-message source">{line.message}</pre>}
            </For>
          </div>
        </Show>
      </Show>
    </article>
  );
}

function LogTable(props: { entry: ChildLogs["entries"][number]; showHeader?: boolean; showLevel?: boolean; showTime?: boolean; compact?: boolean }) {
  const lines = createMemo(() => props.entry.logs ?? []);
  const showHeader = createMemo(() => props.showHeader ?? true);
  const showLevel = createMemo(() => props.showLevel ?? true);
  const showTime = createMemo(() => props.showTime ?? true);
  return (
    <div
      class="inline-log"
      classList={{
        "is-error": props.entry.child.status === "error" || props.entry.status === "error",
        "is-compact": props.compact,
        "no-level": !showLevel(),
        "no-time": !showTime(),
      }}
    >
      <Show when={lines().length > 0} fallback={<div class="log-loading">No visible log: {props.entry.status}</div>}>
        <div class="log-table">
          <Show when={showHeader()}>
            <div class="log-table-head">
              <Show when={showTime()}><span>Date (UTC)</span></Show>
              <Show when={showLevel()}><span>Level</span></Show>
              <span>Message</span>
            </div>
          </Show>
          <For each={lines()}>
            {(line) => (
              <div class="log-line" classList={{ "is-error": line.isError }}>
                <Show when={showTime()}><time>{line.date}</time></Show>
                <Show when={showLevel()}><strong>{line.level}</strong></Show>
                <pre>{line.message}</pre>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
