import { Job } from "sidequest";
import { markJobFinished, markJobStarted } from "../heartbeat";
import { child } from "../../logger";
import {
  buildWebhookBody,
  deliverEventWebhookHttp,
  findHook,
  loadEventWebhookConfigSafe,
  loadEventsForDelivery,
  recordDelivery,
  resolveContentRootForSite,
  type EventWebhookDeliverySource,
} from "../../events/event-webhooks";

const log = child({ module: "job:event-webhook-delivery" });

export type EventWebhookDeliveryPayload = {
  site: string;
  eventType: string;
  hookId: string;
  eventIds: number[];
  source: EventWebhookDeliverySource;
};

export class EventWebhookDeliveryJob extends Job {
  async run(payload: EventWebhookDeliveryPayload): Promise<{ ok: boolean }> {
    markJobStarted("event_webhook_delivery");
    try {
      const { site, eventType, hookId, eventIds, source } = payload;
      const contentRoot = resolveContentRootForSite(site);
      if (!contentRoot) {
        log.warn({ site }, "[EventWebhookDelivery] No content root for site");
        recordDelivery({
          site,
          eventType,
          hookId,
          eventIds: eventIds ?? [],
          url: "",
          status: "failure",
          error: "content root not found",
          source: source ?? "live",
        });
        return { ok: false };
      }
      const config = loadEventWebhookConfigSafe(contentRoot);
      const hook = findHook(config, eventType, hookId);
      if (!hook || !hook.enabled || !hook.url) {
        recordDelivery({
          site,
          eventType,
          hookId,
          eventIds: eventIds ?? [],
          url: hook?.url ?? "",
          status: "failure",
          error: "hook missing, disabled, or has no url",
          source: source ?? "live",
        });
        return { ok: false };
      }
      const events = loadEventsForDelivery(site, eventIds ?? []);
      if (events.length === 0) {
        recordDelivery({
          site,
          eventType,
          hookId,
          eventIds: eventIds ?? [],
          url: hook.url,
          status: "failure",
          error: "events no longer available",
          source: source ?? "live",
        });
        return { ok: false };
      }
      const body = buildWebhookBody({
        site,
        eventType,
        hook,
        events,
        source: source ?? "live",
      });
      const result = await deliverEventWebhookHttp({
        url: hook.url,
        headers: hook.headers,
        body,
      });
      if (result.ok) {
        recordDelivery({
          site,
          eventType,
          hookId,
          eventIds,
          url: hook.url,
          status: "success",
          httpStatus: result.status,
          durationMs: result.durationMs,
          source: source ?? "live",
        });
        return { ok: true };
      }
      recordDelivery({
        site,
        eventType,
        hookId,
        eventIds,
        url: hook.url,
        status: "failure",
        httpStatus: result.status,
        error: result.error,
        durationMs: result.durationMs,
        source: source ?? "live",
      });
      return { ok: false };
    } finally {
      markJobFinished("event_webhook_delivery");
    }
  }
}
