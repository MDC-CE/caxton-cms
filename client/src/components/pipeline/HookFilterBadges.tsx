import type { ComponentType, ReactNode } from "react";
import { IconAlertTriangle, IconBulb, IconNote, IconPencil } from "@tabler/icons-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { FunnelStage } from "@shared/funnel";
import { FUNNEL_STAGE_ICON, FUNNEL_STAGE_ICON_TONE, FUNNEL_STAGE_TAPER } from "@/lib/funnel-stage-ui";
import {
  formatFilterValue,
  summarizeHookFilter,
  type HookFilterGroup,
  type HookFilterRow,
} from "@/lib/eventWebhookFilterSummary";
import type { EventWebhookHook } from "@/components/pipeline/EventWebhooksDialog";

export const KIND_OPTIONS = ["idea", "edits", "notes"] as const;

/** Icons match ProposalKindBadge; chart tones keep kinds visually distinct. */
export const KIND_CHIP_META: Record<
  (typeof KIND_OPTIONS)[number],
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    idle: string;
    selected: string;
    iconClass: string;
  }
> = {
  idea: {
    label: "idea",
    icon: IconBulb,
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
    selected: "border-chart-5/40 bg-chart-5/15 text-foreground",
    iconClass: "text-chart-5",
  },
  edits: {
    label: "edits",
    icon: IconPencil,
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
    selected: "border-chart-1/40 bg-chart-1/15 text-foreground",
    iconClass: "text-chart-1",
  },
  notes: {
    label: "notes",
    icon: IconNote,
    idle: "border-border bg-background text-muted-foreground hover:text-foreground",
    selected: "border-chart-3/40 bg-chart-3/15 text-foreground",
    iconClass: "text-chart-3",
  },
};

/** "es, fr +1 · not ~~pt~~" */
function PairText({ row, max = 2 }: { row: HookFilterRow; max?: number }) {
  const fmt = (v: string) => formatFilterValue(row.format, v);
  const inc = row.include;
  const exc = row.exclude;
  return (
    <>
      {inc.slice(0, max).map(fmt).join(", ")}
      {inc.length > max ? <span className="text-muted-foreground"> +{inc.length - max}</span> : null}
      {exc.length ? (
        <span className="text-muted-foreground">
          {inc.length ? " · " : ""}not{" "}
          <span className="line-through">{exc.slice(0, max).map(fmt).join(", ")}</span>
          {exc.length > max ? ` +${exc.length - max}` : ""}
        </span>
      ) : null}
    </>
  );
}

function FullValues({ row }: { row: HookFilterRow }) {
  const fmt = (v: string) => formatFilterValue(row.format, v);
  return (
    <span className={cn(row.mono && "font-mono text-[11px]")}>
      {row.include.map(fmt).join(", ")}
      {row.exclude.length ? (
        <span className="text-muted-foreground">
          {row.include.length ? " · " : ""}not{" "}
          <span className="line-through">{row.exclude.map(fmt).join(", ")}</span>
        </span>
      ) : null}
    </span>
  );
}

function KindIcons({ values }: { values: string[] }) {
  return (
    <>
      {values.map((k) => {
        const meta = KIND_CHIP_META[k as keyof typeof KIND_CHIP_META];
        if (!meta) return <span key={k}>{k}</span>;
        const Icon = meta.icon;
        return (
          <span key={k} className="inline-flex items-center gap-0.5">
            <Icon className={cn("h-3 w-3", meta.iconClass)} aria-hidden />
            {meta.label}
          </span>
        );
      })}
    </>
  );
}

function FunnelStageIcons({ values }: { values: string[] }) {
  return (
    <>
      {values.map((s) => {
        const stage = s as FunnelStage;
        const Icon = FUNNEL_STAGE_ICON[stage];
        if (!Icon) return null;
        return (
          <Icon
            key={s}
            className={cn("h-3 w-3 shrink-0", FUNNEL_STAGE_ICON_TONE[FUNNEL_STAGE_TAPER[stage]])}
            aria-label={formatFilterValue("funnel_stage", s)}
          />
        );
      })}
    </>
  );
}

/** Compact badge face: people groups show a count; others show their values. */
function BadgeFace({ group }: { group: HookFilterGroup }): ReactNode {
  if (group.id === "writer" || group.id === "trigger") {
    return (
      <>
        {group.label}
        <span className="rounded bg-muted px-1 tabular-nums text-muted-foreground">{group.count}</span>
      </>
    );
  }
  if (group.id === "kinds") {
    const row = group.rows[0]!;
    return (
      <>
        {row.include.length ? null : <span className="text-muted-foreground">Kind</span>}
        <KindIcons values={row.include} />
        {row.exclude.length ? <PairText row={{ ...row, include: [] }} max={3} /> : null}
      </>
    );
  }
  if (group.id === "funnel") {
    const stages = group.rows.find((r) => r.field === "funnel_stages");
    const products = group.rows.find((r) => r.field === "funnel_products");
    return (
      <>
        <span className="text-muted-foreground">Funnel</span>
        {stages ? <FunnelStageIcons values={stages.include} /> : null}
        <span className="truncate">
          {stages?.exclude.length ? <PairText row={{ ...stages, include: [] }} /> : null}
          {products ? (
            <span className={cn(products.mono && "font-mono")}>
              {stages?.exclude.length ? " · " : ""}
              <PairText row={products} />
            </span>
          ) : null}
        </span>
      </>
    );
  }
  const row = group.rows[0]!;
  return (
    <>
      <span className="text-muted-foreground">{group.label}</span>
      <span className={cn("truncate", row.mono && "font-mono")}>
        <PairText row={row} />
      </span>
    </>
  );
}

function FilterBadge({ group, testId }: { group: HookFilterGroup; testId: string }) {
  const conflict = group.conflicts.length > 0;
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-5 max-w-[16rem] items-center gap-1 rounded border px-1.5 text-[11px] transition-colors",
            conflict
              ? "border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/15"
              : "border-border bg-background text-foreground hover:bg-muted",
          )}
          title={conflict ? group.conflicts[0] : `${group.label} filter`}
          data-testid={testId}
        >
          {conflict ? <IconAlertTriangle className="h-3 w-3 shrink-0" aria-hidden /> : null}
          <BadgeFace group={group} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[10001] w-72 space-y-2 p-3 text-xs"
        sideOffset={6}
        data-testid={`${testId}-popover`}
      >
        <p className="font-medium text-foreground">{group.label} filters</p>
        <ul className="space-y-1.5">
          {group.rows.map((r) => (
            <li key={r.field}>
              <span className="text-muted-foreground">{r.label}: </span>
              <FullValues row={r} />
            </li>
          ))}
        </ul>
        {conflict ? (
          <ul className="space-y-1 border-t border-border pt-2 text-amber-500">
            {group.conflicts.map((c) => (
              <li key={c} className="flex items-start gap-1.5">
                <IconAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {c}
              </li>
            ))}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function HookFilterBadges({
  hook,
  testIdSuffix,
}: {
  hook: EventWebhookHook;
  testIdSuffix: string;
}) {
  const { groups } = summarizeHookFilter(hook.filter);
  if (!groups.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-1 pt-0.5"
      data-testid={`hook-filter-badges-${testIdSuffix}`}
    >
      {groups.map((g) => (
        <FilterBadge key={g.id} group={g} testId={`badge-hook-filter-${g.id}-${testIdSuffix}`} />
      ))}
    </div>
  );
}
