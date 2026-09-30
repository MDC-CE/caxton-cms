import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, HelpCircle, Info, Loader2 } from "lucide-react";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ADS_UNCHECKED_REASON_LABELS,
  type AdsGa4SeenRow,
  type AdsIssue,
  type AdsIssueAd,
  type AdsIssueDetails,
} from "@shared/ads-diagnostics-rules";
import type { AdsRefreshStatus } from "@shared/ads-refresh-status";
import { PAID_MEDIUMS } from "@shared/paid-traffic";
import type { AdsIssueDetailResponse } from "@/components/ads/ads-types";
import { formatMoney, formatNum, formatWhen } from "@/components/ads/ads-format";
import { AdsResyncButton } from "@/components/ads/AdsResyncButton";

const SHOW_ALL_LIMIT = 200;
const TRACKING_CODES = new Set<AdsIssue["code"]>(["missing_tracking_params", "non_paid_medium", "tracking_params_unchecked"]);

export function adsManagerUrl(accountId: string, target: { campaign_id?: string; ad_id?: string }): string {
  const params = new URLSearchParams({ act: accountId });
  if (target.ad_id) params.set("selected_ad_ids", target.ad_id);
  else if (target.campaign_id) params.set("selected_campaign_ids", target.campaign_id);
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?${params.toString()}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
        Unknown
      </Badge>
    );
  }
  const s = status.toUpperCase();
  const label = s === "ACTIVE" ? "Active" : s.includes("PAUSED") ? "Paused" : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-0 text-[10px] font-medium",
        s === "ACTIVE" ? "border-chart-3/50 text-chart-3" : s.includes("PAUSED") ? "border-amber-500/50 text-amber-500" : "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function AdRow({ ad, showCampaign }: { ad: AdsIssueAd; showCampaign: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5" data-testid={`ads-issue-ad-${ad.ad_id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={adsManagerUrl(ad.account_id, { ad_id: ad.ad_id })}
            target="_blank"
            rel="noreferrer"
            className="truncate text-foreground underline-offset-2 hover:underline"
          >
            {ad.ad_name || ad.ad_id}
          </a>
          <StatusBadge status={ad.effective_status} />
          {ad.unchecked_reason && (
            <span className="text-[11px] text-muted-foreground">Not checked: {ADS_UNCHECKED_REASON_LABELS[ad.unchecked_reason].toLowerCase()}</span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {ad.adset_name}
          {showCampaign ? ` · ${ad.campaign_name}` : ""}
          {ad.last_spend_date ? ` · last spend ${ad.last_spend_date}` : ""}
        </p>
        {(ad.missing?.length || ad.medium) && (
          <p className="text-[11px] text-amber-500">
            {ad.missing?.length ? `Missing ${ad.missing.join(", ")}` : ""}
            {ad.missing?.length && ad.medium ? " · " : ""}
            {ad.medium ? `utm_medium=${ad.medium}` : ""}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium tabular-nums text-foreground">{formatMoney(ad.spend)}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground">{formatNum(ad.link_clicks)} clicks</p>
      </div>
    </li>
  );
}

function UncheckedPopover({
  unchecked,
  refresh,
  onResyncStarted,
}: {
  unchecked: NonNullable<AdsIssueDetails["unchecked"]>;
  refresh: AdsRefreshStatus | undefined;
  onResyncStarted: () => void;
}) {
  const count = unchecked.reduce((s, u) => s + u.ads, 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          data-testid="ads-issue-unchecked-trigger"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {count} couldn't be checked
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-xs" data-testid="ads-issue-unchecked-popover">
        <p className="font-medium text-foreground">Why some ads couldn't be checked</p>
        <ul className="space-y-1">
          {unchecked.map((u) => (
            <li key={u.reason} className="flex justify-between gap-3">
              <span className="text-foreground/90">
                {u.ads} · {ADS_UNCHECKED_REASON_LABELS[u.reason]}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(u.spend)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-muted-foreground">
          <span>Re-read ad setups from Meta</span>
          <AdsResyncButton refresh={refresh} onStarted={onResyncStarted} testIdPrefix="ads-issue-unchecked" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function IdCopyBadge({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label} ID`}
      aria-label={`Copy ${label} ID ${value}`}
      data-testid={`button-copy-ga4-${label.replace(/\s+/g, "-")}-${value}`}
      className={cn(
        badgeVariants({ variant: "outline" }),
        "cursor-pointer gap-1 px-1.5 py-0 font-mono text-[10px] font-normal text-muted-foreground hover:text-foreground",
      )}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast({ title: `${label.charAt(0).toUpperCase()}${label.slice(1)} ID copied`, description: value });
            setTimeout(() => setCopied(false), 2000);
          },
          () => toast({ title: "Copy failed", variant: "destructive" }),
        );
      }}
    >
      <span className="font-sans">{label}</span>
      <span>{value}</span>
      {copied ? <Check className="h-3 w-3 shrink-0 text-chart-3" /> : <Copy className="h-3 w-3 shrink-0" />}
    </button>
  );
}

