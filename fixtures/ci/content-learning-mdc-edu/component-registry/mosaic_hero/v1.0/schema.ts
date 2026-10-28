import { z } from "zod";

export const mosaicHeroPhotoSchema = z.object({
  image_id: z.string().optional(),
  image_alt: z.string().optional(),
});

export const mosaicHeroSectionSchema = z.object({
  type: z.literal("mosaic_hero"),
  version: z.string().optional(),
  title: z.string().optional(),
});

export type MosaicHeroPhoto = z.infer<typeof mosaicHeroPhotoSchema>;
export type MosaicHeroSection = z.infer<typeof mosaicHeroSectionSchema>;
export type MosaicHeroDefault = MosaicHeroSection;
export type MosaicHeroCentered = MosaicHeroSection;
