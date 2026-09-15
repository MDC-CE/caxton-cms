# Reading proposals (review context)

When you open a single open/partial proposal via `list_proposals(proposal_id)`, the response includes live **`review_context`** (situation classification) and often a **`discovery_path`** built from `agent_preview.think_items`. Terminal proposals (`finished` / `rejected` / `withdrawn`) have no review context.

List rows may include a **`review_context_snapshot`** (filed-at-create or last shape-change hint). Prefer live `review_context` for decisions.

## Two axes

| Axis | Values | Meaning |
|---|---|---|
| **Damage class** | `none` · `existing_metadata` · `existing_content` · `selling_page` · `new_public_content` | What kind of public impact this open work has |
| **Undo cost** | `none` · `low` · `medium` · `high` | How hard apply is to undo (`none` = notes/idea; `low` = draft-only soft_variant; `medium` = soft live write; `high` = draft_backed / promote_on_apply) |

Selling content types (`landing` / `landings` / `program` / `programs`) always classify as `selling_page`, even for meta-only SEO.

## Checklist module IDs

| ID | When it fires |
|---|---|
| `selling_page_figures` | Selling page damage |
| `new_content_brand` | New public content |
| `dedup_coordinate` | Open notes (or non-edits) sibling shares an issue |
| `dedup_competing_edits` | Open edits sibling shares an issue |
| `dedup_fix_pending` | Reviewing **notes** while an edits sibling is open — check the fix before closing as wont_fix |
| `idea_accept` | Always on ideas |
| `notes_close` | Notes kind |
| `review_mode_inert` | Notes/idea (apply does not write YAML) |
| `verify_copy` | Baseline edits — proposed value vs live / summary claims |
| `adjacent_findings` | Edits on existing live pages (`existing_metadata` / `existing_content` / `selling_page`) when apply is not blocked |
| `disposition` | Baseline edits — apply / reject / blocker / adjacent notes park |
| `existence_unknown` | Lookup could not confirm existence |
| `target_missing` | Open edits whose live target no longer exists — **apply is blocked** |

## Create-time refuses

`propose_change` fails (does not create) with:

| Code | Meaning | What to do |
|---|---|---|
| `entry_not_found` | Edits target missing: live gone **and** (no variant, or named draft missing) | Create/draft first, or file `kind:"idea"` |
| `mixed_risk_bundle` | Edits entries **or** idea `related_entries` resolve to more than one risk bucket (selling / new-public / other) | Split into separate proposals |
| `competing_entry_edits` | Another open/partial **edits** proposal already targets the same type + slug + locale | Join that proposal, or reject the weaker one |

**Allowed:** live missing but the named draft **exists** — new-page-via-draft; classifies `new_public_content`.

Notes + edits on the same issue stay allowed. Shared issue alone does **not** refuse create.

## Apply block

If live classify reports `target_missing` (page deleted after filing), `update_proposal` **apply** fails with `target_missing`. Reject with `reject_kind: target_missing` (+ confirm + note) / withdraw / close still work. Restore the page and file fresh (optional `supersedes_proposal_id`) if the work is still wanted.

## Three disposition lanes

| Lane | Use | Blocks apply? |
|---|---|---|
| **`add_blocker`** | Proposed field is wrong, invents a claim, or summary overclaims (e.g. “content refresh” with meta-only ops) | Yes |
| **`adjacent_findings` → notes** | Live page is broken in ways the ops do not touch (same entry), or you noticed defects on another entry | No |
| **`reject`** | The change itself must not ship | Closes the proposal |

### Adjacent findings routing

- **`verify_copy`:** proposed `value` vs live for fields this proposal writes; summary vs ops.
- **`adjacent_findings`:** live body/SEO vs approved facts when research tools were used.
- Same entry, ops do not touch → **notes** naming this page (content type / slug / locale). Prefer `related_entries`. Link `related_issue_ids` **only if** an issue already exists — do not invent tickets. Do **not** block apply.
- Other entry → **notes** naming that page — never a blocker on this proposal.
- Existing open notes covering it → **join/append** (same-issue notes refuse duplicates when `no_auto_retry`).
- Nothing to park → no empty notes; apply when in-scope is clean.
- Do not leave findings only in chat.
- Notes are **visible backlog** only: no YAML on close, no auto-assign / auto-retry. A later agent or staff files edits.
- **Proposal Reviewer** lacks `proposals_create`: do **not** convert park items into blockers; hand the list to a create-capable role (or join notes if already open). In-scope false proposed copy still uses `add_blocker`.

## Warnings on live context

- `situation_changed` — live class differs from filed snapshot
- `shared_issue_id` — related open proposals on the same issue
- `existence_unknown` — verify before inventing damage
- `target_missing` — apply blocked

## Ideas

After mixed-risk refuse, a surviving idea has one class: worst of related targets (missing public → `new_public_content`; selling → `selling_page`; other existing → `existing_content`; no targets → `none`). `idea_accept` always fires.

## Partial proposals

On `partial`, only pending/failed entries count toward the situation; already-applied entries are history.
