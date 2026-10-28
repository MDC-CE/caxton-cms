export type EditorType =
  | "color-picker:background"
  | "color-picker:accent"
  | "color-picker:text"
  | "image-with-style-picker"
  | "image-picker"
  | "video-picker"
  | "cta-picker"
  | "link-picker"
  | "boolean-toggle"
  | "form-settings"
  | "text-input"
  | "string-picker:none,line,glow"
  | "string-picker:none,sm,md,lg,full"
  | "string-picker:solid,outline,ghost";

export const fieldEditors: Record<string, EditorType> = {
  background: "color-picker:background",
  eyebrow: "text-input",
  title: "text-input",
  lead: "text-input",
  photo_frame: "string-picker:none,line,glow",
  photo_frame_color: "color-picker:accent",
  photo_radius: "string-picker:none,sm,md,lg,full",
  button_style: "string-picker:solid,outline,ghost",
  "photos[].image_id": "image-with-style-picker",
  "photos[].hover_image_id": "image-picker",
  "photos[].video_id": "image-picker",
  "photos[].alt": "text-input",
  "photos[].url": "link-picker",
  "buttons[]": "cta-picker",
  "buttons[].opens_form": "boolean-toggle",
  "buttons[].button_variant": "color-picker:accent",
  "buttons[].text_color": "color-picker:text",
  form: "form-settings",
  "centered:eyebrow": "text-input",
  "centered:title": "text-input",
  "centered:lead": "text-input",
  "centered:photos[].image_id": "image-with-style-picker",
  "centered:photos[].alt": "text-input",
  "centered:photo_frame": "string-picker:none,line,glow",
  "centered:photo_frame_color": "color-picker:accent",
  "centered:photo_radius": "string-picker:none,sm,md,lg,full",
  "centered:buttons[]": "cta-picker",
  "centered:button_style": "string-picker:solid,outline,ghost",
};
