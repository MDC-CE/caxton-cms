/**
 * Writes the spot-check report for the section padding move from the ledger.
 *
 *   npx tsx scripts/section-padding/report.ts [reports/section-padding-move.md]
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { KEPT_SELF_PADDED, PADDING_INVENTORY } from "./inventory";
import { maskBindings, SHARED_REGISTRY } from "./lib";
import type { LedgerRow } from "./move-padding";

const LEDGER_PATH = "reports/section-padding-move-ledger.json";
const out = process.argv[2] ?? "reports/section-padding-move.md";
const ledger: LedgerRow[] = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));

const sitesYml = yaml.load(fs.readFileSync("sites.yml", "utf8")) as Record<string, { content_folder?: string }>;
const domainBySite = new Map<string, string>();
for (const [domain, cfg] of Object.entries(sitesYml)) {
  if (cfg && typeof cfg === "object" && cfg.content_folder) domainBySite.set(cfg.content_folder, domain);
}

const loadYaml = (file: string): Record<string, unknown> | null => {
  try {
    return (yaml.load(maskBindings(fs.readFileSync(file, "utf8")).masked) as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
};

const patternCache = new Map<string, Map<string, Record<string, string>>>();
function urlPatterns(site: string): Map<string, Record<string, string>> {
  if (patternCache.has(site)) return patternCache.get(site)!;
  const map = new Map<string, Record<string, string>>();
  const ct = loadYaml(path.join(site, "content-types.yml")) ?? {};
  for (const cfg of Object.values(ct)) {
    if (!cfg || typeof cfg !== "object") continue;
    const c = cfg as { directory?: string; url_pattern?: Record<string, string> };
    if (c.directory && c.url_pattern) map.set(c.directory, c.url_pattern);
  }
  patternCache.set(site, map);
  return map;
}

type Kind = { label: string; locale?: string };
function kindOf(file: string): Kind {
  const base = path.basename(file);
  if (file.includes("/examples/")) return { label: "registry example" };
  if (/template/.test(base)) return { label: "shared template (every entry of this type)" };
  if (base === "_common.yml") return { label: "all locales" };
  const m = base.match(/^(?:(.+)\.)?(en|es)\.yml$/);
  if (!m) return { label: "other" };
  if (!m[1]) return { label: "live", locale: m[2] };
  if (/^draft/.test(m[1])) return { label: `draft (${m[1]})`, locale: m[2] };
  return { label: `variant/draft "${m[1]}"`, locale: m[2] };
}

function pageUrl(row: LedgerRow): string {
  if (row.site === SHARED_REGISTRY || row.file.includes("/component-registry/")) return "";
  const kind = kindOf(row.file);
  const parts = row.file.split("/");
  const site = parts[0];
  const domain = domainBySite.get(site);
  const pattern = urlPatterns(site).get(parts[1]);
  if (!domain || !pattern || parts.length < 4) return "";
  const locales = kind.locale ? [kind.locale] : ["en", "es"];
  const dir = path.dirname(row.file);
  const own = loadYaml(row.file) ?? {};
  const common = loadYaml(path.join(dir, "_common.yml")) ?? {};
  const urls: string[] = [];
  for (const locale of locales) {
    const p = pattern[locale] ?? pattern.default ?? pattern.en;
    if (!p) continue;
    const localeFile = loadYaml(path.join(dir, `${locale}.yml`)) ?? {};
    const pick = (k: string) => {
      for (const src of [own, localeFile, common]) {
        const v = src[k];
        if (typeof v === "string" && v && !v.includes("__SPBIND_")) return v;
      }
      return k === "slug" ? path.basename(dir) : `:${k}`;
    };
    urls.push(`https://${domain}${p.replace(/:([a-z_]+)/g, (_, k) => pick(k))}`);
  }
  return urls.join(" ");
}

const fmt = (v: unknown) => (v === null || v === undefined ? "(unset)" : JSON.stringify(v).replace(/"/g, "").replace(/,/g, ", "));
const esc = (s: string) => s.replace(/\|/g, "\\|");

const total = ledger.length;
const files = new Set(ledger.map((r) => r.file)).size;
const bySite = new Map<string, number>();
const byComponent = new Map<string, { n: number; px: number }>();
for (const r of ledger) {
  bySite.set(r.site, (bySite.get(r.site) ?? 0) + 1);
  const c = byComponent.get(r.component) ?? { n: 0, px: 0 };
  c.n++;
  if (r.exact_px) c.px++;
  byComponent.set(r.component, c);
}

const inventoryRows = PADDING_INVENTORY.map((e) => {
  const side = (b: { top: number; bottom: number }) => (b.top === b.bottom ? `${b.top}` : `${b.top} / ${b.bottom}`);
  const variants = e.renderedAs.map((r) => `${r.type}:${r.variant}`).join(", ");
  const extra = e.otherwise ? ` (otherwise mobile ${side(e.otherwise.mobile)}, desktop ${side(e.otherwise.desktop)})` : "";
  return `| ${e.file.replace("client/src/components/", "")} | ${variants} | ${side(e.mobile)} | ${side(e.desktop)}${extra} | ${e.note ?? ""} |`;
});

const spotRows: string[] = [];
const spotComponents = new Set<string>();
for (const r of ledger) {
  if (spotComponents.has(r.component)) continue;
  const kind = kindOf(r.file);
  if (kind.label !== "live" || !r.site.startsWith("site_")) continue;
  const url = pageUrl(r);
  if (!url) continue;
  spotComponents.add(r.component);
  spotRows.push(`| ${r.component} | ${url} | ${r.section} | ${fmt(r.before)} | ${fmt(r.after)} |`);
}

const detail = ledger.filter((r) => r.exact_px || r.note || r.background_after || r.flags.length);
const detailRows = detail.map((r) => {
  const kind = kindOf(r.file);
  const notes = [
    r.background_after ? `background ${fmt(r.background_before)} → ${r.background_after}` : "",
    ...r.flags,
    r.note ?? "",
  ].filter(Boolean).join("; ");
  return `| ${pageUrl(r) || "—"} | ${r.file} | ${kind.locale ?? ""} ${kind.label} | ${r.section} | ${r.component} | ${fmt(r.before)} | ${fmt(r.after)} | ${esc(notes)} |`;
});

const bgRows = ledger.filter((r) => r.background_after);
const flagged = ledger.filter((r) => r.flags.length);

const md = `# Section padding move — spot-check report

Generated ${new Date().toISOString().slice(0, 10)} from \`${LEDGER_PATH}\`.

About 40 section components used to add their own top and bottom padding in code. That padding now lives in each section's spacing setting (\`paddingY\`), so staff and agents see and control it. Every existing section got the old padding added to its setting, so live pages should look the same after the deploy.

- Sections updated: **${total}** in **${files}** files
- Per site: ${[...bySite.entries()].map(([s, n]) => `${s} ${n}`).join(", ")}
- Sections whose new value uses exact pixels (no preset matched): ${ledger.filter((r) => r.exact_px).length}
- Sections whose background setting changed so the color keeps covering the moved padding: ${bgRows.length}. Every new value is a theme background; a "Muted 30%" (\`muted-30\`) entry was added to the 4geeks-com and 4geeks-florida themes for the old \`bg-muted/30\` tint.

## Staff reminder: proposals created before the deploy

Layout proposals (agent or staff) created before this deploy were written when components still added their own padding. Before approving one, open its preview and check the vertical spacing: a proposal that adds or replaces one of these sections without a spacing value will now show it with no padding.

## Spot checks (one live page per component)

Open each page after the deploy and compare spacing above and below the section with how it looked before.

| Component | Page | Section | Before | After |
|---|---|---|---|---|
${spotRows.join("\n")}

## Things that are intentionally not pixel-identical

- **Pricing plan cards** (\`pricing:planCards\`, \`pricing:planCardsComparison\`): the old padding switched at 640px; section spacing switches at 768px. Screens 640–767px wide now get 32px instead of 56px.
- **Sections with a max width and a converted background** (${flagged.length}): the color used to fill only the max-width box; the section background now spans the full width. Listed in the table below with a flag.
- **Not migrated (YAML that does not parse, page already broken):** \`site_4geeks-com/pages/home-new/en.yml\`, \`site_4geeks-florida/pages/home-new/en.yml\`, \`site_4geeks-florida/pages/ejemplo/en.yml\`.

## Components that keep their own padding

These paint a surface edge to edge (decorations or color bands span the padding), so the padding is part of the design, not section spacing. Their schema now marks them \`self_padded\`.

${KEPT_SELF_PADDED.map((f) => `- \`${f}\``).join("\n")}

## Per component

| Component | Sections | Exact px |
|---|---|---|
${[...byComponent.entries()].sort().map(([c, v]) => `| ${c} | ${v.n} | ${v.px} |`).join("\n")}

## Inventory (px moved per breakpoint, top / bottom)

| File | Rendered as | Mobile | Desktop | Note |
|---|---|---|---|---|
${inventoryRows.join("\n")}

## Every section with exact px, a background change, or a note

| Page | File | Locale / kind | Section | Component | Before | After | Notes |
|---|---|---|---|---|---|---|---|
${detailRows.join("\n")}

## After the deploy

Run the read-only re-scan to catch sections saved with the old values between the final content push and the deploy:

\`\`\`bash
npx tsx scripts/section-padding/rescan.ts
\`\`\`
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log("wrote", out, "rows", detailRows.length, "spot checks", spotRows.length);
