import { describe, expect, it } from "vitest";
import {
  parsePerformanceSearch,
  serializePerformanceSearch,
  chartBounds,
  selectionOverlaps,
  PERFORMANCE_VIEW_DEFAULTS,
} from "./server-performance-url";

describe("server-performance-url", () => {
  it("omits defaults and keeps an unknown key", () => {
    const qs = serializePerformanceSearch(PERFORMANCE_VIEW_DEFAULTS, "sort=count");
    expect(qs).toBe("sort=count");
  });

  it("writes a click as the same pair and keeps the range shortcut", () => {
    const qs = serializePerformanceSearch({
      ...PERFORMANCE_VIEW_DEFAULTS,
      range: "1h",
      startingAt: 100,
      endingAt: 100,
      tab: "pages",
    });
    expect(qs).toContain("starting_at=100");
    expect(qs).toContain("ending_at=100");
    expect(qs).toContain("range=1h");
    expect(qs).toContain("tab=pages");
    expect(qs).not.toContain("section=");
  });

  it("drops an inverted or partial window", () => {
    expect(parsePerformanceSearch("?starting_at=20&ending_at=10").startingAt).toBeNull();
    expect(parsePerformanceSearch("?starting_at=10").startingAt).toBeNull();
    expect(parsePerformanceSearch("?starting_at=&ending_at=1").startingAt).toBeNull();
  });

  it("reads an old traffic link as api or pages", () => {
    expect(parsePerformanceSearch("?tab=traffic").tab).toBe("api");
    expect(parsePerformanceSearch("?tab=traffic&section=pages").tab).toBe("pages");
    expect(parsePerformanceSearch("?section=pages").tab).toBe("process");
    const qs = serializePerformanceSearch({ ...PERFORMANCE_VIEW_DEFAULTS, tab: "pages" });
    expect(qs).toContain("tab=pages");
    expect(qs).not.toContain("section=");
  });

  it("ignores a traffic tab on a process that has no traffic", () => {
    const view = parsePerformanceSearch("?process=sidequest&tab=pages");
    expect(view.process).toBe("sidequest");
    expect(view.tab).toBe("process");
    expect(view.route).toBeNull();
  });

  it("reads a route on the traffic tab that is open", () => {
    const view = parsePerformanceSearch("?tab=api&route=/api/x&method=GET");
    expect(view.route).toBe("/api/x");
    expect(view.method).toBe("GET");
    expect(parsePerformanceSearch("?tab=pages&route=/pricing&method=GET").method).toBeNull();
    const qs = serializePerformanceSearch(view);
    expect(qs).toContain("route=%2Fapi%2Fx");
    expect(qs).toContain("method=GET");
    expect(serializePerformanceSearch({ ...view, tab: "process", route: null, method: null })).not.toContain("route=");
  });

  it("keeps the range shortcut under a drag so back-to-range can restore it", () => {
    const qs = serializePerformanceSearch({
      ...PERFORMANCE_VIEW_DEFAULTS,
      range: "24h",
      startingAt: 100,
      endingAt: 200,
    });
    expect(qs).toContain("range=24h");
    expect(qs).toContain("starting_at=100");
    expect(qs).toContain("ending_at=200");
  });

  it("keeps a drag on the preset until zoom is on", () => {
    const drag = parsePerformanceSearch("?starting_at=100&ending_at=200");
    expect(drag.zoomed).toBe(false);
    expect(chartBounds(drag, 9_000).from).toBe(9_000 - 6 * 60 * 60 * 1000);
    const zoomed = parsePerformanceSearch("?starting_at=100&ending_at=200&zoom=1");
    expect(zoomed.zoomed).toBe(true);
    expect(chartBounds(zoomed, 9_000)).toEqual({ from: 100, to: 200 });
    const click = parsePerformanceSearch("?starting_at=100&ending_at=100&range=1h&zoom=1");
    expect(click.zoomed).toBe(false);
    expect(chartBounds(click, 10_000).from).toBe(10_000 - 60 * 60 * 1000);
    const qs = serializePerformanceSearch(zoomed);
    expect(qs).toContain("zoom=1");
    expect(serializePerformanceSearch(drag)).not.toContain("zoom=");
  });

  it("keeps the zoomed chart when a later selection is inside it", () => {
    const view = parsePerformanceSearch("?zoom=1&zoom_from=100&zoom_to=400&starting_at=200&ending_at=200&range=6h");
    expect(view.zoomed).toBe(true);
    expect(view.startingAt).toBe(200);
    expect(view.endingAt).toBe(200);
    expect(chartBounds(view, 9_000)).toEqual({ from: 100, to: 400 });
    const drag = parsePerformanceSearch("?zoom=1&zoom_from=100&zoom_to=400&starting_at=150&ending_at=250");
    expect(chartBounds(drag, 9_000)).toEqual({ from: 100, to: 400 });
    const qs = serializePerformanceSearch(view);
    expect(qs).toContain("zoom=1");
    expect(qs).toContain("zoom_from=100");
    expect(qs).toContain("zoom_to=400");
    expect(qs).toContain("starting_at=200");
  });

  it("keeps a selection that still meets the new range", () => {
    expect(selectionOverlaps(100, 100, 50, 200)).toBe(true);
    expect(selectionOverlaps(80, 120, 100, 200)).toBe(true);
    expect(selectionOverlaps(100, 100, 100, 200)).toBe(true);
    expect(selectionOverlaps(10, 40, 50, 200)).toBe(false);
    expect(selectionOverlaps(null, null, 50, 200)).toBe(false);
  });
});
