import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { scrollToSectionWhenReady } = vi.hoisted(() => ({
  scrollToSectionWhenReady: vi.fn(),
}));

vi.mock("./useScrollToLocationHashWhenReady", () => ({
  scrollToSectionWhenReady,
}));

import { activateHashTarget } from "./useInternalNav";

describe("activateHashTarget", () => {
  let locationHash: string;
  let locationSearch: string;
  let locationPathname: string;
  let hashAssignments: number;
  let hashChangeEvents: number;
  let replaceStateCalls: string[];
  let pushStateCalls: string[];
  let elements: Map<string, { dataset: { sectionType?: string } }>;

  function applyHistoryUrl(url: string): void {
    const u = new URL(url, "http://localhost");
    locationPathname = u.pathname;
    locationSearch = u.search;
    locationHash = u.hash;
  }

  beforeEach(() => {
    locationHash = "";
    locationSearch = "";
    locationPathname = "/programs/ai-engineering";
    hashAssignments = 0;
    hashChangeEvents = 0;
    replaceStateCalls = [];
    pushStateCalls = [];
    elements = new Map();
    scrollToSectionWhenReady.mockClear();

    vi.stubGlobal("document", {
      getElementById: (id: string) => {
        const el = elements.get(id);
        if (!el) return null;
        return { dataset: el.dataset };
      },
    });

    vi.stubGlobal("history", {
      replaceState: (_a: unknown, _b: unknown, url: string) => {
        replaceStateCalls.push(url);
        applyHistoryUrl(url);
      },
      pushState: (_a: unknown, _b: unknown, url: string) => {
        pushStateCalls.push(url);
        applyHistoryUrl(url);
      },
    });

    vi.stubGlobal("window", {
      location: {
        get pathname() {
          return locationPathname;
        },
        get search() {
          return locationSearch;
        },
        get hash() {
          return locationHash;
        },
        set hash(v: string) {
          const next = v.startsWith("#") ? v : `#${v}`;
          if (next !== locationHash) {
            locationHash = next;
            hashAssignments += 1;
          }
        },
      },
      dispatchEvent: (event: Event) => {
        if (event.type === "hashchange") hashChangeEvents += 1;
        return true;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a modal with pushState and a manual hashchange, without assigning location.hash", () => {
    elements.set("modal-ubwgcj", { dataset: { sectionType: "modal" } });

    activateHashTarget("modal-ubwgcj", "");

    expect(locationHash).toBe("#modal-ubwgcj");
    expect(hashAssignments).toBe(0);
    expect(hashChangeEvents).toBe(1);
    expect(pushStateCalls).toEqual(["/programs/ai-engineering#modal-ubwgcj"]);
    expect(replaceStateCalls).toEqual([]);
  });

  it("merges search into the modal pushState url", () => {
    elements.set("modal-ubwgcj", { dataset: { sectionType: "modal" } });

    activateHashTarget("modal-ubwgcj", "?cohort=1713");

    expect(locationPathname).toBe("/programs/ai-engineering");
    expect(locationSearch).toBe("?cohort=1713");
    expect(locationHash).toBe("#modal-ubwgcj");
    expect(hashAssignments).toBe(0);
    expect(pushStateCalls).toEqual(["/programs/ai-engineering?cohort=1713#modal-ubwgcj"]);
  });

  it("does not push a duplicate history entry when the modal url is already current", () => {
    elements.set("modal-ubwgcj", { dataset: { sectionType: "modal" } });
    locationHash = "#modal-ubwgcj";

    activateHashTarget("modal-ubwgcj", "");

    expect(pushStateCalls).toEqual([]);
    expect(hashChangeEvents).toBe(1);
  });

  it("uses replaceState with hash for non-modal sections", () => {
    elements.set("pricing-6svo9e", { dataset: { sectionType: "pricing" } });

    activateHashTarget("pricing-6svo9e", "?cohort=1713");

    expect(replaceStateCalls).toEqual([
      "/programs/ai-engineering?cohort=1713#pricing-6svo9e",
    ]);
    expect(scrollToSectionWhenReady).toHaveBeenCalledWith("pricing-6svo9e");
  });
});
