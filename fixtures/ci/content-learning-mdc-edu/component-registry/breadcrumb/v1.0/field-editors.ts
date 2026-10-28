/**
 * Field Editor Configuration for Breadcrumb Component
 *
 * Defines which fields in this component should use special editors
 * in the Props tab of the section editor panel.
 *
 * EditorType options: "icon-picker" | "color-picker" | "image-picker" | "link-picker" | "variant-picker" | "rich-text-editor"
 */

export type EditorType = string;

export const fieldEditors: Record<string, EditorType> = {
  "items[].url": "link-picker",
};
