/**
 * Field Editor Registry - Type Definitions
 * 
 * Field editor configurations are now managed in the component registry:
 * 4geeks-com/component-registry/{component}/v{x.y}/field-editors.ts
 * 
 * The server aggregates all field-editors.ts files and serves them via:
 * GET /api/component-registry/field-editors
 * 
 * This file only exports the EditorType for use in components.
 * 
 * Editor types can include parameters using colon notation:
 * - "icon-picker" - Icon picker
 * - "color-picker" - Color picker (defaults to accent colors)
 * - "color-picker:background" - Color picker with background colors
 * - "color-picker:accent" - Color picker with accent colors
 * - "color-picker:text" - Color picker with text colors
 * - "image-picker" - Image picker
 * - "video-picker" - Video picker (browse media gallery, upload, or paste URL)
 * - "link-picker" - Link picker
 * - "plain-text" - Single-line text. Optional hint after the colon is shown under the field.
 */

export type EditorType = string;

export type ColorPickerVariant = "background" | "accent" | "text";

export function parseEditorType(editorType: string): { 
  type: string; 
  variant?: string;
} {
  const parts = editorType.split(":");
  return {
    type: parts[0],
    variant: parts[1],
  };
}
