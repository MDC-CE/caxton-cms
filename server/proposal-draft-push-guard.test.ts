import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { setLiveServerForTests } from "./live-server";
import {
  isProposalLinkedDraft,
  proposalDraftsNeedingConfirm,
  skipAutoCommitForProposalDraft,
} from "./proposal-draft-push-guard";

let dir: string;
let linked: string;
let plain: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "draft-guard-"));
  linked = path.join(dir, "draft.es.yml");
  plain = path.join(dir, "es.yml");
  fs.writeFileSync(linked, "title: Hola\n_draft:\n  proposal:\n    id: p1\n    env: production\n");
  fs.writeFileSync(plain, "title: Hola\n");
});

afterEach(() => {
  setLiveServerForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("proposal draft push guard", () => {
  it("detects drafts carrying a proposal link", () => {
    expect(isProposalLinkedDraft(linked)).toBe(true);
    expect(isProposalLinkedDraft(plain)).toBe(false);
    expect(isProposalLinkedDraft(path.join(dir, "missing.yml"))).toBe(false);
  });

  it("off the live server: auto-commit skips them and manual pushes must confirm", () => {
    setLiveServerForTests(false);
    expect(skipAutoCommitForProposalDraft(linked)).toBe(true);
    expect(skipAutoCommitForProposalDraft(plain)).toBe(false);
    expect(proposalDraftsNeedingConfirm([linked, plain])).toEqual([linked]);
  });

  it("on the live server nothing is filtered", () => {
    setLiveServerForTests(true);
    expect(skipAutoCommitForProposalDraft(linked)).toBe(false);
    expect(proposalDraftsNeedingConfirm([linked, plain])).toEqual([]);
  });
});
