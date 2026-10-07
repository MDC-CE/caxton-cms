import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function registeredClasses(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "server/jobs/register.ts"), "utf-8");
  return Array.from(src.matchAll(/registerJobClass\(\s*"[^"]+"\s*,\s*(\w+)\s*\)/g), (m) => m[1]);
}

function exportedClasses(): Set<string> {
  const src = fs.readFileSync(path.join(ROOT, "sidequest.jobs.ts"), "utf-8");
  const names = new Set<string>();
  for (const m of Array.from(src.matchAll(/export\s*\{([^}]+)\}/g))) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

describe("sidequest.jobs.ts manual registry", () => {
  it("exports every job class registered in server/jobs/register.ts", () => {
    const registered = registeredClasses();
    expect(registered.length).toBeGreaterThan(0);
    const exported = exportedClasses();
    const missing = registered.filter((name) => !exported.has(name));
    expect(missing, `Add these to sidequest.jobs.ts or the worker fails with "Invalid job class"`).toEqual([]);
  });
});
