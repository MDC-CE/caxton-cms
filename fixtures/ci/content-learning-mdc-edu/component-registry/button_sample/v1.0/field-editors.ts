/**
 * Props controls for the button sample section.
 */

export type EditorType = string;

export const fieldEditors: Record<string, EditorType> = {
  title: "text-input",
  button_text: "text-input",
  button_url: "link-picker",
  button_style: "string-picker:filled,outline",
};
