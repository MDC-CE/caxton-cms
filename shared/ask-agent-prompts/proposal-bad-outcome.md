---
id: proposal-bad-outcome
version: 1
title: Proposal bad outcome retro
used_when: >
  A Platform Steward marked a closed proposal (finished, rejected, or withdrawn)
  as a bad outcome on Agents → Proposals and clicks Discuss with agent.
intention: >
  Diagnose why this proposal ended badly and plan concrete improvements
  (rules, review situations, checklists, MCP tool descriptions, prompts) so the
  same outcome is less likely — discussing the plan before any edits.
success_looks_like: >
  Root cause named from the staff notes and decision record; 1–3 prevention
  changes proposed with the file or surface each touches; agent waits for
  approval before editing anything.
failure_modes:
  - Reopens, updates, or re-files the proposal
  - Edits site content or other proposals
  - Blames the reviewer instead of finding a systemic fix
  - Invents decision context when the record is missing
  - Starts editing rules or code before the plan is agreed
required:
  - proposal_id
  - title
  - kind
  - status
  - close_reason
  - mcp_url
  - what_went_wrong
  - expected
  - reviewed_by
  - decision_block
max_chars: 3500
sections:
  - Goal
  - Target
  - Context
  - Do
  - Don’t
---

Goal: A steward marked this closed proposal as a bad outcome. Help me find the root cause and plan improvements so it does not happen again.

Target:
- proposalId: {{proposal_id}}
- title: {{title}}
- kind: {{kind}}
- final status: {{status}} (close reason: {{close_reason}})
- MCP: {{mcp_url}}

Context:
- What went wrong (staff): {{what_went_wrong}}
- What should have happened instead (staff): {{expected}}
- Reviewed by: {{reviewed_by}}

Decision record:
{{decision_block}}

Do:
1. Optionally load the proposal via list_proposals (proposal_id) for entries, blockers, and notes. Treat the staff notes above as authoritative.
2. Name the root cause: wrong decision, bad execution, missing context, or should have been escalated. Say which step (proposer, reviewer, tool, rule) let it through.
3. Propose 1–3 improvements — Cursor rule, review situation or checklist item, MCP tool description or warning, or prompt change — with the file or surface each would touch.
4. Stop and discuss the plan with me before editing anything.

Don’t: reopen or update this proposal, edit site content, change other proposals, or start implementing before I agree to the plan.
