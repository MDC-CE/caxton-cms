/**
 * Field Editor Configuration for NumberedSteps Component
 *
 * Defines which fields in this component should use special editors
 * in the Props tab of the section editor panel.
 */

export type EditorType = string;

export const fieldEditors: Record<string, EditorType> = {
  "cta_button.text": "text-input",
  "cta_button.url": "link-picker",
  "cta_button.variant": "string-picker:primary,secondary,outline",
  "cta_button.icon": "icon-picker",
  "horizontalStepper:cta.url": "link-picker",
  "horizontalStepper:button_style": "string-picker:solid,outline,ghost",
  "photoTimeline:image_id": "image-picker",
  "photoTimeline:photos[].image_id": "image-picker",
  "photoTimeline:cta.url": "link-picker",
  "photoTimeline:frame": "string-picker:none,line,glow",
  "photoTimeline:radius": "string-picker:none,sm,md,lg,full",
  "photoTimeline:button_style": "string-picker:solid,outline,ghost",
  "photoTimeline:steps[].icon": "icon-picker",
  "stickyCards:steps[].image_id": "image-picker",
  "stickyCards:steps[].link.text": "text-input",
  "stickyCards:steps[].link.url": "link-picker",
  "stickyCards:steps[].link.button_style": "string-picker:solid,outline,ghost",
  "stickyCards:cta.url": "link-picker",
  "stickyCards:cta.text": "text-input",
  "stickyCards:cta.variant": "string-picker:primary,secondary,outline",
  "stickyCards:button_style": "string-picker:solid,outline,ghost",
};
