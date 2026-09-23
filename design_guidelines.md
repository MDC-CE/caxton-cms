# Design Guidelines: MDC Learning (learning.mdc.edu)

## Design Approach

**Source of truth**: Figma MDC Design System (Color Palette, Typography, MediaQuery / Grid System v0.1). Tokens live in `site_learning-mdc-edu/theme.json` and are applied via CSS variables + Theme Editor.

**Core Principles**:
- Content-first hierarchy with clear learning paths
- Card-based modular design for scalability
- Purposeful brand color (Primary blue `#005EAA`, Yellow accent `#FFD400`)
- Clean layouts on the Figma grid (4 / 8 / 12 columns, 20px gutters)
- Semantic tokens only — never raw Tailwind palette colors

---

## Color System (STRICT - No Exceptions)

**IMPORTANT**: Only use the semantic color tokens defined below. NEVER use hardcoded colors like `bg-blue-500`, `text-[#ff0000]`, `text-red-600`, or any Tailwind color palette classes. All colors MUST come from CSS variables via semantic class names.

### Brand Colors (Figma)

| Token | HSL Value | Hex | Usage |
|-------|-----------|-----|-------|
| `primary` | `207 100% 33%` | `#005EAA` | Primary buttons, links, focus rings |
| `accent` | `50 100% 50%` | `#FFD400` | Highlights, badges (use sparingly) |
| `destructive` | `349 86% 49%` | `#EA1239` | Errors, delete actions |
| `foreground` | `220 8% 15%` | `#232529` | Body / headings (Dark Grey-500) |

Full scales (Primary, Blue, Light Blue, Light/Dark Grey, Yellow, Green, Violet, Error) are in Theme Editor → Custom Theme and `theme.json` `palette_scales`.

### Semantic Color Tokens

#### Backgrounds
| Tailwind Class | Usage |
|----------------|-------|
| `bg-background` | Main page background |
| `bg-card` | Card surfaces, elevated containers |
| `bg-popover` | Dropdown menus, tooltips, popovers |
| `bg-muted` | Subtle backgrounds, disabled states |
| `bg-primary` | Primary action buttons |
| `bg-secondary` | Secondary buttons, tags |
| `bg-accent` | Yellow highlights |
| `bg-destructive` | Error/danger buttons |
| `bg-sidebar` | Sidebar background |

#### Text Colors
| Tailwind Class | Usage |
|----------------|-------|
| `text-foreground` | Primary text (headings, body) |
| `text-muted-foreground` | Secondary text, captions, metadata |
| `text-primary` | Links, emphasized text (use sparingly) |
| `text-primary-foreground` | Text on primary backgrounds |
| `text-destructive` | Error messages |
| `text-card-foreground` | Text on cards |

#### Borders
| Tailwind Class | Usage |
|----------------|-------|
| `border-border` | Default borders |
| `border-input` | Input field borders |
| `border-card-border` | Card borders |
| `border-primary` | Focus rings, active states |

### Chart/Data Visualization Colors
Only for charts — `chart-1`…`chart-5` map to Primary / Yellow / Green / Error / Violet.

### Forbidden Practices

**NEVER do this:**
```jsx
<div className="bg-blue-500 text-white">  // WRONG
<span className="text-red-600">Error</span>  // WRONG
<div className="bg-[#005EAA]">  // WRONG
```

**ALWAYS do this:**
```jsx
<div className="bg-primary text-primary-foreground">  // CORRECT
<span className="text-destructive">Error</span>  // CORRECT
style={{ color: 'hsl(var(--primary))' }}  // CORRECT (rare)
```

### Status Colors
- `status-online` — Green-500
- `status-away` — Yellow-500
- `status-busy` — Error-500
- `status-offline` — Light Grey-800

---

## Typography System

**Font Family**:
- **Caxton admin** (`/private/*` chrome): Lato / Archivo
- **Site + section components** (class `.site-theme`): Plus Jakarta Sans (Figma)

**Roles (Figma)** — use `text-h1` / `text-h2` / `text-body` / `font-heading` / `font-sans`:

