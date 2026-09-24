import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROPOSAL_SETTINGS,
  parseProposalSettings,
  parseProposalSettingsStrict,
} from "./settings";

describe("parseProposalSettings", () => {
  it("returns defaults when omitted", () => {
    expect(parseProposalSettings(undefined)).toEqual(DEFAULT_PROPOSAL_SETTINGS);
    expect(parseProposalSettings(null)).toEqual(DEFAULT_PROPOSAL_SETTINGS);
    expect(parseProposalSettings({})).toEqual(DEFAULT_PROPOSAL_SETTINGS);
  });

  it("parses known enums and booleans", () => {
    const parsed = parseProposalSettings({
      withdraw: { mcp: "disabled", staff: "steward_only" },
      four_eyes: { enabled: false, staff_ui_exempt: true },
      hold: { stewards_only: false },
      claim: { staff_ui_takeover: false },
    });
    expect(parsed.withdraw.mcp).toBe("disabled");
    expect(parsed.withdraw.staff).toBe("steward_only");
    expect(parsed.four_eyes.enabled).toBe(false);
    expect(parsed.four_eyes.staff_ui_exempt).toBe(true);
    expect(parsed.hold.stewards_only).toBe(false);
    expect(parsed.claim.staff_ui_takeover).toBe(false);
  });

  it("falls back on invalid enum values", () => {
    const parsed = parseProposalSettings({
      withdraw: { mcp: "nope", staff: "also_nope" },
    });
    expect(parsed.withdraw.mcp).toBe("proposer_only");
    expect(parsed.withdraw.staff).toBe("any_editor");
  });
});

describe("parseProposalSettingsStrict", () => {
  it("rejects invalid enums", () => {
    expect(() =>
      parseProposalSettingsStrict({
        withdraw: { mcp: "nope", staff: "any_editor" },
        four_eyes: { enabled: true, staff_ui_exempt: false },
        hold: { stewards_only: true },
        claim: { staff_ui_takeover: true },
      }),
    ).toThrow(/withdraw\.mcp/);
  });

  it("accepts a full valid payload", () => {
    const parsed = parseProposalSettingsStrict({
      withdraw: { mcp: "any_create_author", staff: "proposer_only" },
      four_eyes: { enabled: true, staff_ui_exempt: false },
      hold: { stewards_only: true },
      claim: { staff_ui_takeover: true },
    });
    expect(parsed.withdraw.mcp).toBe("any_create_author");
  });
});
