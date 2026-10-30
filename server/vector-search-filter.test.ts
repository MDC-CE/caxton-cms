import { describe, expect, it } from "vitest";
import { aliasSwapActions, pointPayload, searchChunks, vectorSearchFilter } from "./vector-search";

describe("vector payload and chunk filter", () => {
  it("stores kind and destiny code beside the vector", () => {
    expect(pointPayload({
      slug: "en:course:1170129",
      locale: "en",
      kind: "course",
      destiny_code: "1170129",
      description: "Patient care",
    }, 4)).toEqual({
      _idx: 4,
      slug: "en:course:1170129",
      locale: "en",
      kind: "course",
      destiny_code: "1170129",
    });
  });

  it("filters chunk search to the codes from the first pass", () => {
    expect(vectorSearchFilter({
      locale: "en",
      destinyCodes: ["1170129", "CM000080"],
    })).toEqual({
      must: [
        { key: "locale", match: { value: "en" } },
        { key: "destiny_code", match: { any: ["1170129", "CM000080"] } },
      ],
    });
    expect(vectorSearchFilter({})).toBeUndefined();
  });

  it("publishes a finished build without dropping the previous alias first when there is none", () => {
    expect(aliasSwapActions("ce-catalog-descriptions", "ce-catalog-descriptions__1", null)).toEqual([
      { create_alias: { collection_name: "ce-catalog-descriptions__1", alias_name: "ce-catalog-descriptions" } },
    ]);
  });

  it("moves the live name onto the new build before the old one can be deleted", () => {
    expect(aliasSwapActions(
      "ce-catalog-descriptions",
      "ce-catalog-descriptions__2",
      "ce-catalog-descriptions__1",
    )).toEqual([
      { delete_alias: { alias_name: "ce-catalog-descriptions" } },
      { create_alias: { collection_name: "ce-catalog-descriptions__2", alias_name: "ce-catalog-descriptions" } },
    ]);
  });

  it("does not search chunks when the first pass returned no codes", async () => {
    await expect(searchChunks("to code", [])).resolves.toEqual([]);
    await expect(searchChunks("   ", ["1170129"])).resolves.toEqual([]);
  });
});
