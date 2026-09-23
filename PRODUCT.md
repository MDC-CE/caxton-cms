# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The Caxton operator is the Miami Dade College Continuing Education product manager. They use the CMS to design public pages and components.

The visitor is someone evaluating or starting a continuing-education program on learning.mdc.edu. The Caxton admin is not the surface of this work.

## Product Purpose

The public Continuing Education website for Miami Dade College (learning.mdc.edu). The product manager assembles it in Caxton from YAML-defined sections. Success: a program landing, or a public onboarding flow, that a visitor understands and can start, built only from those components.

## Positioning

Caxton is not the page. The public page is a sequence of versioned components (YAML schema + React) that the product manager edits and the site renders. The same component is reused across landings. Admin chrome stays out: its design is already decided.

## Operating Context

- Site content lives in `site_learning-mdc-edu/` (YAML; content repo, not the app git repo).
- Platform components live in `shared/component-registry/`. Site-only components live in `site_learning-mdc-edu/component-registry/` (today: Answer Highlights, Career Tracks, Portal Teaser).
- Each public section is a `schema.yml` plus a React component. The product manager does not author the admin; they compose landings from those sections.
- Impeccable scope: YAML components and marketing landings on the public site. Not the `/private` UI.

## Capabilities and Constraints

- Marketing landings and public onboarding are designed as section components, not as one-off CMS screens.
- The public visual system is already set: `design_guidelines.md` and tokens in `site_learning-mdc-edu/theme.json` (Figma MDC). New components inherit those semantic tokens. No parallel identity.
- Still open: which surface is built first (a specific program landing, or onboarding), and what onboarding means on the public site (a student's first steps, not the product manager signing up in Caxton).

## Brand Commitments

- Public name: MDC Learning / Continuing Education, learning.mdc.edu.
- Binding public visual identity: primary blue `#005EAA`, yellow accent `#FFD400`, Plus Jakarta Sans on site components (`.site-theme`), Figma 4/8/12 grid, colors only through semantic tokens.
- Caxton admin (Lato / Archivo on `/private`) stays as it is.

## Evidence on Hand

- `design_guidelines.md` — public-site visual system.
- Component registries named above. This record has no prices, enrollment figures, testimonials, or outcome metrics; do not invent them.

## Product Principles

- The landing visitor decides; the product manager composes with YAML sections.
- A component shows the program or the onboarding step; it does not describe the CMS.
- Inherit the MDC system. Do not redesign the admin to dress a landing.
- Commercial claims (price, outcomes, seats) only from a real source. Demonstration material is labeled as such.
