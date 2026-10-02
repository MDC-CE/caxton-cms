import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ComponentInsightsData, InsightPageRecord } from "@shared/schema";

interface SlotOption {
  type: string;
  variant: string;
  background: string | null;
  share: number;
  example_pages: string[];
}
interface RecipeResponse {
  mode: "sections" | "fields";
  fallback?: "site_wide" | null;
  sample?: { layouts: number; scoped_layouts: number; approved: number; total_weight: number };
  slots?: Array<{ slot: number; presence: number; required: boolean; options: SlotOption[] }>;
  top_layouts?: Array<{ key: string; weight: number; approval: string; sections: Array<{ type: string; variant: string }> }>;
  template_file?: string | null;
  attached_pages?: number | null;
}
interface LearnedRule {
  id: string;
  title: string;
  description: string;
  status: "active" | "suggestion" | "pinned" | "disabled";
  evidence: { approved_pages: number; checks: number; agreement: number; examples: string[]; counter_examples: string[] };
}

const APPROVAL_LABEL: Record<string, string> = {
  approved: "Approved",
  implicit: "Trusted",
  rejected: "Not a good example",
  stale: "Paused",
  none: "—",
};

const RULE_STATUS_LABEL: Record<LearnedRule["status"], string> = {
  active: "Learned",
  suggestion: "Suggestion",
  pinned: "Pinned",
  disabled: "Disabled",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function RecipeView({ contentTypes }: { contentTypes: string[] }) {
  const [contentType, setContentType] = useState<string>(contentTypes.includes("landing") ? "landing" : contentTypes[0] ?? "");
  const recipe = useQuery<RecipeResponse>({
    queryKey: ["/api/private/component-insights/recipe", contentType],
    enabled: !!contentType,
    queryFn: async () => {
      const res = await apiFetch(`/api/private/component-insights/recipe?${new URLSearchParams({ contentType })}`);
      if (!res.ok) throw new Error("Failed to load recipe");
      return res.json();
    },
  });
  const r = recipe.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={contentType} onValueChange={setContentType}>
          <SelectTrigger className="w-56" data-testid="select-recipe-content-type">
            <SelectValue placeholder="Content type" />
          </SelectTrigger>
          <SelectContent>
            {contentTypes.map((ct) => (
              <SelectItem key={ct} value={ct}>
                {ct}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {r?.mode === "sections" && r.fallback === "site_wide" && (
          <Badge variant="outline" data-testid="badge-recipe-fallback">
            Few pages of this type — showing site-wide recipe
          </Badge>
        )}
        {r?.mode === "sections" && r.sample && (
          <span className="text-xs text-muted-foreground">
            {r.sample.layouts} layouts · {r.sample.approved} approved/trusted
          </span>
        )}
      </div>

      {recipe.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

      {r?.mode === "fields" && (
        <p className="text-sm text-muted-foreground" data-testid="text-recipe-fields-mode">
          This type uses a shared template{r.attached_pages ? ` (${r.attached_pages} pages)` : ""}. Agents fill the page
          fields; the template decides the sections.
        </p>
      )}

      {r?.mode === "sections" && r.slots && (
        <ol className="space-y-2" data-testid="list-recipe-slots">
          {r.slots.map((s) => (
            <li key={s.slot} className="flex items-start gap-3 text-sm">
              <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{s.slot + 1}</span>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {s.options.map((o, i) => (
                  <Badge
                    key={`${o.type}-${o.variant}-${o.background}-${i}`}
                    variant={i === 0 ? "secondary" : "outline"}
                    className="font-mono text-[11px] font-normal"
                    title={o.example_pages.join(", ")}
                  >
                    {o.type}:{o.variant}
                    {o.background ? ` · ${o.background}` : ""} · {pct(o.share)}
                  </Badge>
                ))}
                {!s.required && <span className="text-xs text-muted-foreground">optional ({pct(s.presence)} of pages)</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function WeightTable({ pages }: { pages: InsightPageRecord[] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => pages.filter((p) => p.kind !== "overlay").sort((a, b) => (b.baseWeight ?? b.weight) - (a.baseWeight ?? a.weight)),
    [pages],
  );
  const visible = showAll ? rows : rows.slice(0, 15);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" data-testid="table-layout-weights">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1.5 pr-3 font-medium">Layout</th>
              <th className="py-1.5 pr-3 font-medium">Approval</th>
              <th className="py-1.5 pr-3 font-medium">Performance vs expected</th>
              <th className="py-1.5 pr-3 font-medium">Manual</th>
              <th className="py-1.5 font-medium text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.key} className="border-t border-border/60">
                <td className="py-1.5 pr-3 font-mono truncate max-w-[18rem]" title={p.key}>
                  {p.key}
                  {p.kind === "shared_template" && (
                    <span className="ml-1 text-muted-foreground font-sans">({p.instanceCount} pages)</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {APPROVAL_LABEL[p.approval?.state ?? "none"]}
                  {p.approval && p.approval.factor !== 1 && <span className="text-muted-foreground"> ×{p.approval.factor}</span>}
                </td>
                <td className="py-1.5 pr-3">
                  {p.performance ? (
                    <span title={`${p.performance.outcome} actual vs ${p.performance.expected} expected (${p.performance.outcome_metric}, ${p.performance.sessions} sessions)`}>
                      ×{p.performance.factor}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">no data</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">×{p.weight}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{p.baseWeight ?? p.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 15 && (
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAll((v) => !v)} data-testid="button-weights-toggle">
          {showAll ? "Show top 15" : `Show all ${rows.length}`}
        </Button>
      )}
    </div>
  );
}

function RulesList({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const rules = useQuery<{ rules: LearnedRule[]; thresholds: { approved_pages: number; agreement: number } }>({
    queryKey: ["/api/private/component-insights/rules"],
  });

  const pin = async (id: string, status: "pinned" | "disabled" | null) => {
    setBusy(id);
    try {
      const res = await apiFetch(`/api/private/component-insights/rules/${encodeURIComponent(id)}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Save failed");
      qc.setQueryData(["/api/private/component-insights/rules"], (prev: unknown) => ({ ...(prev as object), rules: json.rules }));
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (rules.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  const t = rules.data?.thresholds;
  return (
    <div className="space-y-3">
      {t && (
        <p className="text-xs text-muted-foreground">
          A rule becomes “Learned” when at least {t.approved_pages} approved or trusted pages follow it {pct(t.agreement)} of the
          time. Learned and pinned rules show up as warnings in render reviews.
        </p>
      )}
      {(rules.data?.rules ?? []).map((rule) => (
        <div key={rule.id} className="rounded-md border p-3 space-y-1.5" data-testid={`card-rule-${rule.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-sm">{rule.title}</span>
              <Badge variant={rule.status === "active" || rule.status === "pinned" ? "secondary" : "outline"} className="text-[10px]">
                {RULE_STATUS_LABEL[rule.status]}
              </Badge>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === rule.id || rule.status === "pinned"} onClick={() => void pin(rule.id, "pinned")} data-testid={`button-rule-pin-${rule.id}`}>
                  Pin
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === rule.id || rule.status === "disabled"} onClick={() => void pin(rule.id, "disabled")} data-testid={`button-rule-disable-${rule.id}`}>
                  Disable
                </Button>
                {(rule.status === "pinned" || rule.status === "disabled") && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === rule.id} onClick={() => void pin(rule.id, null)} data-testid={`button-rule-follow-${rule.id}`}>
                    Follow data
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{rule.description}</p>
          <p className="text-xs text-muted-foreground">
            Evidence: {rule.evidence.approved_pages} approved pages, followed {pct(rule.evidence.agreement)} of the time
            {rule.evidence.examples.length > 0 && <> · e.g. <span className="font-mono">{rule.evidence.examples.join(", ")}</span></>}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DesignRecipesPanel({ data, canEdit }: { data: ComponentInsightsData; canEdit: boolean }) {
  const [advanced, setAdvanced] = useState(false);
  const contentTypes = useMemo(
    () => [...new Set(data.pages.filter((p) => p.kind !== "overlay").map((p) => p.contentType))].sort(),
    [data.pages],
  );

  return (
    <div className="space-y-6" data-testid="section-design-recipes">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Recipes for agents</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          This is what agents see when they design a page: how your best layouts are put together. Layouts you approve,
          and pages that convert better than expected for their traffic, count more. A shared template counts as one
          layout, judged by how all its pages perform.
        </p>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setAdvanced((v) => !v)}
          data-testid="button-recipes-advanced"
        >
          {advanced ? "Hide advanced" : "Read more (advanced)"}
        </button>
        {advanced && (
          <div className="text-xs text-muted-foreground max-w-3xl space-y-1 pt-1" data-testid="text-recipes-advanced">
            <p>
              Weight = manual <code className="font-mono">insights_weight</code> × approval (approved ×2, trusted ×1.2,
              not a good example ×0) × performance × relevance × locale.
            </p>
            <p>
              Performance = (actual + 5) / (expected + 5), clamped to 0.5–1.5. Expected = sessions per channel × that
              channel's site rate for the same content type and funnel stage (campaign rate when a campaign feeds 2+
              pages). Actual = leads + checkouts for decision pages, engaged sessions otherwise. GA4 export, last 90
              days, refreshed daily.
            </p>
            <p>
              Relevance (per agent request): same content type 1.0 / other 0.3; same funnel stage 1.0 / adjacent 0.5 /
              other 0.25. Locale: pages in the requested language 1.0 / others 0.2. Drafts, A/B variants and overlays are
              excluded. Pins live in <code className="font-mono">design-rules.yml</code> at the site root.
            </p>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Page skeleton by content type</CardTitle>
        </CardHeader>
        <CardContent>
          {contentTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No layouts scanned yet.</p>
          ) : (
            <RecipeView contentTypes={contentTypes} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Learned layout rules</CardTitle>
        </CardHeader>
        <CardContent>
          <RulesList canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why each layout weighs what it does</CardTitle>
        </CardHeader>
        <CardContent>
          <WeightTable pages={data.pages} />
        </CardContent>
      </Card>
    </div>
  );
}
