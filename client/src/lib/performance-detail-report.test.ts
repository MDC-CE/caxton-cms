import { describe, expect, it } from "vitest";
import { buildPerformanceDetailMarkdown, performanceDetailReportFilename } from "./performance-detail-report";

const base = {
  process: "web",
  range: "Oct 5, 14:16 – 14:46",
  window: "30 min",
  samples: null,
  duration: null,
  routes: null,
  running: null,
  logs: { note: null, empty: "No logs in this span.", rows: [] },
  cpu: null,
};

describe("buildPerformanceDetailMarkdown", () => {
  it("writes the header and skips a missing window", () => {
    const text = buildPerformanceDetailMarkdown({ ...base, window: null });
    expect(text).toContain("- **Process:** web");
    expect(text).toContain("- **Range:** Oct 5, 14:16 – 14:46");
    expect(text).not.toContain("**View:**");
    expect(text).not.toContain("**Window:**");
    expect(text).toContain("No logs in this span.");
    expect(text).not.toContain("## Process samples");
  });

  it("lists every process sample and adds a column only when some point has it", () => {
    const blank = {
      cpu: null,
      eventLoopP50Ms: null,
      eventLoopP99Ms: null,
      eventLoopMaxMs: null,
      heapMb: null,
      rssMb: null,
      userCpu: null,
      kernelCpu: null,
      mainThreadCpu: null,
      otherThreadsCpu: null,
      machineCpu: null,
      gcPauseMs: null,
      gcMaxPauseMs: null,
      inFlight: null,
      openFds: null,
      openFdsLimit: null,
    };
    const text = buildPerformanceDetailMarkdown({
      ...base,
      samples: [
        {
          ...blank,
          time: "Oct 5, 14:16:00",
          cpu: 82,
          eventLoopP50Ms: 4,
          eventLoopP99Ms: 40,
          eventLoopMaxMs: 120,
          heapMb: 180,
          rssMb: 420,
          userCpu: 70,
          openFds: 12,
          openFdsLimit: 1024,
        },
        {
          ...blank,
          time: "Oct 5, 14:16:30",
          cpu: 10,
          eventLoopP50Ms: 2,
          eventLoopP99Ms: 8,
          eventLoopMaxMs: 15,
          heapMb: null,
          rssMb: 400,
        },
      ],
    });
    expect(text).toContain("## Process samples");
    expect(text).toContain("| Time | CPU % | Event loop p50 ms | Event loop p99 ms | Event loop max ms | Heap MB | RSS MB | Your code % | File descriptors |");
    expect(text).toContain("| Oct 5, 14:16:00 | 82 | 4 | 40 | 120 | 180 | 420 | 70 | 12 / 1024 |");
    expect(text).toContain("| Oct 5, 14:16:30 | 10 | 2 | 8 | 15 | — | 400 | — | — |");
    expect(text).not.toContain("Kernel %");
    expect(text).not.toContain("GC pause");
  });

  it("lists duration buckets and the slow share", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      duration: {
        buckets: [
          { label: "<10 ms", count: 4 },
          { label: "500–1000 ms", count: 1 },
        ],
        total: 5,
        slowPct: 20,
      },
    });
    expect(text).toContain("## Calls by duration");
    expect(text).toContain("| <10 ms | 4 |");
    expect(text).toContain("5 total calls. 20% at 500 ms or more.");
  });

  it("renders routes, escapes table cells, and keeps every row", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      routes: {
        showKind: true,
        showSsr: true,
        statusLine: "9 × 200, 1 × 500",
        ssrLine: "8 × rendered",
        rows: [
          {
            kind: "pages",
            method: "GET",
            route: "/a|b",
            path: "line1\nline2",
            count: 10,
            avgMs: 40,
            maxMs: 800,
            statusCounts: { "500": 1, "200": 9 },
            ssrCounts: { ssr_ok: 8, client_fallback: 2 },
          },
        ],
      },
    });
    expect(text).toContain("9 × 200, 1 × 500");
    expect(text).toContain("| Kind | Method | Route | Path |");
    expect(text).toContain("| page | GET | /a\\|b | line1 line2 | 10 | 40 ms | 800 ms | 9 / 1 | 9 200, 1 500 | 8 × rendered, 2 × client only |");
  });

  it("omits kind, path, and render when the detail box does", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      routes: {
        showKind: false,
        showSsr: false,
        statusLine: "",
        ssrLine: "",
        rows: [
          {
            kind: "api",
            method: "POST",
            route: "/api/x",
            count: 2,
            avgMs: 10,
            maxMs: 20,
            statusCounts: {},
          },
        ],
      },
    });
    expect(text).not.toContain("| Kind |");
    expect(text).not.toContain("| Path |");
    expect(text).not.toContain("| Render |");
    expect(text).toContain("| POST | /api/x | 2 | 10 ms | 20 ms | — | — |");
  });

  it("includes open requests and log rows", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      running: [{ method: "GET", route: "/api/slow", count: 2, maxMs: 900 }],
      logs: {
        note: "No data before Oct 3, 10:00.",
        empty: null,
        rows: [{
          level: "error",
          module: "server",
          message: "boom | now",
          errName: "TypeError",
          count: 3,
          lastSeen: "Oct 5, 14:20:01",
        }],
      },
    });
    expect(text).toContain("| GET | /api/slow | 2 | 900 ms |");
    expect(text).toContain("No data before Oct 3, 10:00.");
    expect(text).toContain("| error | server | boom \\| now (TypeError) | 3 | Oct 5, 14:20:01 |");
  });

  it("summarizes a CPU recording and fences the full stack", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      logs: { note: null, empty: null, rows: [] },
      cpu: {
        inactive: null,
        notice: null,
        lastError: null,
        empty: "No recording in this range.",
        stacks: [{
          when: "Oct 5, 14:16:23",
          ok: true,
          threads: [{
            name: "main",
            percent: 80,
            frames: [{
              percent: 40,
              function: "JS:*burnFromOurRoute file:///home/alejandro/wsl-projects/website/website-v3/server/dev-cpu-burn-route.ts:1:197",
              file: "/tmp/perf.map",
              kind: "js",
            }],
          }],
        }],
      },
    });
    expect(text).toContain("### Oct 5, 14:16:23");
    expect(text).toContain("| main | 80% |");
    expect(text).toContain("burnFromOurRoute (server/dev-cpu-burn-route.ts:1:197)");
    expect(text).toContain("JavaScript");
    expect(text).toContain("```\nmain 80%\n40% JS:*burnFromOurRoute");
    expect(text).not.toContain("No recording in this range.");
  });

  it("lengthens the fence when the stack already contains backticks", () => {
    const text = buildPerformanceDetailMarkdown({
      ...base,
      logs: { note: null, empty: null, rows: [] },
      cpu: {
        inactive: null,
        notice: null,
        lastError: null,
        empty: null,
        stacks: [{
          when: "Oct 5, 14:16:23",
          ok: true,
          threads: [{
            name: "main",
            percent: 10,
            frames: [{ percent: 10, function: "has ``` inside", file: "", kind: "native" }],
          }],
        }],
      },
    });
    expect(text).toContain("````\nmain 10%\n10% has ``` inside\n````");
  });
});

describe("performanceDetailReportFilename", () => {
  it("stamps the process and start time", () => {
    expect(performanceDetailReportFilename("web", Date.UTC(2026, 9, 5, 18, 16, 23)))
      .toBe("performance-web-2026-10-05T18-16-23-000Z.md");
  });
});
