import { describe, expect, it } from "vitest";
import { applyCaptureGroups } from "./redirects";

describe("applyCaptureGroups", () => {
  it("substitutes $1…$n and lowercases relative targets", () => {
    expect(applyCaptureGroups("/en/blog/$1/$2", ["AI", "Post"])).toBe("/en/blog/ai/post");
  });

  it("keeps capture casing for absolute targets", () => {
    expect(applyCaptureGroups("https://example.com/$1", ["AbC"])).toBe("https://example.com/AbC");
  });

  it("inserts captures literally — `$&`, `$2`, `$$` from the URL are not re-expanded", () => {
    expect(applyCaptureGroups("/new/$1/$2", ["a$&b", "$1"])).toBe("/new/a$&b/$1");
    expect(applyCaptureGroups("/new/$1", ["$2$$"])).toBe("/new/$2$$");
    expect(applyCaptureGroups("/new/$1", ["x$`y$'z"])).toBe("/new/x$`y$'z");
  });

  it("leaves unknown group references literal", () => {
    expect(applyCaptureGroups("/new/$1/$3", ["a"])).toBe("/new/a/$3");
    expect(applyCaptureGroups("/new/$0", ["a"])).toBe("/new/$0");
  });

  it("treats trailing digits as literal when the longer group does not exist", () => {
    expect(applyCaptureGroups("/page-$12", ["a"])).toBe("/page-a2");
  });

  it("uses two-digit groups when they exist", () => {
    const groups = Array.from({ length: 10 }, (_, i) => `g${i + 1}`);
    expect(applyCaptureGroups("/$10/$1", groups)).toBe("/g10/g1");
  });
});
