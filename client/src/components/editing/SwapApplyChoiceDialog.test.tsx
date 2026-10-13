import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  formatBoundAgentReason,
  SwapApplyChoiceOptions,
  type SwapApplyChoiceOptionsProps,
} from "@/components/editing/SwapApplyChoiceDialog";

function defaultProps(overrides: Partial<SwapApplyChoiceOptionsProps> = {}): SwapApplyChoiceOptionsProps {
  return {
    prompt: "Swap this section",
    entryKey: "programs/full-stack/en",
    onUseSample: () => {},
    onAgentSelect: () => {},
    index: 2,
    ...overrides,
  };
}

function render(props: SwapApplyChoiceOptionsProps): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SwapApplyChoiceOptions {...props} />
    </QueryClientProvider>,
  );
}

type AnyElement = React.ReactElement<Record<string, unknown>>;

function findByTestId(node: React.ReactNode, testId: string): AnyElement | null {
  if (!React.isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = findByTestId(child, testId);
        if (hit) return hit;
      }
    }
    return null;
  }
  const el = node as AnyElement;
  if (el.props["data-testid"] === testId) return el;
  return findByTestId(el.props.children as React.ReactNode, testId);
}

describe("SwapApplyChoiceOptions", () => {
  it("renders both choices with the agent trigger enabled", () => {
    const html = render(defaultProps());
    expect(html).toContain('data-testid="button-swap-use-sample-2"');
    expect(html).toContain("Use sample text");
    expect(html).toContain('data-testid="button-swap-ai-agent-2"');
    expect(html).toContain("Ask AI agent");
    expect(html).not.toContain("text-swap-agent-bound-2");
    expect(html).not.toMatch(/data-testid="button-swap-ai-agent-2"[^>]*disabled/);
  });

  it("disables the agent trigger with a reason on bound sections", () => {
    const html = render(defaultProps({ isBound: true, boundSiblingCount: 3 }));
    expect(html).toContain('data-testid="text-swap-agent-bound-2"');
    expect(html).toContain("This section is synced to 3 other pages. Use sample text, or unbind it first.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="button-swap-ai-agent-2"/);
  });

  it("shows the shared-template note only when not bound", () => {
    expect(render(defaultProps({ isSharedTemplate: true }))).toContain("text-swap-agent-shared-2");
    expect(
      render(defaultProps({ isSharedTemplate: true, isBound: true, boundSiblingCount: 1 })),
    ).not.toContain("text-swap-agent-shared-2");
  });

  it("calls onUseSample from the sample button", () => {
    const onUseSample = vi.fn();
    const tree = SwapApplyChoiceOptions(defaultProps({ onUseSample }));
    const button = findByTestId(tree, "button-swap-use-sample-2");
    expect(button).not.toBeNull();
    (button!.props.onClick as () => void)();
    expect(onUseSample).toHaveBeenCalledTimes(1);
  });
});

describe("formatBoundAgentReason", () => {
  it("uses singular and plural page counts", () => {
    expect(formatBoundAgentReason(1)).toContain("synced to 1 other page.");
    expect(formatBoundAgentReason(2)).toContain("synced to 2 other pages.");
  });
});
