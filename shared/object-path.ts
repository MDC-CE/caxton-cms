/** Dot-path helpers for plain YAML-shaped objects (`a.b.0.c`, `a.b[0].c`). */

export function splitPath(pathStr: string): string[] {
  return pathStr.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

export function getAtPath(obj: unknown, pathStr: string): unknown {
  let current: unknown = obj;
  for (const part of splitPath(pathStr)) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function hasAtPath(obj: unknown, pathStr: string): boolean {
  const parts = splitPath(pathStr);
  let current: unknown = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === null || current === undefined || typeof current !== "object") return false;
    const rec = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(rec, parts[i]!)) return false;
    current = rec[parts[i]!];
  }
  return parts.length > 0;
}

export function setAtPath(obj: Record<string, unknown>, pathStr: string, value: unknown): void {
  const parts = splitPath(pathStr);
  if (!parts.length) return;
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = current[key];
    if (next === null || next === undefined || typeof next !== "object") {
      current[key] = /^\d+$/.test(parts[i + 1]!) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/** Delete a key and prune parent objects left empty (e.g. `meta: {}`). */
export function deleteAtPath(obj: Record<string, unknown>, pathStr: string): boolean {
  const parts = splitPath(pathStr);
  if (!parts.length) return false;
  const chain: Array<Record<string, unknown>> = [obj];
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[parts[i]!];
    if (current === null || current === undefined || typeof current !== "object") return false;
    chain.push(current as Record<string, unknown>);
  }
  const leafParent = chain[chain.length - 1]!;
  const leafKey = parts[parts.length - 1]!;
  if (!Object.prototype.hasOwnProperty.call(leafParent, leafKey)) return false;
  if (Array.isArray(leafParent)) leafParent.splice(Number(leafKey), 1);
  else delete leafParent[leafKey];
  for (let i = chain.length - 1; i > 0; i--) {
    const node = chain[i]!;
    if (Array.isArray(node) || Object.keys(node).length > 0) break;
    delete chain[i - 1]![parts[i - 1]!];
  }
  return true;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
