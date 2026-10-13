/**
 * When component-registry schema.yml changes, section-variants cached issues can
 * become stale (e.g. new variants: keys added). Debounced site-wide refresh.
 */
import type { SiteContext } from "./site-manager";
import { getSiteContextMap } from "./site-manager";
import { startDiagnosticsJob } from "./services/diagnosticsJobService";
import { child } from "./logger";

const log = child({ module: "registrySchemaValidationRefresh" });

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 2_000;

const REGISTRY_SCHEMA_PATH =
  /^[^/]+\/component-registry\/[^/]+\/[^/]+\/schema\.ya?ml$/;

export function isComponentRegistrySchemaPath(filePath: string): boolean {
  return REGISTRY_SCHEMA_PATH.test(filePath.replace(/\\/g, "/"));
}

async function refreshSectionVariants(ctx: SiteContext): Promise<void> {
  try {
    const result = await startDiagnosticsJob({
      contentRoot: ctx.contentRoot,
      contentRootName: ctx.contentRootName,
      ci: ctx.contentIndex,
      cache: ctx.validationCache,
      freshness: "hard",
      confirm: true,
      kind: "section-variants",
      validators: ["section-variants"],
    });
    if (result.status === "busy") {
      log.info(
        { site: ctx.contentRootName, job_id: result.job_id },
        "section-variants refresh skipped — site-wide diagnostics already running",
      );
      return;
    }
    log.info(
      { site: ctx.contentRootName, job_id: "job_id" in result ? result.job_id : undefined },
      "Queued section-variants refresh after registry schema change",
    );
  } catch (err) {
    log.warn({ err, site: ctx.contentRootName }, "section-variants refresh failed");
  }
}

export function scheduleSectionVariantsRefreshForFile(filePath: string): void {
  const normalized = filePath.replace(/\\/g, "/");
  if (!isComponentRegistrySchemaPath(normalized)) return;

  for (const ctx of getSiteContextMap().values()) {
    if (!normalized.startsWith(`${ctx.contentRootName}/`)) continue;

    const existing = timers.get(ctx.contentRootName);
    if (existing) clearTimeout(existing);

    timers.set(
      ctx.contentRootName,
      setTimeout(() => {
        timers.delete(ctx.contentRootName);
        void refreshSectionVariants(ctx);
      }, DEBOUNCE_MS),
    );
    break;
  }
}
