import type { MoneyByCurrency } from "./ads-types";

/** Per-currency amounts, never summed across currencies. */
export function formatMoney(money: MoneyByCurrency | undefined, opts: { decimals?: number } = {}): string {
  const entries = Object.entries(money ?? {}).filter(([, v]) => Number.isFinite(v));
  if (entries.length === 0) return "—";
  return entries
    .map(([cur, v]) => {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: cur,
          maximumFractionDigits: opts.decimals ?? (v >= 100 ? 0 : 2),
        }).format(v);
      } catch {
        return `${v.toFixed(opts.decimals ?? 2)} ${cur}`;
      }
    })
    .join(" · ");
}

export function moneyTotal(money: MoneyByCurrency | undefined): number {
  return Object.values(money ?? {}).reduce((s, v) => s + v, 0);
}

export function formatPct(ratio: number | null | undefined, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat().format(Math.round(n));
}

export function formatSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return d.toLocaleDateString();
}

export const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  meta: "Meta",
  google: "Google",
  microsoft: "Microsoft",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
  snapchat: "Snapchat",
  pinterest: "Pinterest",
  other: "Other",
};
