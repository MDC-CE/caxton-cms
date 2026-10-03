/**
 * Proposals live only in production. Off the live server, draft files linked to a proposal are
 * test copies: auto-commit skips them and manual pushes must confirm them first.
 */

import fs from "fs";
import path from "path";
import { readDraftMeta } from "./versioning/draft-meta";
import { isLiveServer } from "./live-server";
import { child } from "./logger";

const log = child({ module: "proposal-draft-push-guard" });
const loggedSkips = new Set<string>();

function isYaml(file: string): boolean {
  return file.endsWith(".yml") || file.endsWith(".yaml");
}

function resolveFile(file: string, contentRoot?: string): string {
  if (path.isAbsolute(file)) return file;
  const fromCwd = path.join(process.cwd(), file);
  if (fs.existsSync(fromCwd) || !contentRoot) return fromCwd;
  return path.join(process.cwd(), contentRoot, file);
}

/** Repo-relative (or content-root-relative) path → true when the file carries a `_draft.proposal` link. */
export function isProposalLinkedDraft(file: string, contentRoot?: string): boolean {
  if (!isYaml(file)) return false;
  try {
    return Boolean(readDraftMeta(resolveFile(file, contentRoot))?.proposal);
  } catch {
    return false;
  }
}

/** Proposal-linked drafts among `files` that need confirmation before pushing (empty on the live server). */
export function proposalDraftsNeedingConfirm(files: string[], contentRoot?: string): string[] {
  if (isLiveServer()) return [];
  return files.filter((f) => isProposalLinkedDraft(f, contentRoot));
}

/** Auto-commit: true when this file must stay local (logged once per file). */
export function skipAutoCommitForProposalDraft(relativePath: string): boolean {
  if (isLiveServer() || !isProposalLinkedDraft(relativePath)) return false;
  if (!loggedSkips.has(relativePath)) {
    loggedSkips.add(relativePath);
    log.info(
      { file: relativePath },
      "Auto-commit skipped a proposal draft: proposals live in production, so this test copy stays local.",
    );
  }
  return true;
}

export const CONFIRM_PROPOSAL_DRAFTS_MESSAGE =
  "These drafts belong to proposals you tested on this computer. Proposals live in production, so these usually should not be pushed.";
