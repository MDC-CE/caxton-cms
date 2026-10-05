import { cpuThreadCoverage, formatCpuStackRaw, labelCpuSymbol, type CpuStackSymbolKind } from "./cpu-stack-label";

const SSR_LABELS: Record<string, string> = {
  ssr_ok: "rendered",
  ssr_empty_fallback: "empty #root",
  ssr_error_fallback: "render error",
  client_fallback: "client only",
};

const TOP_FRAMES = 6;

type StackFrame = {
  percent: number;
  function: string;
  file: string;
  kind: CpuStackSymbolKind;
  callers?: Array<{ function: string; file: string }>;
  caller?: { function: string; file: string };
};

export type PerformanceDetailStack =
  | { when: string; ok: true; threads: Array<{ name: string; percent: number; frames: StackFrame[] }> }
  | { when: string; ok: false; error: string };

export type ProcessSample = {
  time: string;
  cpu: number | null;
  eventLoopP50Ms: number | null;
  eventLoopP99Ms: number | null;
  eventLoopMaxMs: number | null;
  heapMb: number | null;
  rssMb: number | null;
  userCpu: number | null;
  kernelCpu: number | null;
  mainThreadCpu: number | null;
  otherThreadsCpu: number | null;
  machineCpu: number | null;
  gcPauseMs: number | null;
  gcMaxPauseMs: number | null;
  inFlight: number | null;
  openFds: number | null;
  openFdsLimit: number | null;
};

export type PerformanceDetailReportInput = {
  process: string;
  range: string;
  window: string | null;
  /** One row per chart point in the range. Null skips the section. */
  samples: ProcessSample[] | null;
  duration: {
    buckets: Array<{ label: string; count: number }>;
    total: number;
    slowPct: number;
  } | null;
  routes: {
    showKind: boolean;
    showSsr: boolean;
    statusLine: string;
    ssrLine: string;
    rows: Array<{
      kind: "api" | "pages";
      method: string;
      route: string;
      path?: string | null;
      count: number;
      avgMs: number;
      maxMs: number;
      statusCounts: Record<string, number>;
      ssrCounts?: Record<string, number>;
    }>;
  } | null;
  running: Array<{ method: string; route: string; count: number; maxMs: number }> | null;
  logs: {
    note: string | null;
    empty: string | null;
    rows: Array<{
      level: string;
      module: string;
      message: string;
      errName: string | null;
      count: number;
      lastSeen: string;
    }>;
  };
  cpu: {
    inactive: string | null;
    notice: string | null;
    lastError: string | null;
    empty: string | null;
    stacks: PerformanceDetailStack[];
  } | null;
};

function cell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function table(headers: string[], rows: string[][], right: boolean[]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const rule = `| ${headers.map((_, index) => (right[index] ? "---:" : "---")).join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");
  return [head, rule, body].join("\n");
}

function fence(text: string): string {
  const longest = text.match(/`+/g)?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0;
  const tick = "`".repeat(Math.max(3, longest + 1));
  return `${tick}\n${text}\n${tick}`;
}

function isOkStatus(code: string): boolean {
  const n = Number(code);
  return Number.isInteger(n) && n >= 200 && n < 400;
}

function statusEntries(counts: Record<string, number>): Array<[string, number]> {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => {
      const na = Number(a[0]);
      const nb = Number(b[0]);
      const aNum = Number.isInteger(na);
      const bNum = Number.isInteger(nb);
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a[0].localeCompare(b[0]);
    });
}

function statusText(counts: Record<string, number>): string {
  const entries = statusEntries(counts);
  if (entries.length === 0) return "—";
  return entries.map(([code, n]) => `${n} ${code}`).join(", ");
}

function shareText(counts: Record<string, number>): string {
  const entries = statusEntries(counts);
  if (entries.length === 0) return "—";
  let ok = 0;
  let failed = 0;
  for (const [code, n] of entries) {
    if (isOkStatus(code)) ok += n;
    else failed += n;
  }
  return `${ok} / ${failed}`;
}

