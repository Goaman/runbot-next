import type { RunbotChildBuild, RunbotVisibleLogLine } from "./parsers";

export type RunbotTestKind = "python" | "tour" | "hoot" | "summary" | "unknown";

export interface RunbotParsedTestFailure {
  id: string;
  kind: RunbotTestKind;
  title: string;
  runner?: "browser_js" | "start_tour" | string;
  pythonTest?: string;
  pythonFile?: string;
  jsTest?: string;
  tourName?: string;
  preset?: "desktop" | "mobile" | string;
  tags: string[];
  command?: string;
  crashes?: RunbotBrowserCrash[];
  child: RunbotChildBuild;
  lines: RunbotVisibleLogLine[];
  sourceLines: RunbotVisibleLogLine[];
}

export interface RunbotTestLogEntry {
  child: RunbotChildBuild;
  status: string;
  logs?: RunbotVisibleLogLine[];
}

export interface RunbotUnparsedTestFailure {
  id: string;
  child: RunbotChildBuild;
  message: string;
  line: RunbotVisibleLogLine;
  sourceLine: RunbotVisibleLogLine;
}

export interface RunbotBrowserCrash {
  title: string;
  message: string;
  line: RunbotVisibleLogLine;
  sourceLine: RunbotVisibleLogLine;
}

type ParsedDraft = Omit<RunbotParsedTestFailure, "id" | "command">;

const summaryPatterns = [
  /^Some tests failed:/i,
  /^\d+\s+failed,\s+\d+\s+error\(s\)/i,
  /^\[HOOT\]\s+Failed\s+\d+\s+tests/i,
  /^Disabling auto-retry/i,
  /^Failed tests link:/i,
  /^Module\s+\S+:\s+\d+\s+failures,\s+\d+\s+errors/i,
  /^At least one test failed when loading the modules\./i,
];

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function pythonModuleFromFile(file?: string): string | undefined {
  if (!file) return undefined;
  const match = file.match(/\/addons\/(.+?)\/tests\/(.+?)\.py\b/);
  const addon = match?.[1];
  const module = match?.[2];
  if (!addon || !module) return undefined;
  return `odoo.addons.${addon}.tests.${module.replace(/\//g, ".")}`;
}

function commandFor(failure: ParsedDraft): string | undefined {
  if (!failure.pythonTest) return undefined;
  if (failure.kind === "hoot" && failure.preset) {
    return `./odoo-bin -d test --test-enable --stop-after-init --test-tags ${failure.pythonTest} -- --test-tags /web/tests?debug=assets&preset=${failure.preset}`;
  }
  return `./odoo-bin -d test --test-enable --stop-after-init --test-tags ${failure.pythonTest}`;
}

function isHootWrapper(failure: ParsedDraft): boolean {
  return failure.kind === "hoot" && Boolean(failure.pythonTest) && !failure.jsTest;
}

function failureKey(failure: ParsedDraft): string {
  return [
    failure.child.id,
    failure.kind,
    failure.pythonTest ?? "",
    failure.jsTest ?? "",
    failure.tourName ?? "",
    failure.title,
    failure.preset ?? "",
  ].join("|");
}

