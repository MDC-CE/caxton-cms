import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLeadConversionEventNames,
  getTrackingSettings,
  isCountsAsLeadConfigured,
  updateTrackingSettings,
} from "./settings";

const tmpDirs: string[] = [];

function makeContentRoot(yamlBody: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-lead-"));
  tmpDirs.push(dir);
  fs.writeFileSync(path.join(dir, "settings.yml"), yamlBody, "utf-8");
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const whenToUse = "Visitor is applying or enrolling in a program via Apply or Enroll CTAs.";
const whenNot = "Soft info requests, download gates, newsletter, or contact — use other events.";

describe("counts_as_lead helpers", () => {
  it("treats missing counts_as_lead as not a lead", () => {
    const root = makeContentRoot(`tracking:
  conversion_events:
    - name: student_application
      when_to_use: "${whenToUse}"
      when_not_to_use: "${whenNot}"
    - name: newsletter_signup
      when_to_use: "${whenToUse}"
      when_not_to_use: "${whenNot}"
  signup_event_name: sign_up
  login_event_name: login
`);
    expect(isCountsAsLeadConfigured(getTrackingSettings(root).conversion_events)).toBe(false);
    const leads = getLeadConversionEventNames(root);
    expect(leads).toEqual(["sign_up"]);
  });

  it("includes flagged events and always unions canonical signup", () => {
    const root = makeContentRoot(`tracking:
  conversion_events:
    - name: student_application
      when_to_use: "${whenToUse}"
      when_not_to_use: "${whenNot}"
      counts_as_lead: true
    - name: newsletter_signup
      when_to_use: "${whenToUse}"
      when_not_to_use: "${whenNot}"
      counts_as_lead: false
    - name: sign_up
      when_to_use: "${whenToUse}"
      when_not_to_use: "${whenNot}"
      counts_as_lead: false
  signup_event_name: sign_up
  login_event_name: login
`);
    expect(isCountsAsLeadConfigured(getTrackingSettings(root).conversion_events)).toBe(true);
    const leads = getLeadConversionEventNames(root);
    expect(leads).toContain("student_application");
    expect(leads).toContain("sign_up");
    expect(leads).not.toContain("newsletter_signup");
  });

  it("forces signup true and login false on save", () => {
    const root = makeContentRoot("tracking:\n  conversion_events: []\n");
    updateTrackingSettings(
      {
        conversion_events: [
          {
            name: "sign_up",
            when_to_use: whenToUse,
            when_not_to_use: whenNot,
            counts_as_lead: false,
          },
          {
            name: "login",
            when_to_use: whenToUse,
            when_not_to_use: whenNot,
            counts_as_lead: true,
          },
        ],
      },
      root,
    );
    const raw = fs.readFileSync(path.join(root, "settings.yml"), "utf-8");
    expect(raw).toMatch(/name: sign_up[\s\S]*?counts_as_lead: true/);
    expect(raw).toMatch(/name: login[\s\S]*?counts_as_lead: false/);
  });
});