function countLine(counts: Record<string, number> | undefined, labels?: Record<string, string>): string {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} × ${labels?.[key] ?? key}`)
    .join(", ");
}

function num(value: number | null): string {
  return value == null ? "—" : String(value);
}

function fds(sample: ProcessSample): string {
  if (sample.openFds == null) return "—";
  return sample.openFdsLimit == null ? String(sample.openFds) : `${sample.openFds} / ${sample.openFdsLimit}`;
}

function processSampleTable(samples: ProcessSample[]): string {
  const columns: Array<{ header: string; cell: (sample: ProcessSample) => string }> = [
    { header: "Time", cell: (sample) => sample.time },
    { header: "CPU %", cell: (sample) => num(sample.cpu) },
    { header: "Event loop p50 ms", cell: (sample) => num(sample.eventLoopP50Ms) },
    { header: "Event loop p99 ms", cell: (sample) => num(sample.eventLoopP99Ms) },
    { header: "Event loop max ms", cell: (sample) => num(sample.eventLoopMaxMs) },
    { header: "Heap MB", cell: (sample) => num(sample.heapMb) },
    { header: "RSS MB", cell: (sample) => num(sample.rssMb) },
  ];
  const optional: Array<{ header: string; has: (sample: ProcessSample) => boolean; cell: (sample: ProcessSample) => string }> = [
    { header: "Your code %", has: (sample) => sample.userCpu != null, cell: (sample) => num(sample.userCpu) },
    { header: "Kernel %", has: (sample) => sample.kernelCpu != null, cell: (sample) => num(sample.kernelCpu) },
    { header: "Main thread %", has: (sample) => sample.mainThreadCpu != null, cell: (sample) => num(sample.mainThreadCpu) },
    { header: "Other threads %", has: (sample) => sample.otherThreadsCpu != null, cell: (sample) => num(sample.otherThreadsCpu) },
    { header: "Machine %", has: (sample) => sample.machineCpu != null, cell: (sample) => num(sample.machineCpu) },
    { header: "GC pause ms", has: (sample) => sample.gcPauseMs != null, cell: (sample) => num(sample.gcPauseMs) },
    { header: "GC max pause ms", has: (sample) => sample.gcMaxPauseMs != null, cell: (sample) => num(sample.gcMaxPauseMs) },
    { header: "In-flight", has: (sample) => sample.inFlight != null, cell: (sample) => num(sample.inFlight) },
    { header: "File descriptors", has: (sample) => sample.openFds != null, cell: fds },
  ];
  for (const column of optional) {
    if (samples.some(column.has)) columns.push(column);
  }
  return table(
    columns.map((column) => column.header),
    samples.map((sample) => columns.map((column) => column.cell(sample))),
    columns.map((column) => column.header !== "Time"),
  );
}

function kindLabel(kind: CpuStackSymbolKind): string {
  if (kind === "js") return "JavaScript";
  if (kind === "kernel") return "Kernel";
  return "Native";
}

/** Markdown of the full detail for this range. The on-screen tab does not narrow it. */
export function buildPerformanceDetailMarkdown(input: PerformanceDetailReportInput): string {
  const parts: string[] = ["# Performance detail", ""];
  parts.push(`- **Process:** ${input.process}`);
  parts.push(`- **Range:** ${input.range}`);
  if (input.window) parts.push(`- **Window:** ${input.window}`);

  if (input.samples && input.samples.length > 0) {
    parts.push("", "## Process samples", "", processSampleTable(input.samples));
  }

  if (input.duration && input.duration.buckets.some((bucket) => bucket.count > 0)) {
    parts.push(
      "",
      "## Calls by duration",
      "",
      table(
        ["Duration", "Calls"],
        input.duration.buckets.map((bucket) => [bucket.label, String(bucket.count)]),
        [false, true],
      ),
      "",
      `${input.duration.total} total calls. ${input.duration.slowPct}% at 500 ms or more.`,
    );
  }

  if (input.routes && input.routes.rows.length > 0) {
    const showPath = input.routes.rows.some((row) => row.path);
    const headers = [
      ...(input.routes.showKind ? ["Kind"] : []),
      "Method",
      "Route",
      ...(showPath ? ["Path"] : []),
      "Calls",
      "Avg time",
      "Peak time",
      "Successful / Failed",
      "Status count",
      ...(input.routes.showSsr ? ["Render"] : []),
    ];
    const right = headers.map((header) => header === "Calls" || header === "Avg time" || header === "Peak time");
    const rows = input.routes.rows.map((row) => [
      ...(input.routes!.showKind ? [row.kind === "pages" ? "page" : "API"] : []),
      row.method,
      row.route,
      ...(showPath ? [row.path || "—"] : []),
      String(row.count),
      `${row.avgMs} ms`,
      `${row.maxMs} ms`,
      shareText(row.statusCounts),
      statusText(row.statusCounts),
      ...(input.routes!.showSsr ? [countLine(row.ssrCounts, SSR_LABELS) || "—"] : []),
    ]);
    parts.push("", "## Routes", "");
    if (input.routes.statusLine) parts.push(input.routes.statusLine, "");
    if (input.routes.ssrLine) parts.push(input.routes.ssrLine, "");
    parts.push(table(headers, rows, right));
  }

  if (input.running && input.running.length > 0) {
    parts.push(
      "",
      "## Requests still running",
      "",
      table(
        ["Method", "Route", "Open calls", "Running for (peak)"],
        input.running.map((row) => [row.method, row.route, String(row.count), `${row.maxMs} ms`]),
        [false, false, true, true],
      ),
    );
  }

  parts.push("", "## Error and warning logs", "");
  if (input.logs.note) parts.push(input.logs.note, "");
  if (input.logs.rows.length > 0) {
    parts.push(table(
      ["Level", "Module", "Message", "Count", "Last seen"],
      input.logs.rows.map((row) => [
        row.level,
        row.module,
        row.errName ? `${row.message} (${row.errName})` : row.message,
        String(row.count),
        row.lastSeen,
      ]),
      [false, false, false, true, false],
    ));
  } else if (input.logs.empty) {
    parts.push(input.logs.empty);
  }

  if (input.cpu) {
    parts.push("", "## CPU stacks", "");
    if (input.cpu.inactive) parts.push(input.cpu.inactive, "");
    if (input.cpu.notice) parts.push(input.cpu.notice, "");
    if (input.cpu.lastError) parts.push(input.cpu.lastError, "");
    if (input.cpu.stacks.length === 0 && input.cpu.empty) parts.push(input.cpu.empty);
    for (const stack of input.cpu.stacks) {
      parts.push("", `### ${stack.when}`, "");
      if (!stack.ok) {
        parts.push(stack.error);
        continue;
      }
      if (stack.threads.length === 0) {
        parts.push("No samples in this recording.");
        continue;
      }
      parts.push(table(
        ["Thread", "Execution %"],
        stack.threads.map((thread) => [thread.name, `${thread.percent}%`]),
        [false, true],
      ));
      for (const thread of stack.threads) {
        const shown = thread.frames.slice(0, TOP_FRAMES);
        parts.push("", `**${thread.name}**`, "");
        if (shown.length === 0) {
          parts.push("No functions in this thread.");
        } else {
          parts.push(table(
            ["Function", "Kind", "Execution %"],
            shown.map((frame) => {
              const label = labelCpuSymbol(frame.function, frame.file, frame.kind);
              const name = label.path ? `${label.name} (${label.path})` : label.name;
              return [name, kindLabel(frame.kind), `${frame.percent}%`];
            }),
            [false, false, true],
          ));
        }
        const coverage = cpuThreadCoverage(thread.percent, thread.frames.map((frame) => frame.percent));
        if (coverage != null) parts.push("", `Listed functions cover ${coverage}% of this thread.`);
      }
      parts.push("", "Full stack:", "", fence(formatCpuStackRaw(stack)));
    }
  }

  return `${parts.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export function performanceDetailReportFilename(process: string, startingAt: number): string {
  const stamp = new Date(startingAt).toISOString().replace(/[:.]/g, "-");
  return `performance-${process}-${stamp}.md`;
}
