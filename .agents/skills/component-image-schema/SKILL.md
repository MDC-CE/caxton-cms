---
name: component-image-schema
description: How to add image fields to YML-driven section components in this codebase. Use this skill whenever you need to add, change, or understand image props in any component — including the schema.ts definition, field-editors.ts registration, and the YML data shape. Also activate when adding a laptop mockup image, background image, or an array of images to a section component. Essential reference for anyone doing the laptop/device image work in features_quad or similar components.
---

# Component Image Schema

This skill covers every decision you need to make when adding an image field to a YML-driven section component: which schema to use, how to configure the field editor, what the YML data looks like, and special rules for background images and image arrays.

---

## The Three Image Schemas

All base schemas live in `shared/component-registry/_common/schema.ts`. Site packages import them through `site_<name>/component-registry/_common/schema.ts`, which only re-exports the shared file.

### 1. `imageSchema` — Simple inline image (recommended default)

```ts
export const imageSchema = z.object({
  src: z.string(),
  alt: z.string(),
});
```

**Use when:**
- The image is a decorative or illustrative element (hero right column, product photo, laptop mockup).
- The editor just needs to pick a source and write alt text.
- Object positioning is not critical.

**YML data shape:**
```yaml
image:
  src: "https://storage.googleapis.com/..."
  alt: "Student working on a laptop"
```

**Field editor:**
```ts
"image": "image-with-style-picker"   // or "image-picker" for src-only
```

> **Laptop mockup rule:** For a laptop/device image that sits decoratively beside content, `imageSchema` (or the registry variant below) is the right choice. The src points to the laptop screenshot or device mockup; alt should describe what is on screen.

---

### 2. `imageWithStyleSchema` — Image with CSS control

```ts
export const imageWithStyleSchema = z.object({
  src: z.string(),
  alt: z.string().optional(),
  object_fit: z.enum(["cover", "contain", "fill", "none", "scale-down"]).optional(),
  object_position: z.string().optional(), // e.g., "center top", "50% 20%"
  width: z.string().optional(),
  height: z.string().optional(),
  max_width: z.string().optional(),
  max_height: z.string().optional(),
  border_radius: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  filter: z.string().optional(),
});
```

**Use when:**
- The image fills a container and editors need to control `object-fit` / `object-position`.
- The image needs precise sizing control that varies per page.
- Editors need to adjust opacity or apply CSS filters.

**Field editor:**
```ts
"image": "image-with-style-picker"
```

**YML data shape:**
```yaml
image:
  src: "https://storage.googleapis.com/..."
  alt: "Code editor on a MacBook"
  object_fit: "contain"
  object_position: "center top"
```

---

### 3. Registry-based image (`image_id`) — **Recommended for laptop / device mockups**

When the image should come from the internal image registry (supports srcset, responsive variants, and focal point), use a registry reference instead of a raw `src`. This is what `features_quad` does for its images.

**Schema pattern in component `schema.ts`:**
```ts
export const laptopImageSchema = z.object({
  image_id: z.string().describe("Image ID from the image registry"),
  alt: z.string().optional().describe("Override alt text"),
});
```

**Field editor:**
```ts
"laptop_image.image_id": "image-with-style-picker"
// for arrays:
"images[].image_id": "image-with-style-picker"
// for logos:
"logo.image_id": "image-picker:logo"
```

**YML data shape:**
```yaml
laptop_image:
  image_id: "feliz-empresario-laptop"
  alt: "Student working on AI course"
```

**When to use:** Any image processed through the media gallery (registered in `site_<name>/image-registry.json`, usually served from GCS), that benefits from responsive srcset, or needs focal-point control. For the laptop mockup in `features_quad`, this is the correct approach.

---

## Background Images — Special Considerations

Background images are applied with CSS (`background-image`) rather than as `<img>` tags.

### Schema in `schema.ts`

```ts
background_image: z.object({
  src: z.string(),
  position: z.string().optional().default("center center"),
  size: z.enum(["cover", "contain", "auto"]).optional().default("cover"),
  overlay_opacity: z.number().min(0).max(1).optional(),
}).optional(),
```

