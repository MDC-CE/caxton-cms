import { describe, expect, it } from "vitest";
import { ARTICLE_HTML_MARKER } from "@shared/reading-time";
import { patchVariableFieldHighlights } from "./variable-manager";

describe("patchVariableFieldHighlights", () => {
  const singleEntry = { title: "How to become an AI engineer", content: "# Raw\n\n```mermaid\nflowchart LR\n```" };

  it("keeps server-rendered article HTML instead of the raw entry markdown", () => {
    const html = `${ARTICLE_HTML_MARKER}\n<figure class="geekchart"><svg></svg></figure>`;
    const patched = patchVariableFieldHighlights(
      { type: "article", content: html },
      { content: "{{ single.content }}" },
      singleEntry,
      {},
    );
    expect(patched.content).toBe(html);
  });

  it("still wraps plain bound strings for the edit-mode highlight", () => {
    const patched = patchVariableFieldHighlights(
      { type: "hero", title: "How to become an AI engineer" },
      { title: "{{ single.title }}" },
      singleEntry,
      {},
    );
    expect(patched.title).toBe("{{ single.title | How to become an AI engineer }}");
  });
});
