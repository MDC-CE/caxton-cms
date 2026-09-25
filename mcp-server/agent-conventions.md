---
name: website-mcp-conventions
description: >-
  Standing conventions for how an agent should talk to the human while using the
  Website MCP server to make changes to {{BRAND_TITLE}} (domain {{SITE_DOMAIN}}).
  This is a living list that grows as the human corrects or refines how they
  want these conversations to go. Always check these conventions before and
  after any Website MCP write (add_section, update_fields,
  replace_entry_sections, create_entry, publish_draft, promote_variant, delete_variant,
  translate_entry, etc.) — both for how to report the result and for any
  other standing preference recorded here.
---

# Website MCP — conversation conventions

This document is a running log of how the human wants agents to communicate
while doing CMS work through the Website MCP server for {{BRAND_TITLE}}. It starts
small and is meant to be edited in place as new conventions come up —
when the human corrects something or asks for a new habit, add it below
as its own numbered convention rather than starting a new document.

For MCP **protocol** (sessions, reports, envelopes, multi-site), follow the
technical playbook from `bootstrap_agent` — this file is conversation
conventions only.

## How to update this file

- Add new conventions as new numbered entries under "Conventions." Keep
  each one short and concrete (a rule + a one-line example), not prose.
- If a new instruction changes or replaces an old one, edit that entry
  in place rather than leaving both — this file should always reflect
  current behavior, not a history of changes.
- Don't remove the worked examples when editing; update them so they
  stay accurate.
- Bump `CONVENTIONS_VERSION` in `mcp-server/lib/mcp-playbook.ts` when
  you change this file so agents re-fetch `skill.content` on bootstrap.

## Conventions

### 0. Mutate education vs optional discovery

After writes, trust structured \`warnings\` / \`side_effects\` / \`next_actions\` (real tool names only). When a response includes \`discovery_path\`, treat it as optional context to improve judgment before the next consequential step — not required calls, and not a substitute for \`next_actions\`.

### 1. Always link to a page you modified, and flag drafts

Whenever you tell the human you changed a page through the Website MCP,
give them the URL as a clickable markdown link — never just the slug or
the raw content path (e.g. not `scholarship/miami-tech-works`).

- Build the link from the page's public locale prefix + slug, e.g.
  `https://{{SITE_DOMAIN}}/en/scholarship/miami-tech-works`.
- **If the write was to a draft or non-live variant** (you passed a
  `variant` param, e.g. `variant: "draft"`, or the entry has no live
  locale yet), append `?force_variant=draft` (or the matching variant
  slug) as a query param so the link actually previews that variant
  instead of the live page — otherwise the link either 404s or shows
  stale live content.
- If the change was scoped to a specific section (e.g. via
  `section_id`), you can add the section's anchor too, e.g.
  `#how-to-apply`, after the variant query param.

**Worked example:** after editing the `how-to-apply` section on the
`miami-tech-works` scholarship draft (no live locale yet, written to
`variant: "draft"`), report it as:

