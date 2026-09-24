---
name: new-section-component
description: "End-to-end workflow for creating a new section component: canvas design first, then codebase implementation following 4Geeks architecture and design system."
---

# New Section Component Skill

This skill defines the two-phase workflow for creating any new section component in the 4Geeks marketing platform. Every new component **must** be designed visually on the canvas first, approved by the user, and then built into the codebase following the architecture and design system documented below.

---

## Phase 1: Canvas Design (Mockup Sandbox)

Before writing any production code, prototype the component visually in a mockup sandbox so the user can review and approve the design.

### Steps

1. **Clarify requirements** — Ask the user what the section should accomplish, what content it displays, and any layout preferences (e.g., number of columns, card vs. flat, image placement).
2. **Create a mockup sandbox artifact** — Use `createArtifact()` with `artifactType: "mockup-sandbox"`. Build a self-contained HTML/CSS/JS prototype that:
   - Uses the 4Geeks design tokens (colors, typography, spacing, radius) listed in the Design System Reference below.
   - Shows realistic placeholder content (never lorem ipsum — use marketing-appropriate copy).
   - Demonstrates responsive behavior (desktop and mobile).
   - If the component has variants, show each variant.
3. **Present to the user** — Let the user review in the preview pane. Iterate on feedback until they approve.
4. **Lock the design** — Once approved, document the final layout decisions (variant names, props, content structure) before moving to Phase 2.

---

## Phase 2: Codebase Implementation

After the user approves the mockup, build the component into the codebase. Every new section component requires **all** of the following files and registrations.

### File Checklist

#### 1. Component Registry — shared vs site

Choose **one** home (never both — boot fails on duplicate type names):

| Kind | Path |
|---|---|
| **Shared** (all sites, ≤~12 platform types) | `shared/component-registry/<component_name>/v1.0/` (app repo) |
| **Site-only** | `site_<name>/component-registry/<component_name>/v1.0/` (content folder from `sites.yml`) |

| File | Purpose |
|---|---|
| `schema.ts` | Zod validation schemas and TypeScript types. Export the unified section schema (use `z.discriminatedUnion` / `z.union` for multi-variant components) plus all sub-schemas and types. **Source of truth for fields/variants.** Shared packages may import only `shared/component-registry/_common` — never site helpers. |
| `schema.yml` | Human-readable metadata for MCP / AI / admin: name, description, `when_to_use`, variants, props. Generated/updated by schema-sync from `schema.ts` (preserve hand-authored docs). |
| `field-editors.ts` | Optional. Maps prop names to custom inline-editor types (e.g., `"font-size-picker"`). Export `fieldEditors: Record<string, EditorType>`. |
| `examples/` | One or more `.yml` files with realistic YAML examples. Each file has `name`, `description`, and `yaml` (a YAML string showing the section in a `sections` array). **Every variant must have at least one example.** |
| `screenshots/` | Shared types only: tracked WebP thumbs in the app repo. Site types use site-scoped cache/GCS. |
| `<name>.css` | Only when Tailwind cannot express the rule (mask, clip, critical-path radius). Same folder and same repo as the component. Import it from the top of `client/src/index.css`, above `@font-face` and `@tailwind`. Do not paste the rules into `index.css`, and do not use a `<style>` tag in the section chunk. |

After writing or changing `schema.ts`, keep `schema.yml` current:

- `predev` / `prebuild` run `npm run ensure:schema-yml` (check → sync → re-check) so agents cannot leave drift unnoticed.
- Manual while iterating: `npm run schema:sync -- --component=<type>`
- Check only: `npm run schema:sync:check`

**Non-effects:** ensure/sync does **not** push the content GitHub, does not update React, and does not fan out locales. Shared edits are app commits; site registry edits ship via DebugBubble Sync. Another site cannot use a site-only type — promote to shared or duplicate into that site's registry.

**schema.yml template:**

```yaml
name: My Component
version: "1.0"
component: MyComponent
file: client/src/components/MyComponent.tsx
description: Short description of the component purpose.
when_to_use: |
  Guidance on when to pick this component.
# Declare behaviors when the component participates in platform patterns:
# behaviors:
#   conversion:
#     via: form-settings
#   ecommerce:
#     role: funnel   # or catalog
#     events: [view_item, add_to_cart]
#   listing:
#     source: dynamic_entries
#   schema_org:
#     handler: faq
# CTA ecommerce intent is NOT on behaviors — bind paths in field-editors.ts as "cta-tracking".
# Optional — only if this component needs non-default section-level behavior:
# section_defaults:
#   load: eager
variants:
  default:
    description: Default layout
    best_for: General use
props:
  title:
    type: string
    required: true
    description: Main heading text
    example: "Why Choose Us"
  items:
    type: array
    required: true
    description: List of items
    items:
      icon:
        type: string
        required: false
        description: Tabler icon name (e.g., IconRocket)
      label:
        type: string
        required: true
```

