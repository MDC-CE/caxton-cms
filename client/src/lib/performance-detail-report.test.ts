import { describe, expect, it } from "vitest";
import { buildPerformanceDetailMarkdown, performanceDetailReportFilename } from "./performance-detail-report";

const base = {
  process: "web",
  range: "Oct 5, 14:16 – 14:46",
  window: "30 min",
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
