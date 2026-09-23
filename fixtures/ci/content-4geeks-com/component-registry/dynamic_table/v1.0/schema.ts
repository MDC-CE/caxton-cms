/**
 * Dynamic Table — listing over a private database / content type.
 * Rows come from resolveDynamicEntries → `items`. Keep layout/UI only.
 */
import { z } from "zod";

export const dynamicTableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "number", "date", "image", "link", "boolean"]),
});

export const dynamicTableActionSchema = z.object({
  label: z.string(),
  href: z.string(),
});

const permanentFilterSchema = z.object({
  item_property_slug: z.string(),
  value: z.unknown(),
});

const userFilterSchema = z.object({
  item_property_slug: z.string(),
  component_renderer: z.enum(["text-input", "dropdown", "tags"]),
  default_value: z.unknown().optional(),
  all_label: z.string().optional(),
  split_comma_values: z.boolean().optional(),
});

export const dynamicTableDynamicEntriesSchema = z.object({
  database: z.string().optional(),
  content_type: z.string().optional(),
  limit: z.number().optional(),
  sort: z.string().optional(),
  search: z.string().optional(),
  item_template: z.record(z.string(), z.unknown()).optional(),
  hardcoded_entries: z.array(z.record(z.string(), z.unknown())).optional(),
  permanent_filters: z.array(permanentFilterSchema).optional(),
  user_filters: z.array(userFilterSchema).optional(),
  ignored_entries: z.array(z.string()).optional(),
});

export const dynamicTableSectionSchema = z.object({
  type: z.literal("dynamic_table"),
  version: z.string().optional(),
  variant: z.enum(["default", "striped", "cards", "comparison"]).optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  background: z.string().optional(),
  columns: z.array(dynamicTableColumnSchema),
  action: dynamicTableActionSchema.optional(),
  max_rows: z.number().int().positive().optional(),
  /** Shown when resolved items is empty; section chrome stays visible. */
  empty_text: z.string().optional(),
  /** Runtime-resolved by resolveDynamicEntries. */
  items: z.array(z.record(z.string(), z.unknown())).optional(),
  dynamic_entries: dynamicTableDynamicEntriesSchema.optional(),
  _dynamic_meta: z
    .object({
      content_type: z.string().optional(),
      database: z.string().optional(),
      total: z.number().optional(),
      locale: z.string().optional(),
    })
    .optional(),
});

export type DynamicTableColumn = z.infer<typeof dynamicTableColumnSchema>;
export type DynamicTableAction = z.infer<typeof dynamicTableActionSchema>;
export type DynamicTableSection = z.infer<typeof dynamicTableSectionSchema>;
