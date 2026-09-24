/**
 * CareerTracks — visual grid of career pathway cards for the MDC learning portal.
 */
import { z } from "zod";
import { ctaButtonSchema } from "../../../../shared/component-registry/_common/schema";

export const careerTrackItemSchema = z.object({
  icon: z.string().optional().describe("Icon name (e.g. IconHeartbeat, IconCode)"),
  title: z.string().describe("Track title (e.g. Health and care)"),
  description: z.string().describe("Short blurb for the track"),
  cta: ctaButtonSchema.optional().describe("Optional link CTA for the card"),
});

export const careerTracksSectionSchema = z.object({
  type: z.literal("career_tracks"),
  version: z.string().optional(),
  variant: z.enum(["default"]).optional(),
  heading: z.string().describe("Section heading"),
  subheading: z.string().optional().describe("Optional supporting line under the heading"),
  background: z.string().optional().describe("Section background token / Tailwind class"),
  tracks: z.array(careerTrackItemSchema).min(1).describe("Career track cards"),
});

export type CareerTrackItem = z.infer<typeof careerTrackItemSchema>;
export type CareerTracksSection = z.infer<typeof careerTracksSectionSchema>;
