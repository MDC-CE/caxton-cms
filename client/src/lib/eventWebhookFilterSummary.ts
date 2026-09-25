import type { FunnelStage } from "@shared/funnel";
import type { EventWebhookFilter } from "@/components/pipeline/EventWebhooksDialog";
import { FUNNEL_STAGE_LABEL } from "@/lib/funnel-stage-ui";

export type FilterValueFormat = "plain" | "actor_type" | "funnel_stage";

export type HookFilterRow = {
  field: string;
  label: string;
  include: string[];
  exclude: string[];
  format: FilterValueFormat;
  mono: boolean;
};

export type HookFilterGroupId = "funnel" | "kinds" | "contentTypes" | "locales" | "writer" | "trigger";

export type HookFilterGroup = {
  id: HookFilterGroupId;
  label: string;
  /** Only rows with at least one included or excluded value. */
  rows: HookFilterRow[];
  count: number;
  /** Plain reasons this hook can't match; non-empty turns the badge amber. */
  conflicts: string[];
};

export type HookFilterSummary = {
  groups: HookFilterGroup[];
  funnelConflict: boolean;
};

const ACTOR_TYPE_LABEL: Record<string, string> = {
  ui: "Staff UI (ui)",
  mcp: "Agent (mcp)",
  system: "System (system)",
};

export function actorTypeLabel(v: string): string {
  return ACTOR_TYPE_LABEL[v.toLowerCase()] ?? v;
}

export function formatFilterValue(format: FilterValueFormat, v: string): string {
  if (format === "actor_type") return actorTypeLabel(v);
  if (format === "funnel_stage") return FUNNEL_STAGE_LABEL[v as FunnelStage] ?? v;
  return v;
}

/** Values in both lists (case-insensitive exact match, like the server; `*` is not expanded). */
export function overlap(include: readonly string[], exclude: readonly string[]): string[] {
  const ex = new Set(exclude.map((v) => v.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of include) {
    const k = v.toLowerCase();
    if (ex.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

export const FUNNEL_CONFLICT_REASON = "Only ideas have a funnel; this hook can't match.";

type RowSpec = {
  field: string;
  label: string;
  include?: readonly string[];
  exclude?: readonly string[];
  format?: FilterValueFormat;
  mono?: boolean;
};

function buildGroup(id: HookFilterGroupId, label: string, specs: RowSpec[]): HookFilterGroup | null {
  const rows: HookFilterRow[] = [];
  const conflicts: string[] = [];
  for (const s of specs) {
    const include = [...(s.include ?? [])];
    const exclude = [...(s.exclude ?? [])];
    if (include.length + exclude.length === 0) continue;
    const format = s.format ?? "plain";
    rows.push({ field: s.field, label: s.label, include, exclude, format, mono: s.mono ?? false });
    for (const v of overlap(include, exclude)) {
      conflicts.push(
        `"${formatFilterValue(format, v)}" is both included and excluded; this hook can't match.`,
      );
    }
  }
  if (!rows.length) return null;
  const count = rows.reduce((n, r) => n + r.include.length + r.exclude.length, 0);
  return { id, label, rows, count, conflicts };
}

export function summarizeHookFilter(filter: EventWebhookFilter | undefined): HookFilterSummary {
  if (!filter) return { groups: [], funnelConflict: false };
  const f = filter;

  const funnelIncluded = (f.funnel_stages?.length ?? 0) + (f.funnel_products?.length ?? 0) > 0;
  const kindsIn = f.kinds ?? [];
  const funnelConflict =
    funnelIncluded &&
    ((kindsIn.length > 0 && !kindsIn.includes("idea")) || (f.exclude_kinds ?? []).includes("idea"));

  const groups = [
    buildGroup("funnel", "Funnel", [
      { field: "funnel_stages", label: "Stage", include: f.funnel_stages, exclude: f.exclude_funnel_stages, format: "funnel_stage" },
      { field: "funnel_products", label: "Product", include: f.funnel_products, exclude: f.exclude_funnel_products, mono: true },
    ]),
    buildGroup("kinds", "Kind", [
      { field: "kinds", label: "Kind", include: f.kinds, exclude: f.exclude_kinds },
    ]),
    buildGroup("contentTypes", "Type", [
      { field: "content_types", label: "Content type", include: f.content_types, exclude: f.exclude_content_types, mono: true },
    ]),
    buildGroup("locales", "Locale", [
      { field: "locales", label: "Locale", include: f.locales, exclude: f.exclude_locales, mono: true },
    ]),
    buildGroup("writer", "Writer", [
      { field: "proposal_authors", label: "Proposer", include: f.proposal_authors, exclude: f.exclude_proposal_authors, mono: true },
      { field: "proposal_models", label: "Model", include: f.proposal_models, exclude: f.exclude_proposal_models, mono: true },
      { field: "proposal_actor_types", label: "Source", include: f.proposal_actor_types, format: "actor_type" },
      { field: "proposal_roles", label: "Swarm role", include: f.proposal_roles, mono: true },
    ]),
    buildGroup("trigger", "Triggered by", [
      { field: "event_authors", label: "Who", include: f.event_authors, exclude: f.exclude_event_authors, mono: true },
      { field: "event_models", label: "Model", include: f.event_models, exclude: f.exclude_event_models, mono: true },
      { field: "event_clients", label: "Client", include: f.event_clients, exclude: f.exclude_event_clients },
      { field: "event_actor_types", label: "Source", include: f.event_actor_types, format: "actor_type" },
    ]),
  ].filter((g): g is HookFilterGroup => g !== null);

  if (funnelConflict) {
    const funnel = groups.find((g) => g.id === "funnel");
    funnel?.conflicts.unshift(FUNNEL_CONFLICT_REASON);
  }

  return { groups, funnelConflict };
}
