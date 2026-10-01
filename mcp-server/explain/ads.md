# Ads (paid traffic)

Call this topic before answering “what are ads doing for us?” or “why do Meta / Google Ads numbers not match the site?”. Tool: **`get_paid_traffic`** (`metrics_view`, read-only). Organic search → topic `seo` / `get_organic_traffic`. General GA4 behavior → topic `analytics` / `get_analytics_report`.

## Sources (never summed)

| Source | What it gives | Where it lives |
|---|---|---|
| Meta Marketing API | spend, clicks, landing page views, Meta-reported leads (pixel + instant forms), ad creative link | `.cache/{site}/meta-ads-days/{date}.json` (refresh last 10 days, keep 13 months, 90-day backfill; see Account sync) |
| Google Ads → BigQuery Data Transfer | spend, clicks, impressions, Google-reported leads (`google_leads`), campaign / ad group / ad setups, network split | `.cache/{site}/google-ads-days/{date}.json`, `google-ads-network-days/`, `google-ads-setups.json`, `google-ads-state.json` (see Google Ads) |
| GA4 BigQuery export | paid visits per landing page, engagement, bounce, experiment variant; Google campaign / ad group / network per visit | `.cache/{site}/paid-landing-days/{date}.json` (complete days only, ~2-day lag) |
| Lead ledger | site leads (unique vs repeat, test flag), first / last paid landing with platform + campaign / ad set / ad ids | pipeline SQLite `lead_submissions` (no PII, 25-month retention) |

Meta-reported leads, Google-reported leads and site leads are **separate columns** — never add them. Spend is **per currency**, never converted (`mixed_currency` warning when accounts differ).

## Account sync

- One sync reads **every** configured account (`ads.meta.ad_account_ids` in `site_<name>/settings.yml`); every process (web + job worker) re-reads `settings.yml` when it changes on disk, so a newly added account is picked up by the next sync.
- Per-account state lives in `.cache/{site}/meta-ads-state.json` → `accounts[id]`; the report echoes it as `meta.accounts[] { id, name, currency, history_loaded, sync_error? }`.
- **Auto-backfill:** while any configured account has no `history_loaded_at` (`history_loaded: false` — new, or removed and re-added), a `refresh` (automatic, staff Resync, or `refresh: true`) runs as a 90-day backfill for all accounts. Accounts removed from settings are dropped from the state on the next sync.
- **Partial sync:** an account Meta refuses to read (no access, wrong id, disabled) is skipped with `sync_error`; other accounts still save, and its previously saved rows are kept. The sync fails as a whole only when every account fails. It stays `history_loaded: false`, so it retries the 90-day load next sync.

## Google Ads

- **Source:** we read only the Google Ads → BigQuery Data Transfer tables (staff create the transfer in Google Cloud; we never call the Google Ads API and never write to Google). Settings: `ads.google { enabled, customer_ids, bigquery { project, dataset }, lead_conversion_actions, known_external_campaigns }` in `site_<name>/settings.yml` (staff UI Settings → Ads → Google, `ads_settings`). Only ticked `customer_ids` count.
- **Setup:** staff follow the Setup checklist in Settings → Ads → Google (`GET /api/settings/ads/google/setup`, read-only): dataset in GA4's location → BigQuery Data Viewer for the site's service account → transfer (daily, 30-day refresh window) → transfer access to Google Ads (latest run status + error text via the Data Transfer API when the service account can read it; a service-account-run transfer needs that account added as a Google Ads user) → 90-day backfill (progress = latest run per data day: loaded / running / queued / failed; falls back to distinct loaded days in the tables, where quiet days have no rows; short / in-progress history is a non-blocking check so staff can connect accounts immediately) → use the found accounts. No MCP tool; point staff there when `google_not_connected` / `google_sync_failing` appear.
- **Sync** (same `ads_sync` job as Meta + GA4; `meta_ads_sync` is an alias): re-reads the last **10 days** of spend / clicks and **30 days** of conversions every run, plus any day the transfer reloaded. Per-account state → report `google.accounts[] { id, name, currency, history_loaded, data_through, auto_tagging, sync_error? }`.
- **Lag:** the transfer lands each day late. The newest 1–2 days missing are normal (`google_data_through` warning: "missing, not zero"); older → `google_transfer_stale` warning + issue. `refresh: true` can't make the transfer run sooner.
- **Visit matching** (paid Google visits → campaign), in order; the report counts each in `google.visit_match { ga4_link, gclid, tags, none }`:
  1. GA4 ↔ Google Ads link (`session_traffic_source_last_click.google_ads_campaign` in the export) — best.
  2. `gclid` joined to the transfer's `ClickStats` **inside BigQuery** (needs the same BigQuery location as GA4); click ids are never stored by us.
  3. URL suffix tags (`utm_id` / `utm_term` / `utm_content` = campaign / ad group / ad ids; template in Settings → Ads → Google).
  Unmatched visits stay paid Google traffic, just without campaign ids. **Performance Max** reports campaign level only (no ad group / ad).
