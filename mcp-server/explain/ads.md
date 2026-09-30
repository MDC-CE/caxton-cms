# Ads (paid traffic)

Call this topic before answering “what are ads doing for us?” or “why do Meta numbers not match the site?”. Tool: **`get_paid_traffic`** (`metrics_view`, read-only). Organic search → topic `seo` / `get_organic_traffic`. General GA4 behavior → topic `analytics` / `get_analytics_report`.

## Sources (never summed)

| Source | What it gives | Where it lives |
|---|---|---|
| Meta Marketing API | spend, clicks, landing page views, Meta-reported leads (pixel + instant forms), ad creative link | `.cache/{site}/meta-ads-days/{date}.json` (refresh last 10 days, keep 13 months, 90-day backfill; see Account sync) |
| GA4 BigQuery export | paid visits per landing page, engagement, bounce, experiment variant | `.cache/{site}/paid-landing-days/{date}.json` (complete days only, ~2-day lag) |
| Lead ledger | site leads (unique vs repeat, test flag), last paid landing | pipeline SQLite `lead_submissions` (no PII, 25-month retention) |

Meta-reported leads and site leads are **separate columns** — never add them. Spend is **per currency**, never converted (`mixed_currency` warning when accounts differ).

## Account sync

- One sync reads **every** configured account (`ads.meta.ad_account_ids` in `site_<name>/settings.yml`); every process (web + job worker) re-reads `settings.yml` when it changes on disk, so a newly added account is picked up by the next sync.
- Per-account state lives in `.cache/{site}/meta-ads-state.json` → `accounts[id]`; the report echoes it as `meta.accounts[] { id, name, currency, history_loaded, sync_error? }`.
- **Auto-backfill:** while any configured account has no `history_loaded_at` (`history_loaded: false` — new, or removed and re-added), a `refresh` (automatic, staff Resync, or `refresh: true`) runs as a 90-day backfill for all accounts. Accounts removed from settings are dropped from the state on the next sync.
- **Partial sync:** an account Meta refuses to read (no access, wrong id, disabled) is skipped with `sync_error`; other accounts still save, and its previously saved rows are kept. The sync fails as a whole only when every account fails. It stays `history_loaded: false`, so it retries the 90-day load next sync.

## Modes

| Mode | Returns |
|---|---|
| `summary` | totals, top 5 pages by spend, counts of pages / destinations / campaigns |
| `campaigns` | campaign groups (spend, clicks, Meta leads, paid visits, pages) — paginated |
| `entries` | managed pages with paid visits; `group=campaign` keeps full per-row campaign list; `split_by_version` adds per-variant rows |
| `destinations` | spend that did **not** land on a managed page: instant forms, off-site, other site in sites.yml, missing page, unknown destination — so totals reconcile with Meta |
| `diagnostics` | tracking issues (error/warning/info, spend affected, how to fix), KPIs; consent drop arrives as a `consent_rate_drop` warning (not an issue row). Two windows: money/traffic KPIs (`window_days`) follow `days`; issues, `open_errors`/`open_warnings` and the consent drop always cover the last 28 days (`issue_window_days`) — changing `days` never hides or resolves an issue |

`days` 1–90 ending **yesterday**. `limit` default 25 (max 100) + `offset`.

## Filters (campaign / ad set / ad / date range)

