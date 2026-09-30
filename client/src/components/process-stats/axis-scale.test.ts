import { describe, expect, it } from "vitest";
import { axisScale, isIsolatedReading } from "./ProcessLineChart";

describe("axisScale", () => {
  it("keeps CPU on steps of 20 and grows only when the peak does not fit", () => {
    expect(axisScale("cpu", 80).ticks).toEqual([0, 20, 40, 60, 80]);
    expect(axisScale("cpu", 110).domain).toEqual([0, 120]);
    expect(axisScale("cpu", 80).format(80)).toBe("80%");
    expect(axisScale("cpu", 110).format(120)).toBe("120%");
  });

  it("keeps memory on steps of 500 MB", () => {
    expect(axisScale("memory", 1600).ticks).toEqual([0, 500, 1000, 1500, 2000]);
    expect(axisScale("memory", 1600).format(2000)).toBe("2000MB");
  });

  it("uses event-loop marks through the peak, and 60s only after 30s", () => {
    expect(axisScale("eventLoop", 80).domain[0]).toBe(10);
    expect(axisScale("eventLoop", 80).ticks).toEqual([10, 30, 100]);
    expect(axisScale("eventLoop", 3000).ticks).toEqual([10, 30, 100, 300, 1000, 3000]);
    expect(axisScale("eventLoop", 8000).ticks).toEqual([10, 30, 100, 300, 1000, 3000, 10_000]);
    expect(axisScale("eventLoop", 40_000).ticks).toEqual([10, 30, 100, 300, 1000, 3000, 10_000, 30_000, 60_000]);
    expect(axisScale("eventLoop", 80).format(10)).toBe("10ms");
  });

  it("labels latency ticks in milliseconds and starts at 10", () => {
    const axis = axisScale("latency", 40);
    expect(axis.ticks).toEqual([10, 25, 50]);
    expect(axis.format(10)).toBe("10ms");
    expect(axisScale("latency", 800).ticks).toEqual([10, 25, 50, 100, 250, 500, 1000]);
  });

  it("reserves the same width for every axis", () => {
    const widths = (["cpu", "memory", "eventLoop", "latency", "count"] as const).map((kind) => axisScale(kind, 80).width);
    expect(new Set(widths).size).toBe(1);
  });

  it("marks a reading only when neither neighbor has a number", () => {
    const values = [10, null, 80, 90, null, 40];
    expect(isIsolatedReading(values, 0)).toBe(true);
    expect(isIsolatedReading(values, 1)).toBe(false);
    expect(isIsolatedReading(values, 2)).toBe(false);
    expect(isIsolatedReading(values, 3)).toBe(false);
    expect(isIsolatedReading(values, 5)).toBe(true);
    expect(isIsolatedReading([null, 0, null], 1)).toBe(true);
    expect(isIsolatedReading([Number.NaN], 0)).toBe(false);
  });

  it("counts calls on a linear axis", () => {
    expect(axisScale("count", 4).ticks).toEqual([0, 1, 2, 3, 4]);
    expect(axisScale("count", 8).ticks).toEqual([0, 2, 4, 6, 8]);
    expect(axisScale("count", 100).ticks).toEqual([0, 50, 100]);
  });
});
