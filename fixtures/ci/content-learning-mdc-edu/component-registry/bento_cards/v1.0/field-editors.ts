export type EditorType =
  | "icon-picker"
  | "image-picker"
  | "link-picker"
  | "text-input"
  | "string-picker:primary,secondary,outline"
  | "string-picker:none,line,glow"
  | "string-picker:none,sm,md,lg,full";

export const fieldEditors: Record<string, EditorType> = {
  "items[].icon": "icon-picker",
  "photoTiles:title": "text-input",
  "photoTiles:lead": "text-input",
  "photoTiles:eyebrow": "text-input",
  "photoTiles:cards[].image_id": "image-picker",
  "photoTiles:cards[].title": "text-input",
  "photoTiles:cards[].detail": "text-input",
  "photoTiles:cards[].pay": "text-input",
  "photoTiles:cards[].credential": "text-input",
  "photoTiles:cards[].prep": "text-input",
  "photoTiles:cards[].description": "text-input",
  "photoTiles:cards[].cta_text": "text-input",
  "photoTiles:cards[].url": "link-picker",
  "photoTiles:frame": "string-picker:none,line,glow",
  "photoTiles:radius": "string-picker:none,sm,md,lg,full",
  "expandingPhotos:cards[].image_id": "image-picker",
  "expandingPhotos:cards[].url": "link-picker",
  "expandingPhotos:frame": "string-picker:none,line,glow",
  "expandingPhotos:radius": "string-picker:none,sm,md,lg,full",
  "browserCards:cards[].image_id": "image-picker",
  "browserCards:cards[].button.url": "link-picker",
  "browserCards:cards[].button.text": "text-input",
  "browserCards:cards[].button.variant": "string-picker:primary,secondary,outline",
};