| Role | Mobile (S) | Desktop (L, ≥ md) | Weight |
|------|------------|-------------------|--------|
| Display H1 | 35 / 35 | 45 / 45 | 300 or 700 |
| Headline H2 | 30 / 30 | 35 / 35 | 300 or 700 |
| Title H3 | 18 / 20 | 20 / 22 | 300 or 700 |
| Title H4 | 18 / 20 | 20 / 22 | 500 or 700 |
| Body P | 14 / 18 or 16 / 20 | same | 400 or 600 |
| Links | 16 / 18 | same | 400 or 600 |

Letter-spacing is `0%` across the system.

## Layout System

**Breakpoints (Figma MediaQuery)**:

| Token | Min width | Columns | Gutter | Page margin |
|-------|-----------|---------|--------|-------------|
| (base) / `sm` | 332px | 4 | 20px | 20px |
| `md` | 679px | 8 | 20px | 20px |
| `lg` | 1132px | 12 | 20px | 60px |
| `xl` | 1468px | 12 | 20px | 120px |

Use `page-shell` (or `px-page-margin`) for horizontal page padding. CSS vars: `--page-margin`, `--page-gutter`, `--grid-columns`.

**Spacing Scale**: 0.25rem (4px) increments; section spacing ~4rem; card padding 1.5rem; grid gaps 1.25rem (20px gutter).

**Elevations**: `shadow-card` / `shadow-elevation` / `shadow-elevation-blue` (Figma Elevation 1 / 2 / Blue).

## Component Library

### Navigation
**Top Navigation Bar**:
- Fixed header with white background, subtle bottom border
- Logo left, primary navigation center, user profile/avatar right
- Height: 4rem (64px)
- Navigation links: body size, primary for active states

### Cards
- White background, 12px radius (`rounded-card`)
- Shadow: `shadow-card`
- Padding: 1.5rem
- Hover: subtle lift with `shadow-elevation`

### Buttons

Source: Figma Buttons v0.1. Action labels use **Public Sans** 14 / normal, weight 400. Radius is always **20px**. Letter-spacing is 0.

**Touch target.** Every button (text, icon, header, sticky-bar actions) has a minimum hit area of **44×44px**, even when the painted box in Figma is shorter. Keep the visual padding below; grow the hit area with `min-h` / `min-w` (or equivalent padding), not by scaling the label.

| Size | Horizontal padding | Vertical padding | Painted height in Figma |
|------|--------------------|------------------|-------------------------|
| Lg | 50px | 10px | 36px |
| Md | 30px | 10px | 36px |
| Sm | 15px | 10px | 30px |

**Primary (light).** Enabled is Blue Gradient 1, left to right: `#005EAA` → `#3470E8`, label white. Hover and pressed drop the gradient.

| State | Fill | Label |
|-------|------|-------|
| Enabled | `#005EAA` → `#3470E8` | white |
| Hovered | `#00569B` | white |
| Pressed | `#004379` | white |
| Disabled | `#B0CDE5` | white |

**Secondary, light mode.** 1px border. Enabled fill is primary at 10% opacity.

| State | Fill | Border | Label |
|-------|------|--------|-------|
| Enabled | `rgba(0, 94, 170, 0.1)` | `#005EAA` | `#005EAA` |
| Hovered | none | `#005EAA` | `#005EAA` |
| Pressed | none | `#004379` | `#004379` |
| Disabled | `rgba(176, 205, 229, 0.2)` | `#B0CDE5` | `#8AB5D8` |

**Secondary, dark mode.** Enabled fill is white at 10% opacity; border and label are white. Hover drops the fill and keeps the white border and label.

**Tertiary (text).** No fill or border. Public Sans **Bold** 14, color `#005EAA`, optional trailing chevron with a 10px gap (“Learn more”).

**Header icon button.** Icon glyph about 20px, 5px padding, no chrome. Hit area is still 44×44.

Map fills to semantic tokens where they already exist (`primary` = `#005EAA`). State colors above stay as specified; do not substitute the Tailwind palette.

### Icons

Source: Figma Icons v0.1. Framed icons share white fill, 1px border `#E5E7EB`, and Elevation 1 (`0 2px 2px rgba(229, 231, 235, 0.5)`). Cards and form icons also use a 5px backdrop blur.

