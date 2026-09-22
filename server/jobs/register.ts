import { registerJobClass } from "./queue";
import { IndexRefreshJob } from "./definitions/index-refresh";
import { OnSaveValidationJob } from "./definitions/on-save-validation";
import { EntryDeleteCleanupJob } from "./definitions/entry-delete-cleanup";
import { SyncStateFlushJob } from "./definitions/sync-state-flush";
import { BindingPropagationJob } from "./definitions/binding-propagation";
import { ClusterHubPathRewriteJob } from "./definitions/cluster-hub-path-rewrite";
import { AiImageGcJob } from "./definitions/ai-image-gc";
import { SeoIndexRefreshJob } from "./definitions/seo-index-refresh";
import { EventWebhookDeliveryJob } from "./definitions/event-webhook-delivery";

export function registerAllJobs(): void {
  registerJobClass("index_refresh", IndexRefreshJob);
  registerJobClass("on_save_validation", OnSaveValidationJob);
  registerJobClass("entry_delete_cleanup", EntryDeleteCleanupJob);
  registerJobClass("sync_state_flush", SyncStateFlushJob);
  registerJobClass("binding_propagation", BindingPropagationJob);
  registerJobClass("cluster_hub_path_rewrite", ClusterHubPathRewriteJob);
  registerJobClass("ai_image_gc", AiImageGcJob);
  registerJobClass("seo_index_refresh", SeoIndexRefreshJob);
  registerJobClass("event_webhook_delivery", EventWebhookDeliveryJob);
}
