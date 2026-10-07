import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./site-config", () => ({
  getSiteConfigs: () => [
    { domain: "4geeks.com", contentFolder: "site_4geeks-com", aliases: ["www.4geeks.com"] },
    { domain: "business.4geeks.com", contentFolder: "site_business-4geeks" },
  ],
}));

import { getSiteBaseUrl, getSiteHosts } from "./site-urls";

describe("getSiteBaseUrl", () => {
  const prev = process.env.SITE_URL;
  beforeEach(() => {
    process.env.SITE_URL = "https://4geeks.com/";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
  });

  it("uses SITE_URL for the default site", () => {
    expect(getSiteBaseUrl("site_4geeks-com")).toBe("https://4geeks.com");
    expect(getSiteBaseUrl("/abs/path/site_4geeks-com/")).toBe("https://4geeks.com");
  });

  it("uses the sites.yml domain for secondary sites", () => {
    expect(getSiteBaseUrl("/abs/site_business-4geeks")).toBe("https://business.4geeks.com");
  });

  it("falls back to SITE_URL for unknown or missing roots", () => {
    expect(getSiteBaseUrl("site_unknown")).toBe("https://4geeks.com");
    expect(getSiteBaseUrl(undefined)).toBe("https://4geeks.com");
  });

  it("lists domains, aliases, and localhost as site hosts", () => {
    const hosts = getSiteHosts();
    expect(hosts).toEqual(
      expect.arrayContaining(["4geeks.com", "www.4geeks.com", "business.4geeks.com", "localhost"]),
    );
  });
});
