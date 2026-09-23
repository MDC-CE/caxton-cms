---
name: MDC Learning
description: Public catalog for Miami Dade College Continuing Education. Cards on a strict grid, signal blue for action, yellow only on summer camps.
colors:
  signal-blue: "#005EAA"
  signal-blue-hover: "#00569B"
  signal-blue-pressed: "#004379"
  signal-blue-disabled: "#B0CDE5"
  signal-wash: "rgba(0, 94, 170, 0.1)"
  gradient-blue: "#3470E8"
  highlighter-yellow: "#FFD400"
  campus-ink: "#232529"
  ink-quiet: "#666666"
  muted-text: "#767676"
  paper: "#FFFFFF"
  paper-soft: "#FBFBFB"
  hairline: "#E5E7EB"
  certificate-blue: "#9ACDFE"
  scholarship-green: "#25BF6C"
  error-red: "#EA1239"
  on-signal: "#FFFFFF"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "45px"
    fontWeight: 700
    lineHeight: "45px"
    letterSpacing: "0"
  headline:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "35px"
    fontWeight: 700
    lineHeight: "35px"
    letterSpacing: "0"
  title:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "22px"
    letterSpacing: "0"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0"
  label:
    fontFamily: "Public Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "normal"
    letterSpacing: "0"
rounded:
  card: "12px"
  button: "20px"
  chip: "10px"
  icon: "25px"
  shell: "15px"
  field: "6px"
spacing:
  gutter: "20px"
  card: "24px"
  section: "64px"
  margin-compact: "20px"
  margin-lg: "60px"
  margin-xl: "120px"
  hit: "44px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.on-signal}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 50px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue-hover}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.button}"
    height: "44px"
  button-primary-pressed:
    backgroundColor: "{colors.signal-blue-pressed}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.button}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.signal-wash}"
    textColor: "{colors.signal-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 30px"
    height: "44px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.signal-blue}"
    typography: "{typography.label}"
    padding: "0"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.campus-ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.ink-quiet}"
    rounded: "{rounded.chip}"
    padding: "10px"
    height: "30px"
  chip-filter-selected:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.on-signal}"
    rounded: "{rounded.chip}"
    padding: "10px"
    height: "30px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.campus-ink}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
    height: "36px"
  nav:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.campus-ink}"
    typography: "{typography.body}"
    height: "64px"
---

# Design System: MDC Learning

## Overview

**Creative North Star: "The Campus Catalog"**

The public site is a campus catalog. A program is a card on a strict grid, and a landing is a sequence of those modules. Type does the inviting: headlines are large, tightly leaded, and set with room around them. Color is measured. The page should feel like an editorial course listing, not a dashboard and not a campaign poster.

MDC Signal Blue carries buttons, links, and focus. Highlighter Yellow is not a general accent. It appears only on summer-camp surfaces. Everything else stays on paper white, soft grey, and Campus Ink. Cards rest on a short grey shadow and lift one step on hover. A blue shadow is emphasis, not the default.

This system is the public site under `.site-theme`. Caxton admin chrome keeps Lato and Archivo and stays outside it.

**Key Characteristics:**

- Cards are the catalog module: white, 12px corners, Elevation 1 at rest
- Headlines lock line-height to the font size; letter-spacing stays at 0
- Signal blue does the actions; yellow is reserved for summer camps
- Radii change with the job: 12px cards, 20px buttons, 10px chips, 25px icon frames
- Every control keeps a 44×44px hit area

## Colors

The palette is a college blue on white paper, with one gated yellow and a quiet grey ink.

### Primary

- **MDC Signal Blue** (`#005EAA`): Primary buttons, links, selected chips, focus rings. Enabled primary buttons run a left-to-right gradient from this blue to Gradient Blue (`#3470E8`); hover (`#00569B`) and pressed (`#004379`) drop the gradient and flatten. Disabled fills use Primary-100 (`#B0CDE5`).
- **Signal wash** (`rgba(0, 94, 170, 0.1)`): Enabled secondary buttons, light breadcrumb chips.

### Secondary

- **Highlighter Yellow** (`#FFD400`): Summer-camp surfaces only. Dark Grey on this yellow is the accessible pairing.

**The Summer Camp Rule.** Highlighter Yellow appears only on summer-camp surfaces. It is not a badge, button, link, or progress fill on any other program.

### Neutral

- **Paper** (`#FFFFFF`): Page and card fill.
- **Paper Soft** (`#FBFBFB`): Sticky-bar inner card (Light Grey-50).
- **Hairline** (`#E5E7EB`): Icon frames, sticky icon buttons, card borders.
- **Campus Ink** (`#232529`): Headings and body (Dark Grey-500). The CSS variable is `220 8% 15%`.
- **Quiet Ink** (`#666666`): Idle filter and breadcrumb labels.
- **Muted Text** (`#767676`): Captions and metadata (Light Grey-800). Do not fake this by fading the ink.

