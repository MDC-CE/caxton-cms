/**
 * Field Editor Configuration for HumanAndAIDuo Component
 *
 * Defines which fields in this component should use special editors
 * in the Props tab of the section editor panel.
 */

export type EditorType =
  | "icon-picker"
  | "color-picker"
  | "image-picker"
  | "image-with-style-picker"
  | "link-picker"
  | "rich-text-editor";

export const fieldEditors: Record<string, EditorType> = {
  description: "rich-text-editor",
  footer_description: "rich-text-editor",
  "bullet_groups[].description": "rich-text-editor",
  "images[].src": "image-with-style-picker",
};
