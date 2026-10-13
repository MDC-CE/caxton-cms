/**
 * Parsed YAML trees keyed by content hash. Callers mutate the result, so every
 * read returns a clone. The library stays js-yaml.
 */

import crypto from "crypto";
import yaml from "js-yaml";
import { escapeTemplateVars, unescapeObjectVars } from "@shared/templateVars";

const MAX_ENTRIES = 2000;
const parsed = new Map<string, unknown>();

function cloneParsed(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}

export function loadYamlWithTemplateVars(raw: string): unknown {
  const hash = crypto.createHash("sha1").update(raw).digest("hex");
  const hit = parsed.get(hash);
  if (hit !== undefined || parsed.has(hash)) {
    parsed.delete(hash);
    parsed.set(hash, hit);
    return cloneParsed(hit);
  }

  const { escaped, map } = escapeTemplateVars(raw);
  const loaded = yaml.load(escaped);
  const value = unescapeObjectVars(loaded, map);
  parsed.set(hash, value);
  while (parsed.size > MAX_ENTRIES) {
    const oldest = parsed.keys().next().value;
    if (oldest === undefined) break;
    parsed.delete(oldest);
  }
  return cloneParsed(value);
}

export function resetYamlParseCacheForTests(): void {
  parsed.clear();
}
