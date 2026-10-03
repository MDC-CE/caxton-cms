import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./site-config", () => ({
  getSiteConfigs: () => [
    { domain: "4geeks.com", contentFolder: "site_4geeks-com", aliases: ["www.4geeks.com"] },
    { domain: "business.4geeks.com", contentFolder: "site_business-4geeks" },
  ],
}));

import { isLiveServer, liveServerStatus } from "./live-server";

const prevNodeEnv = process.env.NODE_ENV;
const prevSiteUrl = process.env.SITE_URL;
const prevMode = process.env.WEBLIFY_MODE;

afterEach(() => {
  process.env.NODE_ENV = prevNodeEnv;
  if (prevSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = prevSiteUrl;
  if (prevMode === undefined) delete process.env.WEBLIFY_MODE;
  else process.env.WEBLIFY_MODE = prevMode;
});

describe("isLiveServer", () => {
  it("is true only in production mode with SITE_URL on a sites.yml domain", () => {
    process.env.NODE_ENV = "production";
    process.env.SITE_URL = "https://4geeks.com";
    expect(isLiveServer()).toBe(true);
    process.env.SITE_URL = "https://www.4geeks.com/";
    expect(isLiveServer()).toBe(true);
  });

  it("a production build on localhost is not live", () => {
    process.env.NODE_ENV = "production";
    process.env.SITE_URL = "http://localhost:5000";
    expect(liveServerStatus()).toMatchObject({ live: false, production_mode: true, site_url_matches: false });
  });

  it("missing SITE_URL is not live", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SITE_URL;
    expect(isLiveServer()).toBe(false);
  });

  it("development with a live SITE_URL is not live", () => {
    process.env.NODE_ENV = "development";
    delete process.env.WEBLIFY_MODE;
    process.env.SITE_URL = "https://4geeks.com";
    expect(isLiveServer()).toBe(false);
  });
});
