import { describe, expect, it } from "vitest";
import {
  isPrivateEmbedPath,
  isPrivateHtmlAuthBypass,
  resolvePrivatePageAccess,
} from "@shared/private-page-access";

describe("isPrivateEmbedPath", () => {
  it("allows capture and component preview frames", () => {
    expect(isPrivateEmbedPath("/private/entry-preview-frame/blog/foo")).toBe(true);
    expect(
      isPrivateEmbedPath("/private/component-showcase/hero/preview"),
    ).toBe(true);
    expect(
      isPrivateEmbedPath("/private/component-showcase/hero/preview/"),
    ).toBe(true);
    expect(
      isPrivateEmbedPath("/private/demo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).toBe(true);
    expect(
      isPrivateEmbedPath("/private/demo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"),
    ).toBe(true);
  });

  it("does not treat staff admin pages as embeds", () => {
    expect(isPrivateEmbedPath("/private/redirects")).toBe(false);
    expect(isPrivateEmbedPath("/private/component-showcase/hero")).toBe(false);
    expect(isPrivateEmbedPath("/private/preview/page/home")).toBe(false);
    expect(isPrivateEmbedPath("/private/settings")).toBe(false);
    expect(isPrivateEmbedPath("/private/demo/short")).toBe(false);
    expect(isPrivateEmbedPath("/private/demo/not-hex-not-hex-not-hex-not-hex!!")).toBe(false);
  });
});

describe("isPrivateHtmlAuthBypass", () => {
  it("allows OAuth return with staff_session_code", () => {
    expect(
      isPrivateHtmlAuthBypass("/private/settings", "?staff_session_code=abc"),
    ).toBe(true);
  });

  it("does not bypass for empty staff_session_code", () => {
    expect(isPrivateHtmlAuthBypass("/private/settings", "?staff_session_code=")).toBe(
      false,
    );
  });
});

describe("resolvePrivatePageAccess", () => {
  const base = {
    pathname: "/private/redirects",
    isLoading: false,
    isValidated: false as boolean | null,
    hasToken: false,
    hasCachedStaffSession: false,
  };

  it("denies anonymous visitors", () => {
    expect(resolvePrivatePageAccess(base)).toBe("deny");
  });

  it("allows a validated staff session", () => {
    expect(
      resolvePrivatePageAccess({
        ...base,
        hasToken: true,
        isValidated: true,
      }),
    ).toBe("allow");
  });

  it("waits when a cached staff token is still validating", () => {
    expect(
      resolvePrivatePageAccess({
        ...base,
        isLoading: true,
        isValidated: null,
        hasToken: true,
        hasCachedStaffSession: true,
      }),
    ).toBe("pending");
  });

  it("denies immediately when auth is loading but there is no staff token", () => {
    expect(
      resolvePrivatePageAccess({
        ...base,
        isLoading: true,
        isValidated: null,
      }),
    ).toBe("deny");
  });

  it("allows embed frames without login", () => {
    expect(
      resolvePrivatePageAccess({
        ...base,
        pathname: "/private/component-showcase/hero/preview",
      }),
    ).toBe("allow");
  });
});
