/**
 * PortalTeaser — “coming soon” panel for quizzes, guides, and future tools.
 */
import { z } from "zod";
import { ctaButtonSchema } from "../../../../shared/component-registry/_common/schema";

export const portalTeaserSectionSchema = z.object({
  type: z.literal("portal_teaser"),
  version: z.string().optional(),
  variant: z.enum(["default"]).optional(),
  badge: z.string().optional().describe("Small label above the title (e.g. Coming soon)"),
  title: z.string().describe("Teaser heading"),
  body: z.string().describe("Supporting copy (plain or light markdown)"),
  cta: ctaButtonSchema.optional().describe("Optional CTA button"),
  background: z.string().optional().describe("Section background token / Tailwind class"),
});

export type PortalTeaserSection = z.infer<typeof portalTeaserSectionSchema>;