Supporting scales, not brand voices: Certificate Blue (`#9ACDFE`) on certificate and partner chips and the sticky-bar shell; Scholarship Green (`#25BF6C`) on scholarship assist chips; Error Red (`#EA1239`) for errors. Charts use Signal Blue, Yellow, Green, Error, and Violet, in that order. Platform status swatches (online green, away yellow, busy error, offline grey) stay in the status set; away-yellow is not a license to tint a program page.

**The Token Rule.** Components use semantic color tokens. Raw palette classes and hardcoded hex in class names are out.

## Typography

**Display / body font:** Plus Jakarta Sans (with sans-serif)
**Action label font:** Public Sans (with sans-serif)

**Character:** Headlines are editorial and tight, with the line-height locked to the size so a title reads as a block, not a paragraph. Body stays small and even. Action labels switch to Public Sans so a button does not pretend to be a headline. The loaded font files today are Plus Jakarta Sans only; Public Sans is the specified action face.

### Hierarchy

- **Display** (700, 45px / 45px from 679px; 35px / 35px below): Page title. Weight 300 is the light alternate at the same sizes.
- **Headline** (700, 35px / 35px from 679px; 30px / 30px below): Section title. Weight 300 is the light alternate.
- **Title** (700, 20px / 22px from 679px; 18px / 20px below): Card and subsection titles. H4 uses 500 at the same sizes, or 700 for the bold alternate.
- **Body** (400, 16px / 20px): Reading text. Small body is 14px / 18px. Semibold is 600. Keep lines in a comfortable measure on the 12-column grid.
- **Label** (Public Sans 400, 14px, letter-spacing 0): Button labels. Tertiary text buttons use Public Sans Bold 14. Assist chips use Medium 13; partner chips use Medium 16.

Links are 16px / 18px, weight 400 or 600, in Signal Blue.

**The Locked Leading Rule.** Display and headline line-height equal the font size. Letter-spacing stays at 0.

**The Two Faces Rule.** Plus Jakarta Sans sets the page. Public Sans sets action labels.

## Layout

The grid is the Figma media query, not a generic 12-column web grid. From 332px: 4 columns, 20px gutter, 20px page margin. From 679px: 8 columns, same gutter and margin. From 1132px: 12 columns, 20px gutter, 60px margin. From 1468px: 12 columns, 20px gutter, 120px margin. Horizontal padding uses the page shell.

Rhythm is a 4px step. Sections sit about 64px apart. Cards pad 24px. Grid gaps match the 20px gutter. The catalog is dense in the cards and open in the margins: type can be large because the page edge moves outward on desktop.

**The Opening Margin Rule.** Gutters stay 20px. Page margin stays 20px through tablet, then 60px at 1132px and 120px at 1468px.

## Elevation & Depth

Depth is a short grey lift, plus one blue emphasis shadow. Surfaces are not flat and they are not floating. Cards, framed icons, and chip rows rest on Elevation 1. Hover on a card, and the sticky bar shell, use Elevation 2. The blue shadow is for emphasis only. Menus use a separate, slightly longer grey shadow.

### Shadow Vocabulary

- **Elevation 1** (`box-shadow: 0 2px 2px 0 #E5E7EB80`): Cards at rest, framed icons, chip-row shells.
- **Elevation 2** (`box-shadow: 0 4px 4px 0 #E5E7EB80`): Card hover, sticky bar shell.
- **Elevation Blue** (`box-shadow: 0 6px 10px 0 #005EAA4D`): Emphasis only, not the default card.
- **Submenu** (`box-shadow: 0 4px 8px 0 #9D9D9D`): Submenus.

**The Short Shadow Rule.** Cards rest on Elevation 1. Hover and the sticky bar use Elevation 2. The blue shadow is for emphasis only.

## Shapes

Corners follow the job. Cards are gently rounded (12px). Buttons are softer pills (20px) at every size. Chips are tighter (10px). Framed icons are squircle-like (25px). The sticky bar shell is 15px, and its inner card is 10px. Fields use a small radius (6px). Nothing is sharp, and nothing shares one radius.

Borders are 1px hairlines, except partner chips at 0.5px in Certificate Blue. Framed icons and the sticky shell also use a 5px backdrop blur.

**The Role Radius Rule.** Radius follows the component. Cards 12px, buttons 20px, chips 10px, framed icons 25px, sticky shell 15px.

## Components

Buttons are confident and pill-shaped. Cards are quiet catalog tiles. Chips are filters, not decorations. Type stays in charge; chrome stays light.

### Buttons

