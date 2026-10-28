export type EditorType =
  | "icon-picker"
  | "color-picker"
  | "color-picker:background"
  | "image-picker"
  | "image-with-style-picker"
  | "link-picker"
  | "string-picker:none,line,glow"
  | "string-picker:none,sm,md,lg,full"
  | "string-picker:thumb,none"
  | "string-picker:solid,outline,ghost";

export const fieldEditors: Record<string, EditorType> = {
  background: "color-picker:background",
  "tabs[].image_id": "image-with-style-picker",
  "tabs[].programs[].image_id": "image-with-style-picker",
  "profileList:tabs[].icon": "icon-picker",
  "profileList:tabs[].image_id": "image-with-style-picker",
  "profileList:tabs[].programs[].url": "link-picker",
  "profileList:tabs[].more_url": "link-picker",
  "profileList:frame": "string-picker:none,line,glow",
  "profileList:frame_color": "color-picker",
  "profileList:radius": "string-picker:none,sm,md,lg,full",
  "profileList:media": "string-picker:thumb,none",
  "profileList:button_style": "string-picker:solid,outline,ghost",
};
