---
id: section-variant-swap
version: 1
title: Swap section layout with AI Agent
used_when: >
  Staff clicks Use This in the section swap popover (EditableSection) and picks
  "Ask AI agent" in the choice dialog instead of using the example's sample text.
intention: >
  Move one section to a different component version/variant while carrying its
  current copy into the new fields — proposed first, written only after staff approve.
success_looks_like: >
  Correct section verified; before/after proposal approved in chat; one section at
  the same index with the new layout and the original copy, facts, links, images and
  variable tokens; original section_id restored; short report; other locales offered.
failure_modes:
  - Writes before staff approve the proposal
  - Leaves sample/example text in the new section
  - Invents claims, numbers or links not in the original copy
  - Swaps the wrong section after the index shifted
  - Leaves a duplicate section or two sections with the same section_id
  - Edits other sections, variants or locales without asking
required:
  - url
  - content_type
  - slug
  - locale
  - page_variant
  - section_index
  - section_heading
  - component
  - from_version
  - from_variant
  - to_version
  - to_variant
  - shared_template_line
  - mcp_url
max_chars: 1800
sections:
  - Goal
  - Target
  - Do
  - Tools
  - Don’t
---

Goal: Swap one section to a new layout and move its current text into it, using the 4Geeks CMS MCP server.

Target:
- Page: {{url}} ({{content_type}}/{{slug}}, locale {{locale}}, {{page_variant}})
- Section: sections[{{section_index}}], {{component}} {{from_version}} / {{from_variant}}, heading "{{section_heading}}"
- New layout: {{component}} {{to_version}} / {{to_variant}}
- MCP: {{mcp_url}}
{{shared_template_line}}

Do:
1. get_entry_content; confirm sections[{{section_index}}] matches component, variant and heading. If not, stop and ask.
2. get_component_variant for the new layout's fields.
3. Fit the current copy into those fields. Keep facts, links, images and {{ variable }} tokens; shorten rather than invent. Use the example for structure only, never its text. Keep background and spacing.
4. Show me the proposal field by field next to the current text, plus anything dropped or empty. Wait for my go.
5. Then: add_section at {{section_index}} without section_id (pass variant if a draft), remove_section at {{section_index}}+1, then update_fields sections.{{section_index}}.section_id with the original ID if it had one. Re-read and verify one section with the new layout.
6. Report what was kept, trimmed, and needs my input.
7. Ask whether to do the same for this page's other locales, each with its own text.

Tools: get_entry_content, get_component_variant, add_section, remove_section, update_fields.

Don’t: write before my go, publish, touch other sections or variants, or edit other locales without asking.
