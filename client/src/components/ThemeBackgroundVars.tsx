import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { buildThemeBackgroundCss, THEME_BG_STYLE_ID, type ThemePalettes } from "@shared/theme-palette";

/**
 * Declares `--theme-bg-<id>` vars on pages the server did not theme
 * (private/editor/preview routes, client navigations from them) and keeps
 * them current after Theme editor saves (shared `/api/theme` query).
 */
export function ThemeBackgroundVars() {
  const [location] = useLocation();
  const [ssrThemed] = useState(
    () => typeof document !== "undefined" && !!document.getElementById("__theme_overrides__"),
  );
  const enabled = !ssrThemed || location.startsWith("/private");
  const { data: theme } = useQuery<ThemePalettes>({ queryKey: ["/api/theme"], enabled });

  useEffect(() => {
    if (!enabled || !theme) return;
    const css = buildThemeBackgroundCss(theme);
    let el = document.getElementById(THEME_BG_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = THEME_BG_STYLE_ID;
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }, [enabled, theme]);

  return null;
}
