# Content proposals

Agents and staff can **propose** entry field changes or **idea** briefs when they have **`proposals_create`**. Live YAML does not change until a **different agent role** with **`proposals_review`** (Proposal Reviewer or Publisher) — or staff UI — **applies** edits. Notes handoffs stay open as reminders; **close** finishes them with a reason (no content change). Ideas use **accept** to greenlight a brief (still no YAML).

**Identity:** Mutating MCP requires a **role connector** (`/mcp/role/…`), `agent_session` start with exact `model` (`provider/model`), and `agent_session_id` on every mutate. Four-eyes and claims compare **username + role** (staff UI is separate). Exact model is stored for observability.

Agentic swarm role connectors may write **drafts** freely, may write **live** only with an active same-locale issue claim (same human+role), and must use proposals (not MCP promote/create) to go live — see agent-conventions §2.

## Tools (exactly 4)

| Tool | Caps | Job |
|---|---|---|
| `propose_change` | `proposals_create` | Create. `entries[]` → edits; `kind:"idea"` → idea brief; omit → notes. Optional `related_entries` (idea context; slug need not exist). Notes default `no_auto_retry`. Soft-blocks on recent entry writes. |
| `list_proposals` | `content_view` \| `proposals_create` \| `proposals_review` | **Stats-first.** Filter with `query` / `issue_id` / `status` / `kind` / `proposer_username` / `proposer_actor` (`type`\|`role`) / `agent_session_id` / `escalated` → **summary** rows (`entry_count`, `field_paths`, slim stubs; no ops/values). `proposal_id` → **full** detail; open\|partial also returns live `review_context` + `discovery_path`. |

See also **`explain` topic `reading-proposals`**: damage/undo axes, checklist IDs, create refuses, apply block when target missing.

| `update_proposal` | `proposals_create` and/or `proposals_review` (actions filtered) | See action allowlists below. |
| `get_entry_activity` | same as list | Read recent writes (14 days). Use before `confirm_recent_activity`. |

Do not invent `get_proposal`, `apply_proposal`, etc.

## Swarm decide seats

| Role | Create | Decide (apply/reject/accept/close/blockers) |
|---|---|---|
| Specialists + Orchestrator | yes (`proposals_create`) | no — author toolkit only (claim/release/withdraw/attach/set_no_auto_retry) |
| **Proposal Reviewer** | no | yes — review toolkit (no withdraw/attach/set_no_auto_retry) |
| **Publisher** | yes | yes — full toolkit |

Approve (apply) may change **live or draft** content that was already proposed. Reviewer cannot free-edit pages or create proposals.

## `update_proposal` action allowlists

| Caps | Allowed | Denied |
|---|---|---|
| `proposals_review` only | claim, release, apply, reject, accept, close, acknowledge, blockers | withdraw, attach_variant, set_no_auto_retry, revise_entries |
| `proposals_create` only | claim, release, withdraw, attach_variant, set_no_auto_retry, revise_entries | apply, reject, accept, close, blockers |
| both | full set | — |

## Kinds

| Kind | When | Primary disposition |
|---|---|---|
| `edits` | `entries[]` or `promote_on_apply` | Four-eyes **apply** / **reject** |
| `notes` | No entries, default | **close** with reason (wall handoff) |
| `idea` | `kind:"idea"`, no entries | **accept** (next_step) or **close** park |

Do **not** use notes for new-spoke / config pitches — use `kind:"idea"`.

### Summary by kind

| Kind | `summary` job (min 80) |
|---|---|
| `edits` | **Intent + why** only. Do **not** paste proposed field values — those live in `updates[]` / ops. List triage uses title + `field_paths`. Go-live with empty updates: say **why this draft should become live** (preview owns exact copy). |
| `notes` | Handoff payload: steps tried + recommended next. |
| `idea` | Brief: pitch + desired outcome. |

**Field roles:** `summary` = above; optional `rationale` = deeper reasoning (still no value dumps); optional `situation_note` = current live picture, not proposed values.

After **`revise_entries`**, trust Proposed changes / ops over an older summary if scope drifted — revise does not rewrite summary.

## Ideas

- **accept:** four-eyes (human+role); open blockers block; `next_step` min 20; → `finished` + `accepted`. **No YAML.**
- **close** park: `wont_fix` \| `tracked_elsewhere` \| `other` (not four-eyes). Do not use close for “yes.”
- Optional `related_entries`: context only; targets may not exist yet.

## Recent activity gate

- Edits create/apply: recent writes → `confirm_recent_activity` after `get_entry_activity`.
- Confirming does **not** write YAML or complete validation issues.

## Review modes (edits)

| `review_mode` | On apply |
|---|---|
| `soft` | Write `updates[]` to live |
| `soft_variant` | Write into draft variant (no promote) |
| `draft_backed` | Promote variant. May need `confirm_end_experiment` |

## Notes / no_auto_retry

- New notes: `no_auto_retry: true`. Duplicate notes on same issue blocked until claim + clear flag or close.
- MCP must **claim** before `set_no_auto_retry`. Staff UI may flip without claim.

## Close (notes)

- `close` / `acknowledge`: `wont_fix` \| `fixed_elsewhere` \| `tracked_elsewhere` \| `other`.
- Finishes without YAML; not four-eyes.

## Collaboration

- **One open proposal per variant** → `proposal_exists`.
- **Claim** = working it (human+role; staff UI may take over). **add_blocker** = feedback for polish.
- **Reject** = rare terminal: bad / not implementable / illegal-or-policy / harmful / duplicate weaker / target missing. Requires `confirm_reject`, `reject_kind`, and `close_note` (min 80). Do **not** reject for polish.
- **revise_entries** (authors): rewrite pending/failed soft ops; idle or self-claim only; foreign claim blocks; open blockers stay open until `resolve_blocker`.
- **Open blockers block apply and idea accept** — reject/withdraw/close still work.
- **Escalated:** steward UI hold (`escalated: true` + note). Status stays open|partial. MCP `update_proposal` fails (`code: escalated`) until release. Not an MCP action. Sibling create may warn `escalated_sibling`.
- Cleared blockers ≠ approved — re-preview then four-eyes apply/accept.
- Optional `supersedes_proposal_id` on `propose_change` links a replacement to a rejected/withdrawn predecessor (`replaced_by` on the old). Never required.
- **Withdraw:** `close_note` min 20 (no reject-kind gate).

## Rules

- **Four-eyes:** apply / reject / accept when caller identity (username+role or UI) ≠ proposer identity. **Close/park is not four-eyes.**
- **Non-effects:** no GitHub push; no auto-complete issues; accept/close do not create entries.

## Create refuses + review context

- **Refuse create:** `entry_not_found` (missing write target), `mixed_risk_bundle` (mixed selling/new-public/other in one edits or idea related set), `competing_entry_edits` (second open edits on same type+slug+locale).
- **Allowed shape:** live missing but named draft exists → `new_public_content` (promote later).
- **Apply block:** `target_missing` when the page was deleted after filing — reject/withdraw/close still work.
- Live `review_context` on `list_proposals(proposal_id)` for open|partial; snapshot on list rows is a filed hint only.
- Multi-row list is **summary only** (`proposals_view: "summary"`, warning `proposals_summary_only`): use `entry_count` + `field_paths` to triage; pass `proposal_id` for ops/baselines before apply.
- Before apply, prefer `list_proposals(proposal_id)` + `explain` → `reading-proposals`.

Full checklist IDs and axes: `explain` → `reading-proposals`.
