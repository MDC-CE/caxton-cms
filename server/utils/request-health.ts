/**
 * Lightweight process / HTML latency signals for diagnosing CPU / event-loop stalls.
 *
 * - Periodic event-loop delay + memory (grep: module=process-health)
 * - Slow anonymous HTML responses (grep: module=slow-html / "slow HTML")
 *
 * Env:
 *   PROCESS_HEALTH_INTERVAL_MS — default 30000
 *   EVENT_LOOP_WARN_P99_MS — default 100 (warn when p99 exceeds this)
 *   SLOW_HTML_MS — default 500 (log HTML responses at/above this)
 */

import { monitorEventLoopDelay } from "node:perf_hooks";
import { child as loggerChild } from "../logger";

const healthLog = loggerChild({ module: "process-health" });
const slowHtmlLog = loggerChild({ module: "slow-html" });

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getSlowHtmlThresholdMs(): number {
  return envInt("SLOW_HTML_MS", 500);
}

export type SlowHtmlOutcome =
  | "cache_hit"
  | "ssr_ok"
  | "ssr_empty_fallback"
  | "ssr_error_fallback"
  | "client_fallback"
  | "other";

export interface SlowHtmlFields {
  url: string;
  ms: number;
  status?: number;
  cache?: "HIT" | "MISS" | "BYPASS" | "NONE";
  outcome?: SlowHtmlOutcome;
  appHtmlLength?: number;
  /** Optional actor hint (mcp / staff / anon) when known. */
  actor?: string;
}

/** Log when an HTML document response exceeds SLOW_HTML_MS (default 500). */
export function logSlowHtmlIfNeeded(fields: SlowHtmlFields): void {
  const threshold = getSlowHtmlThresholdMs();
  if (fields.ms < threshold) return;

  const clean = (fields.url || "/").split("?")[0].split("#")[0] || "/";
  slowHtmlLog.warn(
    {
      url: clean,
      ms: fields.ms,
      status: fields.status,
      cache: fields.cache ?? "NONE",
      outcome: fields.outcome ?? "other",
      appHtmlLength: fields.appHtmlLength,
      actor: fields.actor,
      thresholdMs: threshold,
    },
    "slow HTML response",
  );
}

let healthStarted = false;

/**
 * Start periodic event-loop + memory logging. Safe to call once at boot.
 * Uses monitorEventLoopDelay; resets the histogram each interval.
 */
export function startProcessHealthMonitor(): void {
  if (healthStarted) return;
  healthStarted = true;

  const intervalMs = envInt("PROCESS_HEALTH_INTERVAL_MS", 30_000);
  const warnP99Ms = envInt("EVENT_LOOP_WARN_P99_MS", 100);

  let histogram: ReturnType<typeof monitorEventLoopDelay>;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch (err) {
    healthLog.warn({ err }, "event loop monitor unavailable");
    return;
  }

  setInterval(() => {
    try {
      const meanMs = histogram.mean / 1e6;
      const p50Ms = histogram.percentile(50) / 1e6;
      const p99Ms = histogram.percentile(99) / 1e6;
      const maxMs = histogram.max / 1e6;
      histogram.reset();

      const mem = process.memoryUsage();
      const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
      const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
      const rssMb = Math.round(mem.rss / 1024 / 1024);

      const fields = {
        eventLoopMeanMs: Math.round(meanMs * 10) / 10,
        eventLoopP50Ms: Math.round(p50Ms * 10) / 10,
        eventLoopP99Ms: Math.round(p99Ms * 10) / 10,
        eventLoopMaxMs: Math.round(maxMs * 10) / 10,
        heapUsedMb,
        heapTotalMb,
        rssMb,
        uptimeSec: Math.round(process.uptime()),
      };

      if (p99Ms >= warnP99Ms) {
        healthLog.warn(fields, "event loop delay elevated");
      } else {
        healthLog.info(fields, "process health");
      }
    } catch (err) {
      healthLog.warn({ err }, "process health tick failed");
    }
  }, intervalMs).unref();
}