| Family | Container | Radius | Glyph | Chrome |
|--------|-----------|--------|-------|--------|
| Cards, style 1 | 60×55 | 25px | ~23px | framed |
| Cards, style 2 | 80×70 | 25px | ~40×46 | framed |
| Forms | 34×34 | 25px | 14px | framed |
| Tag, xs | hug content, padding 9×7 | 25px | 13px | framed |
| Tag, sm | 43×40 | 15px | ~19–22px | framed |
| Inline (star, clock, calendar, …) | 38×20 frame, 2px padding | none | ~16px | none; light and dark color modes |
| Submenu | 50×50 | — | — | — |
| Header (cart, search, menu, close) | glyph only, ~17–23px | none | — | none |

Inline icons switch stroke/fill between light and dark mode. They do not get the card frame.

### Chips

Source: Figma Chips v0.1. Radius **10px** unless noted. Filter and breadcrumb labels are **Plus Jakarta Sans** Regular 14 / 16, color `#666666` when idle.

**Filter chip.** Height 30px, padding 10px.

| State | Fill | Border | Label |
|-------|------|--------|-------|
| Enabled | none | none | `#666666` |
| Hovered | none | 1px `#005EAA` | `#666666` |
| Pressed (selected) | `#005EAA` | none | white |
| Disabled | `rgba(196, 196, 196, 0.3)` | none | `#C4C4C4` |

**Chip row** (language, timeline, locations). Outer shell: padding 5px, gap 15px, radius 15px, fill `rgba(229, 231, 235, 0.35)`, Elevation 1, 5px blur. The active chip uses the filter pressed style; the others use filter enabled.

**Breadcrumb chip.** Height 30px, padding 10px, 1px border. Selected adds a 5px gap and an 11px dismiss icon.

| Mode | Fill | Border | Label |
|------|------|--------|-------|
| Light | `rgba(0, 94, 170, 0.1)` | `#005EAA` | `#005EAA` |
| Dark | `#303238` | `#919294` | `#9ACDFE` |

**Assist chip.** Public Sans Medium 13 / 18, padding 10×6, radius 10px.

| Type | Fill | Label |
|------|------|-------|
| Scholarships | `#25BF6C` | white |
| Technologies | `#005EAA` | white |
| Certificate | `#9ACDFE` | `#005EAA` |
| Information | white, inset shadow `0 2px 2px #E5E7EB` | `#005EAA` |

**Partner chip.** Public Sans Medium 16 / 14, padding 14×10, radius 10px, fill `rgba(154, 205, 254, 0.2)`, border 0.5px `#9ACDFE`, label `#005EAA`.

### Sticky bar

Source: Figma Sticky Bar (Sticky Call Bar), sizes `lg` and `sm`.

**Shell.** Padding 5px, radius 15px, fill `rgba(154, 205, 254, 0.3)`, backdrop blur 5px, shadow `0 4px 4px rgba(229, 231, 235, 0.5)` (Elevation 2).

**Inner card.** Fill `#FBFBFB` (light grey-50), border 0.5px `#E5E7EB`, radius 10px, backdrop blur 5px. Label is Plus Jakarta Sans SemiBold, color `#222222`.

| Size | Label | Card padding | Gap label → actions | Gap between icon buttons | Icon button |
|------|-------|--------------|---------------------|--------------------------|-------------|
| lg | 16 / 20 | 20×15 | 25px | 10px | 40×43, radius 15px, glyph ~20–22px |
| sm | 14 / 18 | 20×10 | 20px | 8px | hug, padding 12×7, radius 25px, glyph 18px |

Icon buttons on the bar: white fill, 1px border `#E5E7EB`. Their hit area is still **44×44px**.

### Progress Indicators
- Track: muted / light grey
- Fill: `bg-primary` (or `bg-accent` for emphasis)

## Accessibility

- Prefer White text on Primary-500 (AAA large) and Dark Grey on Yellow-500
- Focus rings: `ring-ring` / `border-primary`
- Do not reduce text opacity; use `text-muted-foreground` instead

## Theme Editor

- **Base Theme**: semantic CSS variables (live site via `__theme_overrides__`)
- **Custom Theme**: approved backgrounds / text / accents from Figma scales
- Source file: `site_learning-mdc-edu/theme.json` (content GitHub)
