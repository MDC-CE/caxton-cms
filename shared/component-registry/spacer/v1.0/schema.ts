/**
 * Spacer Component Schemas - v1.0
 *
 * An empty section that only adds vertical space between its neighbors.
 */
import { z } from "zod";

export const spacerSizeSchema = z.enum(["sm", "md", "lg", "xl"]);

export const spacerSectionSchema = z.object({
  type: z.literal("spacer"),
  version: z.string().optional(),
  size: spacerSizeSchema
    .optional()
    .default("md")
    .describe("Height of the space: sm (16px), md (32px, default), lg (64px), xl (96px)."),
  mobile_size: spacerSizeSchema
    .optional()
    .describe("Height below 768px. Omit to use size on every screen."),
});

export type SpacerSize = z.infer<typeof spacerSizeSchema>;
export type SpacerSection = z.infer<typeof spacerSectionSchema>;