> Saved: [Miami Tech Works — How to apply](https://{{SITE_DOMAIN}}/en/scholarship/miami-tech-works?force_variant=draft#how-to-apply)

If the page were already live and you edited the live locale directly
(no `variant` param, `confirm_live_edit: true`), the link would omit
`?force_variant=draft` entirely.

### 2. Agentic roles: drafts free; live needs claim; publish via proposal

On an agentic swarm role connector (`/mcp/role/…`), write policy is enforced:

- **Identity:** On a role connector, call `agent_session` start with exact `model` (`provider/model`, e.g. `claude/sonnet-4.5`). Pass `agent_session_id` on every mutate — unscoped writes are blocked. **Production** plain `/mcp` hard-denies mutates with `role_connector_required` + `connector_guide` (one connection per `/mcp/role/<id>` for a swarm) — use Private → MCP Server → Connection. **Non-production** plain `/mcp` may mutate freestyle when MCP write is on. When **MCP write** is off (Security → Users), honor `mcp_write_disabled` / `mcp_write_guide.course_of_action` (propose-only until an admin enables write).
- **Draft / variant writes** (any locale): allowed with your edit caps — no issue claim required.
- **Live writes** (omit `variant`): allowed only while you hold an **active claim** on a validation issue for that **content type + slug + locale** as the **same human+role**. Successful live writes refresh the claim TTL (~30m).
- **Publish / promote / demote / create_entry**: denied — open an **edits** `propose_change` (field updates and/or `promote_on_apply`). For a brief before work exists, use `propose_change` with `kind:"idea"` (accept ≠ apply; no YAML). Idea **accept** requires `accepted_entry` `{ contentType, slug, locale }` plus `next_step` (locks that page+locale for follow-up). Notes are wall reminders only (close with a reason; no YAML) — do not use notes for new-spoke pitches.
- **Stuck on a claimed issue:** `update_issue` **release** with a report (what you tried). Do **not** invent a notes proposal for that handoff — the issue stays in the open queue / can reopen for the next agent.

When caps forbid a write (any connector), call `propose_change` (prefer **edits**, or **idea** for a brief) instead of pasting JSON in chat.

- **Edits `summary`:** intent + why only (min 80). Do **not** restate `updates[]` values — ops own those; list triage uses title + `field_paths`. Go-live with empty updates: why the draft should become live. Notes/idea summaries stay the handoff or brief payload.

**Worked example:** missing `content_edit_text` on a blog CTA → `propose_change` with that entry’s `updates[]`, then tell the human **Proposal Reviewer** or **Publisher** (or staff UI) must `update_proposal` with `action: "apply"`.

### 2b. Proposal collaboration (claim vs blocker vs approve)

Proposals are a shared work item, not a chat. Prefer one open proposal per draft variant (`proposal_exists` → join it).

- **1.0 — the draft is the change:** `propose_change` writes `updates[]` into a 0% draft right away (yours, or `draft` / `draft-p{id6}` it creates); apply only promotes it. Live is unchanged until apply. Page-level fields (`funnel`, `meta.robots`, `authors`, …) change every language — say so to the human. Editing someone else's proposal draft makes you a co-author (you cannot approve it). `context_stale` / attention `needs_author` = live moved under the draft: the author runs `revise_entries`. Undo an applied proposal with `update_proposal` `action: "revert"` (files a new proposal; four-eyes). Pre-1.0 proposals return `legacy_version` → re-file.

- **Claim** only when you will edit the draft / soft updates (same human+role; staff UI may take over). **add_blocker** when the **proposed** change is wrong or invents claims (what’s wrong, what fixed looks like, why — min 80 chars; no tool shopping lists). Do not claim only to approve.
- **Adjacent findings:** after optional page research, park out-of-scope live defects as **notes** (name the page; link an issue only if one already exists; join existing notes). Same-entry ops-not-touched → notes, not apply-blocker. Other entry → notes only. Do not leave findings only in chat. Lack `proposals_create` (Proposal Reviewer) → hand the list to a create-capable role; do not convert park items into blockers. Nothing to park → no empty notes.
- **Reject** only when the idea must not ship (bad / not implementable / illegal-or-policy / harmful / duplicate weaker / target missing). Pass `confirm_reject`, `reject_kind`, and `close_note` (min 80). Prefer **add_blocker** for in-scope polish; author **`revise_entries`** (idle or self-claim; foreign claim blocks) then `resolve_blocker` — revise does not clear blockers.
- Only the **active claimant** (human+role) may `resolve_blocker`. Do not resolve to overturn a disagreement — escalate or leave open; reviewers `reopen_blocker`.
- Open blockers block **apply** and idea **accept** (reject/withdraw/close still OK). Cleared blockers ≠ ship — re-preview, then four-eyes `apply` / `accept`. For `promote_on_apply`, confirm ending experiments when asked (`confirm_end_experiment`).
- **Idea follow-through:** after accept, file edits with `implements_proposal_id` (required when that idea reserved the page). At most one open implements child. Pickup stalled work via `list_proposals({ stalled: true })` or `proposal_stats.stalled_ideas`. Refuse codes: `explain_site` `topic: "proposals"` (subtopics `overview` / `reading`).
- **New pages and new languages:** what the edits must contain depends on `layout_owner` — see §2d (decision table + "can a proposal create it?"). The slug is required; the folder need not exist. Do **not** call `create_entry` (not on specialist connectors) and do **not** pass a `variant` — the proposal creates the folder and its draft.

**Worked example (new attached post, `layout_owner: shared_template`):**

1. Idea: `propose_change` with `kind: "idea"` and `related_entries: [{ contentType: "blog", slug: "what-is-grok", locale: "en" }]`.
2. Accept (a different role): `update_proposal` `action: "accept"` with that same `accepted_entry` and `next_step`. No YAML yet.
3. Edits: `propose_change` with `implements_proposal_id`, `review_situations: ["new_public_content"]`, and `entries[]` of field `updates[]` only — **no** `variant`. Required live fields must be in the ops (blog: title, description, body/`content`, category).
   The proposal writes `{slug}/_common.yml` and the unpublished draft now (visitors do not see it).
4. Apply (a different role): `update_proposal` `action: "apply"`. A new URL-param value (for example category) also needs `confirm_new_values: true` after principal approval. Apply publishes `{locale}.yml` with `sections: []` and does not touch `template.{locale}.yml`.

- **Worked example (new page, `layout_owner: entry`):** same idea → accept (warning `accepted_entry_needs_layout`) → edits flow, with the whole layout as one update. Example `entries[0]`: `{ contentType: "downloadable", slug: "ai-engineering-interview-kit", locale: "en", updates: [{ field_path: "meta.page_title", value: "…" }, { field_path: "sections", value: [{ type: "hero", version: "1.0", … }] }] }`.
- A new **language** on an existing page folder never needs an idea (§2d says what it must contain).
- **Escalated hold:** when `escalated: true`, a Platform Steward paused agent work (staff UI only). Do **not** call `update_proposal` — every action fails with `code: escalated` until they release. Read `escalated_note`. Overlapping create may warn `escalated_sibling` but still succeeds. After release the note may remain as history (mutations allowed again).
- Optional `supersedes_proposal_id` on `propose_change` when replacing a rejected/withdrawn proposal (never required). Withdraw needs a short note; site Rules may require matching proposer username, allow any create author, or disable MCP withdraw (`withdraw_disabled` — ask staff). Staff UI follows a separate staff setting.
- Four-eyes = different **username+role** (or staff UI), not merely a different model under the same role.
- **`list_proposals(proposal_id)`** on an open/partial proposal may include **`discovery_path`**: optional research menu (`think` + `tool` items). Use it to deepen judgment before apply/reject/add_blocker/adjacent notes. It is **not** `next_actions` and skip does **not** block decide actions. Items with `available: false` need a human to enable access, then refresh MCP.

**Worked example:** Blake adds a blocker on CTA product; Alex revises soft entries (or fixes the draft), resolves with a note; Casey (different role or UI) previews again then applies.

### 2c. Locale translation: draft write, then promote proposal

`translate_entry` always writes a **non-public variant** (default `draft`) — never live `{locale}.yml`. Polish with write tools on that variant. When ready to go public:

- File **`propose_change`** with `variant`, `promote_on_apply: true`, and prefer `review_situations: ["locale_translation"]`.
- Summary: intent + **Translated from {src} → {tgt}** (no pasted body). Soft-only proposals without promote are **not** this pack — keep polishing with write tools.
- Reviewer scores fidelity to source locale (facts/slug/shell), not punchier-than-live English. Playbook: `explain_site` `topic: "proposals"` `subtopic: "translations"`.

**Worked example:** Translator runs `translate_entry` → `draft.es.yml`, fixes wording with `update_fields` on `variant: draft`, then proposes promote with `locale_translation`; Proposal Reviewer applies.

### 2d. Layout owner: what a draft contains

Every entry has one `layout_owner` (on `get_entry_content`, proposal entries, `review_context.entries[]`, and section errors). `get_content_type_info` / `list_entries` show only the **type default** — a detached entry of a shared-layout type reports `entry`. `layout_owner` wins over `body_model`. Database-backed is **not** a layout concept (see the creatability table).

| Row | Examples | Draft contains | Section ops | New language | Apply writes | Reviewers check |
|---|---|---|---|---|---|---|
| `layout_owner: shared_template` | attached blog post, attached database-backed entry | fields only | none — `attached_sections_refused` (layout lives in `template.{locale}.yml`) | field edits only | `{locale}.yml` fields with `sections: []` (file entries) or field overrides (database-backed); template untouched | fields and claims |
| `layout_owner: entry` | downloadable, landing, program page, any detached entry | fields + the full layout | one full `{ field_path: "sections", value: [...] }`, or `sections[i].x` on an existing locale | must send full translated `sections` (else `sections_required`, `details.new_locale`) | the whole page | layout, components, siblings, CTAs (`layout_structure`); section edits on existing pages go stale if live changes (`merge_preview.status: has_sections` → `context_stale`) |
| `is_shared_template: true` | slug `template` of a shared-layout type | the shared layout itself | full `sections` or `sections[i].x` | must send full `sections` | `template.{locale}.yml` → every attached entry in that language (`affected_entries`; apply needs `confirm_affected_entries: N`); detached entries unaffected | blast radius (`template_blast_radius`): sample entries, new `entry.*` template placeholders filled (`template_placeholders_unfilled`), all languages covered (`template_locales_incomplete`) |

Every full `sections` array is registry-checked for shape only (`invalid_sections` + `property_path`; read `get_component_schema` first). Images, links, and ecommerce scope are still the reviewer's job. Publishing an empty `entry` page fails with `empty_page`. If an entry is reattached (`entry` → `shared_template`) while a proposal with sections is open: review warning `layout_owner_changed`, and apply returns `context_stale` (`details.reason: "layout_owner_changed"`) → needs_author.

**Can a proposal create a new entry?** (independent of `layout_owner`)

| Type | Create via proposal |
|---|---|
| file-based `shared_template` type | yes — idea → accept → field edits, no variant |
| file-based `entry` type | yes — idea → accept (`accepted_entry_needs_layout`) → edits with one full `sections` update |
| database-backed type | no — accept warns `accepted_entry_not_creatable`; a human creates the row first |
| detached entry | n/a — it already exists |

**Change the layout of every entry of a type:** target slug `template`, one entry per language, `all_or_nothing: true`; apply with `confirm_affected_entries` (the count). Detached entries need their own edits (or a reattach). A type without a shared layout has no template — edit each entry separately.

### 3. Cluster SEO only on live (or draft-before-live)

Do not write `seo.*` on A/B experiment variants, and do not write draft SEO once any live locale exists. Promote over live keeps live `seo:` — edit the live locale after promote if clustering must change.

**Worked example:** after promoting `variant: "b"`, call `update_fields` without `variant` to set `seo.pillar_path`, not another write on `b`.

### 4. Diagnostics `open_issues` is an open work queue

Treat `run_entry_diagnostics` / `get_diagnostics_job` `open_issues[]` as **actionable open work** (default), not a full validation dump. Soft-completed and other-author claims are excluded unless you pass `issue_status: "completed" | "claimed" | "all"`. Prefer one-slug sync (`freshness: "hard"`) before claim/edit; do not treat bulk/unscoped `open_issues[]` as live proof. Skip ids in `claimed_issues` / `completed_issues` (or `status !== "open"` and not `claimed_by_me`).

**Coding-agent-only issues:** Catalog codes with `coding_agent_only: true` are excluded from default `open_issues` and refuse `update_issue` claim (`action_required: issue_coding_agent_only`). They need a Cursor coding agent or staff (filesystem / content repo). Do not claim them. Visible under `issue_status: "all"` and staff Diagnostics.

**Worked example:** after edits, call `run_entry_diagnostics` with `slugs: [slug]`, `freshness: "hard"`, then claim from `open_issues[]` — not from a stale unscoped page.

### 5. Mutate reports: why + highlights (not process padding)

On field mutates and issue `complete`, pass `why` (goal/ticket in plain English) and `highlights` for big deltas (links added, section changes). Do not pad with “automatic MCP/bot” boilerplate. Server fills simple field values for staff; full diffs live on GitHub after push.

### 6. Claim only with a valid fix path — no invented keyword metrics

Claim an issue only when you already have a **valid fix path you can execute** with MCP (or a cited offline source). Do not invent facts (search volume, difficulty, rankings).

For `SEO_KEYWORD_RESEARCH_INCOMPLETE`:
- **SEO research on:** call `get_or_refresh_seo_research` with `action: keyword_metrics` (cache-first). Do **not** write `seo.kw_monthly_volume` / `seo.kw_difficulty` YAML.
- **SEO research off:** write both `kw_*` only with `seo_research_source: staff_provided` or `external:<tool_name>` from a real source.
- **No reliable source:** do not claim, or claim→`release` blocked — never guess numbers.

**Worked example:** research configured + keyword set without metrics → `get_or_refresh_seo_research` (`action: keyword_metrics`), then revalidate — not `update_fields` with invented 1300/33.

### 6b. SEO research toolkit (vs measured traffic)

- **Measured GSC clicks/impressions:** `get_organic_traffic` (day cache / BigQuery).
- **Planning research:** `get_or_refresh_seo_research` — `keyword_metrics` | `serp` | `keyword_ideas` | `competitors` | `keyword_gaps`. Cache-first; session + daily budgets; warn % → `confirm_seo_research_budget`; does **not** write `seo.kw_*` YAML.
- Do not invent volume, difficulty, or SERP features. `keyword_gaps` needs a non-empty `competitors` list (run `competitors` first).

### 7. Set `seo.refresh_tier` when clustering / topic nature is known

When enabling SEO clustering or classifying a page’s topic, set `seo.refresh_tier` to `fast`, `medium`, or `evergreen` (fact staleness — not traffic decay). Read `get_entry_fields` with `fields: ["seo.refresh_tier"]` (fill_intent) or `explain_site` topic `seo` to pick. Cannot clear — change only by picking another tier. Revisit the tier when the page angle changes (e.g. concept explainer becomes a yearly “best of”). Per locale; translate does not copy.

**Worked example:** turning clustering on for a “best AI tools 2026” post → `update_fields` with `seo.refresh_tier: "fast"` (after reading fill_intent if unsure).

### 8. Inspect fields with an explicit list

`get_entry_fields` requires non-empty `fields: string[]`. Omit or pass `[]` once to get `available_fields` names only (`action_required: select_fields`), then retry with the paths you need. Do not expect a full dump of every field value.

**Worked example:** `get_entry_fields` with `fields: ["title", "authors"]` before updating those paths.

### 9. Reader copy must not expose SEO topology

Clusters, pillars, spokes, piece-count (“third in our X cluster”), and companion-piece maps are **staff/SEO packaging**. Do **not** put that architecture into reader-facing body or H2s. Link by **page job** instead (“what it is”, “how to set up”, “what’s new”).

- **Bad:** “This is the third piece in our Grok Bot cluster. For the full picture, start with…”
- **Good:** “New here? Read [what Grok Bot is](…) or [how to set it up](…). This page is only what’s new since launch.”
- Teaching “what a topic cluster is” when that *is* the article topic is fine. YAML `cluster_*`, `seo.*`, and proposal summaries may still say “cluster hub.”
- Reviewers score this as intent on body / new-page / hub-link / translation packs → `add_blocker` (not create refuse, not reject for voice alone).

**Worked example:** hub links stay; rewrite “Recent cluster updates” → “What’s new” and drop “our tools cluster” inventory talk.