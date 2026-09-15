import fs from "fs";
import path from "path";
import { SITE_PROBE_P95_MS, type ScenarioBudget } from "./budgets.js";

export type CallSample = {
  duration_ms: number;
  response_bytes: number;
  est_tokens: number;
  ok: boolean;
  error?: string;
};

export type ScenarioStats = {
  scenario_id: string;
  tool: string;
  /** Use-case blurb for HTML info popovers. */
  about?: string;
  args_summary: Record<string, unknown>;
  class: string;
  calls: number;
  duration_ms: { p50: number; p95: number; max: number };
  response_bytes: { max: number };
  est_tokens: { max: number };
  budget: ScenarioBudget;
  over_band: string[];
  hard_error: boolean;
  errors: string[];
  skipped?: string;
};

export type ProbeStats = {
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  failures: number;
  samples: number;
};

export type StressReport = {
  ok: boolean;
  started_at: string;
  finished_at: string;
  ports: { app: number; mcp: number };
  content: {
    folder: string;
    domain?: string;
    pulled: boolean;
    commit?: string | null;
  };
  auth: string;
  concurrency: number;
  heavy: boolean;
  fail_on_budget: boolean;
  summary: {
    hard_errors: number;
    over_band: number;
    skipped: number;
    slowest_scenario?: string;
    largest_payload_scenario?: string;
  };
  scenarios: ScenarioStats[];
  skipped: Array<{ scenario_id: string; reason: string }>;
  site_probe: { health: ProbeStats };
  guidance: string;
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function aggregateSamples(
  scenario_id: string,
  tool: string,
  args_summary: Record<string, unknown>,
  band: string,
  samples: CallSample[],
  budget: ScenarioBudget,
  skipped?: string,
  about?: string,
): ScenarioStats {
  if (skipped) {
    return {
      scenario_id,
      tool,
      about,
      args_summary,
      class: band,
      calls: 0,
      duration_ms: { p50: 0, p95: 0, max: 0 },
      response_bytes: { max: 0 },
      est_tokens: { max: 0 },
      budget,
      over_band: [],
      hard_error: false,
      errors: [],
      skipped,
    };
  }

  const durations = samples.map((s) => s.duration_ms).sort((a, b) => a - b);
  const p50 = percentile(durations, 50);
  const p95 = percentile(durations, 95);
  const max = durations[durations.length - 1] ?? 0;
  const maxBytes = Math.max(0, ...samples.map((s) => s.response_bytes));
  const maxTokens = Math.max(0, ...samples.map((s) => s.est_tokens));
  const errors = samples.filter((s) => !s.ok).map((s) => s.error || "error");
  const hard_error = errors.length > 0;
  const over_band: string[] = [];
  if (p95 > budget.p95_ms) over_band.push("latency_p95");
  if (maxTokens > budget.est_tokens) over_band.push("est_tokens");

  return {
    scenario_id,
    tool,
    about,
    args_summary,
    class: band,
    calls: samples.length,
    duration_ms: { p50, p95, max },
    response_bytes: { max: maxBytes },
    est_tokens: { max: maxTokens },
    budget,
    over_band,
    hard_error,
    errors: [...new Set(errors)].slice(0, 5),
  };
}

export function aggregateProbe(samples: number[], failures: number): ProbeStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    max_ms: sorted[sorted.length - 1] ?? 0,
    failures,
    samples: samples.length,
  };
}

export function buildReport(partial: Omit<StressReport, "ok" | "summary" | "guidance"> & {
  ok?: boolean;
}): StressReport {
  const measured = partial.scenarios.filter((s) => !s.skipped);
  const hard_errors = measured.filter((s) => s.hard_error).length;
  const over_band = measured.filter((s) => s.over_band.length > 0).length;
  const slowest = [...measured].sort((a, b) => b.duration_ms.p95 - a.duration_ms.p95)[0];
  const largest = [...measured].sort((a, b) => b.est_tokens.max - a.est_tokens.max)[0];

  const failBudget = partial.fail_on_budget && over_band > 0;
  const ok = hard_errors === 0 && !failBudget && (partial.ok !== false);

  return {
    ...partial,
    ok,
    summary: {
      hard_errors,
      over_band,
      skipped: partial.skipped.length,
      slowest_scenario: slowest?.scenario_id,
      largest_payload_scenario: largest?.scenario_id,
    },
    guidance:
      "Tighten budgets from this baseline (≈2–3× warm p95 latency, ≈1.5–2× a good payload). Use --fail-on-budget when ready.",
  };
}