- `campaign_ids`, `adset_ids`, `ad_ids`: numeric Meta ids, ≤20 each. OR within a level, AND across levels. Report modes echo `filters`. Find ids with `mode: campaigns` (`campaign_id`) or diagnostics `details.ads` (ad set / ad ids).
- **Spend** (Meta rows) matches on the row's own ids — complete.
- **GA4 visits** match on link tags (`utm_id` campaign, `utm_term` ad set, `utm_content` ad). Missing parents are filled from synced Meta ads (a visit tagged only with an ad id counts for that ad's ad set and campaign). Visits without the tag needed at the finest filtered level are **left out**, never estimated → `untagged_visits_excluded` (count + top pages). Treat visits, conversion rate and cost per visit as a **floor** when it appears. `known` ids for paid vs organic still come from every synced ad, so filtering never reclassifies traffic.
- **Leads** (ledger) match on the ids of the ad the visitor clicked **last**, whatever `model` says; page credit still follows `model`. With `model: first_paid` → `leads_matched_by_last_click`.
- **`account` / `currency`**: Meta-only filters that narrow all three sides. Spend = that account's (or currency's) rows. Paid visits count only when their `utm_id` / `utm_term` / `utm_content` match a synced campaign / ad set / ad in the filtered accounts; non-Meta and `unclear` visits are excluded. Meta paid visits with **no** tags → `totals.unassigned_visits` + `row.unassigned_visits` (could be any account); visits tagged with ids from Meta accounts we don't sync → `totals.unsynced_account_visits` (not this account's; connect it if it should count). Both → `visits_not_tied_to_account` warning (visit-based numbers are a floor). Leads count only when the last-clicked ad's ids are in the filtered accounts. Without these filters nothing is narrowed and both counts are 0.
- **No match**: ids with no spend, visits or leads in the window → `filter_no_match` (ids listed) + `next_actions` → `mode: campaigns`. The call still succeeds (a quiet campaign is a real answer).
- `since` / `until` (YYYY-MM-DD, UTC, inclusive) replace `days`. Only `since` → `days` forward (default 90); only `until` → `days` back (default 28). `until` after yesterday → clamped to yesterday; `since` before the ~13-month retention floor → clamped (`range_clamped`). Spans over 90 days, reversed or invalid dates → error (split the range). Nothing is fetched: days with no cached file → `data_gaps` (per source, compressed ranges) and `data_gaps: { meta_missing_days, ga4_missing_days }` — **missing, not zero**. GA4 days inside its ~2-day lag are not counted as gaps. Site leads before `collecting_since` still raise `ledger_collecting`.
- **Diagnostics**: id filters keep issues whose `details.ads` or `ga4_seen` match, plus issues with no ad scope (sync / setup failures). Kept issues list only matching ads (`ads_total` = matching count); `spend_affected`, KPIs, `open_errors` / `open_warnings` and `status` stay whole-site (`diagnostics_filtered` warning). With `issue_ids`, open issues outside the filter come back as `filtered_out_issue_ids` (`issue_filtered_out`). `since` / `until` are ignored (`range_ignored_in_diagnostics`).

## Diagnostics issue details

