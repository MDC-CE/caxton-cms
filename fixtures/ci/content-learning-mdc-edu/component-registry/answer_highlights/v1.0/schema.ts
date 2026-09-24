/**
 * AnswerHighlights — static editorial callouts for what the career portal answers.
 */
import { z } from "zod";

export const answerHighlightItemSchema = z.object({
  icon: z.string().optional().describe("Icon name (e.g. IconBriefcase)"),
  title: z.string().describe("Highlight title"),
  description: z.string().describe("Short supporting line"),
});

export const answerHighlightsSectionSchema = z.object({
  type: z.literal("answer_highlights"),
  version: z.string().optional(),
  variant: z.enum(["default"]).optional(),
  heading: z.string().optional().describe("Optional section heading"),
  background: z.string().optional().describe("Section background token / Tailwind class"),
  items: z
    .array(answerHighlightItemSchema)
    .min(1)
    .max(6)
    .describe("Editorial highlight cards (typically 3–4)"),
});

export type AnswerHighlightItem = z.infer<typeof answerHighlightItemSchema>;
export type AnswerHighlightsSection = z.infer<typeof answerHighlightsSectionSchema>;
