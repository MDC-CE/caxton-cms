/**
 * TextBlock Component Schemas - v1.0
 *
 * A standalone block of formatted copy with an optional eyebrow, heading, and rich text body.
 */
import { z } from "zod";

export const textBlockSectionSchema = z.object({
  type: z.literal("text_block"),
  version: z.string().optional(),
  eyebrow: z.string().optional(),
  heading: z.string().optional(),
  body: z.string(),
  alignment: z.enum(["left", "center", "right"]).optional().default("left"),
  max_width: z.enum(["narrow", "default", "wide"]).optional().default("default"),
});

export type TextBlockSection = z.infer<typeof textBlockSectionSchema>;
