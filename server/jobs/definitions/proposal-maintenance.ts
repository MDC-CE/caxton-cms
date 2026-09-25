import { Job } from "sidequest";
import { child } from "../../logger";
import { enqueueJob } from "../queue";

const log = child({ module: "job:proposal-maintenance" });

const DAY_MS = 24 * 60 * 60 * 1000;

async function reschedule(jobType: string, delayMs = DAY_MS): Promise<void> {
  try {
    await enqueueJob(jobType, {}, { delayMs, uniqueKey: jobType, uniqueWithArgs: false });
  } catch (err) {
    log.warn({ err, jobType }, "[proposal-maintenance] reschedule failed");
  }
}

/** Daily (self-rescheduling): stale_since / 30-day flag / 90-day abandoned_stale close. */
export class ProposalStaleSweepJob extends Job {
  async run(): Promise<{ ok: boolean }> {
    const { getSiteContextMap } = await import("../../site-manager");
    const { proposalServiceForSite } = await import("../../content-proposals/service");
    try {
      for (const ctx of Array.from(getSiteContextMap().values())) {
        const report = await proposalServiceForSite(ctx).staleSweep();
        log.info({ site: ctx.contentRootName, ...report }, "[ProposalStaleSweepJob] done");
      }
    } finally {
      await reschedule("proposal_stale_sweep");
    }
    return { ok: true };
  }
}

/** Daily (self-rescheduling): verify `_draft.proposal` links locally and against production. */
export class DraftLinkCheckJob extends Job {
  async run(): Promise<{ ok: boolean }> {
    const { getSiteContextMap } = await import("../../site-manager");
    const { proposalServiceForSite, pipelineEnv } = await import("../../content-proposals/service");
    const { fetchProductionAdmin, resolveProductionOrigin } = await import("../../dev-production-fetch");
    try {
      for (const ctx of Array.from(getSiteContextMap().values())) {
        const site = ctx.contentRootName;
        const remoteStatus = async (proposalId: string): Promise<"open" | "closed" | "unknown"> => {
          if (pipelineEnv() === "production") return "closed";
          const origin = resolveProductionOrigin(site);
          if (!origin) return "unknown";
          const res = await fetchProductionAdmin(
            new URL(`/api/admin/proposals/${encodeURIComponent(proposalId)}`, origin),
            { method: "GET" },
            origin,
          );
          if (!res.ok) return res.kind === "http" && res.status === 404 ? "closed" : "unknown";
          const body = (await res.response.json().catch(() => null)) as { proposal?: { status?: string } } | null;
          const status = body?.proposal?.status;
          if (!status) return "unknown";
          return status === "open" || status === "partial" ? "open" : "closed";
        };
        const report = await proposalServiceForSite(ctx).verifyDraftLinks({ remoteStatus });
        log.info({ site, ...report }, "[DraftLinkCheckJob] done");
      }
    } finally {
      await reschedule("draft_link_check");
    }
    return { ok: true };
  }
}

/** Startup: make sure both daily jobs are queued once; warn when PIPELINE_ENV is unset. */
export async function scheduleProposalMaintenance(): Promise<void> {
  if (!process.env.PIPELINE_ENV?.trim()) {
    log.warn(
      "PIPELINE_ENV is not set — proposal drafts are linked with env 'unknown', and the daily link check verifies them against local and production before cleaning up.",
    );
  }
  await reschedule("proposal_stale_sweep", 10 * 60 * 1000);
  await reschedule("draft_link_check", 15 * 60 * 1000);
}