/** GA4 dates are calendar days (YYYY-MM-DD), so compare against the local calendar day, not UTC. */
function daysAgoLabel(ymd: string): string | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function Ga4SeenDate({ row, windowDays }: { row: AdsGa4SeenRow; windowDays: number }) {
  const single = row.first_seen === row.last_seen;
  const ago = daysAgoLabel(row.last_seen);
  const label = single
    ? `Seen on ${row.first_seen}${ago ? `, ${ago}` : ""}`
    : `Seen ${row.first_seen} → ${row.last_seen}${ago ? `, last ${ago}` : ""}`;
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            aria-label="What does this date mean?"
            data-testid="ads-issue-ga4-seen-date-info"
          >
            <Info className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 text-xs" data-testid="ads-issue-ga4-seen-date-popover">
          <p className="font-medium text-foreground">What this date means</p>
          <p className="text-muted-foreground">
            {single
              ? "The day GA4 recorded paid visits with exactly these campaign tags."
              : "The first and last day GA4 recorded paid visits with exactly these campaign tags."}
          </p>
          <p className="text-muted-foreground">
            Only the last {windowDays} days are checked, so older visits don't show here. It isn't when the ad launched or when this issue
            opened.
          </p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function PaidTrafficRulesPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          data-testid="ads-issue-paid-rules-trigger"
        >
          How Google calculates paid traffic
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2 text-xs" data-testid="ads-issue-paid-rules-popover">
        <p className="font-medium text-foreground">How a visit counts as paid</p>
        <p className="text-muted-foreground">
          GA4 records where each visit came from: the source (like fb or google), the medium (like paid or cpc), the campaign tags, and any ad
          click ID in the link. GA4 doesn't label visits as paid for us. We read that data and check these rules in order:
        </p>
        <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
          <li>
            <span className="text-foreground">The medium is a paid one → paid.</span> Paid mediums:{" "}
            <span className="font-mono text-[10px]">{PAID_MEDIUMS.join(", ")}</span>. The source tells us the platform (fb or instagram means Meta,
            google means Google).
          </li>
          <li>
            <span className="text-foreground">The campaign, ad set or ad ID matches one from your Meta account → paid</span>, even if the medium
            is missing or unusual.
          </li>
          <li>
            <span className="text-foreground">The link has a click ID that only ads add → paid.</span> For example gclid (Google), msclkid
            (Microsoft), ttclid (TikTok) or li_fat_id (LinkedIn).
          </li>
          <li>
            <span className="text-foreground">Only an fbclid → unclear, not counted.</span> Meta adds fbclid to normal post links too, so on its
            own it doesn't prove the click came from an ad.
          </li>
        </ol>
        <p className="text-muted-foreground">Anything else counts as organic. Unclear and organic visits don't appear in this list.</p>
        <p className="text-muted-foreground">
          This is not GA4's own "Paid Social" or "Paid Search" channel report, so numbers there can differ.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function UnrecognizedCampaignPages({ pages, total }: { pages: NonNullable<AdsIssueDetails["pages"]>; total: number }) {
  return (
    <div data-testid="ads-issue-unrecognized-pages">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pages it sends visitors to</p>
      <ul className="mt-1 divide-y divide-border">
        {pages.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3 py-1 text-xs">
            <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-foreground underline-offset-2 hover:underline">
              {p.title}
            </a>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatNum(p.visits)} visits</span>
          </li>
        ))}
      </ul>
      {pages.length > 0 && pages.reduce((s, p) => s + p.visits, 0) < total && (
        <p className="text-[11px] text-muted-foreground">Top {pages.length} pages shown.</p>
      )}
    </div>
  );
}

