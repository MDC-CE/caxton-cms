import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isLocalVideo,
  shouldShowMutedOverlay,
  UniversalVideo,
} from "./UniversalVideo";

describe("shouldShowMutedOverlay", () => {
  it("shows for local autoplay with overlay object", () => {
    expect(
      shouldShowMutedOverlay({
        url: "https://cdn.example.com/clip.mp4",
        autoplay: true,
        overlay_on_muted: { title: "Hi" },
      }),
    ).toBe(true);
  });

  it("shows for empty overlay object (presence is the switch)", () => {
    expect(
      shouldShowMutedOverlay({
        url: "/media/intro.webm",
        autoplay: true,
        overlay_on_muted: {},
      }),
    ).toBe(true);
  });

  it("shows for YouTube autoplay with overlay", () => {
    expect(
      shouldShowMutedOverlay({
        url: "https://www.youtube.com/watch?v=abc123",
        autoplay: true,
        overlay_on_muted: { title: "Hi" },
      }),
    ).toBe(true);
  });

  it("hides when autoplay is off", () => {
    expect(
      shouldShowMutedOverlay({
        url: "https://cdn.example.com/clip.mp4",
        autoplay: false,
        overlay_on_muted: { title: "Hi" },
      }),
    ).toBe(false);
  });

  it("hides when overlay object is missing", () => {
    expect(
      shouldShowMutedOverlay({
        url: "https://cdn.example.com/clip.mp4",
        autoplay: true,
        overlay_on_muted: null,
      }),
    ).toBe(false);
    expect(
      shouldShowMutedOverlay({
        url: "https://cdn.example.com/clip.mp4",
        autoplay: true,
      }),
    ).toBe(false);
  });
});

describe("isLocalVideo", () => {
  it("detects common extensions", () => {
    expect(isLocalVideo("a.mp4")).toBe(true);
    expect(isLocalVideo("a.webm")).toBe(true);
    expect(isLocalVideo("https://youtube.com/watch?v=1")).toBe(false);
  });
});

describe("UniversalVideo muted overlay markup", () => {
  it("renders the overlay card for local muted autoplay", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalVideo, {
        url: "https://cdn.example.com/clip.mp4",
        autoplay: true,
        overlay_on_muted: {
          title: "Tu video ya ha comenzado",
          subtitle: "Haga clic para escuchar",
        },
      }),
    );
    expect(html).toContain('data-testid="video-muted-overlay"');
    expect(html).toContain("Tu video ya ha comenzado");
    expect(html).toContain("Haga clic para escuchar");
    expect(html).not.toContain(" controls");
  });

  it("renders muted YouTube autoplay iframe when autoplay is on", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalVideo, {
        url: "https://www.youtube.com/watch?v=abc123xyz",
        autoplay: true,
      }),
    );
    expect(html).toContain('data-testid="video-inline-youtube"');
    expect(html).toContain("mute=1");
    expect(html).toContain("autoplay=1");
    expect(html).not.toContain('data-testid="video-preview"');
  });

  it("renders YouTube overlay when configured", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalVideo, {
        url: "https://www.youtube.com/watch?v=abc123xyz",
        autoplay: true,
        overlay_on_muted: { title: "Tu video ya ha comenzado" },
      }),
    );
    expect(html).toContain('data-testid="video-muted-overlay"');
    expect(html).toContain("mute=1");
  });

  it("skips overlay markup when autoplay is off even with overlay config", () => {
    const html = renderToStaticMarkup(
      createElement(UniversalVideo, {
        url: "https://cdn.example.com/clip.mp4",
        autoplay: false,
        overlay_on_muted: { title: "Tu video ya ha comenzado" },
      }),
    );
    expect(html).not.toContain('data-testid="video-muted-overlay"');
    expect(html).toContain('data-testid="video-placeholder"');
  });
});
