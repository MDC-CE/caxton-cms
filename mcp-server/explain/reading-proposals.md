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
| `verify_copy` / `disposition` | Baseline edits |
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

If live classify reports `target_missing` (page deleted after filing), `update_proposal` **apply** fails with `target_missing`. Reject / withdraw / close still work. Restore the page and file fresh if the work is still wanted.

## Warnings on live context

- `situation_changed` — live class differs from filed snapshot
- `shared_issue_id` — related open proposals on the same issue
- `existence_unknown` — verify before inventing damage
- `target_missing` — apply blocked

## Ideas

After mixed-risk refuse, a surviving idea has one class: worst of related targets (missing public → `new_public_content`; selling → `selling_page`; other existing → `existing_content`; no targets → `none`). `idea_accept` always fires.

## Partial proposals

On `partial`, only pending/failed entries count toward the situation; already-applied entries are history.
