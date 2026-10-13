import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Clock, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { AdsUtmConventionView } from "@/components/ads/ads-types";
import type { UtmConventionPlatform } from "@shared/ads-settings";

const PLATFORM_LABEL: Record<UtmConventionPlatform, string> = { meta: "Meta", google: "Google" };

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Banners for the UTM convention: unreadable ads-config.yml, ignored values, and the grace period
 * after a convention change. Renders nothing when everything is normal.
 */
export function AdsUtmConventionBanner({ view, className }: { view: AdsUtmConventionView | undefined; className?: string }) {
  if (!view) return null;
  const { grace, rejected, config_error } = view;
  if (!config_error && rejected.length === 0 && !grace.active) return null;
  return (
    <div className={cn("space-y-2", className)} data-testid="ads-utm-convention-banner">
      {config_error && (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="banner-ads-config-unreadable">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">The Ads config file can&apos;t be read</p>
            <p className="text-muted-foreground">
              Meta, Google and GA4 syncs are paused until it&apos;s fixed. Checks keep using the last version that worked. Fix{" "}
              <code className="font-mono text-xs">{view.file}</code> in the content repo.
            </p>
            <p className="font-mono text-xs text-muted-foreground">{config_error}</p>
          </div>
        </div>
      )}
      {rejected.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="banner-utm-convention-rejected">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Some tagging values were ignored</p>
            <p className="text-muted-foreground">They don&apos;t follow the GA4 standard, so the default is used instead.</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {rejected.map((r) => (
                <li key={`${r.field}:${r.value}`}>
                  <code className="font-mono">{r.value}</code> — {r.reason}
                  {r.default_used ? (
                    <>
                      {" "}
                      (using <code className="font-mono">{r.default_used}</code>)
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {grace.active && (
        <div className="flex gap-2 rounded-md border border-sky-500/40 bg-sky-500/5 p-3 text-sm" data-testid="banner-utm-convention-grace">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">The tagging rules changed on {day(grace.changed_at)}</p>
            <p className="text-muted-foreground">
              Ads and visits still using the old values are listed as info until {day(grace.ends_at)}, then flagged as normal issues. Update
              them in Meta or Google before then.
            </p>
            {grace.accepted_old_values.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Old values still accepted:{" "}
                {grace.accepted_old_values.map((v, i) => (
                  <span key={v}>
                    {i > 0 ? ", " : ""}
                    <code className="font-mono">{v}</code>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
      <span className="w-40 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{children}</span>
    </div>
  );
}

function Values({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} variant="outline" className="px-1.5 py-0 font-mono text-[11px] font-normal">
          {v}
        </Badge>
      ))}
    </span>
  );
}

export function utmConventionAnchor(platform: UtmConventionPlatform): string {
  return `utm-convention-${platform}`;
}

/** Settings → Ads page that shows one platform's tagging rules, scrolled to the rules card. */
export function utmConventionHref(platform: UtmConventionPlatform): string {
  return `/private/settings/ads/${platform}#${utmConventionAnchor(platform)}`;
}

/** Settings → Ads: the active UTM convention for one platform, read-only. */
export function AdsUtmConventionCard({ view, platform }: { view: AdsUtmConventionView | undefined; platform: UtmConventionPlatform }) {
  const [open, setOpen] = useState(false);
  const anchor = utmConventionAnchor(platform);
  const loaded = !!view;
  useEffect(() => {
    if (loaded && window.location.hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded, anchor]);
  if (!view) return null;
  const c = view.convention;
  const source = c.sources[platform];
  const label = PLATFORM_LABEL[platform];
  return (
    <Card id={anchor} className="scroll-mt-20" data-testid={`card-utm-convention-${platform}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Tagging rules for {label} ads
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            Edited in {view.file}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tracking checks compare every paid visit and {label} ad against these values. They can&apos;t be changed here; edit{" "}
          <code className="font-mono text-xs">{view.file}</code> in the content repo.
        </p>
        <AdsUtmConventionBanner view={view} />
        <div className="divide-y divide-border rounded-md border border-border px-3" data-testid={`utm-convention-values-${platform}`}>
          <Row label="Source">
            <Values values={source?.canonical ?? []} />
          </Row>
          {(source?.aliases.length ?? 0) > 0 && (
            <Row label="Flagged as old spellings">
              <Values values={source!.aliases} />
            </Row>
          )}
          <Row label="Medium">
            <Values values={c.mediums[platform] ? [c.mediums[platform]] : []} />
          </Row>
          <Row label="Letters">{c.case === "lowercase" ? "Lowercase only" : "Any case"}</Row>
          <Row label="Campaign names">
            {c.campaign_pattern ? <code className="font-mono text-xs">{c.campaign_pattern}</code> : <span className="text-muted-foreground">Any name</span>}
          </Row>
          {platform === "google" && <Row label="Campaign and ad group ids">{c.require_ids ? "Required (utm_id and utm_term)" : "Optional"}</Row>}
          {c.exceptions.length > 0 && (
            <Row label="Campaigns not checked">
              <Values values={c.exceptions.map((e) => e.key)} />
            </Row>
          )}
        </div>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              data-testid={`button-utm-convention-advanced-${platform}`}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
              Read more (advanced)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2 text-xs text-muted-foreground">
            <p>
              Source: <code className="font-mono">&lt;site&gt;/{view.file}</code> → <code className="font-mono">utm_convention</code>. There is no
              API or MCP write; edit the YAML and push it like any content file.
            </p>
            <p>
              Mediums must match GA4&apos;s paid rule (<code className="font-mono">{view.standard.paid_medium_regex}</code>) or be a display
              medium ({view.standard.display_mediums.join(", ")}). Anything else is ignored and the default is used.{" "}
              <a href={view.standard.doc_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                GA4 channel rules
              </a>
            </p>
            <p>Which visits count as paid doesn&apos;t change with these rules; they only decide which tags get flagged.</p>
            <p>
              After a change, old values stay at info for {view.grace_days} days. Change history is kept per environment in{" "}
              <code className="font-mono">{view.history_file}</code> and comes along with Download from production.
            </p>
            <p>
              Generated {platform === "meta" ? "URL parameters" : "final URL suffix"}:{" "}
              <code className="break-all font-mono">{platform === "meta" ? view.meta_template : view.google_template}</code>
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
