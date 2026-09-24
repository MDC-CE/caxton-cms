import { describe, expect, it } from "vitest";
import {
  MANAGE_LIST_VIEW_DEFAULTS,
  parseManageListSearch,
  serializeManageListSearch,
} from "./content-type-manage-url";

describe("parseManageListSearch", () => {
  it("returns defaults for an empty query", () => {
    expect(parseManageListSearch("")).toEqual(MANAGE_LIST_VIEW_DEFAULTS);
    expect(parseManageListSearch("?")).toEqual(MANAGE_LIST_VIEW_DEFAULTS);
  });

  it("parses perspective, view, q, page", () => {
    const view = parseManageListSearch(
      "perspective=organic&view=db&q=python&page=3",
    );
    expect(view.perspective).toBe("organic");
    expect(view.view).toBe("db");
    expect(view.q).toBe("python");
    expect(view.page).toBe(3);
  });

  it("rejects invalid perspective, view, and page", () => {
    expect(parseManageListSearch("perspective=nope").perspective).toBe("default");
    expect(parseManageListSearch("view=csv").view).toBeNull();
    expect(parseManageListSearch("page=0").page).toBe(1);
    expect(parseManageListSearch("page=abc").page).toBe(1);
  });

  it("parses updated sort, published sort, shared filters, and tag filters", () => {
    const view = parseManageListSearch(
      "updated=asc&locale=es&market=us&sort=position&dir=asc&t=topic:ai&t=topic:ml&t=level:beginner&pub=7d&status=pending_drafts",
    );
    expect(view.updatedSortDir).toBe("asc");
    expect(view.publishedSortDir).toBeNull();
    expect(view.locale).toBe("es");
    expect(view.organicMarket).toBe("us");
    expect(view.organicSort).toBe("position");
    expect(view.organicSortDir).toBe("asc");
    expect(view.publishDatePreset).toBe("7d");
    expect(view.publishDateFrom).toBe("");
    expect(view.publishDateTo).toBe("");
    expect(view.statusFilter).toBe("pending_drafts");
    expect(view.tagFilters).toEqual({
      topic: ["ai", "ml"],
      level: ["beginner"],
    });
  });

  it("parses custom publish date range only when pub=custom", () => {
    const custom = parseManageListSearch(
      "pub=custom&pubFrom=2024-01-01&pubTo=2024-01-31",
    );
    expect(custom.publishDatePreset).toBe("custom");
    expect(custom.publishDateFrom).toBe("2024-01-01");
    expect(custom.publishDateTo).toBe("2024-01-31");

    const ignored = parseManageListSearch(
      "pub=7d&pubFrom=2024-01-01&pubTo=2024-01-31",
    );
    expect(ignored.publishDateFrom).toBe("");
    expect(ignored.publishDateTo).toBe("");
  });

  it("rejects invalid pub, status, and date strings", () => {
    expect(parseManageListSearch("pub=yesterday").publishDatePreset).toBeNull();
    expect(parseManageListSearch("status=live").statusFilter).toBeNull();
    expect(
      parseManageListSearch("pub=custom&pubFrom=01-01-2024&pubTo=not-a-date")
        .publishDateFrom,
    ).toBe("");
  });

  it("parses published sort and clears updated when both are present", () => {
    const view = parseManageListSearch("updated=desc&published=asc");
    expect(view.publishedSortDir).toBe("asc");
    expect(view.updatedSortDir).toBeNull();
  });
});

describe("serializeManageListSearch", () => {
  it("omits defaults so the URL stays empty", () => {
    expect(serializeManageListSearch(MANAGE_LIST_VIEW_DEFAULTS)).toBe("");
  });

  it("writes only non-default keys", () => {
    const qs = serializeManageListSearch({
      ...MANAGE_LIST_VIEW_DEFAULTS,
      perspective: "organic",
      view: "db",
      q: "react",
      page: 2,
      updatedSortDir: "desc",
      publishedSortDir: null,
      tagFilters: { topic: ["ai"] },
      locale: "es",
      organicMarket: "us",
      organicSort: "ctr",
      organicSortDir: "asc",
      publishDatePreset: "28d",
      statusFilter: "only_draft",
    });
    const params = new URLSearchParams(qs);
    expect(params.get("perspective")).toBe("organic");
    expect(params.get("view")).toBe("db");
    expect(params.get("q")).toBe("react");
    expect(params.get("page")).toBe("2");
    expect(params.get("updated")).toBe("desc");
    expect(params.get("published")).toBeNull();
    expect(params.getAll("t")).toEqual(["topic:ai"]);
    expect(params.get("locale")).toBe("es");
    expect(params.get("market")).toBe("us");
    expect(params.get("sort")).toBe("ctr");
    expect(params.get("dir")).toBe("asc");
    expect(params.get("pub")).toBe("28d");
    expect(params.get("pubFrom")).toBeNull();
    expect(params.get("status")).toBe("only_draft");
  });

  it("writes custom publish dates and omits them for non-custom presets", () => {
    const custom = serializeManageListSearch({
      ...MANAGE_LIST_VIEW_DEFAULTS,
      publishDatePreset: "custom",
      publishDateFrom: "2024-06-01",
      publishDateTo: "2024-06-15",
    });
    const params = new URLSearchParams(custom);
    expect(params.get("pub")).toBe("custom");
    expect(params.get("pubFrom")).toBe("2024-06-01");
    expect(params.get("pubTo")).toBe("2024-06-15");

    const today = serializeManageListSearch({
      ...MANAGE_LIST_VIEW_DEFAULTS,
      publishDatePreset: "today",
      publishDateFrom: "2024-06-01",
      publishDateTo: "2024-06-15",
    });
    expect(new URLSearchParams(today).get("pubFrom")).toBeNull();
    expect(new URLSearchParams(today).get("pubTo")).toBeNull();
  });

  it("writes published sort", () => {
    const qs = serializeManageListSearch({
      ...MANAGE_LIST_VIEW_DEFAULTS,
      publishedSortDir: "asc",
    });
    expect(new URLSearchParams(qs).get("published")).toBe("asc");
  });

  it("omits view when it matches defaultViewMode", () => {
    const qs = serializeManageListSearch(
      { ...MANAGE_LIST_VIEW_DEFAULTS, view: "db" },
      "",
      { defaultViewMode: "db" },
    );
    expect(qs).toBe("");
  });

  it("keeps unknown params and round-trips", () => {
    const qs = serializeManageListSearch(
      {
        ...MANAGE_LIST_VIEW_DEFAULTS,
        perspective: "seo",
        q: "a",
        statusFilter: "published",
      },
      "debug=1",
    );
    expect(new URLSearchParams(qs).get("debug")).toBe("1");
    expect(parseManageListSearch(qs).perspective).toBe("seo");
    expect(parseManageListSearch(qs).q).toBe("a");
    expect(parseManageListSearch(qs).statusFilter).toBe("published");
  });
});
