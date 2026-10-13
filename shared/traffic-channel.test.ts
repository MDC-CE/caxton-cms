import { describe, expect, it } from "vitest";
import {
  channelForSource,
  classifyChannel,
  isInternalUtmSource,
  referrerHost,
} from "./traffic-channel";

const OWN = ["4geeks.com", ".4geeks.com"];
const FL = ["fl.4geeksacademy.com", ".4geeksacademy.com"];

describe("classifyChannel", () => {
  it("paid and Meta unclear come from the paid rules", () => {
    expect(classifyChannel({ utm: { utm_source: "google", utm_medium: "cpc" }, ownHosts: OWN })).toBe("paid");
    expect(classifyChannel({ click_ids: { gclid: "G" }, referrer: "https://www.google.com/", ownHosts: OWN })).toBe("paid");
    expect(classifyChannel({ click_ids: { fbclid: "F" }, referrer: "https://l.facebook.com/", ownHosts: OWN })).toBe("meta_unclear");
  });

  it("untagged visits use the referrer host", () => {
    expect(classifyChannel({ referrer: "https://www.google.com/", ownHosts: OWN })).toBe("organic_search");
    expect(classifyChannel({ referrer: "https://www.google.com.mx/", ownHosts: OWN })).toBe("organic_search");
    expect(classifyChannel({ referrer: "https://www.bing.com/search?q=x", ownHosts: OWN })).toBe("organic_search");
    expect(classifyChannel({ referrer: "android-app://com.google.android.googlequicksearchbox/", ownHosts: OWN })).toBe(
      "organic_search",
    );
    expect(classifyChannel({ referrer: "https://t.co/abc", ownHosts: OWN })).toBe("organic_social");
    expect(classifyChannel({ referrer: "https://www.linkedin.com/feed/", ownHosts: OWN })).toBe("organic_social");
    expect(classifyChannel({ referrer: "https://chatgpt.com/", ownHosts: OWN })).toBe("ai_assistant");
    expect(classifyChannel({ referrer: "https://gemini.google.com/app", ownHosts: OWN })).toBe("ai_assistant");
    expect(classifyChannel({ referrer: "https://mail.google.com/mail/u/0/", ownHosts: OWN })).toBe("email");
    expect(classifyChannel({ referrer: "https://some-blog.dev/post", ownHosts: OWN })).toBe("referral");
    expect(classifyChannel({ referrer: "", ownHosts: OWN })).toBe("direct");
  });

  it("self-referrals carry no new information", () => {
    expect(classifyChannel({ referrer: "https://4geeks.com/en/blog", ownHosts: OWN })).toBeNull();
    expect(classifyChannel({ referrer: "https://learn.4geeks.com/", ownHosts: OWN })).toBeNull();
  });

  it("our other sites count as ordinary referrals", () => {
    expect(classifyChannel({ referrer: "https://4geeks.com/en/coding-bootcamp", ownHosts: FL })).toBe("referral");
  });

  it("tags win over the referrer; known sources count without a medium", () => {
    expect(classifyChannel({ utm: { utm_source: "chatgpt.com" }, ownHosts: OWN })).toBe("ai_assistant");
    expect(classifyChannel({ utm: { utm_source: "google", utm_medium: "organic" }, ownHosts: OWN })).toBe("organic_search");
    expect(classifyChannel({ utm: { utm_source: "linkedin", utm_medium: "social" }, ownHosts: OWN })).toBe("organic_social");
    expect(
      classifyChannel({ utm: { utm_source: "newsletter", utm_medium: "email" }, referrer: "https://www.linkedin.com/", ownHosts: OWN }),
    ).toBe("email");
    expect(classifyChannel({ utm: { utm_source: "partner_x", utm_medium: "banner_free" }, ownHosts: OWN })).toBe("tagged_other");
  });

  it("internal UTMs are ignored", () => {
    expect(
      classifyChannel({ utm: { utm_source: "4geeks.com", utm_medium: "dropdown" }, referrer: "https://4geeks.com/", ownHosts: OWN }),
    ).toBeNull();
    expect(classifyChannel({ utm: { utm_source: "4geeks.com", utm_medium: "dropdown" }, ownHosts: OWN })).toBeNull();
    expect(classifyChannel({ utm: { utm_source: "4geeks.com", utm_medium: "dropdown" }, ownHosts: FL })).toBe("tagged_other");
  });
});

describe("helpers", () => {
  it("referrerHost keeps only the host", () => {
    expect(referrerHost("https://www.google.com/search?q=secret")).toBe("google.com");
    expect(referrerHost(null)).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
  });

  it("isInternalUtmSource matches the current host and parent domain only", () => {
    expect(isInternalUtmSource("4geeks.com", OWN)).toBe(true);
    expect(isInternalUtmSource("www.4geeks.com", OWN)).toBe(true);
    expect(isInternalUtmSource("https://4geeks.com/en", OWN)).toBe(true);
    expect(isInternalUtmSource("google", OWN)).toBe(false);
    expect(isInternalUtmSource("4geeksacademy.com", OWN)).toBe(false);
  });

  it("channelForSource handles hosts and keywords", () => {
    expect(channelForSource("chatgpt.com")).toBe("ai_assistant");
    expect(channelForSource("ig")).toBe("organic_social");
    expect(channelForSource("acme")).toBeNull();
  });
});
