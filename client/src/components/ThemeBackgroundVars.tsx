import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  buildThemeBackgroundCss,
  buildThemeColorVarsCss,
  isSiteThemedPath,
  THEME_BG_STYLE_ID,
  THEME_COLORS_CLIENT_STYLE_ID,
  THEME_OVERRIDES_STYLE_ID,
  type ThemePalettes,
} from "@shared/theme-palette";

type SiteTheme = ThemePalettes & {
  colors?: { light?: Record<string, string>; dark?: Record<string, string> };
};

function upsertStyle(id: string, css: string): void {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/**
 * Declares `--theme-bg-<id>` vars on pages the server did not theme
 * (private/editor/preview routes, client navigations from them) and keeps
 * them current after Theme editor saves (shared `/api/theme` query).
 *
 * Site colors (`colors.light` / `colors.dark`) apply only where the site's
 * pages render (public pages, page preview, section demos); admin-only
 * screens keep the default colors, even after a client navigation.
 */
export function ThemeBackgroundVars() {
  const [location] = useLocation();
  const [ssrThemed] = useState(
    () => typeof document !== "undefined" && !!document.getElementById(THEME_OVERRIDES_STYLE_ID),
  );
  const siteThemed = isSiteThemedPath(location);
  const enabled = !ssrThemed || location.startsWith("/private");
  const { data: theme } = useQuery<SiteTheme>({ queryKey: ["/api/theme"], enabled });

  useEffect(() => {
    if (!enabled || !theme) return;
    upsertStyle(THEME_BG_STYLE_ID, buildThemeBackgroundCss(theme));
  }, [enabled, theme]);

  useEffect(() => {
    const server = document.getElementById(THEME_OVERRIDES_STYLE_ID) as HTMLStyleElement | null;
    if (server) server.disabled = !siteThemed;
    const clientColors = siteThemed && !server && theme ? buildThemeColorVarsCss(theme.colors) : "";
    if (clientColors) {
      upsertStyle(THEME_COLORS_CLIENT_STYLE_ID, clientColors);
    } else {
      document.getElementById(THEME_COLORS_CLIENT_STYLE_ID)?.remove();
    }
  }, [siteThemed, theme]);

  return null;
}
