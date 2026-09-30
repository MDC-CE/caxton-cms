import { describe, expect, it } from "vitest";
import { axisScale } from "./ProcessLineChart";

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

  it("uses the same event-loop decades until the peak needs another one", () => {
    expect(axisScale("eventLoop", 80).ticks).toEqual([0.1, 1, 10, 100]);
    expect(axisScale("eventLoop", 3000).ticks).toEqual([0.1, 1, 10, 100, 1000, 10_000]);
    expect(axisScale("eventLoop", 80).format(0.1)).toBe("0.1ms");
  });

  it("labels latency ticks in milliseconds and starts at 50", () => {
    const axis = axisScale("latency", 40);
    expect(axis.ticks).toEqual([50, 100]);
    expect(axis.format(50)).toBe("50ms");
    expect(axisScale("latency", 800).ticks).toEqual([50, 100, 250, 500, 1000]);
  });

  it("reserves the same width for every axis", () => {
    const widths = (["cpu", "memory", "eventLoop", "latency", "count"] as const).map((kind) => axisScale(kind, 80).width);
    expect(new Set(widths).size).toBe(1);
  });

  it("counts calls on a linear axis", () => {
    expect(axisScale("count", 4).ticks).toEqual([0, 1, 2, 3, 4]);
    expect(axisScale("count", 8).ticks).toEqual([0, 2, 4, 6, 8]);
    expect(axisScale("count", 100).ticks).toEqual([0, 50, 100]);
  });
});
