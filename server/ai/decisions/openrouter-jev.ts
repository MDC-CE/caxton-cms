/**
 * OpenRouter Decisions API client for TypeSafe Jev (not chat completions).
 */

import {
  OPENROUTER_DEFAULT_BASE_URL,
  resolveDecisionModel,
  resolveLLMApiKey,
  resolveLLMBaseURL,
} from "../LLMService";
import { child } from "../../logger";
import type { DecisionClient, DecideRequest, DecideResult } from "./types";

const log = child({ module: "ai/decisions/jev" });

const DEFAULT_TIMEOUT_MS = 2000;

export function decisionsApiUrl(baseUrl: string): string {
  // llm.yml usually points at .../api/v1 — Decisions live under /api/alpha/decisions
  const root = baseUrl.replace(/\/$/, "").replace(/\/api\/v1$/, "");
  if (root.includes("/api/alpha")) {
    return `${root.replace(/\/$/, "")}/decisions`;
  }
  return `${root}/api/alpha/decisions`;
}

export function createOpenRouterJevClient(opts?: {
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  contentRoot?: string;
}): DecisionClient {
  const apiKeyEnv = opts?.apiKeyEnv ?? "OPENROUTER_API_KEY";
  const baseUrlEnv = opts?.baseUrlEnv ?? "OPENROUTER_BASE_URL";
  const contentRoot = opts?.contentRoot;

  return {
    async decide(req: DecideRequest): Promise<DecideResult> {
      const apiKey = resolveLLMApiKey(apiKeyEnv);
      if (!apiKey) {
        return { status: "unavailable", reason: "no_key" };
      }
      const base =
        resolveLLMBaseURL(baseUrlEnv) || OPENROUTER_DEFAULT_BASE_URL;
      const url = decisionsApiUrl(base);
      const model = req.model?.trim() || resolveDecisionModel(contentRoot);
      const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            state: req.state,
            questions: req.questions,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          log.warn(
            { status: res.status, body: body.slice(0, 200) },
            "Jev decisions request failed",
          );
          return {
            status: "unavailable",
            reason: "error",
            message: `HTTP ${res.status}`,
          };
        }
        const data = (await res.json()) as {
          answers?: Record<string, unknown>;
          model?: string;
        };
        if (!data?.answers || typeof data.answers !== "object") {
          return {
            status: "unavailable",
            reason: "error",
            message: "missing answers",
          };
        }
        return {
          status: "ok",
          answers: data.answers,
          model: typeof data.model === "string" ? data.model : model,
        };
      } catch (err) {
        const aborted =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted/i.test(err.message));
        if (aborted) {
          return { status: "unavailable", reason: "timeout" };
        }
        log.warn({ err }, "Jev decisions request error");
        return {
          status: "unavailable",
          reason: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

let defaultClient: DecisionClient | null = null;

export function getDecisionClient(): DecisionClient {
  if (!defaultClient) defaultClient = createOpenRouterJevClient();
  return defaultClient;
}

/** Clear cached client so the next getDecisionClient() re-reads llm.yml. */
export function reloadDecisionClient(): void {
  defaultClient = null;
}

/** @internal tests */
export function setDecisionClientForTests(client: DecisionClient | null): void {
  defaultClient = client;
}

/**
 * Cheap Decisions API probe — one tiny noul. Does not persist settings.
 */
export async function probeDecisionModel(opts?: {
  apiKeyEnv?: string;
  baseUrlEnv?: string;
  contentRoot?: string;
  model?: string;
  timeoutMs?: number;
}): Promise<
  | { ok: true; model: string }
  | { ok: false; error: string; model?: string }
> {
  const apiKeyEnv = opts?.apiKeyEnv ?? "OPENROUTER_API_KEY";
  const baseUrlEnv = opts?.baseUrlEnv ?? "OPENROUTER_BASE_URL";
  const apiKey = resolveLLMApiKey(apiKeyEnv);
  if (!apiKey) {
    return { ok: false, error: `API key not configured. Set ${apiKeyEnv} in environment.` };
  }
  const model = opts?.model?.trim() || resolveDecisionModel(opts?.contentRoot);
  const client = createOpenRouterJevClient({
    apiKeyEnv,
    baseUrlEnv,
    contentRoot: opts?.contentRoot,
  });
  const result = await client.decide({
    model,
    timeoutMs: opts?.timeoutMs ?? 3000,
    state: { probe: "connection_test" },
    questions: {
      reachable: {
        type: "noul",
        instructions: "Is this a connectivity probe message?",
        true: "Yes, this is a probe.",
        false: "No, this is something else.",
      },
    },
  });
  if (result.status === "unavailable") {
    return {
      ok: false,
      model,
      error:
        result.message ||
        (result.reason === "no_key"
          ? "API key missing"
          : result.reason === "timeout"
            ? "Decision model timed out"
            : "Decision model request failed"),
    };
  }
  return { ok: true, model: result.model || model };
}
