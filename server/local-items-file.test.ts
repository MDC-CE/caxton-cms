import { describe, expect, it } from "vitest";
import yaml from "js-yaml";
import { isJsonItemsFile, parseJsonItemsFile, serializeLocalItems } from "./local-items-file";

const items = [
  { student_name: "Ana Pérez", excerpt: "Great course", priority: 1 },
  { student_name: "Luis -", excerpt: "- starts with a dash", priority: 2 },
];

describe("local items file", () => {
  it("knows a .json file by its extension", () => {
    expect(isJsonItemsFile("testimonials.json")).toBe(true);
    expect(isJsonItemsFile("TESTIMONIALS.JSON")).toBe(true);
    expect(isJsonItemsFile("testimonials.yml")).toBe(false);
    expect(isJsonItemsFile("testimonials.yaml")).toBe(false);
  });

  it("writes JSON for a .json file, so JSON.parse reads it back", () => {
    const body = serializeLocalItems(items, "testimonials.json");
    expect(body.trimStart().startsWith("[")).toBe(true);
    expect(JSON.parse(body)).toEqual(items);
  });

  it("keeps results_path wrapping in JSON", () => {
    const body = serializeLocalItems({ results: items }, "data.json");
    expect(JSON.parse(body)).toEqual({ results: items });
  });

  it("still writes YAML for .yml files", () => {
    const body = serializeLocalItems(items, "testimonials.yml");
    expect(body.startsWith("- ")).toBe(true);
    expect(yaml.load(body)).toEqual(items);
  });

  it("uses the YAML writer it is given", () => {
    const body = serializeLocalItems(items, "x.yaml", () => "custom\n");
    expect(body).toBe("custom\n");
  });

  it("reads a valid .json file as JSON", () => {
    expect(parseJsonItemsFile(JSON.stringify(items), "db/t/t.json")).toEqual(items);
  });

  it("reads a .json file that holds YAML from the old save (the reported error)", () => {
    const oldBody = yaml.dump(items, { lineWidth: 120 });
    expect(() => JSON.parse(oldBody)).toThrow(/minus sign|Unexpected/);
    expect(parseJsonItemsFile(oldBody, "db/testimonials/testimonials.json")).toEqual(items);
  });

  it("still fails on a .json file that is neither JSON nor a YAML list/object", () => {
    expect(() => parseJsonItemsFile("just some text", "db/t/t.json")).toThrow();
    expect(() => parseJsonItemsFile("key: [unclosed", "db/t/t.json")).toThrow();
  });
});
