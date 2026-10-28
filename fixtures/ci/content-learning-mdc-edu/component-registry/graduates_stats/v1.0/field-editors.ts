/**
 * Field Editor Configuration for GraduatesStats Component
 *
 * Defines which fields in this component should use special editors
 * in the Props tab of the section editor panel.
 *
 * EditorType options: "font-size-picker" | "image-with-style-picker" | "rich-text-editor"
 *
 * Pattern for array image fields:
 *   "arrayName[].fieldName": "image-with-style-picker"
 *
 * The image-with-style-picker editor reads and writes:
 *   - image_id      — registry ID of the selected image
 *   - object_position — CSS object-position (e.g. "center top")
 *   - object_scale  — CSS transform scale factor (e.g. 1.2)
 *   - transform_origin — CSS transform-origin (e.g. "50% 0%")
 *
 * Asymmetric variant (tall_image, stacked_images) uses plain string IDs
 * and cannot carry sibling positioning fields without a breaking schema
 * change — those fields are intentionally excluded here.
 */

export type EditorType =
  | "font-size-picker"
  | "image-with-style-picker"
  | "rich-text-editor"
  | "boolean-toggle"
  | "color-picker:background"
  | "color-picker:accent"
  | "string-picker:none,line,glow"
  | "string-picker:none,sm,md,lg,full";

export const fieldEditors: Record<string, EditorType> = {
  heading: "rich-text-editor",
  background: "color-picker:background",
  value_size: "font-size-picker",
  "photo.image_id": "image-with-style-picker",
  "photo.inset_image_id": "image-with-style-picker",
  "photo.frame": "string-picker:none,line,glow",
  "photo.frame_color": "color-picker:accent",
  "photo.radius": "string-picker:none,sm,md,lg,full",
  "collage_images[].image_id": "image-with-style-picker",
  "featured_images[].image_id": "image-with-style-picker",
  "quoteCard:photo.image_id": "image-with-style-picker",
  "quoteCard:photo.frame": "string-picker:none,line,glow",
  "quoteCard:photo.frame_color": "color-picker:accent",
  "tiles:stats[].highlight": "boolean-toggle",
};
