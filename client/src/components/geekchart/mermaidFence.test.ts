import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";
import {
  collectHastText,
  durationFromMeta,
  isMermaidCodeNode,
  remarkFenceMeta,
  speedFromMeta,
} from "./mermaidFence";

// Same shape as ArticleDefault's raw-markdown path: rehype-raw drops node.data,
// sanitize keeps only allowed attributes.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/], "dataMeta"],
  },
};

async function firstCode(markdown: string, withFenceMeta = true): Promise<Element | undefined> {
  const processor = unified().use(remarkParse);
  if (withFenceMeta) processor.use(remarkFenceMeta);
  processor
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema as Parameters<typeof rehypeSanitize>[0]);
  const tree = (await processor.run(processor.parse(markdown))) as Root;
  let found: Element | undefined;
  visit(tree, "element", (node: Element) => {
    if (!found && node.tagName === "code") found = node;
  });
  return found;
}

describe("mermaid fence helpers", () => {
  it("recognizes a mermaid fence and reads its source", async () => {
    const code = await firstCode("```mermaid\nflowchart LR\n  A-->B\n```\n");
    expect(isMermaidCodeNode(code)).toBe(true);
    expect(collectHastText(code).trim()).toBe("flowchart LR\n  A-->B");
  });

  it("ignores other code fences", async () => {
    const code = await firstCode("```ts\nconst a = 1;\n```\n");
    expect(isMermaidCodeNode(code)).toBe(false);
  });

  it("keeps duration/speed through rehype-raw and sanitize", async () => {
    const code = await firstCode("```mermaid duration=6 speed=2\nflowchart LR\n  A-->B\n```\n");
    expect(durationFromMeta(code)).toBe(6);
    expect(speedFromMeta(code)).toBe(2);
  });

  it("loses fence meta without remarkFenceMeta (why the plugin exists)", async () => {
    const code = await firstCode("```mermaid duration=6\nflowchart LR\n  A-->B\n```\n", false);
    expect(durationFromMeta(code)).toBeUndefined();
  });

  it("falls back to node.data.meta when no rehype-raw pass ran", () => {
    const node = {
      type: "element",
      tagName: "code",
      properties: { className: ["language-mermaid"] },
      children: [],
      data: { meta: "speed=0.5" },
    } as unknown as Element;
    expect(speedFromMeta(node)).toBe(0.5);
    expect(durationFromMeta(node)).toBeUndefined();
  });
});
