import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const editModeMock = vi.hoisted(() => ({
  isEditMode: false,
}));

const registryState = vi.hoisted(() => ({
  full: {
    presets: {},
    images: {
      "in-both": { src: "/a.webp", alt: "A" },
      "full-only": { src: "/b.webp", alt: "B" },
    },
  } as { presets: Record<string, unknown>; images: Record<string, { src: string; alt: string }> },
  visitor: {
    presets: {},
    images: {
      "in-both": { src: "/a.webp", alt: "A" },
    },
  } as { presets: Record<string, unknown>; images: Record<string, { src: string; alt: string }> },
  visitorLoading: false,
  visitorFetched: true,
}));

vi.mock("@/contexts/EditModeContext", () => ({
  useEditModeOptional: () => editModeMock,
}));

vi.mock("@/contexts/SectionContext", () => ({
  useSectionContext: () => ({
    isPriority: false,
    sectionIndex: 0,
    contentType: "landing",
    slug: "test-landing",
    locale: "es",
    imageSizes: {},
    variableFields: undefined,
    variableKeys: undefined,
  }),
}));

vi.mock("@/hooks/useContentTypes", () => ({
  useContentTypes: () => ({}),
}));

vi.mock("@/components/DebugBubble/utils/debugHelpers", () => ({
  detectContentInfo: () => ({ type: "landing", slug: "test-landing", label: "Landing" }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/landing/test-landing", vi.fn()],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (opts: { queryKey: unknown[] }) => {
      const key = opts.queryKey;
      if (Array.isArray(key) && key[0] === "/api/image-registry" && key[1] === "visitor-subset") {
        return {
          data: registryState.visitorFetched ? registryState.visitor : undefined,
          isLoading: registryState.visitorLoading,
          isFetched: registryState.visitorFetched,
        };
      }
      if (Array.isArray(key) && key[0] === "/api/image-registry") {
        return { data: registryState.full, isLoading: false, isFetched: true };
      }
      return { data: undefined, isLoading: false, isFetched: true };
    },
  };
});

vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { UniversalImage } from "@/components/UniversalImage";

describe("UniversalImage visitor-blank / edit broken", () => {
  beforeEach(() => {
    editModeMock.isEditMode = false;
    registryState.visitorLoading = false;
    registryState.visitorFetched = true;
    // reset capture query
    vi.stubGlobal("window", {
      ...globalThis.window,
      location: { search: "", pathname: "/landing/test-landing" },
    });
  });

  it("renders img for visitors when id is in the (SSR) registry", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(<UniversalImage id="in-both" />);
    expect(html).toContain('data-testid="img-in-both"');
    expect(html).not.toContain("img-broken");
  });

  it("returns empty for visitors when id is missing from registry", () => {
    editModeMock.isEditMode = false;
    const html = renderToStaticMarkup(<UniversalImage id="full-only" />);
    // Public uses whatever is in /api/image-registry (often the SSR subset).
    // In this mock the full registry has full-only — visitors would see it if hydrated with full.
    // Simulate visitor subset-only by using an unknown id:
    const missing = renderToStaticMarkup(<UniversalImage id="nowhere" />);
    expect(missing).toBe("");
  });

  it("shows BrokenImage in edit mode when id is only in the full gallery", () => {
    editModeMock.isEditMode = true;
    const html = renderToStaticMarkup(<UniversalImage id="full-only" />);
    expect(html).toContain('data-testid="img-broken-full-only"');
    expect(html).toContain('data-broken-reason="visitor-blank"');
    expect(html).not.toContain('data-testid="img-full-only"');
  });

  it("still renders img on private preview when id is missing from the live visitor subset", () => {
    editModeMock.isEditMode = true;
    vi.stubGlobal("window", {
      ...globalThis.window,
      location: {
        search: "?variant=home-layout&locale=en",
        pathname: "/private/preview/page/home",
      },
    });
    const html = renderToStaticMarkup(<UniversalImage id="full-only" />);
    expect(html).toContain('data-testid="img-full-only"');
    expect(html).not.toContain("img-broken");
  });

  it("shows BrokenImage in edit mode for unknown ids", () => {
    editModeMock.isEditMode = true;
    const html = renderToStaticMarkup(<UniversalImage id="nowhere" />);
    expect(html).toContain('data-testid="img-broken-nowhere"');
    expect(html).toContain('data-broken-reason="unknown"');
  });

  it("does not show BrokenImage when capture=1 even in edit mode", () => {
    editModeMock.isEditMode = true;
    vi.stubGlobal("window", {
      location: { search: "?capture=1", pathname: "/landing/test-landing" },
    });
    const html = renderToStaticMarkup(<UniversalImage id="full-only" />);
    // capture hides edit chrome → visitor path: id is in full mock registry so img renders
    expect(html).not.toContain("img-broken");
    expect(html).toContain('data-testid="img-full-only"');
  });

  it("renders img in edit mode when id is in the visitor subset", () => {
    editModeMock.isEditMode = true;
    const html = renderToStaticMarkup(<UniversalImage id="in-both" />);
    expect(html).toContain('data-testid="img-in-both"');
    expect(html).not.toContain("img-broken");
  });
});
