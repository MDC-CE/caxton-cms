/**
 * Field Editor Configuration for Spacer Component
 */

export type EditorType = string;

export const fieldEditors: Record<string, EditorType> = {
  size: "string-picker:sm,md,lg,xl",
  mobile_size: "string-picker:sm,md,lg,xl",
};
