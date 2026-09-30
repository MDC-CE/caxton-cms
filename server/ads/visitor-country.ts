/**
 * Best-effort visitor country for the consent banner mode.
 * Order: CDN header → shared geo cache (filled by /api/geo) → short ip-api lookup.
 * Returns null when unknown; callers fall back to the configured unknown-country mode.
 */

import type { Request } from "express";
import { geoGet, geoSet } from "../geo-cache";
import { normalizeCountryCode } from "@shared/consent";

const LOOKUP_TIMEOUT_MS = 1500;

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined;
  return first || req.ip || req.socket?.remoteAddress || "";
}

function isLocalIp(ip: string): boolean {
  return !ip || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

function countryFromGeoData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  return normalizeCountryCode((data as { countryCode?: unknown }).countryCode);
}

export function countryFromHeaders(req: Request): string | null {
  const header =
    req.headers["cf-ipcountry"] ??
    req.headers["x-vercel-ip-country"] ??
    req.headers["x-country-code"];
  const code = normalizeCountryCode(Array.isArray(header) ? header[0] : header);
  return code && code !== "XX" && code !== "T1" ? code : null;
}

export async function resolveVisitorCountry(req: Request): Promise<string | null> {
  const fromHeader = countryFromHeaders(req);
  if (fromHeader) return fromHeader;

  const ip = clientIpFromRequest(req);
  if (isLocalIp(ip)) return null;

  const cached = countryFromGeoData(geoGet(ip));
  if (cached) return cached;

  try {
    const apiKey = process.env.IPAPI_PRO_KEY;
    const fields = "status,city,country,countryCode,regionName,timezone,lat,lon";
    const url = apiKey
      ? `https://pro.ip-api.com/json/${ip}?key=${apiKey}&fields=${fields}`
      : `http://ip-api.com/json/${ip}?fields=${fields}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    geoSet(ip, data);
    return countryFromGeoData(data);
  } catch {
    return null;
  }
}
