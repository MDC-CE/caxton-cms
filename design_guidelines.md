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
- Primary: `bg-primary text-primary-foreground`
- Secondary/outline: `bg-secondary` or border + foreground
- Destructive: `bg-destructive`
- Accent yellow: rare — badges / one highlight per surface

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
