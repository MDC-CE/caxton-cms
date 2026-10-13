/**
 * Listing Sort Validator
 *
 * `dynamic_entries.sort` is ascending unless prefixed with "-". For recency
 * fields that is almost never intended: a blog listing sorted by
 * `published_at` shows the oldest posts first. Other date fields (e.g.
 * `start_date` on upcoming events) are left alone because ascending is the
 * correct order there.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type {
  Validator,
  ValidatorResult,
  ValidationContext,
  ValidationIssue,
} from "../shared/types";
import { getDefaultContentFolder } from "../../../server/site-config";
import { LISTING_SORT_ISSUE_CODES } from "./listing-sort.issueCodes";

const RECENCY_FIELDS = new Set(["published_at", "created_at", "updated_at"]);

export function findOldestFirstListingSorts(
  data: unknown,
): Array<{ sectionIndex: number; sectionType: string; sort: string }> {
  if (!data || typeof data !== "object") return [];
  const sections = (data as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return [];

  const hits: Array<{ sectionIndex: number; sectionType: string; sort: string }> = [];
  sections.forEach((sec, idx) => {
    if (!sec || typeof sec !== "object") return;
    const rec = sec as Record<string, unknown>;
    const de = rec.dynamic_entries;
    if (!de || typeof de !== "object") return;
    const sort = (de as Record<string, unknown>).sort;
    if (typeof sort !== "string") return;
    const field = sort.trim();
    if (RECENCY_FIELDS.has(field)) {
      hits.push({
        sectionIndex: idx,
        sectionType: typeof rec.type === "string" ? rec.type : "unknown",
        sort: field,
      });
    }
  });
  return hits;
}

function checkFile(filePath: string, warnings: ValidationIssue[]): void {
  let parsed: unknown;
  try {
    parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return;
  }
  for (const hit of findOldestFirstListingSorts(parsed)) {
    warnings.push({
      type: "warning",
      code: "LISTING_SORT_OLDEST_FIRST",
      message: `Section [${hit.sectionIndex}] "${hit.sectionType}" sorts by "${hit.sort}" ascending, so the oldest entries show first`,
      file: filePath,
      suggestion: `Use sort: "-${hit.sort}" to show the newest entries first.`,
    });
  }
}

export const listingSortValidator: Validator = {
  name: "listing-sort",
  issueCodes: LISTING_SORT_ISSUE_CODES,
  description: "Flags listings sorted oldest-first by published_at / created_at / updated_at",
  apiExposed: true,
  estimatedDuration: "fast",
  category: "components",

  async run(context: ValidationContext): Promise<ValidatorResult> {
    const startTime = Date.now();
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    for (const file of context.contentFiles) {
      if (fs.existsSync(file.filePath)) checkFile(file.filePath, warnings);
    }

    const contentRoot = context.contentRoot || path.join(process.cwd(), getDefaultContentFolder());
    try {
      for (const d of fs.readdirSync(contentRoot, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        for (const name of ["template.en.yml", "template.es.yml", "_common.template.yml"]) {
          const fp = path.join(contentRoot, d.name, name);
          if (fs.existsSync(fp)) checkFile(fp, warnings);
        }
      }
    } catch {
      /* skip */
    }

    return {
      name: this.name,
      description: this.description,
      status: warnings.length > 0 ? "warning" : "passed",
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  },
};