function Ga4SeenList({
  rows,
  untagged,
  windowDays,
  mode = "destination",
}: {
  rows: AdsGa4SeenRow[];
  untagged: number;
  windowDays: number;
  mode?: "destination" | "campaign";
}) {
  return (
    <div data-testid="ads-issue-ga4-seen">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How is this calculated?</p>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
        {mode === "campaign" ? (
          <>
            <li>We checked every campaign, ad set and ad we have from your connected Meta ad accounts (about the last 90 days). This one isn&apos;t among them.</li>
            <li>
              GA4 still recorded visits to your pages in the last {windowDays} days that count as paid Meta traffic and carry this campaign&apos;s
              tags. <PaidTrafficRulesPopover />
            </li>
          </>
        ) : (
          <>
            <li>We checked every Meta ad that spent money in the last {windowDays} days and the link it sends people to. None of them link here.</li>
            <li>
              So we looked at GA4 instead: these are visits to this URL that count as paid (from their ad tags, like source and medium) in the same
              days. <PaidTrafficRulesPopover />
            </li>
          </>
        )}
        <li>Visits with the same tags are grouped into one row below.</li>
      </ol>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((r, idx) => {
          const campaignIsId = /^\d+$/.test(r.campaign);
          const campaignIdBadge = campaignIsId && ![r.campaign_id, r.adset_id, r.ad_id].includes(r.campaign);
          return (
            <li key={`${r.campaign}-${r.ad_id ?? ""}-${idx}`} className="py-1.5">
              <div className="min-w-0">
                {!campaignIsId && <p className="mb-1 truncate text-foreground">{r.campaign || "(no campaign name)"}</p>}
                <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5" data-testid="ads-issue-ga4-seen-forensics">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Forensics</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>
                      {r.source} / {r.medium}
                    </span>
                    {campaignIdBadge && <IdCopyBadge label="utm_campaign" value={r.campaign} />}
                    {r.campaign_id && <IdCopyBadge label="campaign" value={r.campaign_id} />}
                    {r.adset_id && <IdCopyBadge label="ad set" value={r.adset_id} />}
                    {r.ad_id && <IdCopyBadge label="ad" value={r.ad_id} />}
                    <Ga4SeenDate row={r} windowDays={windowDays} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {untagged > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {formatNum(untagged)} visit(s) had no ad tag, so the ad set and ad can't be known.
        </p>
      )}
    </div>
  );
}

/** Campaign / account / open-since line plus affected ads, unchecked reasons and GA4 evidence. */
export function AdsIssueEvidence({
  issue,
  snapshotId,
  issueWindowDays,
  refresh,
  onSnapshotExpired,
  onResyncStarted,
}: {
  issue: AdsIssue;
  snapshotId: string | undefined;
  issueWindowDays: number;
  refresh: AdsRefreshStatus | undefined;
  onSnapshotExpired: () => void;
  onResyncStarted: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const details = issue.details;
  const all = useQuery({
    queryKey: ["/api/diagnostics/ads", "issue", snapshotId, issue.id],
    enabled: showAll && !!snapshotId,
    queryFn: async () => {
      const qs = new URLSearchParams({ snapshot_id: snapshotId!, "issue_ids[]": issue.id, ads_limit: String(SHOW_ALL_LIMIT) });
      const res = await apiFetch(`/api/diagnostics/ads?${qs.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load ads");
      const body = (await res.json()) as AdsIssueDetailResponse;
      if (body.snapshot_expired) onSnapshotExpired();
      return body;
    },
    staleTime: 5 * 60 * 1000,
  });

  const scope = issue.scope;
  const fullIssue = showAll ? all.data?.issues.find((i) => i.id === issue.id) : undefined;
  const ads = fullIssue?.details?.ads ?? details?.ads ?? [];
  const total = details?.ads_total ?? 0;
  const campaignScoped = !!scope.campaign_id && issue.code !== "landing_http_error" && issue.code !== "redirect_drops_params" && issue.code !== "ad_url_redirects";
  const hasMeta = Boolean((campaignScoped && scope.campaign_name) || scope.account_id || issue.first_seen);
  const showSetupLine = !!details && (total > 0 || (details.unchecked?.length ?? 0) > 0);

  return (
    <div className="space-y-2">
      {hasMeta && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid={`ads-issue-meta-${issue.id}`}>
          {campaignScoped && scope.campaign_name && <span>Campaign: {scope.campaign_name}</span>}
          {scope.account_id && <span>· Account {scope.account_id}</span>}
          {issue.first_seen && <span>· Open since {issue.first_seen.slice(0, 10)}</span>}
          {scope.account_id && campaignScoped && scope.campaign_id && (
            <a
              href={adsManagerUrl(scope.account_id, { campaign_id: scope.campaign_id })}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              data-testid="link-ads-manager-campaign"
            >
              Open in Meta Ads Manager <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
      )}

      {total > 0 && (
        <div data-testid={`ads-issue-ads-${issue.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Affected ads ({total})</p>
            {details?.unchecked && details.unchecked.length > 0 && (
              <UncheckedPopover unchecked={details.unchecked} refresh={refresh} onResyncStarted={onResyncStarted} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {TRACKING_CODES.has(issue.code)
              ? `Ads that spent in the last ${issueWindowDays} days. Paused ads are included because that spend already happened without tracking.`
              : `Ads that spent in the last ${issueWindowDays} days and point here. Paused ads are included because that spend already happened.`}
          </p>
          <ul className="divide-y divide-border">
            {ads.map((ad) => (
              <AdRow key={ad.ad_id} ad={ad} showCampaign={!campaignScoped} />
            ))}
          </ul>
          {fullIssue && ads.length < total && (
            <p className="text-[11px] text-muted-foreground">
              Showing the top {ads.length} of {total} by spend. Use Meta Ads Manager for the rest.
            </p>
          )}
          {!fullIssue && ads.length < total && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={all.isFetching || !snapshotId}
              onClick={() => setShowAll(true)}
              data-testid={`button-ads-issue-show-all-${issue.id}`}
            >
              {all.isFetching && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Show all {total} ads
            </Button>
          )}
          {all.error && <p className="text-xs text-destructive">{all.error instanceof Error ? all.error.message : "Failed to load ads"}</p>}
        </div>
      )}

      {details?.pages && details.pages.length > 0 && (
        <UnrecognizedCampaignPages pages={details.pages} total={details.ga4_totals?.visits ?? 0} />
      )}

      {details?.ga4_seen && details.ga4_seen.length > 0 && (
        <Ga4SeenList
          rows={details.ga4_seen}
          untagged={details.ga4_untagged_visits ?? 0}
          windowDays={issueWindowDays}
          mode={issue.code === "unrecognized_campaign" ? "campaign" : "destination"}
        />
      )}

      {showSetupLine && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`ads-issue-setup-read-${issue.id}`}>
          Ad setup last read from Meta: {details?.setup_last_read_at ? formatWhen(details.setup_last_read_at) : "not yet"}
          <AdsResyncButton refresh={refresh} onStarted={onResyncStarted} testIdPrefix={`ads-issue-setup-${issue.id}`} />
        </p>
      )}
    </div>
  );
}
