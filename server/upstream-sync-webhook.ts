import { verifyWebhookSignature } from "./github";

export const UPSTREAM_REPO = "breatheco-de/caxton-cms";
export const UPSTREAM_SYNC_WORKFLOW = "sync-caxton-cms.yml";
export const UPSTREAM_SYNC_PATH = "/api/github/upstream-sync";

const WEBHOOK_SECRET_ENV = "UPSTREAM_SYNC_WEBHOOK_SECRET";
const DISPATCH_TOKEN_ENV = "UPSTREAM_SYNC_DISPATCH_TOKEN";

export type UpstreamSyncResult =
  | { status: 200; body: { ok: true; message: string } }
  | { status: 401; body: { error: string } }
  | { status: 503; body: { error: string } };

export function decideUpstreamSync(input: {
  event: string;
  signature: string | undefined;
  payload: string;
  body: unknown;
  secret: string | undefined;
}): UpstreamSyncResult | { dispatch: true } {
  const secret = input.secret?.trim();
  if (!secret) {
    return { status: 503, body: { error: "Upstream sync webhook is not configured" } };
  }
  if (!input.signature || !verifyWebhookSignature(input.payload, input.signature, secret)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }
  if (input.event === "ping") {
    return { status: 200, body: { ok: true, message: "pong" } };
  }
  if (input.event !== "push") {
    return { status: 200, body: { ok: true, message: `Ignored event: ${input.event}` } };
  }
  const body = input.body as {
    ref?: string;
    repository?: { full_name?: string };
  } | null;
  const ref = body?.ref || "";
  const repo = (body?.repository?.full_name || "").toLowerCase();
  if (repo !== UPSTREAM_REPO || ref !== "refs/heads/main") {
    return { status: 200, body: { ok: true, message: "Ignored push" } };
  }
  return { dispatch: true };
}

export async function dispatchUpstreamSyncWorkflow(token: string): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/MDC-CE/caxton-cms/actions/workflows/${UPSTREAM_SYNC_WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Workflow dispatch failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

export async function handleUpstreamSyncWebhook(input: {
  event: string;
  signature: string | undefined;
  payload: string;
  body: unknown;
  secret?: string;
  dispatchToken?: string;
  dispatch?: (token: string) => Promise<void>;
}): Promise<UpstreamSyncResult> {
  const decision = decideUpstreamSync({
    event: input.event,
    signature: input.signature,
    payload: input.payload,
    body: input.body,
    secret: input.secret ?? process.env[WEBHOOK_SECRET_ENV],
  });
  if (!("dispatch" in decision)) return decision;

  const token = (input.dispatchToken ?? process.env[DISPATCH_TOKEN_ENV] ?? "").trim();
  if (!token) {
    return { status: 503, body: { error: "Upstream sync dispatch token is not configured" } };
  }
  await (input.dispatch ?? dispatchUpstreamSyncWorkflow)(token);
  return { status: 200, body: { ok: true, message: "Sync started" } };
}
