/**
 * Fields the Props panel should show because they are saved on the section
 * but no dedicated control already edits them.
 */

const CHROME_KEYS = new Set([
  "type",
  "version",
  "variant",
  "background",
  "paddingY",
  "marginY",
  "showOn",
  "showOnLocations",
  "hidden_until_redirection",
  "section_id",
  "dynamic_entries",
  "binding",
]);

/** Editor types whose array UI already includes the other keys on each item. */
const GROUPED_ARRAY_EDITORS = new Set([
  "color-picker",
  "image-picker",
  "link-picker",
  "plain-text",
  "rich-text-editor",
  "variant-picker",
  "icon-picker",
  "string-picker",
  "boolean-toggle",
  "text-input",
]);

const IMAGE_KEYS = new Set([
  "image_id",
  "image",
  "src",
  "hover_image_id",
  "logo",
  "avatar",
  "video_id",
]);

const ICON_KEYS = new Set(["icon", "badge_icon", "bullet_icon"]);

const LINK_KEYS = new Set(["url", "cta_url", "href", "more_url", "link_url"]);

const LONG_TEXT_KEYS = new Set([
  "text",
  "description",
  "intro",
  "detail",
  "lead",
  "body",
  "content",
  "subtitle",
  "excerpt",
  "comment",
]);

export type ContentControl =
  | { kind: "text" | "longtext"; path: string; label: string; value: string }
  | { kind: "number"; path: string; label: string; value: number }
  | { kind: "boolean"; path: string; label: string; value: boolean }
  | { kind: "image"; path: string; label: string; value: string; alt: string }
  | { kind: "icon"; path: string; label: string; value: string }
  | { kind: "link"; path: string; label: string; value: string }
  | { kind: "array"; path: string; label: string; items: ContentArrayItem[] }
  | { kind: "group"; path: string; label: string; fields: ContentControl[] };

export interface ContentArrayItem {
  label: string;
  fields: ContentControl[];
}

function editorBase(raw: string): string {
  return raw.split(":")[0];
}