### Behaviors + CTA tracking (required when applicable)

- If `field-editors.ts` includes `form-settings` → declare `behaviors.conversion`.
- If listing / `dynamic_entries` → declare `behaviors.listing`.
- If SSR schema.org → declare `behaviors.schema_org`.
- If ecommerce funnel/catalog or `cta-tracking` editors → declare `behaviors.ecommerce`.
- Bind ecommerce CTAs with `"path.to.cta": "cta-tracking"` (required `tracking`: `none` | `add_to_cart` | `click_begin_checkout`).
- See `docs/component-behaviors.md` and `.cursor/rules/component-behaviors.mdc`. Schema-sync preserves `behaviors`.

### Wipe on duplicate (think hard — keep the list tiny)

Page/section duplicate **automatically** clears conversion/ecommerce identity fields derived from field-editors (no `reset_on_duplicate` key on schema):

- Any `conversion_name` under the section (incl. routes)
- `ecommerce_products`
- CTA `tracking` on `cta-tracking` binds

When you add `form-settings`, `cta-tracking`, or `ecommerce-products`, assume staff must re-set those values after every duplicate. Do **not** wipe ordinary copy/layout props. Do not invent parallel schema metadata for this.

**schema.ts template:**

```ts
import { z } from "zod";

export const myItemSchema = z.object({
  icon: z.string().optional(),
  label: z.string(),
});

export const myComponentSectionSchema = z.object({
  type: z.literal("my_component"),
  version: z.string().optional(),
  variant: z.enum(["default"]).optional(),
  title: z.string(),
  items: z.array(myItemSchema),
  background: z.string().optional(),
});

export type MyItem = z.infer<typeof myItemSchema>;
export type MyComponentSection = z.infer<typeof myComponentSectionSchema>;
```

For multi-variant components, define one schema per variant and combine with `z.union([...])`.

#### 2. Re-export in `shared/schema.ts`

Add a re-export block so the rest of the app can import the schema and types:

```ts
// ============================================
// Re-export My Component Schemas from Component Registry
// ============================================
export {
  myComponentSectionSchema,
  type MyComponentSection,
} from "../shared/component-registry/my_component/v1.0/schema";
```

(Use `site_*/…` only for temporary legacy re-exports — prefer shared for platform types.)

Also add the new section schema to the `Section` union type if one exists, or ensure it is included in the validation pipeline.

#### 3. React Component — `client/src/components/<ComponentName>.tsx`

(or a folder with `index.ts` + variant files for multi-variant components)

- Import types from the component registry schema (e.g., `import type { MyComponentSection } from "..."` or from `@shared/schema`).
- Accept a single `data` prop typed to the section schema.
- **No hardcoded content** — every piece of visible text, image, icon, URL, label, etc. MUST come from a YAML prop. The component renders only what the `data` prop provides. Never hardcode strings, labels, or placeholder content inside the component itself.
- Use **only semantic Tailwind tokens** (`bg-primary`, `text-foreground`, `bg-muted`, etc.) — never hardcoded colors like `bg-blue-500`.
- Use **`@tabler/icons-react`** for all icons — never `lucide-react`.
- Use **`UniversalImage`** for images (reference by `image_id` from the image registry).
- Use **`UniversalVideo`** for video content.
- **Buttons** use `rounded-md` (the default) — do not override button border radius.
- **Badges** use `rounded-full` so they render as proper pill-shaped badges.
- **Container/wrapper padding** — when using any box element with a visual background (cards, panels, colored wrappers), always include inner padding so child elements never touch the wrapper borders. Most components use `p-card-padding` (24px) or at minimum `p-4`/`p-6`.
- Follow the 4Geeks Design System rules below.

#### 4. Register in `SectionRenderer.tsx`

In `client/src/components/SectionRenderer.tsx`:

1. Add an **import** at the top (in the appropriate eager/lazy section):
   ```ts
   import { MyComponent } from "@/components/MyComponent";
   ```

2. Add a **case** in the `renderSection` switch:
   ```ts
   case "my_component":
     return <MyComponent data={section as Parameters<typeof MyComponent>[0]["data"]} />;
   ```