- **Leads:** `google_leads` = conversions in the Submit lead form category + staff-picked `lead_conversion_actions`. Never summed with site or Meta leads. Site-lead credit per platform follows `model` (first / last paid landing platform stored per lead since v30 of the ledger; older leads → `lead_platform_legacy`, platform guessed from latest UTMs).
- **Spend without a site visit** → destinations `google_lead_form`, `calls`, `video_views`, `app` (plus `unknown_destination`); excluded from cost per lead.
- **Networks** (`google_networks`, summary + Google diagnostics): rows `search`, `search_partners`, `display`, `youtube`, `cross_network` (Performance Max), `other`, `not_split` with spend, clicks, impressions, paid visits; `not_split_share` = visits we couldn't tie to a network (`google_network_not_split` when high). Network spend is exact.
- **Filters:** `account` accepts a Google customer id (`123-456-7890`). `campaign_ids` / `adset_ids` (= ad groups) / `ad_ids` accept Google ids; with **both** platforms connected, id filters need `platform: meta | google` (error `platform_required_for_ids`).
- **Unticked accounts** that still send paid visits → `google.unconnected_accounts[]` + info issue `google_account_not_connected` (their spend isn't counted).

## Modes

| Mode | Returns |
|---|---|
| `summary` | totals, top 5 pages by spend, counts of pages / destinations / campaigns |
| `campaigns` | campaign groups (spend, clicks, Meta leads, paid visits, pages) — paginated |
| `entries` | managed pages with paid visits; `group=campaign` keeps full per-row campaign list; `split_by_version` adds per-variant rows |
| `destinations` | spend that did **not** land on a managed page: instant forms, off-site, other site in sites.yml, missing page, unknown destination — so totals reconcile with Meta |
| `diagnostics` (no `platform`) | **overview**: worst `status` across platforms, `platforms.meta` / `platforms.google` cards `{ connected, status, open_errors, open_warnings, spend, platform_leads, site_leads, last_synced_at, data_through, top_issues (≤3) }`, `shared_issues` (lead records / consent), `totals`. `next_actions` → `platform: meta|google` for each connected platform with open issues. Writes nothing |
| `diagnostics` + `platform: google` | Google issues (codes below), KPIs `{ spend, tracked_spend, no_site_spend, google_leads, site_leads, paid_visits, clicks, clicks_to_visits_pct, matched_visits_pct }`, `networks`, `matching { ga4_link_available, gclid_join_tables, gclid_join_error }`, `url_suffix_template`, `resolved`. `issue_ids` filters; no snapshots / per-ad lists (`google_diagnostics_args_ignored`) |
| `diagnostics` + `platform: meta` | tracking issues (error/warning/info, spend affected, how to fix), KPIs; consent drop arrives as a `consent_rate_drop` warning (not an issue row). Two windows: money/traffic KPIs (`window_days`) follow `days`; issues, `open_errors`/`open_warnings` and the consent drop always cover the last 28 days (`issue_window_days`) — changing `days` never hides or resolves an issue |

`days` 1–90 ending **yesterday**. `limit` default 25 (max 100) + `offset`. Diagnostics with `snapshot_id` / `issue_ids` / id filters but no `platform` → Meta (`diagnostics_platform_defaulted`); other platforms → error `diagnostics_platform_unsupported`.

### Google diagnostics issue codes

| Code | Severity | Meaning / staff fix |
|---|---|---|
| `google_sync_failing` | error | Transfer tables unreadable (permission / dataset) or repeated sync failures — grant BigQuery Data Viewer, check project / dataset in Settings |
| `google_transfer_stale` | warning → error when far behind | Transfer hasn't loaded recent days — Google Cloud → BigQuery → Data transfers run history |
| `google_transfer_missing_account` | error (not in transfer) / warning (unreadable) | Ticked account absent from the transfer tables — add it to the transfer (manager account) |
| `google_history_short` | info | Account history starts after the 90-day window — backfill the transfer |
| `google_account_not_connected` | info | Unticked account sends paid visits — tick it or ignore |
| `google_auto_tagging_off` | by spend share | Account has auto-tagging off, so no gclid — Google Ads → Account settings → Auto-tagging |
| `google_ga4_not_linked` | warning (info if gclid / tags match) | GA4 export lacks the Google Ads link — link GA4 ↔ Google Ads |
| `google_gclid_join_unavailable` | info / warning | ClickStats join failed (location / permissions); message in `matching.gclid_join_error` |
| `google_destination_policy` | info / warning | Spend that never reaches the site (lead forms, calls, video, app) or has no landing page |
| `google_conversions_not_reporting` | warning | Google counts no leads while the site records paid Google leads — check conversion actions / Settings lead actions |
| `spend_zero_visits` (id `spend_zero_visits:google:*`) | by spend | Google ads spend on a page with no paid visits |

Shared checks (`ga4_ledger_gap`, `ledger_not_recording`, `consent_rate_drop`) carry `platform: "shared"` and appear on the Meta page + the overview's `shared_issues`. Every issue has `platform: meta | google | shared`.

## Filters (campaign / ad set / ad / date range)

- `campaign_ids`, `adset_ids`, `ad_ids`: numeric Meta or Google ids (Google ad groups → `adset_ids`), ≤20 each; add `platform` when both are connected. OR within a level, AND across levels. Report modes echo `filters`. Find ids with `mode: campaigns` (`campaign_id`) or diagnostics `details.ads` (ad set / ad ids).
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
  - `ads[]` — Meta ads that spent in the 28-day issue window: ids + names for ad / ad set / campaign / account, `effective_status` (ACTIVE, PAUSED, …; `null` = setup never read), `spend`, `link_clicks`, `impressions`, `landing_page_views`, `last_spend_date`, `landing_url`, `url_tags`, plus `missing` (template params), `medium` (non-paid `utm_medium`), `unchecked_reason`, or (when GA4 verified) `tagging_source` (`setup` | `meta_auto` | `none`), `ga4_tagged_sessions`, `checked_clicks`. Paused ads stay listed — the spend already happened. Sorted by spend.
  - `ads_total`, `ads_offset` — the list is trimmed: top **3** per issue in the list call.
  - `unchecked[]` `{ reason, ads, spend }` — ads with spend we could not compare to the template. Reasons: `account_unreadable` (Meta refused to read the ad's account on the last sync — `meta.accounts[].sync_error`; staff fix access or the id), `setup_fetch_failed` (Meta didn't return the ad setup on the last sync — `refresh: true` or staff Resync), `ad_removed_in_meta` (deleted/archived; nothing to fix), `no_link_found` (no website link, e.g. call/message ads; URL parameters don't apply).
  - `ga4_seen[]` (destinations with **no** synced ad, e.g. off-site from Google or another Meta account): top 10 GA4 tag groups `{ platform, source, medium, campaign, campaign_id (utm_id), adset_id (utm_term), ad_id (utm_content), visits, leads, first_seen, last_seen }` + `ga4_untagged_visits` (no `utm_content`, so ad set / ad can't be known).
  - `setup_last_read_at` — oldest successful ad-setup read for the issue's account(s); `null` = never read or the last read failed (stored per account in `.cache/{site}/meta-ads-state.json` as `setup_read_at` / `setup_error`).
- Which ads: missing / non-paid / unchecked / unverified tracking → the campaign's ads; `landing_http_error`, `redirect_drops_params`, `ad_url_redirects` → every ad on that URL (spend affected = their sum); `spend_zero_visits` and destination rows → ads whose link resolves there.
- **Meta tracking vs GA4** (Meta only; Google URL-suffix issues unchanged):
  - Full template with good `utm_content` (`{{ad.id}}` or the ad's own id) → tagged from setup (`tagging_source: setup`). A present but wrong `utm_content` (other ad's id, `{{ad.name}}`, `{{placement}}`, …) is **not** fully tagged — same GA4 path as a missing template.
  - Otherwise we compare Meta **link clicks** and GA4 sessions with `utm_content = ad_id` on **complete** GA4 days only (same dates both sides). Window: last `tracking_check_days` (default 7) complete days; if clicks there are below `tracking_missing_min_clicks` (20), fall back to the full 28-day issue window. Fewer than 4 complete days → unverifiable.
  - **Both-conditions `meta_auto`:** sessions ≥ `tracking_tagged_min_sessions` (3) **and** sessions/clicks ≥ `tracking_missing_max_visit_pct` (10%). Those ads are **hidden** (Meta tagged at click time). Cookie-consent loss is absorbed by the 10% floor — no separate control.
  - **Confirmed missing** (`missing_tracking_params`, warning): clicks ≥ min and not `meta_auto`. Skipped per ad when that ad's own bare URL has Meta `landing_http_error` / `redirect_drops_params`, or the ad's page has Meta `spend_zero_visits` (Google zero-visit does not skip Meta). `ad_url_redirects` and unprobed URLs do not skip. Fix via Meta only on this code.
  - **Unverifiable** (`tracking_params_unverified`, info, `platform: meta`): not enough clicks or complete days, or only `utm_id` missing. No Fix via Meta.
  - **Unchecked** (`tracking_params_unchecked`, info): setup unread / no link / removed — **discard-only** via GA4: if the ad meets `meta_auto`, drop it from the warning; otherwise keep. Never emit confirmed-missing without a readable setup. When a campaign already has confirmed missing, remaining unchecked fold into that issue's `details` (no separate unchecked row for that campaign).
  - GA4 not configured → setup-only (missing template / dubious content still warn as today).
- `tracking_params_unchecked` (info, per campaign): ads with spend couldn't be checked and none in that campaign were confirmed missing (after GA4 discard).
- Reports (`summary` / KPIs): `untagged_clicks` / tagged use the **report's own dates** for `meta_auto` (not the 7-day diagnostic window). `adIsTagged` is false for dubious `utm_content` unless `meta_auto`. Google rows unchanged.
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

Returned by `summary` and `diagnostics` (KPI window, follows `days`) when Meta is connected; absent otherwise. Rows in order `facebook`, `instagram`, `messenger`, `audience_network`, `other`, `not_split`; rows with nothing are dropped. Each row: `spend`, `clicks`, `meta_leads` (sum of the picked lead conversions — see Meta lead conversions), `paid_visits`, `unique_leads`, `cost_per_lead` (spend / site leads, `null` with none), `conversion_rate` (site leads / paid visits), `low_sample`.

- **Visits:** paid Meta GA4 sessions by `utm_source`: `fb` → facebook, `ig` → instagram, `msg` → messenger, `an` → audience_network. Anything else (legacy `facebook`, blank, custom) → `not_split`.
- **Leads:** credited, non-repeat, non-test site leads with platform Meta, bucketed by the **lead's own** `utm_source` (its latest campaign tags) — same for `last_paid` and `first_paid`.
- **Spend:** separate Meta read per ad × `publisher_platform` (`.cache/{site}/meta-ads-platform-days/`; Meta `others` / unknown → `other`). Only ads landing on this site (`entry` / `missing_page`) count. Ads whose URL parameters use `{{site_source_name}}` (or a literal `fb`/`ig`/`msg`/`an`) go to their placement row; ads on an older tag put spend in `not_split`, so spend, visits and leads line up per row.
- **`excluded_spend`** `{ instant_form, off_site, unknown }`: spend not in any row (Instant Form, `off_site` / `other_site`, `unknown_destination`). Never in `cost_per_lead`.
- **`spend_since`**: first day placement spend exists for every account in scope (`null` while any account's 90-day placement history is still loading). **`spend_partial`**: `spend_since` after the window start, history not loaded, or the last placement read failed for an account (`meta.accounts` state `platform_error`) — spend and `cost_per_lead` are a floor.
- **`not_split_share`**: `not_split` visits / all placement visits (3 decimals).
- Filters: `account`, `currency`, `campaign_ids` / `adset_ids` / `ad_ids`, `content_type` narrow placement spend like the main report.
- Non-effects: main `totals.spend` and page rows keep using the regular Meta read (no placement breakdown) — never sum `meta_platforms` spend with them. No Meta ads are changed; existing `utm_source=facebook` tags stay until staff update the ads (Fix via Meta only adds missing params, it does not rewrite `utm_source`). A failed placement read never fails the sync.

## Meta lead conversions

- **What counts:** `meta_leads` (totals, pages, campaigns, placements) = plain **sum** of the conversions picked in `settings.yml → ads.meta.lead_conversions` (Settings → Ads → Meta, next to Ad accounts). Keys: `fb_pixel_lead` (Meta `offsite_conversion.fb_pixel_lead`, the standard Lead event) or a custom conversion id (`offsite_conversion.custom.<id>`). **Nothing picked → standard Lead event** (the card shows a warning). Overlapping picks are never de-duplicated — they raise `lead_conversions_overlap`.
- **Recalculation:** changing the picks recalculates every window from cached days (`ads.meta.lead_conversions_changed_at`; the card notes it for 7 days). Days cached before per-conversion counts only know the standard Lead event; the next sync re-downloads 90 days once per account (`meta.accounts[].conversions_loaded_at`) and retries on later syncs.
- **Report** (`summary` mode): `lead_conversions { meta_picked, meta_changed_at, meta[] {key, name, count}, site[] {name, count}, meta_incomplete_days, snapshot_lacks_conversions }`. `meta[]` sums to `totals.meta_leads` (names from the synced custom conversions, else the id). `site[]` groups the credited, non-repeat, non-test leads behind `totals.unique_leads` by form conversion name (`(no conversion name)` when blank) and sums to it. `meta_incomplete_days` counts only when a custom conversion is picked (picked customs read 0 on those days → Meta number is a floor). `snapshot_lacks_conversions`: dev production copy downloaded before production cached per-conversion counts — download again after production syncs.
- **Diagnostics KPIs (Meta):** `meta_conversions`, `site_conversions`, `meta_lead_conversions_picked` (`[]` = standard Lead fallback), `lead_conversions_changed_at`, `meta_conversions_incomplete_days`, `snapshot_lacks_conversions`. Missing on snapshots built before this shipped.
- **Issues** (all `platform: meta`, `site_fixable: false`, `spend_affected: {}`, numbers in `evidence`):
  - `lead_conversions_overlap` (warning, id `lead_conversions_overlap:{a}|{b}` sorted): over the 28-day issue window, both picks report on ≥ `conversion_overlap_days_pct` (80) of ad-days where either has results (≥3 such ad-days) and totals differ ≤ `conversion_overlap_count_pct` (20). `evidence.conversions[].optimized_ads` = ads whose ad set `promoted_object` optimizes for it; `estimated_extra` = the smaller count. Recommendation keeps the optimized one (else the larger count). Resolves once one is unpicked or they stop overlapping.
  - `pixel_events_lockstep` (warning, id `pixel_events_lockstep:{pixel}:{a}|{b}`): two events on one pixel, each ≥ `lockstep_min_events` (20) in the last 7 days, totals within `lockstep_count_pct` (2) and identical counts in ≥80% of active hours. Skips `PageView` and pairs in `ads.meta.expected_event_pairs`. Usually one Tag Manager trigger fires both tags (the site pushes one dataLayer event per form).
  - `lead_conversion_stopped` (warning, id `lead_conversion_stopped:{id}`): a picked custom conversion no selected account lists (`reason: missing`), archived (`archived`), or not shared with a selected account that has spend (`not_shared`, `evidence.accounts`). Picks are never removed automatically. Skipped when no account's conversion list could be read.
  - `pixel_not_reporting_leads` names the picked conversions (or the standard Lead fallback).
- **Fix actions** (`issue.action`, staff-only settings writes after a confirm in Diagnostics; `ads_settings`; no MCP write — suggest them to staff): `unpick_lead_conversion` → `POST /api/ads/meta/lead-conversions/unpick { key }`; `mark_expected_event_pair` → `POST /api/ads/meta/expected-event-pairs { pixel_id, events }`. Both only edit `settings.yml → ads.meta`; nothing changes in Meta or Tag Manager. Picker options: `GET /api/ads/meta/conversions?account_ids=&picked=` (live from Meta, 5-min cache, else the last sync's file).
- **Data:** each sync saves `.cache/{site}/meta-custom-conversions.json` (per account) and `meta-pixel-events.json` (last 7 days, hourly per event, pixels deduped across accounts); both are in production downloads. Failures there never fail the sync (previous lists kept, `meta.accounts[].conversions_error`).

## Clicks → visits

Same traffic on both sides, so it measures clicks lost between Meta and the site:

- **Numerator** `matched_visits`: paid Meta visits whose `utm_id` / `utm_term` / `utm_content` match a synced campaign / ad set / ad in the filtered accounts (`account` / `currency` narrow both sides). Other paid Meta visits → `totals.unmatched_meta_visits` (other ad accounts, shared tagged links, ads without the template). Without `account` / `currency`, `paid_visits` still counts both; with them, only matched visits count (see Filters).
- **Denominator** `totals.ratio_clicks`: Meta **link clicks** (never landing page views) from ads landing on this site (`entry` / `missing_page`) on days with a GA4 export. Excluded: instant forms, `off_site` / `other_site` / `unknown_destination`, days GA4 has not exported (~2-day lag), and ads whose setup lacks the template **and** GA4 did not confirm `meta_auto` on the report window → `untagged_clicks` (reported separately by `missing_tracking_params`). Unchecked setups stay in. `clicks` is unchanged and still counts every click.
- Rows: `clicks_to_visits` = row `matched_visits` / its ratio clicks (`null` with none), plus `untagged_clicks`. Diagnostics KPIs: `clicks_to_visits_pct`, `clicks_to_visits_mismatch`, `unmatched_meta_visits`, `untagged_clicks`.
- **Above 110%** (`clicks_to_visits_mismatch: true`, row ratio > 1.1): GA4 and Meta measure different traffic (session restarts, tagging) — say "mismatch", never "more visits than clicks". `clicks_visits_low` never fires on a mismatched window and ignores a mismatched baseline.

## Meta metrics on page rows

Each page / destination row (and `totals`) now carries Meta-side fields derived from cached insights. Under `platform=all`, site visits / site leads / site `conversion_rate` can mix Meta and Google; Meta fields stay Meta-only.

| Field | Formula / meaning | `null` / grey |
|---|---|---|
| `impressions` | Sum of Meta (and Google when on the row) impressions | — |
| `pixel_leads_click` | Standard Lead in Meta's 7-day click window (0 until day files have the split) | — |
| `ctr` | `clicks / impressions` | `null` with no impressions |
| `cpc` / `cpm` | spend ÷ clicks; spend ÷ impressions × 1000 (per currency) | empty money when denom is 0 |
| `landing_rate` | `landing_page_views / clicks` | `null` with no clicks |
| `meta_conversion_rate` | `meta_leads / landing_page_views` | `null` when Meta reports no page loads (never falls back to clicks) |
| `meta_cost_per_lead` | spend ÷ `meta_leads` | empty money with no Meta leads |
| `lpv_to_visits` | `matched_visits` ÷ tagged Meta landing page views on GA4 days (same rules as `ratio_clicks`) | `null` with none; ratio > 1.1 → measurement mismatch (same threshold as clicks → visits) |
| `meta_low_sample` | `landing_page_views` under `thresholds.min_paid_visits_for_rates` | greys Meta rates in the staff UI |

- **"Saw the ad only" (staff UI / agents):** derive as `max(0, meta_leads − pixel_leads_click)` so it always adds up to `meta_leads`. Do not treat Meta's raw `1d_view` window as the display number.
- **`meta_split_days { covered, total }`:** days in the window whose cached Meta rows include `pixel_leads_click`. Partial coverage → say the click vs saw-the-ad-only split is based on X of Y days.
- **Pixel gap:** when a row has `clicks > 0` and `landing_page_views === 0`, Meta conversion rate is `null` — say the Meta Pixel may be missing on that page.

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
| `meta_production_snapshot` | Dev/local only: numbers are a copy downloaded from production (`meta.source: "production_snapshot"`, `meta.pulled_at`, `meta.last_date`, `meta.production_origin`). Nothing re-syncs it without a local Meta token; days after `last_date` are missing, not zero. Say "production copy as of …", never "live" |
| `meta_snapshot_hidden_accounts` | With a production copy: some downloaded accounts aren't in local Ads settings; their spend (in the message) is left out of totals |
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
| `google_not_connected` | Google Ads not set up — Google spend / leads missing. Staff: `/private/settings/ads/google` |
| `google_data_through` | Newest Google day loaded is before the window end — later days missing, not zero (normal for 1–2 days) |
| `google_transfer_stale` | Transfer is further behind than normal — staff check the transfer run history |
| `google_account_not_synced` | Ticked Google account(s) unreadable on the last sync — their spend missing; others fine |
| `google_network_not_split` | Many paid Google visits can't be tied to a network — network spend exact, visits per network incomplete |
| `lead_platform_legacy` | Some leads predate per-platform landing ids; their platform follows the latest UTMs, not the credited landing |
| `diagnostics_platform_defaulted` | Diagnostics detail args without `platform` — Meta was used |
| `google_diagnostics_args_ignored` | Google diagnostics ignores id filters / `snapshot_id` / `ads_limit` / `ads_offset` |

`status: "not_configured"` when neither Meta, Google Ads nor GA4 is set up.

## Side effects / non-effects

- Reads may enqueue one background refresh (`meta_ads_sync` job) when data is older than 24h; the response does not wait for it. After a failed refresh, reads wait before retrying (1h, 2h, 4h, then 6h max; `refresh.retry_after`) and never run the refresh in the web server when the worker is down.
- Every mode returns `refresh`: `{ state: idle|queued|running|failed|worker_down, requested_at, started_at, finished_at, error, retry_after, progress }` (state file `.cache/{site}/ads-refresh-state.json`).
- `refresh.progress` is `{ done, total, label }` only while `running` (else `null`; also `null` if the run reports no steps). `total` is counted before the run starts: per Meta account one lookup + one per 15-day insight chunk + one per 15-day placement chunk (90 days on an account's first placement load) + creatives + conversions and pixels, then one pixel-events read, one save, then one per GA4 day (max 30; none for `older`). Steps vary in length — don't infer time remaining. Staff see it as a bar in Settings → Ads → Meta → Sync only.
- `diagnostics` probes up to 10 top ad landing URLs (cached 6h), records Issues/Resolved in `.cache/{site}/ads-issues.json` and saves a snapshot in `.cache/{site}/ads-diagnostics-snapshots/`. Reading an unexpired `snapshot_id` builds nothing and probes nothing.
- `refresh: true` → `POST /api/ads/sync` (one `ads_sync` job for Meta + Google + GA4) → side effects `meta_sync_enqueued` (writes `.cache/{site}/meta-ads-days/`, `meta-ads-platform-days/`, `meta-ads-creatives.json`, `meta-custom-conversions.json`, `meta-pixel-events.json`, `meta-ads-state.json` when the job runs) and `google_sync_enqueued` (`google-ads-days/`, `google-ads-network-days/`, `google-ads-setups.json`, `google-ads-state.json`). Each part only runs for a connected platform.
- `diagnostics` + `platform: google` records Issues/Resolved in `.cache/{site}/ads-issues-google.json` (side effect `issue_state_recorded`); no landing probes. The overview writes nothing.
- Never changes Meta or Google Ads campaigns, ads, budgets, settings, consent, or lead delivery — `refresh` only reads. Settings edits are staff-only (`ads_settings`, UI); the consent window is `consent_settings` (staff UI).

## Staff fix for missing tracking parameters (no MCP tool)

- `missing_tracking_params` issues show **Fix via Meta** in Diagnostics → Ads for staff with `ads_edit` ("Edit live ads"; built-in roles `ads_manager`, `platform_steward`). Only **confirmed** missing (GA4 did not see enough visits with the ad's id). `tracking_params_unverified` has no Fix. Uses the same env `META_ADS_ACCESS_TOKEN` as syncs, which must also have `ads_management` (missing scope → Meta permission error at preview/apply). The HTTP routes refuse MCP loopback — agents cannot run it; point staff to the issue drawer instead.
- Effect per ad: new creative from the **same page post** (likes/comments kept) with `url_tags` = existing tags + only the template params the ad lacks (link or URL parameters); the ad is pointed at it. Max 50 ads per confirm; stops on token / permission / rate-limit errors; re-reads ad setups afterwards so the issue can clear.
- Side effects: changed ads go back to Meta review (may pause briefly); the ad set may re-enter learning. Non-effects: budgets, audiences, ad copy/media, non-paid `utm_medium` values, other campaigns.
- Skipped (staff fix in Meta Ads Manager): dynamic / Advantage+ creative, catalog ad, Instant Form, no reusable page post, deleted/archived, already tagged, not found. Routes: `POST /api/ads/meta/tracking-fix/preview|apply` (`server/ads/tracking-fix.ts`, `server/ads/meta-write.ts`).
- **Google: no Fix button.** Google issues (`google_auto_tagging_off`, missing URL suffix) are fixed by staff in Google Ads (Account settings → Auto-tagging; Account settings → Final URL suffix, copied from Settings → Ads → Google). We have no Google Ads API write access (read-only BigQuery transfer). A staff-only add-only fix is reconsidered once the transfer has ≥28 days of data and those issues show real spend affected; until then point staff to the issue's how-to-fix.

## Paths

- Server: `server/ads/` (`meta-client.ts`, `meta-ads-days.ts`, `google-ads-bq.ts`, `google-ads-days.ts`, `paid-detection.ts`, `ads-report.ts`, `ads-diagnostics.ts`, `google-ads-diagnostics.ts`, `ads-diagnostics-overview.ts`, `ads-diagnostics-snapshots.ts`, `lead-ledger.ts`, `ads-refresh.ts`), routes `server/routes/ads.ts` (`GET /api/diagnostics/ads?platform=overview|meta|google`)
- Shared rules: `shared/paid-traffic.ts`, `shared/paid-attribution.ts`, `shared/ads-diagnostics-rules.ts`, `shared/ads-settings.ts`
- Settings: `ads:` block in `site_<name>/settings.yml`; token env `META_ADS_ACCESS_TOKEN` (`ads_read` for syncs; add `ads_management` for staff Fix via Meta)
- Staff UI: Diagnostics → Ads overview (`/private/diagnostics/ads`), Meta (`/private/diagnostics/ads/meta`), Google (`/private/diagnostics/ads/google`); Settings → Ads → Meta / Google (`/private/settings/ads/meta|google`); Diagnostics → Legal (`/private/diagnostics/legal`, consent breakdown), Ads perspective on each content type list, Settings → Ads
- Consent diagnostics: `server/legal/legal-diagnostics.ts`, route `GET /api/diagnostics/legal` in `server/routes/consent.ts`
- Cookies & consent: `docs/cookies.md`