- Order: severity (error → warning → info), then spend affected (summed across currencies for ordering only), then id. `issues_total` counts all; `limit`/`offset` page the issues.
- Each issue: `scope` (`campaign_id`, `campaign_name`, `account_id`, `url`, `page_key`, `ad_id` when known), `first_seen` (ISO, from `.cache/{site}/ads-issues.json`), `details`:
  - `ads[]` — Meta ads that spent in the 28-day issue window: ids + names for ad / ad set / campaign / account, `effective_status` (ACTIVE, PAUSED, …; `null` = setup never read), `spend`, `link_clicks`, `impressions`, `landing_page_views`, `last_spend_date`, `landing_url`, `url_tags`, plus `missing` (template params), `medium` (non-paid `utm_medium`) or `unchecked_reason`. Paused ads stay listed — the spend already happened. Sorted by spend.
  - `ads_total`, `ads_offset` — the list is trimmed: top **3** per issue in the list call.
  - `unchecked[]` `{ reason, ads, spend }` — ads with spend we could not compare to the template. Reasons: `account_unreadable` (Meta refused to read the ad's account on the last sync — `meta.accounts[].sync_error`; staff fix access or the id), `setup_fetch_failed` (Meta didn't return the ad setup on the last sync — `refresh: true` or staff Resync), `ad_removed_in_meta` (deleted/archived; nothing to fix), `no_link_found` (no website link, e.g. call/message ads; URL parameters don't apply).
  - `ga4_seen[]` (destinations with **no** synced ad, e.g. off-site from Google or another Meta account): top 10 GA4 tag groups `{ platform, source, medium, campaign, campaign_id (utm_id), adset_id (utm_term), ad_id (utm_content), visits, leads, first_seen, last_seen }` + `ga4_untagged_visits` (no `utm_content`, so ad set / ad can't be known).
  - `setup_last_read_at` — oldest successful ad-setup read for the issue's account(s); `null` = never read or the last read failed (stored per account in `.cache/{site}/meta-ads-state.json` as `setup_read_at` / `setup_error`).
- Which ads: missing / non-paid / unchecked tracking → the campaign's ads; `landing_http_error`, `redirect_drops_params`, `ad_url_redirects` → every ad on that URL (spend affected = their sum); `spend_zero_visits` and destination rows → ads whose link resolves there.
- `tracking_params_unchecked` (info, per campaign): ads with spend couldn't be checked and none in that campaign were confirmed missing.
- `unrecognized_campaign` (id `unrecognized_campaign:{key}`, `site_fixable: false`, `spend_affected: {}`): GA4 paid Meta visits to **this site's own pages** (entry / missing page — off-site and other-site visits never count) whose campaign (`utm_id`, else numeric `utm_campaign`, else campaign name) is not in any connected account. Known = any id in all stored Meta day rows (~90 days, connected accounts) or ad creatives, or a name matching a connected campaign (case-insensitive).
  - Severity: none below `thresholds.unrecognized_campaign_min_visits` (3); warning at/above; error at ≥ `unrecognized_campaign_error_visits` (20) **or** ≥ `unrecognized_campaign_error_share_pct` (5%) of paid Meta visits — share rule only when paid Meta visits ≥ `unrecognized_campaign_share_min_visits` (100).
  - Skipped when Meta is not connected or while `meta_access_failed` / `meta_sync_failing` is open. `details.pages[]` `{ key, url, title, visits }` (top 5), `details.ga4_seen[]` (tag rows), `details.ga4_totals` `{ visits, leads }`.
  - `settings.yml → ads.meta.known_external_campaigns` (`[{ key, note? }]`, max 100) turns matches into **info** ("Known external campaign"). Staff add entries via Diagnostics "Mark as known" or Settings → Ads (`ads_settings`); there is no MCP write — suggest it to staff.
- GA4-only `off_site_destination` rows (no synced ad links there, only GA4-tagged visits) are info and say none of your ads link here; when a flagged `unrecognized_campaign` brings ≥50% of those visits, `why` names it.
- Lead records vs GA4 (one or neither, never both):
  - `ledger_not_recording` (`site_fixable: true`): GA4 counted paid leads in the issue window but the ledger has **0** credited paid submissions. `info` = the ledger never recorded a non-test lead (new setup, or a local/staging copy — live leads are recorded on the live server); `warning` = it did and stopped (`why` carries the last recorded date, UTC). Fix is on the site: forms must submit through the form/webhook endpoints. Say "we can't compare", not "tracking is broken".
  - `ga4_ledger_gap` (warning): compares only days both sources cover — GA4-exported days from the ledger's first full day on (GA4 lags ~2 days; the ledger's first day is partial). Needs ≥7 such days and ≥1 submission, else skipped. `why` states the day count. Threshold: `ga4_ledger_gap_bootstrap_pct` until the trailing 28 days also have ≥7 comparable days, then `ga4_ledger_gap_widen_pts` vs that baseline.
  - A skipped gap check (or one replaced by `ledger_not_recording`) leaves the open list **without** a `resolved` entry — it was not fixed, just not measurable.
- **Snapshots:** every diagnostics call returns `snapshot_id` + `snapshot_expires_at` (30 min; `.cache/{site}/ads-diagnostics-snapshots/`, last 50; identical builds share one id). Follow up with `snapshot_id` + `issue_ids` (≤10) → only those issues, `ads_limit` default 50 (max 200), `ads_offset` to page, `missing_issue_ids`. Without `snapshot_id`, `issue_ids` runs an issues-only build (no KPI report). Expired / unknown id → fresh build + `snapshot_expired`. `newer_data_available` = a Meta sync or GA4 export landed after the snapshot.
- `refresh: true` (any mode, needs `ads_settings`) queues the same Meta read as staff Resync (last 10 days + ad setups; 90 days while any account has `history_loaded: false`), then reads the cache immediately (`refresh.state` queued → re-call per `next_actions`). Without the grant: `refresh_not_allowed`, the cached read proceeds.

## Paid classification

- Paid = paid medium (`cpc`, `paid_social`, …) **or** a platform click ID that implies paid (`gclid` alone = Google paid).
- Meta needs a paid medium **or** a matching Meta ID (`utm_id` campaign / `utm_content` ad). `fbclid` alone = **Meta: unclear** (organic Facebook shares carry it too).
- UTM template for every Meta ad (shown in Settings → Ads): `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_id={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`. Meta fills `{{site_source_name}}` with `fb` / `ig` / `msg` / `an`; ads set up earlier with `utm_source=facebook` still count as paid Meta (see Facebook vs Instagram).

## Facebook vs Instagram (`meta_platforms`)

Returned by `summary` and `diagnostics` (KPI window, follows `days`) when Meta is connected; absent otherwise. Rows in order `facebook`, `instagram`, `messenger`, `audience_network`, `other`, `not_split`; rows with nothing are dropped. Each row: `spend`, `clicks`, `meta_leads` (pixel), `paid_visits`, `unique_leads`, `cost_per_lead` (spend / site leads, `null` with none), `conversion_rate` (site leads / paid visits), `low_sample`.

- **Visits:** paid Meta GA4 sessions by `utm_source`: `fb` → facebook, `ig` → instagram, `msg` → messenger, `an` → audience_network. Anything else (legacy `facebook`, blank, custom) → `not_split`.
- **Leads:** credited, non-repeat, non-test site leads with platform Meta, bucketed by the **lead's own** `utm_source` (its latest campaign tags) — same for `last_paid` and `first_paid`.
- **Spend:** separate Meta read per ad × `publisher_platform` (`.cache/{site}/meta-ads-platform-days/`; Meta `others` / unknown → `other`). Only ads landing on this site (`entry` / `missing_page`) count. Ads whose URL parameters use `{{site_source_name}}` (or a literal `fb`/`ig`/`msg`/`an`) go to their placement row; ads on an older tag put spend in `not_split`, so spend, visits and leads line up per row.
- **`excluded_spend`** `{ instant_form, off_site, unknown }`: spend not in any row (Instant Form, `off_site` / `other_site`, `unknown_destination`). Never in `cost_per_lead`.
- **`spend_since`**: first day placement spend exists for every account in scope (`null` while any account's 90-day placement history is still loading). **`spend_partial`**: `spend_since` after the window start, history not loaded, or the last placement read failed for an account (`meta.accounts` state `platform_error`) — spend and `cost_per_lead` are a floor.
- **`not_split_share`**: `not_split` visits / all placement visits (3 decimals).
- Filters: `account`, `currency`, `campaign_ids` / `adset_ids` / `ad_ids`, `content_type` narrow placement spend like the main report.
- Non-effects: main `totals.spend` and page rows keep using the regular Meta read (no placement breakdown) — never sum `meta_platforms` spend with them. No Meta ads are changed; existing `utm_source=facebook` tags stay until staff update the ads (Fix via Meta only adds missing params, it does not rewrite `utm_source`). A failed placement read never fails the sync.

## Clicks → visits

Same traffic on both sides, so it measures clicks lost between Meta and the site:

- **Numerator** `matched_visits`: paid Meta visits whose `utm_id` / `utm_term` / `utm_content` match a synced campaign / ad set / ad in the filtered accounts (`account` / `currency` narrow both sides). Other paid Meta visits → `totals.unmatched_meta_visits` (other ad accounts, shared tagged links, ads without the template). Without `account` / `currency`, `paid_visits` still counts both; with them, only matched visits count (see Filters).
- **Denominator** `totals.ratio_clicks`: Meta **link clicks** (never landing page views) from ads landing on this site (`entry` / `missing_page`) on days with a GA4 export. Excluded: instant forms, `off_site` / `other_site` / `unknown_destination`, days GA4 has not exported (~2-day lag), and ads whose setup lacks the template → `untagged_clicks` (reported separately by `missing_tracking_params`). Unchecked setups stay in. `clicks` is unchanged and still counts every click.
- Rows: `clicks_to_visits` = row `matched_visits` / its ratio clicks (`null` with none), plus `untagged_clicks`. Diagnostics KPIs: `clicks_to_visits_pct`, `clicks_to_visits_mismatch`, `unmatched_meta_visits`, `untagged_clicks`.
- **Above 110%** (`clicks_to_visits_mismatch: true`, row ratio > 1.1): GA4 and Meta measure different traffic (session restarts, tagging) — say "mismatch", never "more visits than clicks". `clicks_visits_low` never fires on a mismatched window and ignores a mismatched baseline.

## Lead credit

- One lead → one landing page. Default **last paid landing** (`model=last_paid`); `first_paid` is the switch. 30-day lookback, **no split**. The form page never gets credit unless it was itself the paid landing.
- Repeats (same browser + same form within 24h) are **submissions**, not leads. Test leads (staff session / test email pattern) are excluded from counts but still delivered to the CRM.
- `last_visit_organic`: lead credited to paid, but the visit where they converted came organically (>30 min gap). Shown, not re-credited.
- Journeys are **per browser** (`attribution.basis: browser_observed`) — cross-device paths are invisible.

## Limits agents must state

- **Consent:** ask regions (EU/EEA/UK/CH) need opt-in; Consent Mode v2 advanced mode models some rejected visits in GA4. Consent reaches agents **only as warnings**: `consent_estimates` → say “includes estimates”; `consent_rate_drop` → accept rate fell vs the prior 28 days. Fewer accepts means fewer *measured* visits, not fewer real ones. The per-region breakdown and banner rules are staff-only (Diagnostics → Legal `/private/diagnostics/legal`, Settings → Legal); there is no MCP consent/settings tool.
- **Covered days:** site leads exist only since the ledger started (`collecting_since`, `covered_days`). Earlier windows under-count site leads (`ledger_collecting` warning). The GA4 vs ledger gap check already limits itself to shared days (see Diagnostics issue details).
- **Low sample:** rates are unreliable under `thresholds.min_paid_visits_for_rates` (default 20) paid visits (`low_sample: true`).

## Warnings

| Code | Meaning / action |
|---|---|
| `meta_refresh_in_progress` | Background refresh queued or running (`refresh.state` queued/running) — re-call in ~1 minute (see `next_actions`) |
| `meta_refresh_failed` | Refresh didn't run (`refresh.state: failed`; job failed, or queued >5 min without starting). Message carries `refresh.error` and `refresh.retry_after`. Numbers are the last cached sync; do **not** re-call in a loop. Staff retry via Sync now (Settings → Ads); agents with `ads_settings` may pass `refresh: true` once |
| `jobs_worker_down` | Background job worker not running (`refresh.state: worker_down`), so no automatic refresh. Numbers are the last cached sync. Staff Sync now runs it in the web server instead |
| `meta_not_connected` | No token (`META_ADS_ACCESS_TOKEN`) or no enabled accounts — staff: `/private/settings/ads/meta` |
| `ga4_not_configured` | BigQuery export unset — staff: `/private/tracking/ga4` |
| `mixed_currency` | Accounts in several currencies — compare within one currency |
| `ledger_collecting` | Window starts before the ledger — site lead counts partial |
| `consent_estimates` | Ask-region visits include Consent Mode estimates (message carries the reject %) |
| `consent_rate_drop` | `diagnostics` only: ask-region accept rate fell ≥30% vs the prior 28 days — measured visits drop, real visits may not. Staff fix in Settings → Legal |
| `ads_truncated` | `diagnostics`: some issues list only their top ads — re-call with `snapshot_id` + `issue_ids` (+ `ads_offset` from the message) |
| `issue_not_found` | `issue_ids` entry not open in that build (resolved or wrong id) — re-list |
| `snapshot_expired` | `snapshot_id` past 30 min or unknown — results are a fresh build with a new id; ids / lists may differ |
| `newer_data_available` | Data synced after the snapshot — omit `snapshot_id` to rebuild |
| `tracking_unchecked_account_unreadable` / `_setup_fetch_failed` / `_ad_removed_in_meta` / `_no_link_found` | Counts of ads with spend not checked against the template, by reason (see `details.unchecked`) |
| `visits_not_tied_to_account` | `account` / `currency` filter: untagged Meta visits (`unassigned_visits`) and/or visits with ids from unsynced accounts (`unsynced_account_visits`) were left out — visit-based numbers are a floor |
| `meta_account_unreadable` | A configured account was skipped on the last sync (`meta.accounts[].sync_error`); others still synced. Its spend is the last saved data or none. Staff fix access / id in Settings → Ads |
| `meta_account_not_synced` | Account(s) with `history_loaded: false` — spend may be missing until the next sync's automatic 90-day load |
| `refresh_not_allowed` | `refresh: true` without `ads_settings` — cached read returned |
| `refresh_failed` | `refresh: true` could not queue the sync (message has the error) |
| `untagged_visits_excluded` | Id filter: paid Meta visits to pages in the result had no tag at the filtered level — visit-based numbers are a floor |
| `leads_matched_by_last_click` | Id filter + `model: first_paid`: leads matched by last-clicked ad |
| `filter_no_match` | Id filter: listed ids matched nothing in the window — check ids (`mode: campaigns`) or widen the range |
| `range_clamped` | `since` / `until` moved inside yesterday / retention (message says which) |
| `data_gaps` | Window days with no cached Meta / GA4 file — missing, not zero |
| `diagnostics_filtered` | Diagnostics issues narrowed by id filters; KPIs and counts stay whole-site |
| `issue_filtered_out` | `issue_ids` entry open but outside the id filters |
| `range_ignored_in_diagnostics` | `since` / `until` passed to diagnostics — ignored |
| `meta_platform_not_split` | ≥50% of placement visits come from ads on an older `utm_source` tag — Facebook vs Instagram comparison is incomplete until staff update those ads' URL parameters to the template |
| `meta_platform_spend_partial` | Placement spend starts after the window start, is still loading, or the last placement read failed — `meta_platforms` spend / cost per lead are a floor; main totals unaffected |

`status: "not_configured"` when neither Meta nor GA4 is set up.

## Side effects / non-effects

- Reads may enqueue one background refresh (`meta_ads_sync` job) when data is older than 24h; the response does not wait for it. After a failed refresh, reads wait before retrying (1h, 2h, 4h, then 6h max; `refresh.retry_after`) and never run the refresh in the web server when the worker is down.
- Every mode returns `refresh`: `{ state: idle|queued|running|failed|worker_down, requested_at, started_at, finished_at, error, retry_after, progress }` (state file `.cache/{site}/ads-refresh-state.json`).
- `refresh.progress` is `{ done, total, label }` only while `running` (else `null`; also `null` if the run reports no steps). `total` is counted before the run starts: per Meta account one lookup + one per 15-day insight chunk + one per 15-day placement chunk (90 days on an account's first placement load) + creatives, one save, then one per GA4 day (max 30; none for `older`). Steps vary in length — don't infer time remaining. Staff see it as a bar in Settings → Ads → Meta → Sync only.
- `diagnostics` probes up to 10 top ad landing URLs (cached 6h), records Issues/Resolved in `.cache/{site}/ads-issues.json` and saves a snapshot in `.cache/{site}/ads-diagnostics-snapshots/`. Reading an unexpired `snapshot_id` builds nothing and probes nothing.
- `refresh: true` → side effect `meta_sync_enqueued` (writes `.cache/{site}/meta-ads-days/`, `meta-ads-platform-days/`, `meta-ads-creatives.json`, `meta-ads-state.json` when the job runs).
- Never changes Meta campaigns, ads, budgets, settings, consent, or lead delivery — `refresh` only reads from Meta. Settings edits are staff-only (`ads_settings`, UI); the consent window is `consent_settings` (staff UI).

## Staff fix for missing tracking parameters (no MCP tool)

- `missing_tracking_params` issues show **Fix via Meta** in Diagnostics → Ads for staff with `ads_edit` ("Edit live ads"; built-in roles `ads_manager`, `platform_steward`). Uses the same env `META_ADS_ACCESS_TOKEN` as syncs, which must also have `ads_management` (missing scope → Meta permission error at preview/apply). The HTTP routes refuse MCP loopback — agents cannot run it; point staff to the issue drawer instead.
- Effect per ad: new creative from the **same page post** (likes/comments kept) with `url_tags` = existing tags + only the template params the ad lacks (link or URL parameters); the ad is pointed at it. Max 50 ads per confirm; stops on token / permission / rate-limit errors; re-reads ad setups afterwards so the issue can clear.
- Side effects: changed ads go back to Meta review (may pause briefly); the ad set may re-enter learning. Non-effects: budgets, audiences, ad copy/media, non-paid `utm_medium` values, other campaigns.
- Skipped (staff fix in Meta Ads Manager): dynamic / Advantage+ creative, catalog ad, Instant Form, no reusable page post, deleted/archived, already tagged, not found. Routes: `POST /api/ads/meta/tracking-fix/preview|apply` (`server/ads/tracking-fix.ts`, `server/ads/meta-write.ts`).

## Paths

- Server: `server/ads/` (`meta-client.ts`, `meta-ads-days.ts`, `paid-detection.ts`, `ads-report.ts`, `ads-diagnostics.ts`, `ads-diagnostics-snapshots.ts`, `lead-ledger.ts`, `ads-refresh.ts`), routes `server/routes/ads.ts`
- Shared rules: `shared/paid-traffic.ts`, `shared/paid-attribution.ts`, `shared/ads-diagnostics-rules.ts`, `shared/ads-settings.ts`
- Settings: `ads:` block in `site_<name>/settings.yml`; token env `META_ADS_ACCESS_TOKEN` (`ads_read` for syncs; add `ads_management` for staff Fix via Meta)
- Staff UI: Diagnostics → Ads (`/private/diagnostics/ads`), Diagnostics → Legal (`/private/diagnostics/legal`, consent breakdown), Ads perspective on each content type list, Settings → Ads
- Consent diagnostics: `server/legal/legal-diagnostics.ts`, route `GET /api/diagnostics/legal` in `server/routes/consent.ts`
- Cookies & consent: `docs/cookies.md`