function extractTourName(message: string): string | undefined {
  const posTourCall = message.match(/^.*self\.start_pos_tour\((.*)\).*$/m);
  if (posTourCall?.[1]) {
    const keyword = posTourCall[1].match(/\btour_name\s*=\s*(["'])(.*?)\1/);
    if (keyword?.[2]) return keyword[2];
    return [...posTourCall[1].matchAll(/(["'])(.*?)\1/g)].map((match) => match[2]).find(Boolean);
  }
  const call = message.match(/^.*self\.start_tour\((.*)\).*$/m);
  const args = call?.[1];
  if (!args) return undefined;
  const keyword = args.match(/\btour_name\s*=\s*(["'])(.*?)\1/);
  if (keyword?.[2]) return keyword[2];
  const positionalArgs = args.split(/\s*,\s*\w+\s*=/)[0] ?? args;
  const values = [...positionalArgs.matchAll(/(["'])(.*?)\1/g)].map((match) => match[2]).filter(Boolean);
  return values.at(-1);
}

function parseTourStepFailure(line: RunbotVisibleLogLine, child: RunbotChildBuild, sourceLine = line): ParsedDraft | undefined {
  const match = line.message.match(/^FAILED:\s+\[\d+\/\d+\]\s+Tour\s+(.+?)\s+(?:→|->)\s+Step\s+(.+?)(?:\s+\(trigger:\s*([\s\S]*?)\)\.)?([\s\S]*)$/);
  const tourName = match?.[1]?.trim();
  if (!match || !tourName) return undefined;
  const step = compact(match[2] ?? "");
  const details = compact(`${match[3] ? `trigger: ${match[3]}. ` : ""}${match[4] ?? ""}`);
  return {
    kind: "tour",
    title: tourName,
    runner: "start_tour",
    tourName,
    tags: ["tour", "start_tour", tourName],
    child,
    lines: [{ ...line, message: [step, details].filter(Boolean).join("\n") }],
    sourceLines: [sourceLine],
  };
}

function parseHoot(line: RunbotVisibleLogLine, child: RunbotChildBuild, sourceLine = line): ParsedDraft | undefined {
  const match = line.message.match(/^\[HOOT\]\s+Test\s+"([^"]+)"\s+failed:\s*([\s\S]*)$/i);
  if (!match) return undefined;
  const jsTest = match[1];
  const detail = match[2] ?? "";
  if (!jsTest) return undefined;
  const preset = child.name.toLowerCase().includes("mobile") || /preset=mobile\b/.test(line.message) ? "mobile" : "desktop";
  return {
    kind: "hoot",
    title: jsTest,
    jsTest,
    preset,
    tags: ["hoot", preset],
    child,
    lines: [{ ...line, message: detail.trim() || line.message }],
    sourceLines: [sourceLine],
  };
}

function parseFailLine(line: RunbotVisibleLogLine, child: RunbotChildBuild, sourceLine = line): ParsedDraft | undefined {
  const match = line.message.match(/^FAIL:\s+([^\s]+)\s+Traceback[\s\S]*?File\s+"\s*([^"]+?)\s*",\s+line\s+\d+,\s+in\s+(\w+)([\s\S]*)$/);
  if (!match) return undefined;
  const pythonTest = match[1];
  const pythonFile = match[2];
  const method = match[3];
  const tail = match[4] ?? "";
  if (!pythonTest || !pythonFile || !method) return undefined;
  const lower = line.message.toLowerCase();
  const preset = lower.includes("preset=mobile") ? "mobile" : lower.includes("preset=desktop") ? "desktop" : undefined;
  const hasTourRunner = lower.includes("start_tour") || lower.includes("start_pos_tour");
  const kind: RunbotTestKind = lower.includes("browser_js") || lower.includes("failed tests link:")
    ? lower.includes("[hoot]") || lower.includes("/web/tests")
      ? "hoot"
      : "tour"
    : hasTourRunner
      ? "tour"
    : "python";
  const runner = hasTourRunner ? "start_tour" : lower.includes("browser_js") ? "browser_js" : undefined;
  const tags: string[] = [kind];
  if (preset) tags.push(preset);
  if (runner) tags.push(runner);
  const module = pythonModuleFromFile(pythonFile);
  const tourName = kind === "tour" ? extractTourName(line.message) : undefined;
  if (tourName) tags.push(tourName);
  return {
    kind,
    title: tourName && runner === "start_tour" ? tourName : pythonTest,
    ...(runner ? { runner } : {}),
    pythonTest: module ? `${module}.${method}` : pythonTest,
    pythonFile: compact(pythonFile),
    ...(tourName ? { tourName } : {}),
    ...(preset ? { preset } : {}),
    tags,
    child,
    lines: [{ ...line, message: tail.trim() || line.message }],
    sourceLines: [sourceLine],
  };
}

function parseSummary(line: RunbotVisibleLogLine, child: RunbotChildBuild, sourceLine = line): ParsedDraft | undefined {
  if (!summaryPatterns.some((pattern) => pattern.test(line.message))) return undefined;
  return {
    kind: "summary",
    title: compact(line.message),
    tags: ["summary"],
    child,
    lines: [line],
    sourceLines: [sourceLine],
  };
}

function parseLine(line: RunbotVisibleLogLine, child: RunbotChildBuild, sourceLine = line): ParsedDraft | undefined {
  return parseHoot(line, child, sourceLine) ?? parseFailLine(line, child, sourceLine) ?? parseTourStepFailure(line, child, sourceLine) ?? parseSummary(line, child, sourceLine);
}

function parseBrowserCrash(line: RunbotVisibleLogLine, sourceLine = line): RunbotBrowserCrash | undefined {
  const message = compact(line.message);
  if (!message) return undefined;
  const normalized = message.replace(/^Error received after termination:\s*/i, "");
  if (!/^(?:[A-Za-z]*Error|Uncaught[A-Za-z]*Error):/i.test(normalized)) return undefined;
  return {
    title: normalized.split(/\s+at\s+/)[0] ?? normalized,
    message: normalized,
    line,
    sourceLine,
  };
}

function attachCrash(failure: RunbotParsedTestFailure, crash: RunbotBrowserCrash): void {
  failure.crashes ??= [];
  if (failure.crashes.some((item) => item.message === crash.message && item.sourceLine === crash.sourceLine)) return;
  failure.crashes.push(crash);
}

function mergeFailureDetails(target: RunbotParsedTestFailure, source: RunbotParsedTestFailure): void {
  target.lines.push(...source.lines);
  target.sourceLines.push(...source.sourceLines);
  for (const crash of source.crashes ?? []) attachCrash(target, crash);
  for (const tag of source.tags) {
    if (!target.tags.includes(tag)) target.tags.push(tag);
  }
}

function findTourFailure(failures: Iterable<RunbotParsedTestFailure>, child: RunbotChildBuild, tourName?: string): RunbotParsedTestFailure | undefined {
  const candidates = [...failures].filter((failure) => failure.child.id === child.id && failure.kind === "tour");
  if (tourName) {
    return candidates.reverse().find((failure) => failure.tourName === tourName || failure.title === tourName);
  }
  return candidates.at(-1);
}

export function splitRunbotTestErrorLine(line: RunbotVisibleLogLine): RunbotVisibleLogLine[] {
  const markers = [...line.message.matchAll(/^(?:\[HOOT\]\s+Test\s+"[^"]+"\s+failed:|FAIL:\s+\S+|Some tests failed:|Failed tests link:|\d+\s+failed,\s+\d+\s+error\(s\))/gim)];
  if (markers.length <= 1) return [line];

  return markers.map((marker, index) => {
    const start = marker.index ?? 0;
    const end = markers[index + 1]?.index ?? line.message.length;
    return { ...line, message: line.message.slice(start, end).trim() };
  });
}

export function parseRunbotTestFailures(entries: RunbotTestLogEntry[], options: { includeSummary?: boolean } = {}): RunbotParsedTestFailure[] {
  const merged = new Map<string, RunbotParsedTestFailure>();
  for (const entry of entries) {
    const pendingHoots: RunbotParsedTestFailure[] = [];
    const pendingCrashes: RunbotBrowserCrash[] = [];
    let lastTour: RunbotParsedTestFailure | undefined;
    const flushPendingCrashes = (target = lastTour) => {
      if (!target) return;
      for (const crash of pendingCrashes.splice(0)) attachCrash(target, crash);
    };
    for (const line of entry.logs ?? []) {
      if (!line.isError) continue;
      for (const splitLine of splitRunbotTestErrorLine(line)) {
        const parsed = parseLine(splitLine, entry.child, line);
        if (!parsed) {
          const crash = parseBrowserCrash(splitLine, line);
          if (!crash) continue;
          pendingCrashes.push(crash);
          continue;
        }
        if (parsed.kind === "summary" && !options.includeSummary) continue;
        if (isHootWrapper(parsed)) {
          const matched = pendingHoots.splice(0);
          for (const failure of matched) {
            failure.runner = parsed.runner ?? "browser_js";
            if (parsed.pythonTest) failure.pythonTest = parsed.pythonTest;
            if (parsed.pythonFile) failure.pythonFile = parsed.pythonFile;
            if (parsed.preset && !failure.preset) failure.preset = parsed.preset;
            if (parsed.runner && !failure.tags.includes(parsed.runner)) failure.tags.push(parsed.runner);
            const command = commandFor(failure);
            if (command) failure.command = command;
          }
          if (matched.length > 0) continue;
        }
        if (parsed.kind === "tour" && parsed.tourName && !parsed.pythonTest) {
          const tourFailure = findTourFailure(merged.values(), entry.child, parsed.tourName);
          if (tourFailure) {
            tourFailure.lines.push(...parsed.lines);
            tourFailure.sourceLines.push(...parsed.sourceLines);
            flushPendingCrashes(tourFailure);
            lastTour = tourFailure;
            continue;
          }
        }
        if (parsed.kind === "tour" && parsed.pythonTest) flushPendingCrashes();
        const key = failureKey(parsed);
        const existing = merged.get(key);
        if (existing) {
          existing.lines.push(...parsed.lines);
          existing.sourceLines.push(...parsed.sourceLines);
          if (existing.kind === "tour") {
            lastTour = existing;
          }
          if (existing.kind === "hoot" && existing.jsTest && !existing.pythonTest && !pendingHoots.includes(existing)) {
            pendingHoots.push(existing);
          }
          continue;
        }
        const command = commandFor(parsed);
        const next: RunbotParsedTestFailure = {
          ...parsed,
          id: `${merged.size + 1}`,
          ...(command ? { command } : {}),
        };
        if (next.kind === "tour" && next.pythonTest && next.tourName) {
          const orphan = findTourFailure(merged.values(), entry.child, next.tourName);
          if (orphan && !orphan.pythonTest) {
            mergeFailureDetails(next, orphan);
            merged.delete(failureKey(orphan));
          }
        }
        merged.set(key, next);
        if (next.kind === "hoot" && next.jsTest && !next.pythonTest) pendingHoots.push(next);
        if (next.kind === "tour") {
          lastTour = next;
        }
      }
    }
    flushPendingCrashes();
  }
  const failures = [...merged.values()];
  return failures.filter((failure) => !isHootWrapper(failure) || !failures.some((item) => item !== failure && item.kind === "hoot" && item.jsTest && item.child.id === failure.child.id && item.preset === failure.preset));
}

export function parseUnparsedRunbotTestFailures(entries: RunbotTestLogEntry[]): RunbotUnparsedTestFailure[] {
  const unparsed: RunbotUnparsedTestFailure[] = [];
  const attachedCrashes = new Set(parseRunbotTestFailures(entries).flatMap((failure) => failure.crashes ?? []).map((crash) => crash.sourceLine));
  for (const entry of entries) {
    for (const line of entry.logs ?? []) {
      if (!line.isError) continue;
      for (const splitLine of splitRunbotTestErrorLine(line)) {
        if (parseLine(splitLine, entry.child, line)) continue;
        if (parseBrowserCrash(splitLine, line) && attachedCrashes.has(line)) continue;
        unparsed.push({
          id: `${unparsed.length + 1}`,
          child: entry.child,
          message: compact(splitLine.message),
          line: splitLine,
          sourceLine: line,
        });
      }
    }
  }
  return unparsed;
}
