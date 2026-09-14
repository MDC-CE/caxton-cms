import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ReviewContextPayload = {
  damage_class?: string;
  undo_cost?: string;
  block_apply?: boolean;
  situation_changed_since_filed?: boolean;
  filed_damage_class?: string;
  active_checklists?: string[];
  summary?: string;
  staff_summary?: {
    badge_label: string;
    situation_description: string;
    risk: string;
    undo: string;
    related?: string;
  };
  agent_preview?: {
    think_items?: Array<{ id: string; title: string; why: string; look_for: string[] }>;
    warnings?: Array<{ code: string; message: string }>;
  };
  related_open_proposals?: Array<{
    id: string;
    title?: string;
    kind: string;
    shared_issue_ids: string[];
  }>;
  entries?: Array<{
    contentType: string;
    slug: string;
    locale: string;
    existence: string;
    damage_class: string;
    target_missing?: boolean;
  }>;
};

/** List chip from persisted snapshot (no modal — open detail for live audit). */
export function SituationSnapshotBadge({
  snapshot,
  className,
}: {
  snapshot?: Record<string, unknown> | null;
  className?: string;
}) {
  const label =
    typeof snapshot?.badge_label === "string"
      ? snapshot.badge_label
      : typeof snapshot?.damage_class === "string"
        ? snapshot.damage_class
        : null;
  if (!label) return null;
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", className)}
      data-testid="badge-proposal-situation-snapshot"
    >
      {label}
    </Badge>
  );
}

/** Clickable situation badge → audit dialog (live review_context). */
export function SituationReviewBadge({
  reviewContext,
  className,
}: {
  reviewContext: ReviewContextPayload | null | undefined;
  className?: string;
}) {
  const [advanced, setAdvanced] = useState(false);
  if (!reviewContext?.staff_summary?.badge_label) return null;

  const staff = reviewContext.staff_summary;
  const destructive = Boolean(reviewContext.block_apply);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex shrink-0", className)}
          data-testid="badge-proposal-situation"
          aria-label={`${staff.badge_label} — what this situation means`}
        >
          <Badge
            variant={destructive ? "destructive" : "outline"}
            className="cursor-pointer font-normal hover-elevate"
          >
            {staff.badge_label}
          </Badge>
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] max-w-lg overflow-y-auto"
        data-testid="dialog-proposal-situation"
      >
        <DialogHeader>
          <DialogTitle>{staff.badge_label}</DialogTitle>
          <DialogDescription className="text-left text-sm leading-5 text-muted-foreground">
            {staff.situation_description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {reviewContext.situation_changed_since_filed ? (
            <p
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100"
              data-testid="banner-situation-changed"
            >
              Situation changed since this was filed
              {reviewContext.filed_damage_class
                ? ` (was ${reviewContext.filed_damage_class}, now ${reviewContext.damage_class}).`
                : "."}
            </p>
          ) : null}

          {reviewContext.block_apply ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive"
              data-testid="banner-target-missing"
            >
              The page this proposal edits no longer exists — apply is blocked; reject or withdraw, or
              restore the page and file fresh.
            </p>
          ) : null}

          <div className="space-y-1">
            <p className="font-medium text-foreground">Risk</p>
            <p className="text-muted-foreground leading-5">{staff.risk}</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Undo</p>
            <p className="text-muted-foreground leading-5">{staff.undo}</p>
          </div>
          {staff.related ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">Related proposals</p>
              <p className="text-muted-foreground leading-5">{staff.related}</p>
              {reviewContext.related_open_proposals?.length ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {reviewContext.related_open_proposals.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/private/agents/proposals/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.title || r.id}
                      </Link>{" "}
                      ({r.kind})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {reviewContext.agent_preview?.think_items?.length ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">Checklist</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {reviewContext.agent_preview.think_items.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 text-xs text-primary"
            data-testid="button-proposal-situation-advanced"
            onClick={() => setAdvanced((v) => !v)}
          >
            {advanced ? "Hide advanced" : "Read more (advanced)"}
          </Button>

          {advanced ? (
            <div
              className="space-y-3 border-t pt-3 text-xs text-muted-foreground"
              data-testid="panel-proposal-situation-advanced"
            >
              <p>
                <span className="font-medium text-foreground">damage_class:</span>{" "}
                {reviewContext.damage_class ?? "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">undo_cost:</span>{" "}
                {reviewContext.undo_cost ?? "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">active_checklists:</span>{" "}
                {(reviewContext.active_checklists ?? []).join(", ") || "—"}
              </p>
              {reviewContext.entries?.length ? (
                <div>
                  <p className="font-medium text-foreground">entries</p>
                  <ul className="mt-1 space-y-1 font-mono">
                    {reviewContext.entries.map((e) => (
                      <li key={`${e.contentType}/${e.slug}/${e.locale}`}>
                        {e.contentType}/{e.slug} ({e.locale}) · {e.existence} · {e.damage_class}
                        {e.target_missing ? " · target_missing" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {reviewContext.agent_preview?.think_items?.map((t) => (
                <div key={t.id} className="space-y-1 rounded-md border p-2">
                  <p className="font-mono text-foreground">{t.id}</p>
                  <p className="font-medium text-foreground">{t.title}</p>
                  <p>{t.why}</p>
                  <ul className="list-disc pl-4">
                    {t.look_for.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {reviewContext.agent_preview?.warnings?.length ? (
                <div>
                  <p className="font-medium text-foreground">warnings</p>
                  <ul className="mt-1 space-y-1">
                    {reviewContext.agent_preview.warnings.map((w) => (
                      <li key={w.code}>
                        <span className="font-mono">{w.code}</span>: {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-4">
                {JSON.stringify(reviewContext, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