export function writeReports(projectRoot: string, report: StressReport): {
  jsonPath: string;
  mdPath: string;
  htmlPath: string;
} {
  const dir = path.join(projectRoot, "artifacts");
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, "stress-report.json");
  const mdPath = path.join(dir, "stress-report.md");
  const htmlPath = path.join(dir, "stress-report.html");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(mdPath, renderMarkdown(report));
  fs.writeFileSync(htmlPath, renderHtml(report));
  return { jsonPath, mdPath, htmlPath };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMs(n: number): string {
  return `${n} ms`;
}

type Severity = "good" | "mid" | "bad";

function worse(a: Severity, b: Severity): Severity {
  const rank: Record<Severity, number> = { good: 0, mid: 1, bad: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/** Budget ratio + absolute floors so loose budgets still show heat. */
function latencySeverity(ms: number, budgetMs: number): Severity {
  const byBudget: Severity =
    budgetMs <= 0 ? "good" : ms >= budgetMs ? "bad" : ms >= budgetMs * 0.5 ? "mid" : "good";
  const byAbs: Severity = ms >= 1500 ? "bad" : ms >= 400 ? "mid" : "good";
  return worse(byBudget, byAbs);
}

function tokenSeverity(tokens: number, budgetTokens: number): Severity {
  const byBudget: Severity =
    budgetTokens <= 0
      ? "good"
      : tokens >= budgetTokens
        ? "bad"
        : tokens >= budgetTokens * 0.5
          ? "mid"
          : "good";
  const byAbs: Severity = tokens >= 50_000 ? "bad" : tokens >= 20_000 ? "mid" : "good";
  return worse(byBudget, byAbs);
}

function sevClass(sev: Severity): string {
  return `sev-${sev}`;
}

function thInfo(label: string, tip: string, num = false): string {
  return `<th class="${num ? "num" : ""}">
    <span class="th-label">${escapeHtml(label)}</span>
    <button type="button" class="info-btn" aria-label="About ${escapeHtml(label)}" data-tip="${escapeHtml(tip)}">i</button>
  </th>`;
}

function formatArgsTip(args: Record<string, unknown>): string {
  const keys = Object.keys(args).filter((k) => k !== "concurrency");
  if (!keys.length) return "Params: (none)";
  const compact: Record<string, unknown> = {};
  for (const k of keys) compact[k] = args[k];
  try {
    return `Params: ${JSON.stringify(compact)}`;
  } catch {
    return "Params: (unserializable)";
  }
}

function scenarioTip(s: ScenarioStats): string {
  const use =
    s.about?.trim() ||
    (s.scenario_id.startsWith("burst_")
      ? "Concurrent burst measurement of this tool while /health is probed."
      : "Named stress scenario.");
  const burstNote = s.scenario_id.startsWith("burst_")
    ? " Measured under concurrent burst load (not a solo sequential call)."
    : "";
  return `${use}${burstNote} ${formatArgsTip(s.args_summary)}`.trim();
}

function scenarioCell(s: ScenarioStats): string {
  const tip = scenarioTip(s);
  return `<td class="mono scenario">
    <span class="scenario-id">${escapeHtml(s.scenario_id)}</span>
    <button type="button" class="info-btn" aria-label="About scenario ${escapeHtml(s.scenario_id)}" data-tip="${escapeHtml(tip)}">i</button>
  </td>`;
}

export function renderHtml(report: StressReport): string {
  const measured = report.scenarios.filter((s) => !s.skipped);
  const byLatency = [...measured].sort((a, b) => b.duration_ms.p95 - a.duration_ms.p95);
  const byTokens = [...measured].sort((a, b) => b.est_tokens.max - a.est_tokens.max);
  const over = measured.filter((s) => s.over_band.length > 0);
  const hard = measured.filter((s) => s.hard_error);
  const contentLabel = `${report.content.folder}${report.content.domain ? ` · ${report.content.domain}` : ""}${report.content.pulled ? " · pulled" : ""}`;
  const resultClass = report.ok ? "ok" : "fail";

  const latencyRows = byLatency
    .slice(0, 15)
    .map((s) => {
      const rowClass = s.hard_error || s.over_band.includes("latency_p95") ? "warn" : "";
      const notes: string[] = [];
      if (s.over_band.includes("latency_p95")) notes.push(`over ${s.budget.p95_ms} ms`);
      if (s.hard_error) notes.push("hard error");
      const p50s = latencySeverity(s.duration_ms.p50, s.budget.p95_ms);
      const p95s = latencySeverity(s.duration_ms.p95, s.budget.p95_ms);
      const maxs = latencySeverity(s.duration_ms.max, s.budget.p95_ms);
      return `<tr class="${rowClass}">
        ${scenarioCell(s)}
        <td>${escapeHtml(s.tool)}</td>
        <td class="num">${s.calls}</td>
        <td class="num ${sevClass(p50s)}">${fmtMs(s.duration_ms.p50)}</td>
        <td class="num strong ${sevClass(p95s)}">${fmtMs(s.duration_ms.p95)}</td>
        <td class="num ${sevClass(maxs)}">${fmtMs(s.duration_ms.max)}</td>
        <td class="muted">${escapeHtml(notes.join("; "))}</td>
      </tr>`;
    })
    .join("\n");

  const tokenRows = byTokens
    .slice(0, 15)
    .map((s) => {
      const rowClass = s.over_band.includes("est_tokens") ? "warn" : "";
      const notes: string[] = [];
      if (s.over_band.includes("est_tokens")) notes.push("over token budget");
      if (s.class === "docs") notes.push("docs");
      const tokSev = tokenSeverity(s.est_tokens.max, s.budget.est_tokens);
      return `<tr class="${rowClass}">
        ${scenarioCell(s)}
        <td>${escapeHtml(s.tool)}</td>
        <td class="num">${s.response_bytes.max.toLocaleString()}</td>
        <td class="num strong ${sevClass(tokSev)}">${s.est_tokens.max.toLocaleString()}</td>
        <td class="num muted">${s.budget.est_tokens.toLocaleString()}</td>
        <td class="muted">${escapeHtml(notes.join("; "))}</td>
      </tr>`;
    })
    .join("\n");

  const hp = report.site_probe.health;
  const probeP50 = latencySeverity(hp.p50_ms, SITE_PROBE_P95_MS);
  const probeP95 = latencySeverity(hp.p95_ms, SITE_PROBE_P95_MS);
  const probeMax = latencySeverity(hp.max_ms, SITE_PROBE_P95_MS);
  const failSev: Severity = hp.failures > 0 ? "bad" : "good";

  const overBlock =
    over.length === 0
      ? ""
      : `<section>
    <h2>Over band</h2>
    <ul class="list">
      ${over
        .map(
          (s) =>
            `<li><span class="mono">${escapeHtml(s.scenario_id)}</span> — ${escapeHtml(s.over_band.join(", "))} <span class="muted">(p95=${fmtMs(s.duration_ms.p95)} / tokens=${s.est_tokens.max}; budgets ${fmtMs(s.budget.p95_ms)} / ${s.budget.est_tokens})</span></li>`,
        )
        .join("\n")}
    </ul>
  </section>`;

  const hardBlock =
    hard.length === 0
      ? ""
      : `<section>
    <h2>Hard errors</h2>
    <ul class="list">
      ${hard
        .map(
          (s) =>
            `<li><span class="mono">${escapeHtml(s.scenario_id)}</span> — ${escapeHtml(s.errors.join(" | ") || "error")}</li>`,
        )
        .join("\n")}
    </ul>
  </section>`;

  const skippedBlock =
    report.skipped.length === 0
      ? ""
      : `<section>
    <h2>Skipped</h2>
    <ul class="list">
      ${report.skipped
        .map(
          (s) =>
            `<li><span class="mono">${escapeHtml(s.scenario_id)}</span> — ${escapeHtml(s.reason)}</li>`,
        )
        .join("\n")}
    </ul>
  </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MCP stress report</title>
  <style>
    :root {
      --bg: #0f1115;
      --fg: #e8eaed;
      --muted: #8b919a;
      --line: #1e232b;
      --panel: #161a21;
      --warn-bg: rgba(232, 160, 80, 0.08);
      --warn-fg: #e8a050;
      --ok: #6bcf8e;
      --mid: #e8a050;
      --fail: #e07070;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --sans: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 15px/1.5 var(--sans);
      padding: 2.5rem 1.25rem 4rem;
    }
    main { max-width: 960px; margin: 0 auto; }
    header { margin-bottom: 2.25rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
    h1 { font-size: 1.35rem; font-weight: 560; letter-spacing: -0.02em; margin: 0 0 0.75rem; }
    h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 0.75rem; }
    section { margin-bottom: 2rem; }
    .meta { display: grid; gap: 0.35rem; color: var(--muted); font-size: 0.9rem; }
    .meta strong { color: var(--fg); font-weight: 500; }
    .result { display: inline-block; font-family: var(--mono); font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em; padding: 0.2rem 0.5rem; border: 1px solid var(--line); margin-bottom: 0.85rem; }
    .result.ok { color: var(--ok); border-color: rgba(107, 207, 142, 0.35); }
    .result.fail { color: var(--fail); border-color: rgba(224, 112, 112, 0.4); }
    .guidance { color: var(--muted); font-size: 0.9rem; margin-top: 1rem; max-width: 42rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.55rem 0.65rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th {
      color: var(--muted);
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
      position: relative;
    }
    th .th-label { vertical-align: middle; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: 0.8rem; }
    th.num { text-align: right; }
    td.mono, .mono { font-family: var(--mono); font-size: 0.78rem; }
    td.scenario { white-space: nowrap; }
    td.scenario .scenario-id { vertical-align: middle; }
    td.strong { font-weight: 600; }
    td.muted, .muted { color: var(--muted); }
    td.sev-good { color: var(--ok); }
    td.sev-mid { color: var(--mid); }
    td.sev-bad { color: var(--fail); }
    tr.warn { background: var(--warn-bg); }
    ul.list { margin: 0; padding-left: 1.1rem; color: var(--fg); font-size: 0.9rem; }
    ul.list li { margin: 0.35rem 0; }
    footer { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.85rem; }
    footer p { margin: 0.35rem 0; }

    .info-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      margin-left: 0.28rem;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: transparent;
      color: var(--muted);
      font: 600 0.65rem/1 var(--mono);
      cursor: pointer;
      vertical-align: middle;
      text-transform: none;
      letter-spacing: 0;
    }
    .info-btn:hover, .info-btn[aria-expanded="true"] {
      color: var(--fg);
      border-color: #3a4250;
    }
    .info-pop {
      display: none;
      position: absolute;
      z-index: 20;
      top: calc(100% + 6px);
      left: 0;
      width: min(280px, 70vw);
      padding: 0.7rem 0.8rem;
      background: var(--panel);
      border: 1px solid var(--line);
      color: var(--fg);
      font: 400 0.8rem/1.45 var(--sans);
      text-transform: none;
      letter-spacing: 0;
      text-align: left;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
    }
    th.num .info-pop { left: auto; right: 0; }
    .info-pop.open { display: block; }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="result ${resultClass}">${report.ok ? "OK" : "FAIL"}</div>
      <h1>MCP stress report</h1>
      <div class="meta">
        <div><strong>When</strong> ${escapeHtml(report.started_at)} → ${escapeHtml(report.finished_at)}</div>
        <div><strong>Content</strong> ${escapeHtml(contentLabel)}</div>
        <div><strong>Ports</strong> app :${report.ports.app} · mcp :${report.ports.mcp}</div>
        <div><strong>Auth</strong> ${escapeHtml(report.auth)}</div>
        <div><strong>Load</strong> concurrency ${report.concurrency}${report.heavy ? " · heavy" : ""} · fail_on_budget=${report.fail_on_budget}</div>
        <div><strong>Summary</strong> hard_errors=${report.summary.hard_errors} · over_band=${report.summary.over_band} · skipped=${report.summary.skipped}</div>
      </div>
      <p class="guidance">${escapeHtml(report.guidance)}</p>
    </header>

    <section>
      <h2>Top by latency (p95)</h2>
      <table>
        <thead>
          <tr>
            ${thInfo("Scenario", "Named test case. Click the i next to a row for that scenario’s use case and params. Sorted by slowest p95 first.")}
            ${thInfo("Tool", "MCP tool name that was invoked.")}
            ${thInfo("Calls", "How many warm measurements were taken for this scenario (warmup calls are excluded).", true)}
            ${thInfo("p50", "Median latency in milliseconds — half the calls were faster than this. Typical speed.", true)}
            ${thInfo("p95", "95th percentile latency in milliseconds — only about 5% of calls were slower. Use this for budgets.", true)}
            ${thInfo("max", "Slowest single call in this sample, in milliseconds.", true)}
            ${thInfo("Notes", "Warnings such as over-band or hard errors for this row.")}
          </tr>
        </thead>
        <tbody>
${latencyRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Top by estimated tokens</h2>
      <table>
        <thead>
          <tr>
            ${thInfo("Scenario", "Named test case. Click the i next to a row for that scenario’s use case and params. Sorted by largest token payload first.")}
            ${thInfo("Tool", "MCP tool name that was invoked.")}
            ${thInfo("Bytes", "Largest response body size in bytes across the samples.", true)}
            ${thInfo("Tokens", "Estimated tokens from ceil(chars/4) on the text payload agents receive. Ranking heuristic, not an exact tokenizer.", true)}
            ${thInfo("Budget", "Current token budget for this scenario’s band. Soft warn by default unless fail-on-budget is on.", true)}
            ${thInfo("Notes", "Warnings such as over token budget, or docs-band classification.")}
          </tr>
        </thead>
        <tbody>
${tokenRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Site responsiveness during burst</h2>
      <table>
        <thead>
          <tr>
            ${thInfo("Probe", "Cheap health check hit while tools run in parallel — shows if the site stayed responsive.")}
            ${thInfo("p50", "Median probe latency in milliseconds during the burst.", true)}
            ${thInfo("p95", "95th percentile probe latency in milliseconds during the burst.", true)}
            ${thInfo("max", "Slowest probe sample in milliseconds.", true)}
            ${thInfo("Failures", "How many probe requests failed or returned a non-OK status.", true)}
            ${thInfo("Samples", "Number of probe measurements collected during the burst.", true)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="mono">GET /health</td>
            <td class="num ${sevClass(probeP50)}">${fmtMs(hp.p50_ms)}</td>
            <td class="num strong ${sevClass(probeP95)}">${fmtMs(hp.p95_ms)}</td>
            <td class="num ${sevClass(probeMax)}">${fmtMs(hp.max_ms)}</td>
            <td class="num ${sevClass(failSev)}">${hp.failures}</td>
            <td class="num">${hp.samples}</td>
          </tr>
        </tbody>
      </table>
    </section>

    ${overBlock}
    ${hardBlock}
    ${skippedBlock}

    <footer>
      <p><strong>Colors</strong> — green ok · yellow caution (≥50% of budget, or latency ≥400&nbsp;ms / tokens ≥20k) · red over budget (or latency ≥1.5&nbsp;s / tokens ≥50k).</p>
      <p><strong>Latency</strong> — tools that can make the local site feel stuck under agent load.</p>
      <p><strong>est_tokens</strong> — ceil(chars/4) on the text payload agents get back (ranking heuristic, not tiktoken).</p>
    </footer>
  </main>
  <div id="info-pop" class="info-pop" role="tooltip" hidden></div>
  <script>
    (function () {
      var pop = document.getElementById("info-pop");
      var openBtn = null;

      function place(btn) {
        var rect = btn.getBoundingClientRect();
        var preferRight = btn.closest("th") && btn.closest("th").classList.contains("num");
        var width = Math.min(280, window.innerWidth * 0.7);
        pop.style.width = width + "px";
        pop.style.position = "fixed";
        var top = rect.bottom + 6;
        var left = preferRight ? rect.right - width : rect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        if (top + 120 > window.innerHeight) top = Math.max(8, rect.top - 8 - pop.offsetHeight);
        pop.style.top = top + "px";
        pop.style.left = left + "px";
      }

      function close() {
        pop.classList.remove("open");
        pop.hidden = true;
        pop.textContent = "";
        if (openBtn) openBtn.setAttribute("aria-expanded", "false");
        openBtn = null;
      }

      function open(btn) {
        var tip = btn.getAttribute("data-tip") || "";
        if (openBtn === btn) { close(); return; }
        close();
        openBtn = btn;
        btn.setAttribute("aria-expanded", "true");
        pop.textContent = tip;
        pop.hidden = false;
        pop.classList.add("open");
        place(btn);
      }

      document.addEventListener("click", function (e) {
        var btn = e.target.closest && e.target.closest(".info-btn");
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          open(btn);
          return;
        }
        if (!pop.contains(e.target)) close();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") close();
      });
      window.addEventListener("scroll", function () { if (openBtn) place(openBtn); }, true);
      window.addEventListener("resize", close);
    })();
  </script>
</body>
</html>
`;
}

function renderMarkdown(report: StressReport): string {
  const measured = report.scenarios.filter((s) => !s.skipped);
  const byLatency = [...measured].sort((a, b) => b.duration_ms.p95 - a.duration_ms.p95);
  const byTokens = [...measured].sort((a, b) => b.est_tokens.max - a.est_tokens.max);
  const over = measured.filter((s) => s.over_band.length > 0);
  const hard = measured.filter((s) => s.hard_error);

  const lines: string[] = [];
  lines.push("# MCP stress report");
  lines.push("");
  lines.push(`- **When:** ${report.started_at} → ${report.finished_at}`);
  lines.push(
    `- **Content:** ${report.content.folder}${report.content.domain ? ` (${report.content.domain})` : ""}${report.content.pulled ? " — pulled" : " — on disk"}`,
  );
  lines.push(`- **App:** http://127.0.0.1:${report.ports.app}`);
  lines.push(`- **MCP:** http://127.0.0.1:${report.ports.mcp}`);
  lines.push(`- **Auth:** ${report.auth}`);
  lines.push(`- **Concurrency:** ${report.concurrency}${report.heavy ? " (heavy)" : ""}`);
  lines.push(
    `- **Result:** ${report.ok ? "OK" : "FAIL"} (hard_errors=${report.summary.hard_errors}, over_band=${report.summary.over_band}, fail_on_budget=${report.fail_on_budget})`,
  );
  lines.push("");
  lines.push(`_${report.guidance}_`);
  lines.push("");

  lines.push("## Top by latency (p95)");
  lines.push("");
  lines.push("| Scenario | Tool | Calls | p50 | p95 | max | Notes |");
  lines.push("|----------|------|------:|----:|----:|----:|-------|");
  for (const s of byLatency.slice(0, 15)) {
    const notes: string[] = [];
    if (s.over_band.includes("latency_p95")) {
      notes.push(`over latency budget ${s.budget.p95_ms}ms`);
    }
    if (s.hard_error) notes.push("hard error");
    lines.push(
      `| ${s.scenario_id} | ${s.tool} | ${s.calls} | ${s.duration_ms.p50}ms | **${s.duration_ms.p95}ms** | ${s.duration_ms.max}ms | ${notes.join("; ") || ""} |`,
    );
  }
  lines.push("");

  lines.push("## Top by estimated tokens");
  lines.push("");
  lines.push("| Scenario | Tool | max bytes | est_tokens | Budget | Notes |");
  lines.push("|----------|------|----------:|-----------:|-------:|-------|");
  for (const s of byTokens.slice(0, 15)) {
    const notes: string[] = [];
    if (s.over_band.includes("est_tokens")) notes.push("over token budget");
    if (s.class === "docs") notes.push("docs band");
    lines.push(
      `| ${s.scenario_id} | ${s.tool} | ${s.response_bytes.max} | **${s.est_tokens.max}** | ${s.budget.est_tokens} | ${notes.join("; ") || ""} |`,
    );
  }
  lines.push("");

  const hp = report.site_probe.health;
  lines.push("## Site responsiveness during burst");
  lines.push("");
  lines.push("| Probe | p50 | p95 | max | Failures | Samples |");
  lines.push("|-------|----:|----:|----:|---------:|--------:|");
  lines.push(
    `| GET /health | ${hp.p50_ms}ms | **${hp.p95_ms}ms** | ${hp.max_ms}ms | ${hp.failures} | ${hp.samples} |`,
  );
  lines.push("");

  if (over.length) {
    lines.push("## Over band");
    lines.push("");
    for (const s of over) {
      lines.push(
        `- \`${s.scenario_id}\`: ${s.over_band.join(", ")} (p95=${s.duration_ms.p95}ms / tokens=${s.est_tokens.max}; budgets ${s.budget.p95_ms}ms / ${s.budget.est_tokens})`,
      );
    }
    lines.push("");
  }

  if (hard.length) {
    lines.push("## Hard errors");
    lines.push("");
    for (const s of hard) {
      lines.push(`- \`${s.scenario_id}\`: ${s.errors.join(" | ") || "error"}`);
    }
    lines.push("");
  }

  if (report.skipped.length) {
    lines.push("## Skipped");
    lines.push("");
    for (const s of report.skipped) {
      lines.push(`- \`${s.scenario_id}\` — ${s.reason}`);
    }
    lines.push("");
  }

  lines.push("## How to read this");
  lines.push("");
  lines.push("- **Latency** → tools that can make the local site feel stuck under agent load.");
  lines.push(
    "- **est_tokens** → `ceil(chars/4)` on the text payload agents get back (ranking heuristic, not tiktoken).",
  );
  lines.push("");

  return lines.join("\n");
}
