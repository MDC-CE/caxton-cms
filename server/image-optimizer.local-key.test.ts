import { describe, expect, it } from "vitest";
import { localKeyFromSrc } from "./image-optimizer";

describe("localKeyFromSrc", () => {
  it("maps site images paths even when site-manager require is unavailable", () => {
    expect(localKeyFromSrc("/site_learning-mdc-edu/images/ce-advisors-tablet.webp")).toBe(
      "site_learning-mdc-edu/images/ce-advisors-tablet.webp",
    );
  });

  it("ignores remote and attached_assets urls", () => {
    expect(localKeyFromSrc("https://storage.googleapis.com/bucket/x.webp")).toBeNull();
    expect(localKeyFromSrc("/attached_assets/foo.png")).toBeNull();
  });
});
