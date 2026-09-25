import type { Element as HastElement } from "hast";
import { visit } from "unist-util-visit";

/** Text content of a hast node, same idea as server/markdown-enhance.ts's collectText. */
export function collectHastText(node: HastElement | undefined): string {
  if (!node) return "";
  return node.children
    .map((child) => {
      if (child.type === "text") return child.value;
      if (child.type === "element") return collectHastText(child);
      return "";
    })
    .join("");
}

export function isMermaidCodeNode(node: HastElement | undefined): boolean {
  if (!node || node.tagName !== "code") return false;
  const cls = node.properties?.className;
  const classes = Array.isArray(cls) ? cls.map(String) : typeof cls === "string" ? [cls] : [];
  return classes.includes("language-mermaid");
}

/** Carry a fenced block's info string (```mermaid duration=6) onto the hast
 * `code` node as `dataMeta`, so it survives rehype-raw (which drops
 * `node.data`). Same plugin as server/markdown-enhance.ts's remarkFenceMeta. */
export function remarkFenceMeta() {
  return (tree: import("mdast").Root) => {
    visit(tree, "code", (node: import("mdast").Code) => {
      if (!node.meta) return;
      const data = (node.data ??= {}) as { hProperties?: Record<string, unknown> };
      data.hProperties = { ...(data.hProperties ?? {}), dataMeta: node.meta };
    });
  };
}

function fenceMeta(node: HastElement | undefined): string {
  const fromProps = node?.properties?.dataMeta;
  if (typeof fromProps === "string") return fromProps;
  return String((node?.data as { meta?: string } | undefined)?.meta ?? "");
}

/** duration=6 on the fence: how long the build animation takes, in seconds
 * (server/markdown-enhance.ts reads the same); speed=N still works. */
export function durationFromMeta(node: HastElement | undefined): number | undefined {
  const match = /\bduration=([0-9]*\.?[0-9]+)/.exec(fenceMeta(node));
  return match ? Number(match[1]) : undefined;
}

/** Same `speed=N` fence-meta parsing as server/markdown-enhance.ts's rehypeGeekchart. */
export function speedFromMeta(node: HastElement | undefined): number | undefined {
  const match = /\bspeed=([0-9]*\.?[0-9]+)/.exec(fenceMeta(node));
  return match ? Number(match[1]) : undefined;
}