- **Shape:** Pill corners (20px) at every size. Painted heights are 36px (lg, md) and 30px (sm). The hit area is always at least 44×44px; grow it with min size, not by scaling the label.
- **Primary:** Enabled fill is a left-to-right gradient, Signal Blue to Gradient Blue, white Public Sans 14. Padding is 10px × 50px (lg), 10px × 30px (md), or 10px × 15px (sm).
- **Hover / Focus:** Hover and pressed drop the gradient: hover `#00569B`, pressed `#004379`, white label. Focus uses the signal-blue ring. Disabled fill is `#B0CDE5` with a white label. Motion is 150ms ease-out.
- **Secondary:** 1px Signal Blue border. Enabled fill is the signal wash; hover and pressed drop the fill. Pressed border and label step down to `#004379`. Disabled uses a pale wash, `#B0CDE5` border, `#8AB5D8` label. Dark-mode secondary uses white at 10% fill, white border, white label; hover drops the fill.
- **Tertiary:** No fill or border. Public Sans Bold 14 in Signal Blue. Optional trailing chevron with a 10px gap.
- **Header icon button:** Glyph about 20px, 5px padding, no chrome. Hit area still 44×44px.

**The 44 Rule.** Every button, including icon, header, and sticky-bar actions, has a minimum hit area of 44×44px.

### Chips

- **Filter:** 30px tall, 10px padding, 10px radius. Idle is Quiet Ink with no chrome. Hover adds a 1px Signal Blue border. Selected fills Signal Blue with a white label. Disabled is grey at 30% opacity with a `#C4C4C4` label.
- **Chip row:** A soft grey shell (padding 5px, gap 15px, 15px radius, Elevation 1, 5px blur) holding filter chips. One chip is selected; the others stay idle.
- **Breadcrumb:** Same size as a filter chip, with a 1px border. Light mode matches the secondary button wash. Selected adds a dismiss icon.
- **Assist:** Public Sans Medium 13, padding 10×6, 10px radius. Scholarship is green with white type. Technologies is Signal Blue with white type. Certificate is Certificate Blue with a Signal Blue label. Information is white with an inset hairline shadow and a Signal Blue label.
- **Partner:** Public Sans Medium 16, padding 14×10, Certificate Blue at 20% fill, 0.5px Certificate Blue border, Signal Blue label.

### Cards / Containers

- **Corner style:** Gently rounded (12px).
- **Background:** Paper white, Campus Ink text.
- **Shadow strategy:** Elevation 1 at rest, Elevation 2 on hover. See Elevation & Depth.
- **Border:** Hairline when a stroke is needed; the shadow is the usual edge.
- **Internal padding:** 24px.

### Inputs / Fields

- **Style:** Paper fill, 1px input border, 6px radius, about 36px tall, padding 8px × 12px. Placeholder is muted text.
- **Focus:** Signal Blue ring, 2px, with a small offset.
- **Error / Disabled:** Error text uses Error Red. Disabled fields lose the pointer and fade; do not fade reading text to look secondary.
- **Form icon:** A framed tile, 34×34, 25px radius, white fill, 1px hairline, Elevation 1, 5px blur, 14px glyph.

### Navigation

Fixed white bar, 64px tall, hairline along the bottom. Logo on the left, primary links in the center, account on the right. Links use body size; the active link is Signal Blue. Header icons (cart, search, menu, close) are bare glyphs about 17–23px, with a 44×44px hit area.

### Sticky bar

A frosted call bar. The shell is Certificate Blue at 30% opacity, 15px radius, 5px padding, 5px blur, Elevation 2. The inner card is Paper Soft, 0.5px hairline, 10px radius, 5px blur. The label is Plus Jakarta Sans SemiBold in near-black (`#222222`). Large size uses 16/20 type and 40×43 icon buttons at 15px radius. Small size uses 14/18 type and icon buttons at 25px radius. Icon buttons are white with a 1px hairline. Their hit area is still 44×44px.

### Framed icons

White tile, 1px hairline, Elevation 1, 5px blur on card and form icons. Card style 1 is 60×55 with a ~23px glyph. Card style 2 is 80×70 with a larger glyph. Both use a 25px radius. Inline icons (star, clock, calendar) have no frame and switch stroke between light and dark. Header icons have no frame.

## Do's and Don'ts

### Do:

- **Do** treat a landing as a sequence of catalog cards on the 4 / 8 / 12 grid.
- **Do** use semantic color tokens for every fill, border, and text color.
- **Do** keep Highlighter Yellow on summer-camp surfaces only.
- **Do** set page type in Plus Jakarta Sans and action labels in Public Sans.
- **Do** give every button a 44×44px hit area, even when the painted box is shorter.
- **Do** rest cards on Elevation 1 and lift them to Elevation 2 on hover.

### Don't:

- **Don't** use Tailwind palette classes or hex colors in class names.
- **Don't** use Highlighter Yellow for badges, buttons, links, or progress on non-camp programs.
- **Don't** apply this system to Caxton admin chrome. Admin keeps Lato and Archivo.
- **Don't** fade text with opacity. Use muted text for secondary copy.
- **Don't** leave the primary-button gradient on hover or pressed. Those states are flat.
- **Don't** share one corner radius across cards, buttons, chips, and icon frames.