#### 5. Register in DebugBubble Component Catalog

Add the new component to `client/src/components/DebugBubble/utils/componentCatalog.ts` so it appears in the DebugBubble's component section:

```ts
import { IconMyIcon } from "@tabler/icons-react"; // add to existing imports

// add to componentsList array:
{ type: "my_component", label: "My Component", icon: IconMyIcon, description: "Short description" },
```

#### 6. ComponentPickerModal (Automatic)

The "Add Component" modal (`client/src/components/editing/ComponentPickerModal.tsx`) reads from the `/api/component-registry` API endpoint, which scans the site `component-registry/` folder automatically. As long as the component registry folder (step 1) exists with a valid `schema.yml`, the component will appear in the modal with no extra code changes.

#### 7. YAML Content Example

Create at least one example page section in an existing page YAML (or the component's `examples/` folder) so the component can be previewed:

```yaml
- type: my_component
  title: "Why Choose Us"
  items:
    - icon: IconRocket
      label: "Fast-track your career"
```

---

## 4Geeks Design System Reference

All values below come from `client/src/index.css` and `tailwind.config.ts`. Components **must** use these tokens — never raw hex/rgb values.

### Brand Colors (Light Mode)

| Token | CSS Variable | Hex | Usage |
|---|---|---|---|
| `bg-background` / `text-foreground` | `--background` / `--foreground` | `#FFFFFF` / `#00041A` | Page background, default text |
| `bg-primary` / `text-primary-foreground` | `--primary` / `--primary-foreground` | `#005EAA` / `#FFFFFF` | Primary buttons, links, accents |
| `bg-accent` / `text-accent-foreground` | `--accent` / `--accent-foreground` | `#FFD400` / `#232529` | Secondary highlight, badges |
| `bg-muted` / `text-muted-foreground` | `--muted` / `--muted-foreground` | `#FBFBFB` / `#767676` | Subtle backgrounds, secondary text |
| `bg-card` / `text-card-foreground` | `--card` / `--card-foreground` | `#FFFFFF` / `#232529` | Card surfaces |
| `bg-secondary` / `text-secondary-foreground` | `--secondary` / `--secondary-foreground` | `#F3F3F3` / `#232529` | Outline buttons, secondary actions |
| `bg-destructive` | `--destructive` | `#EA1239` | Errors, destructive actions |

Dark mode tokens are defined in `.dark {}` — components automatically adapt via semantic classes.

### Typography

| Element | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| H1 / `.text-h1` | Plus Jakarta Sans (`font-heading`) | 45px (35px mobile) | 700 | 45px (35px) | 0 |
| H2 / `.text-h2` | Plus Jakarta Sans (`font-heading`) | 35px (30px mobile) | 700 | 35px (30px) | 0 |
| Body / `.text-body` | Plus Jakarta Sans (`font-sans`) | 16px | 400 | 20px | 0 |
| Stats/Numbers | Plus Jakarta Sans (`.font-inter` alias) | varies | varies | — | — |

Tailwind shortcuts: `text-h1`, `text-h2`, `text-body`, `font-heading`, `font-sans`.

### Spacing

| Token | Value | Usage |
|---|---|---|
| Base unit | 8px (`--spacing: 0.5rem`) | Minimum spacing increment |
| Section spacing | 64px (`spacing-section`) | Vertical padding between sections |
| Card padding | 24px (`spacing-card-padding`) | Internal card padding |

### Border Radius

| Token | Value |
|---|---|
| `rounded-card` | 12px (0.75rem) — brand standard for cards |
| `rounded-lg` | 9px |
| `rounded-md` | 6px |
| `rounded-sm` | 3px |

### Shadows

Use `shadow-card` for cards. Shadows are disabled in dark mode.

### Icons

- **Library**: `@tabler/icons-react` — NEVER use `lucide-react`.
- **Allowed icons**: See `4geeks-com/theme.json` `icons` array for the full approved list.

### Allowed Backgrounds

`4geeks-com/theme.json` is the **single source of truth** for all allowed background colors. Never use a background color that is not in this file — not even a color that "looks like" a brand color.

| ID | CSS Variable / Value | Hex equivalent (for mockup sandbox) |
|---|---|---|
| `background` | `--background` | `#FFFFFF` |
| `muted` | `--muted` | `#FAFAFA` |
| `card` | `--card` | `#FFFFFF` |
| `secondary` | `--secondary` | `#F5F5F5` |
| `accent` | `--accent` | `#FFD400` |
| `primary` | `--primary` | `#005EAA` |
| `sidebar` | `--sidebar-background` | matches sidebar token |
| `light-blue-5` | `hsl(210 100% 50% / 0.05)` | ~`#F0F7FF` |
| `light-blue-5-gradient` | gradient to transparent | — |
| `light-blue-diagonal-gradient` | diagonal gradient | — |

**Never use a text/foreground color as a background.** `--foreground` (`#00041A`) is a text token — it has no entry in the `backgrounds` list and must not be applied to `background-color` on any element.

**Why this matters:** Using off-list backgrounds — even ones that look close — breaks consistency across pages and makes dark mode adaptation unpredictable. The approved list was chosen to always look correct in both light and dark mode.

### Allowed Text Colors

Text colors must also come from `theme.json` under `text`. Use solid values only — **never apply `opacity` or `rgba(...)` to text elements**.

| ID | CSS Variable | Usage |
|---|---|---|
| `foreground` | `--foreground` | Default body text, headings |
| `muted-foreground` | `--muted-foreground` | Secondary/supporting text |
| `primary-foreground` | `--primary-foreground` | Text on primary blue backgrounds |
| `secondary-foreground` | `--secondary-foreground` | Text on secondary backgrounds |
| `primary` | `--primary` | Colored links, CTAs, accent labels |

**Why no transparency on text:** Applying `opacity: 0.35` or `rgba(255,255,255,0.6)` to text produces colors that are not part of the design system. They can clash with different backgrounds, break in dark mode, and create visual inconsistency across components. If you need a softer text color, use `muted-foreground` — it exists exactly for that purpose.

### Transparency on Backgrounds

Transparency is acceptable **only on backgrounds**, and only using the predefined opacity levels already codified in `theme.json` under `courses`:

| Pattern | Value | When to use |
|---|---|---|
| `primary/40` | `hsl(var(--primary) / 0.4)` | Stronger tinted bg |
| `primary/30` | `hsl(var(--primary) / 0.3)` | Medium tinted bg |
| `primary/20` | `hsl(var(--primary) / 0.2)` | Light tinted bg (icon wrappers when needed) |
| `primary/5` | `hsl(210 100% 50% / 0.05)` | Very subtle section wash (`light-blue-5`) |

Do not invent new rgba levels (e.g., `rgba(0,132,255,0.15)`, `rgba(0,0,0,0.06)`). Use the closest approved value.

### Color Philosophy — Formal, Near-Monochromatic

4Geeks components lean almost entirely on **blue and muted/neutral tones**. The goal is a professional, restrained design that reads as credible and serious — not colorful or consumer-facing.

**Default approach:**
- Backgrounds: `background`, `muted`, `card`, or `light-blue-5`
- Text: `foreground` and `muted-foreground`
- Accents: `primary` (blue) — used for interactive elements, links, icons, thin highlights
- Visual elevation/differentiation: use `primary/5` (a very subtle blue wash) rather than bold or dark backgrounds — this applies broadly, not just to "featured" cards. Use it whenever you want a section, card, or element to stand out slightly or to add background variety without making it feel like a highlighted call-to-action

**Accent yellow (`--accent` / `#FFD400`):** Use very sparingly — one deliberate use per component at most, such as a badge or a single highlight. Never use it as a repeating element across multiple items in a list or grid.

**Why restraint matters:** Too many colors in UI elements signals consumer/casual design. Mono-chromatic blue + muted tones communicates professionalism and focus, which aligns with 4Geeks as a serious tech education brand. When in doubt, reach for `primary/5` before reaching for any other color.

### Exception — Program / Course Color Identities

When a component renders the 4 academy **programs or courses as distinct side-by-side items** that need visual differentiation, each program may be assigned one color identity from this fixed palette:

| Program | Color | Token | Hex (sandbox) |
|---|---|---|---|
| Full Stack Development with AI | Blue | `--primary` | `#005EAA` |
| AI Engineering | Gray | `--muted-foreground` | `#737373` |
| Data Science & ML | Yellow | `--accent` | `#FFD400` |
| Cybersecurity | Red | `--destructive` | `hsl(0 75% 45%)` ≈ `#C0311B` |

These color identities are used for: icon color, thin accent bars/lines, CTA link text color. They are **not** used as full card background colors (use `card` or `light-blue-5` for card backgrounds). The assignment above is flexible — the important thing is that each program consistently uses one distinct color across all components that reference it.

**Why:** When displaying all 4 programs simultaneously, pure mono-chrome makes them visually indistinguishable. Assigning one color per program lets users scan and remember which card is which — especially useful when the same programs appear in multiple components across a page. The 4-color system (blue, gray, yellow, red) stays within the brand palette without becoming decorative or consumer-feeling.

### Typography Sizing Hierarchy

Use font sizes to convey information hierarchy. There are three levels:

| Size | Tailwind | Usage |
|---|---|---|
| `text-base` (16px) | `text-base` | Main body / description text — any paragraph or tagline that carries real meaning. Do not downsize these to `text-sm` to save space. |
| `text-sm` (14px) | `text-sm` | Supporting metadata — duration badges, secondary labels, pill text, captions that are visually subordinate. |
| `text-xs` (12px) | `text-xs` | Fine-print labels — uppercase tracking-widest category tags, table column headers, "Avg. salary" type labels above a value. |

**Common mistake to avoid:** Using `text-sm` for a program tagline or card description because the card is small. Description text carries meaning and needs to be readable at normal size. If the card feels too crowded with `text-base`, the fix is to reduce padding or shorten the copy — not to shrink the text.

**Data values** (numbers, salary ranges, durations displayed as standalone facts) should be sized up, not down — they are the information the user came to read.

**Why:** Consistent text sizing creates a predictable reading rhythm across components. When description text is randomly `text-sm` in some components and `text-base` in others, the page feels inconsistent even if the colors and spacing are correct.

### Icon Usage in Components

Icons are effective as visual differentiators for cards, list items, and bullet-like elements. Follow these rules:

- **No background wrapper by default.** Don't wrap icons in a colored circle or square container. The icon itself, rendered in `text-primary` or `text-muted-foreground`, provides enough visual cue without adding visual noise.
- **Max size: `w-8 h-8`.** Icons in cards and list items should not exceed 32px. Larger icons are reserved for hero/decorative use cases where the icon IS the main visual element.
- **Exception — sparse content:** If a card or list item has very minimal content (e.g., just an icon and a single line of text, with no description or metadata), a subtle background on the icon (using `primary/20`) can prevent the card from feeling visually empty. This is the only case where an icon background is acceptable.

**Why:** A background behind an icon in a rich card (one that already has a title, description, and CTA) adds unnecessary visual weight and makes the design feel busier. The icon's color alone is sufficient differentiation when the surrounding content provides enough structure.

### Accent Separator Lines

When using a colored vertical bar or horizontal line as a visual differentiator (e.g., a left-side accent stripe on a card or list item):

- Keep it **thin**: `w-0.5` (2px) or `w-1` (4px) for vertical bars, `h-px` or `h-0.5` for horizontal dividers
- Never use `w-3` (12px) or wider — this turns a subtle signal into a decorative block that competes with the content

**Why:** A thin line is enough to guide the eye and signal differentiation. A thick bar draws too much attention, creates visual imbalance, and undermines the formal, restrained aesthetic.

### Button Variants

Use the shadcn `<Button>` component. The actual `variant` prop values are: `default` (renders as primary blue), `secondary`, `outline`, `ghost`, `destructive`. Note: in YAML content the CTA `variant` field uses `"primary"` which maps to `variant="default"` at the component level. Never implement custom hover/active states — the built-in elevation system handles this.

### Interaction System

- Use `hover-elevate` and `active-elevate-2` utility classes for non-Button/Badge elements.
- Never add `hover:bg-*` or custom hover states to `<Button>` or `<Badge>`.
- For toggle states, use `toggle-elevate` + `toggle-elevated`.

---

## Naming Conventions

- **Component type** (YAML `type` field): `snake_case` (e.g., `graduates_stats`, `cta_banner`)
- **Component name** (React): `PascalCase` (e.g., `GraduatesStats`, `CtaBanner`)
- **Registry folder**: matches the `type` value in `snake_case` (e.g. `site_4geeks-com/component-registry/graduates_stats/`)
- **Schema exports**: `camelCase` with `Schema` suffix (e.g., `graduatesStatsSectionSchema`)
- **Type exports**: `PascalCase` with `Section` suffix (e.g., `GraduatesStatsSection`)

---

## Multi-Variant Components

When a component supports multiple layout variants:

1. Define a separate Zod schema per variant with a `variant` literal discriminator.
2. Combine into a unified schema with `z.discriminatedUnion("variant", [...])` (optionally `.or(...)` for backward-compatible default).
3. Create a main component file that switches on `variant` and delegates to sub-components.
4. Use a folder structure: `client/src/components/<component_name>/` with `index.ts`, main component, and variant files.
5. Keep `schema.yml` variants in sync via `npm run schema:sync -- --component=<type>` (or rely on `ensure:schema-yml` on predev). Document `description` / `best_for` in yml after sync if needed.

**Reference implementation**: See `graduates_stats` or `cta_banner` for the complete pattern:
- `client/src/components/graduates_stats/` — folder with index, main component, and variant files
- `site_4geeks-com/component-registry/graduates_stats/v1.0/` — schema.yml, schema.ts, field-editors.ts, examples/

---

## Common Pitfalls

- **Never hardcode content** — all visible text, labels, images, icons, URLs must come from YAML props. The component is a pure renderer of its `data` prop.
- **Never use hardcoded colors** — only semantic tokens (`bg-primary`, `text-muted-foreground`, etc.).
- **Never put component CSS in `client/src/index.css`** — Tailwind classes on the component, or a `.css` file beside it in the registry (content repo for site components). Import that file at the top of `index.css`.
- **Never use `lucide-react`** — always `@tabler/icons-react`.
- **Never use raw `<img>` or `<video>` tags** — use `UniversalImage` and `UniversalVideo`.
- **Never use emoji** — use Tabler icons instead.
- **Always include `data-testid`** attributes on interactive and meaningful display elements.
- **Always support the `background` prop** — most section components accept an optional `background` string for the outer wrapper.
- **Always include `version: z.string().optional()`** in the Zod schema.
- **Always re-export from `shared/schema.ts`** — so the rest of the app can import types.
- **Buttons use `rounded-md`** (the default border radius) — never override it.
- **Badges use `rounded-full`** — so they render as proper pill shapes.
- **Wrapper elements need padding** — any box with a visual background (card, panel, colored div) must have inner padding so children never touch the borders.
- **Reuse existing field editors** — when a prop needs a custom inline editor, use one of the existing `EditorType` values listed below. Only create a new editor type if the user explicitly asks for it.

### Existing Field Editor Types

These are already implemented and available for use in `field-editors.ts`:

| EditorType | Purpose |
|---|---|
| `"icon-picker"` | Pick a Tabler icon |
| `"color-picker"` | Pick a theme color (variants: `"color-picker:text"`, `"color-picker:courses"`, `"color-picker:accent"`) |
| `"image-picker"` | Pick an image from the registry (variant: `"image-picker:logo"`) |
| `"image-with-style-picker"` | Pick an image with CSS positioning/style options |
| `"link-picker"` | Pick/edit a URL link |
| `"video-picker"` | Pick/edit a video URL |
| `"rich-text-editor"` | Inline rich text editing |
| `"markdown"` | Markdown text editing |
| `"font-size-picker"` | Pick a font size from theme presets |
| `"boolean-toggle"` | Toggle a boolean value |
| `"variant-picker"` | Pick from component variants |
| `"cta-picker"` | Edit a CTA button (text, url, variant) |
| `"text-input"` | Simple text input |
| `"string-picker:opt1,opt2,..."` | Pick from a custom list of string options |

### Field Editor Key Path Convention

The keys in `fieldEditors` follow a convention based on where the prop lives in the data tree. The editor panel parses these paths at runtime — using the wrong format will silently fail (the picker simply won't appear).

| Prop location | Key format | Example |
|---|---|---|
| Top-level section prop | Bare key | `"layout"`, `"show_salary"` |
| Child of an array | `"arrayName[].fieldName"` | `"programs[].color"`, `"courses[].icon"` |
| Variant-scoped array child | `"variant:arrayName[].fieldName"` | `"solid:courses[].course_background"` |
| Array-of-array grandchild | Not supported — omit | — |

**Critical rule:** array children must use `[]` bracket notation, not dot-star (`programs.*.color`) or plain dots (`programs.color`). The editor panel matches paths with the regex `/^([\w.]+)\[\]\.(.+)$/` — anything that doesn't match this pattern is ignored silently.

```ts
// CORRECT
export const fieldEditors = {
  layout: "string-picker:grid,stacked_list",   // top-level
  "programs[].color": "color-picker:courses",  // array child
  "programs[].icon": "icon-picker",            // array child
};

// WRONG — silently ignored
export const fieldEditors = {
  "programs.*.color": "color-picker:courses",  // dot-star fails
  "programs.color": "color-picker:courses",    // no brackets, fails
};
```
