import { z } from "zod";

export const schemaOrgSectionSchema = z.object({
  type: z.literal("schema_org"),
  version: z.string().optional(),
  schema_type: z.string().min(1),
  properties: z.record(z.unknown()).default({}),
  section_id: z.string().optional(),
  paddingY: z.record(z.unknown()).optional(),
});

export type SchemaOrgSection = z.infer<typeof schemaOrgSectionSchema>;