### Field editor for background image

```ts
"background_image.src": "image-picker"
// or if you want full style control:
"background_image": "image-with-style-picker"
```

### YML data shape

```yaml
background_image:
  src: "https://storage.googleapis.com/..."
  position: "center top"
  size: "cover"
  overlay_opacity: 0.4
```

### Rendering pattern (TSX)

```tsx
<section
  style={{
    backgroundImage: `url(${props.background_image.src})`,
    backgroundPosition: props.background_image.position ?? "center center",
    backgroundSize: props.background_image.size ?? "cover",
  }}
  className="relative"
>
  {props.background_image.overlay_opacity && (
    <div
      className="absolute inset-0"
      style={{ background: `rgba(0,0,0,${props.background_image.overlay_opacity})` }}
    />
  )}
  <div className="relative z-10">{/* content */}</div>
</section>
```

> Always include an overlay when text appears over a background image. This matches the universal design guideline for hero image washes.

---

## Arrays of Images

### Schema (`schema.ts`)

Registry-based (preferred):
```ts
export const myImageItemSchema = z.object({
  image_id: z.string().describe("Image ID from the image registry"),
  alt: z.string().optional(),
});

images: z.array(myImageItemSchema).optional().describe("Up to N images"),
```

Raw src (simpler, no registry dependency):
```ts
images: z.array(z.object({
  src: z.string(),
  alt: z.string(),
})).optional(),
```

### Field editor for arrays

Use `[]` bracket notation:
```ts
"images[].image_id": "image-with-style-picker",
"images[].src": "image-picker",
```

### YML data shape

```yaml
images:
  - image_id: "laptop-front-view"
    alt: "Laptop showing the AI dashboard"
  - image_id: "laptop-side-view"
    alt: "Laptop from a side angle"
```

---

## Choosing the Right Editor Type

| Scenario | `field-editors.ts` value |
|---|---|
| Basic image pick (src only) | `"image-picker"` |
| Logo / small icon image | `"image-picker:logo"` |
| Image with object-fit/position control | `"image-with-style-picker"` |
| Registry image (with srcset) | `"image-with-style-picker"` |
| Background image src only | `"image-picker"` |

---

## Complete Example — Laptop Image Field

Recommended pattern for adding a laptop/device image to a section component:

### `schema.ts`
```ts
import { z } from "zod";

export const laptopImageSchema = z.object({
  image_id: z.string().describe("Image ID from the image registry — use the laptop mockup image"),
  alt: z.string().optional().describe("What is visible on the laptop screen"),
});

export const mySectionSchema = z.object({
  type: z.literal("my_section"),
  version: z.string().optional(),
  heading: z.string(),
  laptop_image: laptopImageSchema.optional().describe("Laptop mockup image displayed beside the content"),
});
```

### `field-editors.ts`
```ts
export type EditorType = "icon-picker" | "color-picker" | "image-picker" | "image-with-style-picker" | "link-picker";

export const fieldEditors: Record<string, EditorType> = {
  "laptop_image.image_id": "image-with-style-picker",
};
```

### YML instance data
```yaml
type: my_section
version: "1.0"
heading: "Learn AI Engineering"
laptop_image:
  image_id: "feliz-empresario-laptop"
  alt: "AI course running in a code editor on a laptop"
```

---

## Relevant Files

- `shared/component-registry/_common/schema.ts` (source of truth for the image schemas)
- `site_4geeks-com/component-registry/_common/schema.ts` (re-export for site packages)
- `site_4geeks-com/component-registry/features_quad/v1.0/schema.ts`
- `site_4geeks-com/component-registry/features_quad/v1.0/field-editors.ts`
- `shared/component-registry/hero/v1.0/field-editors.ts`
- `site_4geeks-com/component-registry/two_column_accordion_card/v1.0/field-editors.ts`
- `site_4geeks-com/component-registry/two_column_accordion_card/v1.0/schema.ts`
