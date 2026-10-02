/**
 * Surgical line edits for section-level `background:` keys in page YAML
 * (top-level `sections:` list) and registry examples (`yaml: |` block with a
 * section list). Nested `background` keys (cards, items, badges) and every
 * other byte of the file are left untouched.
 */
import yaml from "js-yaml";

export interface BackgroundLineChange {
  line: number;
  from: string;
  to: string;
}

/**
 * Calls `map(value)` for every section-level background; a returned string
 * replaces the value (written unquoted when it is a plain ID, quoted otherwise).
 */
export function rewriteSectionBackgroundLines(
  source: string,
  map: (value: string) => string | null | undefined,
): { text: string; changes: BackgroundLineChange[] } {
  const lines = source.split("\n");
  const changes: BackgroundLineChange[] = [];
  let inSections = false;
  let itemKeyIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (indent === 0 && (/^sections:\s*$/.test(trimmed) || /^yaml:\s*\|[-+]?\s*$/.test(trimmed))) {
      inSections = true;
      itemKeyIndent = -1;
      continue;
    }
    if (inSections && indent === 0 && !trimmed.startsWith("- ")) {
      inSections = false;
      continue;
    }
    if (!inSections) continue;

    const itemStart = /^(\s*)- (\S.*)?$/.exec(line);
    if (itemStart && (itemKeyIndent < 0 || itemStart[1].length + 2 === itemKeyIndent)) {
      itemKeyIndent = itemStart[1].length + 2;
    }
    if (itemKeyIndent < 0) continue;

    const m = /^(\s*)(- )?background:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const keyIndent = m[1].length + (m[2] ? 2 : 0);
    if (keyIndent !== itemKeyIndent) continue;
    let value: unknown;
    try {
      value = yaml.load(m[3]);
    } catch {
      continue;
    }
    if (typeof value !== "string" || !value) continue;
    const next = map(value);
    if (next == null || next === value) continue;
    const scalar = /^[a-z][a-z0-9-]*$/.test(next) ? next : JSON.stringify(next);
    lines[i] = `${m[1]}${m[2] ?? ""}background: ${scalar}`;
    changes.push({ line: i + 1, from: value, to: next });
  }
  return { text: lines.join("\n"), changes };
}
