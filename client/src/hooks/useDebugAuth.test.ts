import { describe, expect, it } from "vitest";
import { resolveDebugModeActive, staffCanEnterEditMode } from "./useDebugAuth";

describe("staffCanEnterEditMode", () => {
  it("is false with no edit grants", () => {
    expect(staffCanEnterEditMode([{ name: "content_view", contentTypes: "*" }])).toBe(false);
  });

  it("is true for wildcard edit grants", () => {
    expect(staffCanEnterEditMode([{ name: "content_edit_text", contentTypes: "*" }])).toBe(true);
  });

  it("is true when edit is scoped to specific content types (not only *)", () => {
    expect(
      staffCanEnterEditMode([{ name: "content_edit_text", contentTypes: ["page"] }]),
    ).toBe(true);
    expect(
      staffCanEnterEditMode([{ name: "content_edit_structure", contentTypes: ["landing", "page"] }]),
    ).toBe(true);
  });

  it("is true for legacy grants that omit contentTypes", () => {
    expect(staffCanEnterEditMode([{ name: "content_edit_media" }])).toBe(true);
  });

  it("is false for empty contentTypes lists", () => {
    expect(staffCanEnterEditMode([{ name: "content_edit_text", contentTypes: [] }])).toBe(false);
  });
});

describe("resolveDebugModeActive", () => {
  const off = {
    debugParam: null as string | null,
    isDismissed: false,
    isDev: false,
    hasDebugModeFlag: false,
    hasNonExpiredStaffToken: false,
  };

  it("turns off for ?debug=false even when staff token and DEV would enable", () => {
    expect(
      resolveDebugModeActive({
        ...off,
        debugParam: "false",
        isDev: true,
        hasNonExpiredStaffToken: true,
        hasDebugModeFlag: true,
      }),
    ).toBe(false);
  });

  it("turns off when dismissed unless ?debug=true", () => {
    expect(
      resolveDebugModeActive({
        ...off,
        isDismissed: true,
        isDev: true,
        hasNonExpiredStaffToken: true,
        hasDebugModeFlag: true,
      }),
    ).toBe(false);
    expect(
      resolveDebugModeActive({
        ...off,
        isDismissed: true,
        debugParam: "true",
      }),
    ).toBe(true);
  });

  it("turns on for ?debug=true", () => {
    expect(resolveDebugModeActive({ ...off, debugParam: "true" })).toBe(true);
  });

  it("turns on in DEV when not dismissed", () => {
    expect(resolveDebugModeActive({ ...off, isDev: true })).toBe(true);
  });

  it("turns on when debug_mode flag is set", () => {
    expect(resolveDebugModeActive({ ...off, hasDebugModeFlag: true })).toBe(true);
  });

  it("turns on for non-expired staff token", () => {
    expect(
      resolveDebugModeActive({ ...off, hasNonExpiredStaffToken: true }),
    ).toBe(true);
  });

  it("stays off with no opt-in and no staff token", () => {
    expect(resolveDebugModeActive(off)).toBe(false);
  });

  it("treats expired/missing token as off when nothing else enables", () => {
    expect(
      resolveDebugModeActive({ ...off, hasNonExpiredStaffToken: false }),
    ).toBe(false);
  });
});
