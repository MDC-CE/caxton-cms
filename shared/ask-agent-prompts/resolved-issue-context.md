---
id: resolved-issue-context
version: 1
title: Resolved issue locator stub
used_when: >
  Staff clicks Ask Agent on a resolved-issue row in Diagnostics → Global Health
  (Resolved issues list).
intention: >
  Locate one previously resolved Global Health issue so staff can add their real
  question below the pasted stub — without mutating content or claiming issues yet.
success_looks_like: >
  Entry and/or archive row identified via MCP; agent waits for staff instructions
  below; no unsolicited edits or update_issue claim/complete.
failure_modes:
  - Mutates YAML or calls update_issue before staff instructions
  - Invents a different entry or locale
  - Treats the stub as an open fix playbook
  - Skips archive lookup when the closer note is needed
required:
  - issue_id
  - code
  - severity
  - validator
  - url
  - content_type
  - slug
  - locale
  - variant_line
  - file_path
  - mcp_url
  - message
  - resolved_at
  - resolved_by
  - reopened_line
max_chars: 1000
sections:
  - Goal
  - Target
  - Context
  - Do
  - Don’t
---

Goal: Locate this previously resolved Global Health issue so I can ask about it below.

Target:
- issueId: {{issue_id}}
- code: {{code}} ({{severity}})
- validator: {{validator}}
- URL: {{url}}
- contentType: {{content_type}}
- slug: {{slug}}
- locale: {{locale}}{{variant_line}}
- filePath: {{file_path}}
- MCP: {{mcp_url}}

Context:
- archived — not an open claim queue
- message: {{message}}
- resolved: {{resolved_at}} by {{resolved_by}}
{{reopened_line}}
Do:
1. Resolve the entry via MCP when Target has enough locators (get_entry_content / get_entry_fields).
2. If you need the closer’s note, load this row via get_validation_issues (set: resolved) using Target fields.
3. Stop and wait — do not edit, claim, or complete yet. My instructions follow below.

Don’t: mutate content or call update_issue until I add instructions below.

