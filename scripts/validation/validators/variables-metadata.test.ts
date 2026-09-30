import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import { duplicateKey, unitMismatch, variablesMetadataValidator } from "./variables-metadata";
import { VARIABLES_METADATA_ISSUE_CODES } from "./variables-metadata.issueCodes";
import type { ValidationContext } from "../shared/types";
import { resetRegistry } from "../../../server/content-types";
import { resetVariableManagerCache } from "../../../server/variable-manager";
import { listCacheIssuesFromStore, ValidationCacheService } from "../../../server/services/validationCacheService";

function makeContext(contentRoot: string): ValidationContext {
  return {
    contentFiles: [],
    redirectMap: new Map(),
    availableSchemas: new Set(),
    sitemapEntries: [],
    contentRoot,
  };
}

describe("variablesMetadataValidator", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vars-meta-"));
    resetRegistry();
    resetVariableManagerCache();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    resetRegistry();
    resetVariableManagerCache();
  });

  function writeVars(vars: Record<string, unknown>) {
    fs.writeFileSync(path.join(tmp, "variables.yml"), yaml.dump(vars));
  }

  it("errors on missing description / category and skips reserved keys", async () => {
    writeVars({
      "global.no_desc": { category: "copy", default: "x" },
      "global.no_cat": { description: "Something", default: "x" },
      "global.ok": { description: "Fine", category: "contact", default: "+1" },
      "reserved.legal_terms_url": { default: "/terms" },
    });
    const r = await variablesMetadataValidator.run(makeContext(tmp));
    expect(r.status).toBe("failed");
    const codes = r.errors.map((e) => `${e.code}:${e.message}`);
    expect(codes.some((c) => c.startsWith("VARIABLE_MISSING_DESCRIPTION") && c.includes("global.no_desc"))).toBe(true);
    expect(codes.some((c) => c.startsWith("VARIABLE_MISSING_CATEGORY") && c.includes("global.no_cat"))).toBe(true);
    expect(codes.some((c) => c.includes("global.ok"))).toBe(false);
    expect(codes.some((c) => c.includes("legal_terms_url"))).toBe(false);
  });

  it("marks the missing-metadata codes coding_agent_only with handoff guidance", () => {
    for (const code of ["VARIABLE_MISSING_DESCRIPTION", "VARIABLE_MISSING_CATEGORY"]) {
      expect(VARIABLES_METADATA_ISSUE_CODES[code].coding_agent_only).toBe(true);
      expect(VARIABLES_METADATA_ISSUE_CODES[code].suggestion).toContain("list_proposals");
      expect(VARIABLES_METADATA_ISSUE_CODES[code].suggestion).toContain("kind: \"notes\"");
    }
  });

  it("warns on unit mismatch, broken replaced_by, near duplicates and deprecated in use", async () => {
    writeVars({
      "global.rate": { description: "Rate", category: "outcome_claim", unit: "percent", default: "84%" },
      "global.ai_fluency_price": { description: "Price", category: "price", default: "499" },
      "global.aifluency_price": { description: "Dup", category: "price", default: "499" },
      "global.ai.fluency.price": {
        description: "Old",
        category: "price",
        deprecated: true,
        replaced_by: "global.missing",
        default: "499",
      },
    });
    fs.mkdirSync(path.join(tmp, "pages", "home"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "pages", "home", "en.yml"), 'price: "{{ global.ai.fluency.price | 499 }}"\n');

    const r = await variablesMetadataValidator.run(makeContext(tmp));
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain("VARIABLE_UNIT_MISMATCH");
    expect(codes).toContain("VARIABLE_REPLACED_BY_BROKEN");
    expect(codes).toContain("VARIABLE_NEAR_DUPLICATE");
    expect(codes).toContain("VARIABLE_DEPRECATED_IN_USE");
    expect(r.errors).toHaveLength(0);
  });

  it("unitMismatch and duplicateKey helpers", () => {
    expect(unitMismatch("percent", "84")).toBeNull();
    expect(unitMismatch("percent", "84%")).toBe("contains %");
    expect(unitMismatch("usd", "$16,999")).toBe("contains a currency symbol");
    expect(unitMismatch("usd", "16,999")).toBeNull();
    expect(unitMismatch("url", "/apply")).toBeNull();
    expect(unitMismatch("count", "1,500+")).toBeNull();
    expect(unitMismatch("text", "anything")).toBeNull();
    expect(duplicateKey("global.ai.fluency.price")).toBe(duplicateKey("global.ai_fluency_price"));
  });

  it("claim over MCP is refused with issue_coding_agent_only", async () => {
    const cache = new ValidationCacheService(tmp);
    cache.applyValidatorResults(
      [
        {
          name: "variables-metadata",
          category: "integrity",
          errors: [
            {
              type: "error",
              code: "VARIABLE_MISSING_DESCRIPTION",
              message: 'Variable "global.x" has no description.',
              file: path.join(tmp, "variables.yml"),
            },
          ],
          warnings: [],
        },
      ],
      { contentFiles: [] },
    );
    const issue = listCacheIssuesFromStore(cache).issues.find((i) => i.code === "VARIABLE_MISSING_DESCRIPTION");
    expect(issue?.id).toBeTruthy();
    const refused = await cache.claimIssue(issue!.id, "mcp-agent");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe("issue_coding_agent_only");
  });
});