function humanLabel(path: string): string {
  const last = path.split(".").pop() || path;
  return last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function groupedArrayPaths(configured: Record<string, string>): Set<string> {
  const groups: Record<string, string[]> = {};
  for (const [path, raw] of Object.entries(configured)) {
    if (/^[\w]+\[\]\.[\w]+\[\]\./.test(path)) continue;
    const match = path.match(/^([\w.]+)\[\]\.([\w.]+)$/);
    if (!match) continue;
    const arr = match[1];
    if (!groups[arr]) groups[arr] = [];
    groups[arr].push(editorBase(raw));
  }
  const out = new Set<string>();
  for (const [arr, types] of Object.entries(groups)) {
    if (types.length >= 1 && types.every((t) => GROUPED_ARRAY_EDITORS.has(t))) {
      out.add(arr);
    }
  }
  return out;
}

function configuredItemKeys(arrayPath: string, configured: Record<string, string>): Set<string> {
  const prefix = `${arrayPath}[].`;
  const keys = new Set<string>();
  for (const path of Object.keys(configured)) {
    if (path.startsWith(prefix) && !path.slice(prefix.length).includes("[]")) {
      keys.add(path.slice(prefix.length));
    }
  }
  return keys;
}

function nestedArrayIsConfigured(
  arrayPath: string,
  childKey: string,
  configured: Record<string, string>,
): boolean {
  const needle = `${arrayPath}[].${childKey}[].`;
  return Object.keys(configured).some((path) => path.startsWith(needle));
}

function isDuplicatePhotoKey(key: string, source: Record<string, unknown>): boolean {
  if (key === "id" && ("image_id" in source || "src" in source)) return true;
  if (key === "alt" && "image_alt" in source) return true;
  return false;
}

function controlForLeaf(
  key: string,
  value: unknown,
  path: string,
  source: Record<string, unknown>,
): ContentControl | null {
  const label = humanLabel(key);
  if (typeof value === "boolean") {
    return { kind: "boolean", path, label, value };
  }
  if (typeof value === "number") {
    return { kind: "number", path, label, value };
  }
  if (typeof value !== "string") return null;
  if (IMAGE_KEYS.has(key)) {
    const alt = String(source.image_alt || source.alt || "");
    return { kind: "image", path, label, value, alt };
  }
  if (ICON_KEYS.has(key)) {
    return { kind: "icon", path, label, value };
  }
  if (LINK_KEYS.has(key)) {
    return { kind: "link", path, label, value };
  }
  if (LONG_TEXT_KEYS.has(key) || value.length > 80) {
    return { kind: "longtext", path, label, value };
  }
  return { kind: "text", path, label, value };
}

function itemLabel(item: Record<string, unknown>, index: number): string {
  const raw =
    item.title ||
    item.label ||
    item.name ||
    item.text ||
    item.image_alt ||
    item.alt ||
    "";
  const text = String(raw).trim();
  return text || `Item ${index + 1}`;
}

function walkObject(
  source: Record<string, unknown>,
  basePath: string,
  configured: Record<string, string>,
  grouped: Set<string>,
): ContentControl[] {
  const fields: ContentControl[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (!basePath && CHROME_KEYS.has(key)) continue;
    if (value == null) continue;
    const path = basePath ? `${basePath}.${key}` : key;
    if (path in configured) continue;

    if (Array.isArray(value)) {
      if (grouped.has(path)) continue;
      const items = walkArray(path, value, configured, grouped);
      if (items) fields.push(items);
      continue;
    }

    if (typeof value === "object") {
      const nested = walkObject(value as Record<string, unknown>, path, configured, grouped);
      if (nested.length) {
        fields.push({ kind: "group", path, label: humanLabel(key), fields: nested });
      }
      continue;
    }

    const leaf = controlForLeaf(key, value, path, source);
    if (leaf) fields.push(leaf);
  }
  return fields;
}

function walkArray(
  arrayPath: string,
  value: unknown[],
  configured: Record<string, string>,
  grouped: Set<string>,
): ContentControl | null {
  if (value.length === 0) {
    return { kind: "array", path: arrayPath, label: humanLabel(arrayPath), items: [] };
  }
  if (value.some((item) => item == null || typeof item !== "object" || Array.isArray(item))) {
    return null;
  }

  const owned = configuredItemKeys(arrayPath, configured);
  const items: ContentArrayItem[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const item = raw as Record<string, unknown>;
    const fields: ContentControl[] = [];
    for (const [key, child] of Object.entries(item)) {
      if (owned.has(key) || isDuplicatePhotoKey(key, item)) continue;
      if (Array.isArray(child)) {
        if (nestedArrayIsConfigured(arrayPath, key, configured)) continue;
        const childPath = `${arrayPath}.${index}.${key}`;
        if (grouped.has(childPath)) continue;
        const nested = walkArray(childPath, child, configured, grouped);
        if (nested) fields.push(nested);
        continue;
      }
      if (child && typeof child === "object") {
        const nested = walkObject(child as Record<string, unknown>, key, configured, grouped);
        if (nested.length) {
          fields.push({ kind: "group", path: key, label: humanLabel(key), fields: nested });
        }
        continue;
      }
      const leaf = controlForLeaf(key, child, key, item);
      if (leaf) fields.push(leaf);
    }
    if (fields.length) {
      items.push({ label: itemLabel(item, index), fields });
    }
  });
  if (!items.length) return null;
  return { kind: "array", path: arrayPath, label: humanLabel(arrayPath), items };
}

export function collectVisibleContent(
  section: Record<string, unknown> | null | undefined,
  configured: Record<string, string>,
): ContentControl[] {
  if (!section) return [];
  return walkObject(section, "", configured, groupedArrayPaths(configured));
}
