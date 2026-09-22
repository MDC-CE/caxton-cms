import { useState, useEffect, useRef, useMemo } from "react";
import { AlertTriangle, ArrowLeft, Blocks, ChevronDown, ChevronUp, FileInput, LayoutGrid, Link, Moon, Palette, Plus, Save, Search, Sun, Trash2, Undo2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiRequestWithAuth, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoleculeRenderer, type MoleculeDefinition } from "@/components/MoleculeRenderer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import yaml from "js-yaml";
import { escapeTemplateVars, unescapeObjectVars } from "@shared/templateVars";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterSitemapEntries, sitemapPathname } from "@/lib/sitemapSearch";

interface PreviewExample {
  component: string;
  version: string;
  example: string;
  /** @deprecated legacy: full-page iframe; prefer importYaml */
  pageUrl?: string;
  /** Imported section YAML used to render this preview. */
  importYaml?: string;
  /** True when this row maps to an example that exists in component registry. */
  registryPersisted?: boolean;
}

function parseImportedSections(importYaml?: string): unknown[] {
  if (!importYaml?.trim()) return [];
  try {
    const { escaped, map } = escapeTemplateVars(importYaml);
    const parsed = unescapeObjectVars(yaml.load(escaped), map);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // Ignore invalid YAML
  }
  return [];
}

interface SitemapEntry {
  loc: string;
  label: string;
  /** Present on dynamic sitemap entries; required for correct /api/page-sections locale. */
  locale?: string;
}

interface RemoteSectionWithYaml {
  type: string;
  section_id: string | null;
  label: string;
  yamlContent?: string;
}

interface PaletteEntry {
  id: string;
  label: string;
  cssVar?: string;
  value?: string;
  lightValue?: string;
  darkValue?: string;
}

interface ThemeData {
  colors?: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
  };
  preview_examples?: PreviewExample[];
  backgrounds?: PaletteEntry[];
  text?: PaletteEntry[];
  accents?: PaletteEntry[];
}

interface MoleculesData {
  molecules: MoleculeDefinition[];
}

interface RegistryComponent {
  type: string;
  name: string;
  versions: string[];
}

interface RegistryData {
  components: RegistryComponent[];
}

interface ExampleItem {
  name: string;
  yaml: string;
}

interface VariantImpact {
  variantName: string;
  componentName: string;
  tsxPath: string;
  examples: string[];
  pages: Array<{ path: string; count: number; sectionIds: string[] }>;
}

type DeleteStep = "choose" | "confirm-example" | "confirm-variant";

const TOKEN_GROUPS: { label: string; tokens: { id: string; label: string }[] }[] = [
  {
    label: "Brand",
    tokens: [
      { id: "--primary", label: "Primary" },
      { id: "--accent", label: "Accent" },
      { id: "--destructive", label: "Destructive" },
    ],
  },
  {
    label: "Surfaces",
    tokens: [
      { id: "--background", label: "Background" },
      { id: "--card", label: "Card" },
      { id: "--muted", label: "Muted" },
      { id: "--secondary", label: "Secondary" },
    ],
  },
  {
    label: "Foregrounds",
    tokens: [
      { id: "--foreground", label: "Foreground" },
      { id: "--muted-foreground", label: "Muted text" },
      { id: "--primary-foreground", label: "On Primary" },
      { id: "--secondary-foreground", label: "On Secondary" },
      { id: "--accent-foreground", label: "On Accent" },
      { id: "--destructive-foreground", label: "On Destructive" },
    ],
  },
  {
    label: "Borders & Ring",
    tokens: [
      { id: "--border", label: "Border" },
      { id: "--input", label: "Input border" },
      { id: "--ring", label: "Focus ring" },
    ],
  },
];

function parseHsl(value: string): [number, number, number] {
  const parts = (value || "").trim().split(/\s+/);
  const h = parseFloat(parts[0]) || 0;
  const s = parseFloat(parts[1]) || 0;
  const l = parseFloat(parts[2]) || 0;
  return [Math.round(h), Math.round(s), Math.round(l)];
}

function formatHsl(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

interface ColorPickerPopoverProps {
  value: string;
  onChange: (value: string) => void;
  testId: string;
  swatchClassName?: string;
}

function parseColorValue(value: string): [number, number, number] | null {
  if (!value) return null;
  const fromHex = hexToHsl(value);
  if (fromHex) return fromHex;
  const trimmed = value.trim();
  if (/^\d/.test(trimmed)) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]);
      const l = parseFloat(parts[2]);
      if (!isNaN(h) && !isNaN(s) && !isNaN(l)) return [Math.round(h), Math.round(s), Math.round(l)];
    }
  }
  return null;
}

function ColorPickerBody({ value, onChange, testId }: { value: string; onChange: (v: string) => void; testId: string }) {
  const parsed = parseColorValue(value);
  const isColor = parsed !== null;
  const [h, s, l] = isColor ? parsed : [0, 0, 50];
  const [hexInput, setHexInput] = useState(isColor ? hslToHex(h, s, l) : "");

  useEffect(() => {
    const p = parseColorValue(value);
    setHexInput(p ? hslToHex(...p) : "");
  }, [value]);

  const handleHexChange = (v: string) => {
    setHexInput(v);
    const p = hexToHsl(v);
    if (p) onChange(formatHsl(...p));
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={hexInput}
        onChange={(e) => handleHexChange(e.target.value)}
        placeholder="#hex"
        className="w-full text-xs px-2 py-1 rounded-md border border-input bg-background font-mono"
        data-testid={`input-hex-${testId}`}
      />
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-3">H</span>
          <div
            className="flex-1 h-2 rounded-full relative"
            style={{
              background: `linear-gradient(to right, hsl(0 ${s}% ${l}%), hsl(60 ${s}% ${l}%), hsl(120 ${s}% ${l}%), hsl(180 ${s}% ${l}%), hsl(240 ${s}% ${l}%), hsl(300 ${s}% ${l}%), hsl(360 ${s}% ${l}%))`,
            }}
          >
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={h}
              onChange={(e) => onChange(formatHsl(Number(e.target.value), s, l))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              data-testid={`slider-h-${testId}`}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${(h / 360) * 100}%`, transform: "translateX(-50%) translateY(-50%)", backgroundColor: `hsl(${h} ${s}% ${l}%)` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-7 text-right">{h}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-3">S</span>
          <div
            className="flex-1 h-2 rounded-full relative"
            style={{ background: `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))` }}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={s}
              onChange={(e) => onChange(formatHsl(h, Number(e.target.value), l))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              data-testid={`slider-s-${testId}`}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${s}%`, transform: "translateX(-50%) translateY(-50%)", backgroundColor: `hsl(${h} ${s}% ${l}%)` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-7 text-right">{s}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-3">L</span>
          <div
            className="flex-1 h-2 rounded-full relative"
            style={{ background: `linear-gradient(to right, hsl(${h} ${s}% 0%), hsl(${h} ${s}% 50%), hsl(${h} ${s}% 100%))` }}
          >
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={l}
              onChange={(e) => onChange(formatHsl(h, s, Number(e.target.value)))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              data-testid={`slider-l-${testId}`}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${l}%`, transform: "translateX(-50%) translateY(-50%)", backgroundColor: `hsl(${h} ${s}% ${l}%)` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-7 text-right">{l}%</span>
        </div>
      </div>
    </div>
  );
}

function ColorPickerPopover({ value, onChange, testId, swatchClassName }: ColorPickerPopoverProps) {
  const parsed = parseColorValue(value);
  const isColor = parsed !== null;
  const [h, s, l] = isColor ? parsed : [0, 0, 50];

  const defaultSwatchClass = "w-5 h-5 rounded border border-border shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`swatch-${testId}`}
          className={swatchClassName ?? defaultSwatchClass}
          style={isColor ? { backgroundColor: `hsl(${h} ${s}% ${l}%)` } : undefined}
          title={isColor ? `hsl(${h} ${s}% ${l}%)` : "Not a plain color"}
        >
          {!isColor && (
            <span
              className="block w-full h-full rounded"
              style={{
                background: "repeating-conic-gradient(#aaa 0% 25%, transparent 0% 50%) 0 0 / 6px 6px",
              }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <ColorPickerBody value={value} onChange={onChange} testId={testId} />
      </PopoverContent>
    </Popover>
  );
}

interface ColorRowProps {
  tokenId: string;
  label: string;
  value: string;
  onChange: (token: string, value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function ColorRow({ tokenId, label, value, onChange, isOpen, onToggle }: ColorRowProps) {
  const testId = tokenId.replace(/^--/, "");
  const parsedColor = parseColorValue(value);
  const swatchBg = parsedColor ? `hsl(${parsedColor[0]} ${parsedColor[1]}% ${parsedColor[2]}%)` : undefined;
  return (
    <div className="py-3" data-testid={`color-row-${testId}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{label}</span>
        <button
          type="button"
          className="w-6 h-6 rounded-full border border-border shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: swatchBg }}
          onClick={onToggle}
          aria-expanded={isOpen}
          data-testid={`swatch-${testId}`}
        />
      </div>
      {isOpen && (
        <div className="mt-2">
          <ColorPickerBody
            value={value}
            onChange={(v) => onChange(tokenId, v)}
            testId={testId}
          />
        </div>
      )}
    </div>
  );
}

interface PaletteEntryRowProps {
  entry: PaletteEntry;
  index: number;
  total: number;
  knownCssVars: Set<string>;
  previewMode: "light" | "dark";
  onChange: (index: number, entry: PaletteEntry) => void;
  onDelete: (index: number) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

function resolveSwatchColor(entry: PaletteEntry, previewMode: "light" | "dark"): string {
  if (entry.cssVar) return `hsl(var(${entry.cssVar}))`;
  if (previewMode === "light" && entry.lightValue) return entry.lightValue;
  if (previewMode === "dark" && entry.darkValue) return entry.darkValue;
  return entry.value || "transparent";
}

function PaletteEntryRow({
  entry,
  index,
  total,
  knownCssVars,
  previewMode,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: PaletteEntryRowProps) {
  const mode: "cssVar" | "value" = entry.cssVar ? "cssVar" : "value";
  const isUnknownVar = mode === "cssVar" && entry.cssVar && !knownCssVars.has(entry.cssVar);
  const swatchColor = resolveSwatchColor(entry, previewMode);

  const setMode = (newMode: "cssVar" | "value") => {
    if (newMode === "cssVar") {
      onChange(index, { ...entry, cssVar: entry.cssVar || "--", value: undefined, lightValue: undefined, darkValue: undefined });
    } else {
      onChange(index, { ...entry, cssVar: undefined, value: entry.value || "", lightValue: entry.lightValue || "", darkValue: entry.darkValue || "" });
    }
  };

  return (
    <div className="py-2 space-y-2" data-testid={`palette-entry-${entry.id}`}>
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded border border-border shrink-0"
          style={{ background: swatchColor }}
          title={swatchColor}
        />
        <input
          type="text"
          value={entry.label}
          onChange={(e) => onChange(index, { ...entry, label: e.target.value })}
          className="flex-1 min-w-0 text-xs px-2 py-1 rounded-md border border-input bg-background"
          placeholder="Label"
          data-testid={`input-palette-label-${index}`}
        />
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setMode("cssVar")}
            className={`text-xs px-1.5 py-0.5 rounded-l border transition-colors ${mode === "cssVar" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover-elevate"}`}
            data-testid={`button-mode-cssvar-${index}`}
          >
            var
          </button>
          <button
            type="button"
            onClick={() => setMode("value")}
            className={`text-xs px-1.5 py-0.5 rounded-r border-t border-r border-b transition-colors ${mode === "value" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover-elevate"}`}
            data-testid={`button-mode-value-${index}`}
          >
            val
          </button>
        </div>
        <button
          type="button"
          onClick={() => onMoveUp(index)}
          disabled={index === 0}
          className="text-muted-foreground disabled:opacity-30 hover-elevate p-0.5 rounded"
          data-testid={`button-move-up-${index}`}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1}
          className="text-muted-foreground disabled:opacity-30 hover-elevate p-0.5 rounded"
          data-testid={`button-move-down-${index}`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="text-muted-foreground hover:text-destructive hover-elevate p-0.5 rounded"
          data-testid={`button-delete-entry-${index}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {mode === "cssVar" && (
        <div className="flex items-center gap-2 pl-7">
          <input
            type="text"
            value={entry.cssVar || ""}
            onChange={(e) => onChange(index, { ...entry, cssVar: e.target.value })}
            className="flex-1 text-xs px-2 py-1 rounded-md border border-input bg-background font-mono"
            placeholder="--variable-name"
            data-testid={`input-cssvar-${index}`}
          />
          {isUnknownVar && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400 gap-1 shrink-0">
              <AlertTriangle className="h-3 w-3" />
              Unknown var
            </Badge>
          )}
        </div>
      )}

      {mode === "value" && (
        <div className="space-y-1.5 pl-7">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Value</span>
              <input
                type="text"
                value={entry.value || ""}
                onChange={(e) => onChange(index, { ...entry, value: e.target.value })}
                className="flex-1 text-xs px-2 py-1 rounded-md border border-input bg-background font-mono"
                placeholder="hsl(...) or linear-gradient(...)"
                data-testid={`input-value-${index}`}
              />
              <ColorPickerPopover
                value={entry.value || ""}
                onChange={(v) => onChange(index, { ...entry, value: v })}
                testId={`value-${index}`}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Light value</span>
              <input
                type="text"
                value={entry.lightValue || ""}
                onChange={(e) => onChange(index, { ...entry, lightValue: e.target.value })}
                className="flex-1 text-xs px-2 py-1 rounded-md border border-input bg-background font-mono"
                placeholder="optional light mode override"
                data-testid={`input-light-value-${index}`}
              />
              <ColorPickerPopover
                value={entry.lightValue || ""}
                onChange={(v) => onChange(index, { ...entry, lightValue: v })}
                testId={`light-value-${index}`}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-20 shrink-0">Dark value</span>
              <input
                type="text"
                value={entry.darkValue || ""}
                onChange={(e) => onChange(index, { ...entry, darkValue: e.target.value })}
                className="flex-1 text-xs px-2 py-1 rounded-md border border-input bg-background font-mono"
                placeholder="optional dark mode override"
                data-testid={`input-dark-value-${index}`}
              />
              <ColorPickerPopover
                value={entry.darkValue || ""}
                onChange={(v) => onChange(index, { ...entry, darkValue: v })}
                testId={`dark-value-${index}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PaletteAccordionProps {
  palette: "backgrounds" | "text" | "accents";
  label: string;
  entries: PaletteEntry[];
  knownCssVars: Set<string>;
  previewMode: "light" | "dark";
  onChange: (palette: "backgrounds" | "text" | "accents", entries: PaletteEntry[]) => void;
}

function PaletteAccordion({ palette, label, entries, knownCssVars, previewMode, onChange }: PaletteAccordionProps) {
  const handleEntryChange = (index: number, updated: PaletteEntry) => {
    const next = [...entries];
    next[index] = updated;
    onChange(palette, next);
  };

  const handleDelete = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(palette, next);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...entries];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(palette, next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= entries.length - 1) return;
    const next = [...entries];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(palette, next);
  };

  const handleAdd = () => {
    const newEntry: PaletteEntry = {
      id: `entry-${Date.now()}`,
      label: "New entry",
      cssVar: "--primary",
    };
    onChange(palette, [...entries, newEntry]);
  };

  return (
    <AccordionItem value={palette} data-testid={`palette-accordion-${palette}`}>
      <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 hover:no-underline">
        {label}
        <span className="ml-auto mr-2 text-xs font-normal normal-case tracking-normal text-muted-foreground">
          {entries.length} entries
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        <div className="space-y-0">
          {entries.map((entry, i) => (
            <div key={`${entry.id}-${i}`}>
              <PaletteEntryRow
                entry={entry}
                index={i}
                total={entries.length}
                knownCssVars={knownCssVars}
                previewMode={previewMode}
                onChange={handleEntryChange}
                onDelete={handleDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
              {i < entries.length - 1 && <Separator />}
            </div>
          ))}
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAdd}
              className="w-full gap-1.5"
              data-testid={`button-add-entry-${palette}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Add entry
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

const ATOM_TAG_ORDER = ["button", "badge", "form", "card", "stats", "banner", "atoms"] as const;
const ATOM_TAG_LABELS: Record<string, string> = {
  button: "Buttons",
  badge: "Badges",
  form: "Form Elements",
  card: "Cards",
  stats: "Stats",
  banner: "Banners",
  atoms: "Other Atoms",
};

function getGroupTag(molecule: MoleculeDefinition): string {
  for (const tag of ATOM_TAG_ORDER) {
    if (molecule.tags.includes(tag)) return tag;
  }
  return "atoms";
}

function AtomGroups({ molecules }: { molecules: MoleculeDefinition[] }) {
  const grouped = (() => {
    const map: Record<string, MoleculeDefinition[]> = {};
    for (const m of molecules) {
      const tag = getGroupTag(m);
      if (!map[tag]) map[tag] = [];
      map[tag].push(m);
    }
    return map;
  })();

  return (
    <div className="space-y-8">
      {ATOM_TAG_ORDER.map((tag) => {
        const group = grouped[tag];
        if (!group || group.length === 0) return null;
        return (
          <div key={tag}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {ATOM_TAG_LABELS[tag] || tag}
            </p>
            <div className="flex flex-wrap gap-4 items-start">
              {group.map((molecule) => (
                <div
                  key={molecule.id}
                  className="flex flex-col gap-1.5"
                  data-testid={`molecule-${molecule.id}`}
                >
                  <div className="flex items-center justify-center p-4 rounded-md bg-background border border-border min-w-[120px]">
                    <MoleculeRenderer molecule={molecule} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">{molecule.variant}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ImportExampleDialogProps {
  open: boolean;
  onClose: () => void;
  registryData: { components: { type: string; name: string; versions: string[] }[] } | undefined;
  onImport: (entry: PreviewExample) => void;
  previewMode: "light" | "dark";
  themeVars: Record<string, string>;
}

function normalizePagePath(path: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  p = p.toLowerCase();
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

interface SiteLocaleSettings {
  default_locale: string;
  supported_locales: { code: string; label: string }[];
}

/** Prefer sitemap entry.locale; else first path segment if it is a supported locale; else settings default. */
function resolveLocaleForPageSections(
  entry: SitemapEntry,
  pagePath: string,
  settings: SiteLocaleSettings | undefined,
): string {
  if (entry.locale && /^[a-z]{2}$/i.test(entry.locale)) {
    return entry.locale.toLowerCase();
  }
  const codes = new Set(
    (settings?.supported_locales ?? []).map((l) => l.code.toLowerCase()),
  );
  const first = normalizePagePath(pagePath).split("/").filter(Boolean)[0]?.toLowerCase();
  if (first && codes.has(first)) {
    return first;
  }
  return (settings?.default_locale ?? "en").toLowerCase();
}

function ImportExampleDialog({ open, onClose, registryData, onImport, previewMode, themeVars }: ImportExampleDialogProps) {
  const { toast } = useToast();
  const [importDialogContentEl, setImportDialogContentEl] = useState<HTMLDivElement | null>(null);
  const [componentType, setComponentType] = useState("");
  const [expandedPage, setExpandedPage] = useState<{ path: string; locale: string } | null>(null);
  const [selectedPage, setSelectedPage] = useState<{
    path: string;
    label: string;
    locale: string;
  } | null>(null);
  const [selectedSection, setSelectedSection] = useState<RemoteSectionWithYaml | null>(null);
  const [saveToRegistry, setSaveToRegistry] = useState(false);
  const [registryExampleName, setRegistryExampleName] = useState("");
  const [registryExampleDescription, setRegistryExampleDescription] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const registryVersionForType = (type: string) =>
    registryData?.components.find((c) => c.type === type)?.versions[0] ?? "v1.0";

  const friendlyComponentName = (type: string) =>
    registryData?.components.find((c) => c.type === type)?.name ?? type;

  useEffect(() => {
    if (open) {
      setComponentType("");
      setExpandedPage(null);
      setSelectedPage(null);
      setSelectedSection(null);
      setSaveToRegistry(false);
      setRegistryExampleName("");
      setRegistryExampleDescription("");
      setPageSearch("");
      setPreviewKey(0);
    }
  }, [open]);

  const { data: sitemapUrls = [], isLoading: sitemapLoading } = useQuery<SitemapEntry[]>({
    queryKey: ["/api/sitemap-urls"],
    queryFn: async () => {
      const res = await fetch("/api/sitemap-urls");
      if (!res.ok) throw new Error("Failed to load pages");
      return res.json();
    },
    enabled: pickerOpen,
  });

  const { data: localeSettings } = useQuery<SiteLocaleSettings>({
    queryKey: ["/api/settings/locales"],
    queryFn: async () => {
      const res = await fetch("/api/settings/locales");
      if (!res.ok) throw new Error("Failed to load locales");
      return res.json();
    },
    enabled: pickerOpen,
  });

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery<{ sections: RemoteSectionWithYaml[] }>({
    queryKey: ["/api/page-sections", expandedPage?.path, expandedPage?.locale, "withYaml"],
    queryFn: async () => {
      const ep = expandedPage!;
      const q = new URLSearchParams({
        path: ep.path,
        locale: ep.locale,
        includeYaml: "true",
      });
      const res = await fetch(`/api/page-sections?${q.toString()}`);
      if (!res.ok) throw new Error("Failed to load sections");
      return res.json();
    },
    enabled: !!expandedPage,
  });

  const filteredSections = sectionsData?.sections ?? [];

  const filteredPages = useMemo(
    () => filterSitemapEntries(sitemapUrls, pageSearch),
    [sitemapUrls, pageSearch],
  );

  const handlePageClick = (entry: SitemapEntry) => {
    const pagePath = normalizePagePath(sitemapPathname(entry.loc));
    const locale = resolveLocaleForPageSections(entry, pagePath, localeSettings);
    if (expandedPage?.path === pagePath && expandedPage.locale === locale) {
      setExpandedPage(null);
    } else {
      setExpandedPage({ path: pagePath, locale });
      setSelectedPage({ path: pagePath, label: entry.label, locale });
      setSelectedSection(null);
    }
  };

  const handleSectionClick = (section: RemoteSectionWithYaml) => {
    setSelectedSection(section);
    setComponentType(section.type);
    setPickerOpen(false);
    try {
      const { escaped, map } = escapeTemplateVars(section.yamlContent ?? "");
      const parsed = unescapeObjectVars(yaml.load(escaped), map);
      const sections = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
      sessionStorage.setItem("preview-sections", JSON.stringify(sections));
    } catch {
      sessionStorage.removeItem("preview-sections");
    }
    setPreviewKey((k) => k + 1);
  };

  const handleUse = async () => {
    if (!selectedSection || !selectedPage) return;
    if (saveToRegistry && !registryExampleName.trim()) return;
    setSaving(true);
    try {
      const version =
        registryData?.components.find((c) => c.type === componentType)?.versions[0] ?? "v1.0";

      if (saveToRegistry) {
        const res = await apiRequest(
          "POST",
          `/api/component-registry/${componentType}/${version}/examples`,
          {
            yamlContent: selectedSection.yamlContent ?? "",
            sectionId: selectedSection.section_id ?? undefined,
            name: registryExampleName.trim(),
            description: registryExampleDescription.trim() || undefined,
          }
        );
        const data = (await res.json()) as { exampleName: string };
        queryClient.invalidateQueries({ queryKey: ["/api/component-registry"] });
        onImport({
          component: componentType,
          version,
          example: data.exampleName,
          importYaml: selectedSection.yamlContent ?? "",
          registryPersisted: true,
        });
        toast({ title: "Example saved", description: `Saved as "${data.exampleName}" in the registry.` });
      } else {
        onImport({
          component: componentType,
          version,
          example: selectedSection.label,
          importYaml: selectedSection.yamlContent ?? "",
          registryPersisted: false,
        });
      }
      onClose();
    } catch (err) {
      toast({ title: "Failed to import", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pickerLabel = selectedSection
    ? `${selectedPage?.label ?? ""} — ${selectedSection.label}`
    : selectedPage
      ? `${selectedPage.label} — pick a section`
      : "Pick page & section";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        ref={(node) => setImportDialogContentEl(node)}
        className="max-w-7xl h-[85vh] flex flex-col gap-0 p-0 overflow-hidden"
        data-testid="dialog-import-example"
      >
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <DialogTitle>Import example from page</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0">
          {/* Left panel */}
          <div className="w-[340px] flex-shrink-0 border-r flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Page & section picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Page &amp; section</label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
                <PopoverTrigger asChild>
                  <button
                    className="w-full text-left text-sm px-3 py-1.5 rounded-md border border-input bg-background flex items-center gap-2 hover-elevate"
                    data-testid="button-import-picker"
                  >
                    <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span
                      className={cn(
                        "truncate",
                        selectedSection ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {pickerLabel}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-0 z-[10001] pointer-events-auto"
                  align="start"
                  container={importDialogContentEl ?? undefined}
                >
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={pageSearch}
                        onChange={(e) => setPageSearch(e.target.value)}
                        placeholder="Search pages..."
                        className="h-8 pl-8 text-sm"
                        autoFocus
                        data-testid="input-import-page-search"
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-[300px]">
                    {sitemapLoading ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">Loading pages...</div>
                    ) : filteredPages.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        {pageSearch ? "No pages found" : "No pages available"}
                      </div>
                    ) : (
                      <div className="p-1">
                        {filteredPages.map((entry, idx) => {
                          const pagePath = normalizePagePath(sitemapPathname(entry.loc));
                          const rowLocale = resolveLocaleForPageSections(
                            entry,
                            pagePath,
                            localeSettings,
                          );
                          const isExpanded =
                            expandedPage?.path === pagePath &&
                            expandedPage.locale === rowLocale;
                          return (
                            <div key={pagePath}>
                              <button
                                onClick={() => handlePageClick(entry)}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate flex items-start gap-2",
                                  isExpanded && "bg-primary/5"
                                )}
                                data-testid={`button-import-page-${idx}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-foreground truncate text-xs">{entry.label}</div>
                                  <div className="text-xs text-muted-foreground truncate">{pagePath}</div>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="ml-3 pl-2 border-l border-border pb-1">
                                  {sectionsLoading ? (
                                    <div className="py-2 px-2 text-xs text-muted-foreground">Loading sections...</div>
                                  ) : filteredSections.length === 0 ? (
                                    <div className="py-2 px-2 text-xs text-muted-foreground">
                                      No sections found on this page
                                    </div>
                                  ) : (
                                    filteredSections.map((section, sIdx) => {
                                      const friendly = friendlyComponentName(section.type);
                                      return (
                                        <button
                                          key={
                                            section.section_id
                                              ? `${section.section_id}-${sIdx}`
                                              : `${section.type}-${sIdx}-${section.label}`
                                          }
                                          onClick={() => handleSectionClick(section)}
                                          className={cn(
                                            "w-full text-left px-2 py-1.5 rounded-md text-xs hover-elevate flex items-start gap-2",
                                            selectedSection?.label === section.label &&
                                              selectedPage?.path === pagePath &&
                                              selectedPage?.locale === rowLocale &&
                                              "bg-primary/10 text-primary"
                                          )}
                                          data-testid={`button-import-section-${idx}-${sIdx}`}
                                        >
                                          <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2">
                                              <span className="truncate font-medium text-foreground">{section.label}</span>
                                              <span
                                                className="text-[10px] text-muted-foreground shrink-0 max-w-[42%] truncate text-right"
                                                title={friendly}
                                              >
                                                {friendly}
                                              </span>
                                            </div>
                                            <div className="text-[10px] font-mono text-muted-foreground/80 truncate mt-0.5">
                                              {section.type}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>

            {selectedSection && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-0.5">
                <p className="text-xs font-medium">{selectedSection.label}</p>
                <p className="text-xs text-muted-foreground">{selectedPage?.path}</p>
                <p className="text-xs text-muted-foreground">
                  {friendlyComponentName(selectedSection.type)}
                  <span className="font-mono text-[10px] opacity-70 ml-1">({selectedSection.type})</span>
                </p>
              </div>
            )}

            <label className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox
                checked={saveToRegistry}
                onCheckedChange={(v) => setSaveToRegistry(!!v)}
                data-testid="checkbox-save-to-registry"
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Save as new registry example</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Persists this section as a reusable YAML file in the component registry.
                  Leave unchecked to add as a session-only reference.
                </p>
              </div>
            </label>

            {saveToRegistry && (
              <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="import-registry-example-name" className="text-xs">
                    Example name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="import-registry-example-name"
                    value={registryExampleName}
                    onChange={(e) => setRegistryExampleName(e.target.value)}
                    placeholder="e.g. Homepage hero spotlight"
                    className="h-9 text-sm"
                    data-testid="input-import-registry-example-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-registry-example-description" className="text-xs">
                    Description
                  </Label>
                  <Textarea
                    id="import-registry-example-description"
                    value={registryExampleDescription}
                    onChange={(e) => setRegistryExampleDescription(e.target.value)}
                    placeholder="What this example demonstrates…"
                    rows={3}
                    className="text-sm resize-y min-h-[72px]"
                    data-testid="input-import-registry-example-description"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 min-h-2" />

            <Button
              disabled={
                !selectedSection ||
                !selectedPage ||
                saving ||
                (saveToRegistry && !registryExampleName.trim())
              }
              onClick={handleUse}
              data-testid="button-use-this-section"
            >
              {saving ? "Saving..." : "Use this section"}
            </Button>
          </div>

          {/* Right panel — component preview (not full page) */}
          <div className="flex-1 min-h-0 bg-muted/20 flex flex-col">
            {selectedSection ? (
              <iframe
                key={`${selectedSection.type}-${previewKey}`}
                src={`/private/component-showcase/${encodeURIComponent(selectedSection.type)}/preview?debug=false&version=${encodeURIComponent(registryVersionForType(selectedSection.type))}&_=${previewKey}`}
                className="w-full flex-1 min-h-0 border-none bg-background"
                title={`Preview: ${friendlyComponentName(selectedSection.type)}`}
                data-testid="iframe-import-preview"
                onLoad={(e) => {
                  const win = (e.currentTarget as HTMLIFrameElement).contentWindow;
                  if (win) {
                    win.postMessage({ type: "theme-vars-update", vars: themeVars, mode: previewMode }, "*");
                  }
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground px-4 text-center">
                <LayoutGrid className="h-10 w-10 opacity-20" />
                <p className="text-sm">Expand a page and choose a section to preview that component here</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ThemeEditor() {
  const { toast } = useToast();
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");
  const [lightColors, setLightColors] = useState<Record<string, string>>({});
  const [darkColors, setDarkColors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isPaletteSaving, setIsPaletteSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"atoms" | "examples">("atoms");
  const [activeTab, setActiveTab] = useState<"base" | "custom">("base");
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [radiusOpen, setRadiusOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(288);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleDragStart = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.max(200, Math.min(560, dragStartWidth.current + delta));
      setSidebarWidth(next);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const [confirmedExamples, setConfirmedExamples] = useState<PreviewExample[]>([]);
  const confirmedExamplesRef = useRef<PreviewExample[]>([]);
  const [addRow, setAddRow] = useState<{ component: string; version: string; example: string } | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const iframeRefs = useRef<Map<number, HTMLIFrameElement>>(new Map());
  const colorsInitialized = useRef(false);

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    entry: PreviewExample | null;
    entryIdx: number;
    step: DeleteStep;
    variantImpact: VariantImpact | null;
    variantImpactLoading: boolean;
  }>({ open: false, entry: null, entryIdx: -1, step: "choose", variantImpact: null, variantImpactLoading: false });

  const deleteExampleMutation = useMutation({
    mutationFn: async ({ component, version, example }: { component: string; version: string; example: string }) => {
      await apiRequest("DELETE", `/api/component-registry/${component}/versions/${version}/examples/${encodeURIComponent(example)}`);
    },
    onSuccess: () => {
      const { entry, entryIdx } = deleteModal;
      if (entry) {
        const updated = confirmedExamples.filter((_, i) => i !== entryIdx);
        setConfirmedExamples(updated);
        savePreviewExamples(updated);
      }
      setDeleteModal((m) => ({ ...m, open: false }));
      queryClient.invalidateQueries({ queryKey: ["/api/component-registry"] });
      toast({ title: "Example deleted", description: "The example has been permanently removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: async ({ component, variantName }: { component: string; variantName: string }) => {
      await apiRequest("DELETE", `/api/component-registry/${component}/variants/${encodeURIComponent(variantName)}`);
    },
    onSuccess: () => {
      const { entry, variantImpact } = deleteModal;
      if (entry) {
        // Remove all preview entries for this variant (not just the clicked one),
        // since the variant and all its examples are gone
        const deletedExamples = new Set(variantImpact?.examples ?? []);
        const updated = confirmedExamples.filter(
          (ex) => ex.component !== entry.component || !deletedExamples.has(ex.example)
        );
        setConfirmedExamples(updated);
        savePreviewExamples(updated);
      }
      setDeleteModal((m) => ({ ...m, open: false }));
      queryClient.invalidateQueries({ queryKey: ["/api/component-registry"] });
      toast({ title: "Variant deleted", description: "The component variant and all its examples have been permanently removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const [backgrounds, setBackgrounds] = useState<PaletteEntry[]>([]);
  const [textPalette, setTextPalette] = useState<PaletteEntry[]>([]);
  const [accents, setAccents] = useState<PaletteEntry[]>([]);
  const palettesInitialized = useRef(false);

  const { data: themeData, isLoading: themeLoading } = useQuery<ThemeData>({
    queryKey: ["/api/theme"],
  });

  const { data: moleculesData, isLoading: moleculesLoading } = useQuery<MoleculesData>({
    queryKey: ["/api/molecules"],
  });

  const { data: registryData } = useQuery<RegistryData>({
    queryKey: ["/api/component-registry"],
  });

  const addRowComponentVersions = (() => {
    if (!addRow?.component || !registryData) return [];
    const comp = registryData.components.find((c) => c.type === addRow.component);
    return comp?.versions || [];
  })();

  const { data: addRowExamplesData } = useQuery<{ examples: ExampleItem[] }>({
    queryKey: ["/api/component-registry", addRow?.component, addRow?.version, "examples"],
    enabled: !!(addRow?.component && addRow?.version),
    queryFn: async () => {
      const res = await fetch(`/api/component-registry/${addRow!.component}/${addRow!.version}/examples`);
      if (!res.ok) throw new Error("Failed to fetch examples");
      return res.json();
    },
  });

  useEffect(() => {
    confirmedExamplesRef.current = confirmedExamples;
  }, [confirmedExamples]);

  useEffect(() => {
    if (themeData?.colors && !colorsInitialized.current) {
      setLightColors(themeData.colors.light || {});
      setDarkColors(themeData.colors.dark || {});
      colorsInitialized.current = true;
    }
    if (themeData?.preview_examples !== undefined) {
      setConfirmedExamples(themeData.preview_examples);
    }
    if (!palettesInitialized.current && (themeData?.backgrounds || themeData?.text || themeData?.accents)) {
      if (themeData.backgrounds) setBackgrounds(themeData.backgrounds);
      if (themeData.text) setTextPalette(themeData.text);
      if (themeData.accents) setAccents(themeData.accents);
      palettesInitialized.current = true;
    }
  }, [themeData]);

  const savePreviewExamples = async (examples: PreviewExample[]) => {
    try {
      const toSave = examples.filter((e) => !e.pageUrl);
      await apiRequest("PUT", "/api/theme/preview-examples", toSave);
      queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
    } catch {
      toast({ title: "Save failed", description: "Could not save preview examples.", variant: "destructive" });
    }
  };

  useEffect(() => {
    const onPreviewReady = (event: MessageEvent) => {
      if (event.data?.type !== "preview-ready") return;
      const sourceWin = event.source as Window | null;
      if (!sourceWin) return;

      confirmedExamplesRef.current.forEach((entry, idx) => {
        if (!entry.importYaml?.trim()) return;
        const iframeWin = iframeRefs.current.get(idx)?.contentWindow;
        if (iframeWin !== sourceWin) return;
        sourceWin.postMessage(
          { type: "preview-update", sections: parseImportedSections(entry.importYaml) },
          "*",
        );
      });
    };

    window.addEventListener("message", onPreviewReady);
    return () => window.removeEventListener("message", onPreviewReady);
  }, []);

  useEffect(() => {
    const activeColors = previewMode === "light" ? lightColors : darkColors;
    iframeRefs.current.forEach((iframe) => {
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "theme-vars-update", vars: activeColors, mode: previewMode },
          "*"
        );
      }
    });
  }, [lightColors, darkColors, previewMode]);

  const activeColors = previewMode === "light" ? lightColors : darkColors;

  const knownCssVars = (() => {
    const vars = new Set<string>();
    for (const key of Object.keys(themeData?.colors?.light || {})) vars.add(key);
    for (const key of Object.keys(themeData?.colors?.dark || {})) vars.add(key);
    return vars;
  })();

  const handleColorChange = (token: string, value: string) => {
    if (previewMode === "light") {
      setLightColors((prev) => ({ ...prev, [token]: value }));
    } else {
      setDarkColors((prev) => ({ ...prev, [token]: value }));
    }
  };

  const previewStyle = (() => {
    const vars: Record<string, string> = {};
    const colors = previewMode === "light" ? lightColors : darkColors;
    for (const [k, v] of Object.entries(colors)) {
      if (k !== "--radius") vars[k] = v;
    }
    return vars as React.CSSProperties;
  })();

  const radiusValue = parseFloat(activeColors["--radius"] || "0.75") || 0.75;

  const handleRadiusChange = (v: number) => {
    const val = `${v}rem`;
    if (previewMode === "light") {
      setLightColors((prev) => ({ ...prev, "--radius": val }));
    } else {
      setDarkColors((prev) => ({ ...prev, "--radius": val }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", "/api/theme/colors", { light: lightColors, dark: darkColors });
      toast({ title: "Theme saved", description: "Color changes are now live on the site." });
      queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
    } catch {
      toast({ title: "Save failed", description: "Could not save theme colors.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (themeData?.colors) {
      setLightColors(themeData.colors.light || {});
      setDarkColors(themeData.colors.dark || {});
    }
  };

  const handlePaletteSave = async () => {
    setIsPaletteSaving(true);
    try {
      const res = await apiRequestWithAuth("PUT", "/api/theme/palettes", { backgrounds, text: textPalette, accents });
      const result = await res.json() as { ok: boolean; warnings?: string[] };
      if (result?.warnings?.length) {
        toast({
          title: "Palettes saved with warnings",
          description: `Saved, but some cssVar references may not resolve: ${result.warnings.join("; ")}`,
        });
      } else {
        toast({ title: "Palettes saved", description: "Custom palette changes are now live." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/theme"] });
    } catch (err: unknown) {
      let description = "Could not save palettes.";
      if (err instanceof Error) {
        description = err.message || description;
      }
      toast({ title: "Save failed", description, variant: "destructive" });
    } finally {
      setIsPaletteSaving(false);
    }
  };

  const handlePaletteReset = () => {
    if (themeData?.backgrounds) setBackgrounds(themeData.backgrounds);
    if (themeData?.text) setTextPalette(themeData.text);
    if (themeData?.accents) setAccents(themeData.accents);
  };

  const handlePaletteChange = (palette: "backgrounds" | "text" | "accents", entries: PaletteEntry[]) => {
    if (palette === "backgrounds") setBackgrounds(entries);
    else if (palette === "text") setTextPalette(entries);
    else if (palette === "accents") setAccents(entries);
  };

  const atomMolecules = (moleculesData?.molecules || []).filter((m) => m.tags.includes("theme-preview"));

  return (
    <>
    <div className="flex h-screen bg-background overflow-hidden" data-testid="page-theme-editor">
      <div className="shrink-0 flex flex-col bg-card relative border-r border-border" style={{ width: sidebarWidth }}>
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Theme Editor</h1>
          </div>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setPreviewMode("light")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${previewMode === "light" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover-elevate"}`}
              data-testid="button-mode-light"
            >
              <Sun className="h-3.5 w-3.5" />
              Light
            </button>
            <button
              onClick={() => setPreviewMode("dark")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${previewMode === "dark" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover-elevate"}`}
              data-testid="button-mode-dark"
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
          </div>
        </div>

        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveTab("base")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === "base" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover-elevate"}`}
            data-testid="tab-base-theme"
          >
            Base Theme
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === "custom" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover-elevate"}`}
            data-testid="tab-custom-theme"
          >
            Custom Theme
          </button>
        </div>

        {activeTab === "base" && (
          <>
            <ScrollArea className="flex-1 px-4">
              {themeLoading ? (
                <div className="space-y-4 py-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="py-2">
                  <Accordion type="multiple" defaultValue={TOKEN_GROUPS.map((g) => g.label)} className="w-full">
                    {TOKEN_GROUPS.map((group) => (
                      <AccordionItem key={group.label} value={group.label} data-testid={`accordion-group-${group.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                        <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 hover:no-underline">
                          {group.label}
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                          <div>
                            {group.tokens.map((token, i) => (
                              <div key={token.id}>
                                <ColorRow
                                  tokenId={token.id}
                                  label={token.label}
                                  value={activeColors[token.id] || "0 0% 0%"}
                                  onChange={handleColorChange}
                                  isOpen={expandedToken === token.id}
                                  onToggle={() => setExpandedToken(expandedToken === token.id ? null : token.id)}
                                />
                                {i < group.tokens.length - 1 && <Separator />}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}

                    <AccordionItem value="Radius" data-testid="accordion-group-radius">
                      <AccordionTrigger className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 hover:no-underline">
                        Radius
                        <span className="ml-auto mr-2 text-xs font-normal normal-case tracking-normal text-muted-foreground">{radiusValue.toFixed(2)}rem</span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 relative h-2 rounded-full bg-muted">
                            <input
                              type="range"
                              min={0}
                              max={2}
                              step={0.05}
                              value={radiusValue}
                              onChange={(e) => handleRadiusChange(Number(e.target.value))}
                              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                              data-testid="slider-radius"
                            />
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white bg-primary shadow-sm"
                              style={{ left: `${(radiusValue / 2) * 100}%`, transform: "translateX(-50%) translateY(-50%)" }}
                            />
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(radiusValue / 2) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right shrink-0">{radiusValue.toFixed(2)}rem</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {[0, 0.25, 0.5, 0.75, 1, 1.5, 2].map((v) => (
                            <button
                              key={v}
                              onClick={() => handleRadiusChange(v)}
                              className={`flex-1 h-6 border text-xs transition-colors hover-elevate ${Math.abs(radiusValue - v) < 0.01 ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                              style={{ borderRadius: `${v * 8}px` }}
                              data-testid={`button-radius-${v}`}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </ScrollArea>

            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="flex-1"
                data-testid="button-reset-theme"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1"
                data-testid="button-save-theme"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        )}

        {activeTab === "custom" && (
          <>
            <ScrollArea className="flex-1 px-4">
              {themeLoading ? (
                <div className="space-y-4 py-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="py-2">
                  <Accordion type="multiple" defaultValue={["backgrounds", "text", "accents"]} className="w-full">
                    <PaletteAccordion
                      palette="backgrounds"
                      label="Backgrounds"
                      entries={backgrounds}
                      knownCssVars={knownCssVars}
                      previewMode={previewMode}
                      onChange={handlePaletteChange}
                    />
                    <PaletteAccordion
                      palette="text"
                      label="Text"
                      entries={textPalette}
                      knownCssVars={knownCssVars}
                      previewMode={previewMode}
                      onChange={handlePaletteChange}
                    />
                    <PaletteAccordion
                      palette="accents"
                      label="Accents"
                      entries={accents}
                      knownCssVars={knownCssVars}
                      previewMode={previewMode}
                      onChange={handlePaletteChange}
                    />
                  </Accordion>
                </div>
              )}
            </ScrollArea>

            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePaletteReset}
                className="flex-1"
                data-testid="button-reset-palettes"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Reset
              </Button>
              <Button
                size="sm"
                onClick={handlePaletteSave}
                disabled={isPaletteSaving}
                className="flex-1"
                data-testid="button-save-palettes"
              >
                <Save className="h-3.5 w-3.5" />
                {isPaletteSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        )}
      </div>

      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10 relative"
        onMouseDown={handleDragStart}
        data-testid="sidebar-resize-handle"
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setActiveSection("atoms")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeSection === "atoms" ? "bg-muted text-foreground" : "text-muted-foreground hover-elevate"}`}
            data-testid="tab-atoms"
          >
            <Blocks className="h-4 w-4" />
            Atoms & Molecules
          </button>
          <button
            onClick={() => setActiveSection("examples")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeSection === "examples" ? "bg-muted text-foreground" : "text-muted-foreground hover-elevate"}`}
            data-testid="tab-examples"
          >
            <LayoutGrid className="h-4 w-4" />
            Examples
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${previewMode === "dark" ? "bg-slate-500" : "bg-amber-400"}`} />
            Previewing {previewMode} mode
          </div>
        </div>

        <ScrollArea className="flex-1">
          {activeSection === "atoms" && (
            <div
              className={`site-theme p-6 min-h-full ${previewMode === "dark" ? "dark bg-[hsl(0_0%_8%)]" : "bg-[hsl(0_0%_97%)]"}`}
              style={previewStyle}
              data-testid="preview-atoms"
            >
              {moleculesLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : atomMolecules.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No theme-preview molecules found
                </div>
              ) : (
                <AtomGroups molecules={atomMolecules} />
              )}
            </div>
          )}

          {activeSection === "examples" && (
            <div className="p-6 space-y-6" data-testid="preview-examples">
              {confirmedExamples.map((entry, idx) => {
                const isSessionImport = !!(entry.importYaml || entry.pageUrl);
                const iframeSrc = entry.importYaml
                  ? `/private/component-showcase/${encodeURIComponent(entry.component)}/preview?debug=false&version=${encodeURIComponent(entry.version)}&embed=theme`
                  : entry.pageUrl
                    ? entry.pageUrl
                    : `/private/component-showcase/${encodeURIComponent(entry.component)}/preview?debug=false&version=${encodeURIComponent(entry.version)}&example=${encodeURIComponent(entry.example)}`;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSessionImport && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">imported</Badge>
                        )}
                        <p className="text-sm font-medium truncate">
                          {isSessionImport
                            ? `${entry.component} — ${entry.example}`
                            : `${entry.component} — ${entry.version} — ${entry.example}`}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setDeleteModal({
                            open: true,
                            entry,
                            entryIdx: idx,
                            step: "choose",
                            variantImpact: null,
                            variantImpactLoading: false,
                          });
                        }}
                        data-testid={`button-delete-example-${idx}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="rounded-md border border-border overflow-hidden">
                      <iframe
                        ref={(el) => {
                          if (el) iframeRefs.current.set(idx, el);
                          else iframeRefs.current.delete(idx);
                        }}
                        src={iframeSrc}
                        className="w-full"
                        style={{ height: 420, border: "none" }}
                        title={`${entry.component} ${entry.example} preview`}
                        data-testid={`iframe-example-${idx}`}
                        onLoad={(e) => {
                          const win = (e.currentTarget as HTMLIFrameElement).contentWindow;
                          if (win) {
                            const colors = previewMode === "light" ? lightColors : darkColors;
                            win.postMessage({ type: "theme-vars-update", vars: colors, mode: previewMode }, "*");
                            if (entry.importYaml?.trim()) {
                              const msg = {
                                type: "preview-update" as const,
                                sections: parseImportedSections(entry.importYaml),
                              };
                              win.postMessage(msg, "*");
                              setTimeout(() => win.postMessage(msg, "*"), 50);
                              setTimeout(() => win.postMessage(msg, "*"), 200);
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {addRow !== null && (
                <div className="rounded-md border border-border p-4 space-y-3" data-testid="add-example-row">
                  <p className="text-sm font-medium text-muted-foreground">Add example</p>
                  <div className="flex flex-wrap gap-3">
                    <select
                      className="flex-1 min-w-[140px] text-sm rounded-md border border-input bg-background px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={addRow.component}
                      onChange={(e) => setAddRow({ component: e.target.value, version: "", example: "" })}
                      data-testid="select-add-component"
                    >
                      <option value="">Component...</option>
                      {(registryData?.components || []).map((c) => (
                        <option key={c.type} value={c.type}>{c.name}</option>
                      ))}
                    </select>

                    <select
                      className="flex-1 min-w-[120px] text-sm rounded-md border border-input bg-background px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      value={addRow.version}
                      onChange={(e) => setAddRow((prev) => prev ? { ...prev, version: e.target.value, example: "" } : prev)}
                      disabled={!addRow.component}
                      data-testid="select-add-version"
                    >
                      <option value="">Version...</option>
                      {addRowComponentVersions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>

                    <select
                      className="flex-1 min-w-[140px] text-sm rounded-md border border-input bg-background px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      value={addRow.example}
                      onChange={(e) => setAddRow((prev) => prev ? { ...prev, example: e.target.value } : prev)}
                      disabled={!addRow.component || !addRow.version}
                      data-testid="select-add-example"
                    >
                      <option value="">Example...</option>
                      {(addRowExamplesData?.examples || []).map((ex) => (
                        <option key={ex.name} value={ex.name}>{ex.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddRow(null)}
                      data-testid="button-cancel-add-example"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!addRow.component || !addRow.version || !addRow.example}
                      onClick={async () => {
                        if (!addRow.component || !addRow.version || !addRow.example) return;
                        const updated = [...confirmedExamples, { component: addRow.component, version: addRow.version, example: addRow.example }];
                        setConfirmedExamples(updated);
                        setAddRow(null);
                        await savePreviewExamples(updated);
                      }}
                      data-testid="button-confirm-add-example"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddRow({ component: "", version: "", example: "" })}
                  disabled={addRow !== null}
                  data-testid="button-add-example"
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add example
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setImportDialogOpen(true)}
                  disabled={addRow !== null}
                  data-testid="button-import-example"
                  className="flex items-center gap-1.5"
                >
                  <FileInput className="h-4 w-4" />
                  Import example from page
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>

    <Dialog
      open={deleteModal.open}
      onOpenChange={(open) => {
        if (!open) setDeleteModal((m) => ({ ...m, open: false }));
      }}
    >
      <DialogContent
        className="max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden gap-0 p-0"
        data-testid="dialog-delete-example"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pr-12 flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>
            {deleteModal.step === "choose" && "Remove from preview"}
            {deleteModal.step === "confirm-example" && "Delete example?"}
            {deleteModal.step === "confirm-variant" && "Delete component variant?"}
          </DialogTitle>
        </DialogHeader>

        {deleteModal.step === "choose" && deleteModal.entry && (
          <div className="space-y-2 pt-1">
            <button
              className="w-full text-left px-4 py-3 rounded-md border border-border hover-elevate text-sm"
              data-testid="button-remove-from-references"
              onClick={async () => {
                const updated = confirmedExamples.filter((_, i) => i !== deleteModal.entryIdx);
                iframeRefs.current.delete(deleteModal.entryIdx);
                setConfirmedExamples(updated);
                await savePreviewExamples(updated);
                setDeleteModal((m) => ({ ...m, open: false }));
              }}
            >
              <p className="font-medium">Remove from references</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remove from this preview list only. The example and component remain intact.
              </p>
            </button>

            {!deleteModal.entry?.pageUrl && (deleteModal.entry?.registryPersisted ?? !deleteModal.entry?.importYaml) && (
              <button
                className="w-full text-left px-4 py-3 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 hover-elevate text-sm"
                data-testid="button-choose-delete-example"
                onClick={() => setDeleteModal((m) => ({ ...m, step: "confirm-example" }))}
              >
                <p className="font-medium text-amber-800 dark:text-amber-300">Delete example</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Permanently delete this example YAML from the registry. No pages will be affected.
                </p>
              </button>
            )}

            {!deleteModal.entry?.pageUrl && (deleteModal.entry?.registryPersisted ?? !deleteModal.entry?.importYaml) && (
              <button
                className="w-full text-left px-4 py-3 rounded-md border border-destructive bg-destructive/5 hover-elevate text-sm"
                data-testid="button-choose-delete-variant"
              onClick={async () => {
                const { entry } = deleteModal;
                if (!entry) return;
                setDeleteModal((m) => ({ ...m, variantImpactLoading: true, step: "confirm-variant" }));
                try {
                  const params = new URLSearchParams({ version: entry.version, exampleName: entry.example });
                  const res = await fetch(`/api/component-registry/${entry.component}/variant-impact?${params}`);
                  if (!res.ok) {
                    const errBody = await res.json().catch(() => ({})) as { error?: string };
                    throw new Error(errBody.error || "Failed to fetch variant impact");
                  }
                  const data = await res.json() as VariantImpact;
                  setDeleteModal((m) => ({ ...m, variantImpact: data, variantImpactLoading: false }));
                } catch {
                  setDeleteModal((m) => ({ ...m, variantImpactLoading: false, step: "choose" }));
                  toast({ title: "Failed to load impact info", variant: "destructive" });
                }
              }}
            >
              <p className="font-medium text-destructive">Delete variant</p>
              <p className="text-xs text-destructive/80 mt-0.5">
                Permanently delete the component variant, all its examples, and remove all its uses from pages.
              </p>
            </button>
            )}

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteModal((m) => ({ ...m, open: false }))}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {deleteModal.step === "confirm-example" && deleteModal.entry && (
          <div className="space-y-4 pt-1">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded px-1 py-0.5 -ml-1"
              onClick={() => setDeleteModal((m) => ({ ...m, step: "choose" }))}
              data-testid="button-back-to-choose"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <p className="text-sm">
              Delete the example <span className="font-semibold">"{deleteModal.entry.example}"</span>?
            </p>
            <p className="text-sm text-muted-foreground">
              This will no longer appear when you choose an example for this component variant. This action cannot be undone. No existing pages or components will be affected.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteModal((m) => ({ ...m, open: false }))}
                data-testid="button-cancel-delete-example"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteExampleMutation.isPending}
                onClick={() => {
                  const { entry } = deleteModal;
                  if (!entry) return;
                  deleteExampleMutation.mutate({ component: entry.component, version: entry.version, example: entry.example });
                }}
                data-testid="button-confirm-delete-example"
              >
                {deleteExampleMutation.isPending ? "Deleting..." : "Delete example"}
              </Button>
            </div>
          </div>
        )}

        {deleteModal.step === "confirm-variant" && (
          <div className="space-y-4 pt-1">
            <button
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover-elevate rounded px-1 py-0.5 -ml-1"
              onClick={() => setDeleteModal((m) => ({ ...m, step: "choose", variantImpact: null }))}
              data-testid="button-back-to-choose-variant"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            {deleteModal.variantImpactLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : deleteModal.variantImpact ? (
              <div className="space-y-3">
                <p className="text-sm">
                  This will permanently delete the component{" "}
                  <span className="font-semibold">{deleteModal.variantImpact.componentName}</span>
                </p>
                <p className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1 break-all">
                  {deleteModal.variantImpact.tsxPath}
                </p>

                {deleteModal.variantImpact.pages.length > 0 && (
                  <>
                    <p className="text-sm">...and all its uses on the following pages:</p>
                    <div className="rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 space-y-2 max-h-[250px] overflow-y-auto">
                      {deleteModal.variantImpact.pages.map((p) => (
                        <div key={p.path} className="text-xs border-b border-destructive/10 last:border-0 last:pb-0 pb-2 last:mb-0">
                          <div>
                            <span className="font-medium font-mono">{p.path}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              → {p.count} {p.count === 1 ? "use" : "uses"}
                            </span>
                          </div>
                          {p.sectionIds.length > 0 && (
                            <div className="mt-1.5 pl-0">
                              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
                                Section IDs
                              </p>
                              <ul className="space-y-0.5 pl-0">
                                {p.sectionIds.map((id) => (
                                  <li
                                    key={id}
                                    className="font-mono text-[11px] text-muted-foreground/90 break-all pl-3 border-l-2 border-muted-foreground/25"
                                  >
                                    {id}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {deleteModal.variantImpact.examples.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm">The following examples will be deleted from the registry as well:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 pl-3">
                      {deleteModal.variantImpact.examples.map((ex) => (
                        <li key={ex}>• {ex}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteModal((m) => ({ ...m, open: false }))}
                data-testid="button-cancel-delete-variant"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteVariantMutation.isPending || deleteModal.variantImpactLoading}
                onClick={() => {
                  const { entry, variantImpact } = deleteModal;
                  if (!entry || !variantImpact) return;
                  deleteVariantMutation.mutate({ component: entry.component, variantName: variantImpact.variantName });
                }}
                data-testid="button-confirm-delete-variant"
              >
                {deleteVariantMutation.isPending ? "Deleting..." : "Delete variant"}
              </Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>

    <ImportExampleDialog
      open={importDialogOpen}
      onClose={() => setImportDialogOpen(false)}
      registryData={registryData}
      previewMode={previewMode}
      themeVars={previewMode === "light" ? lightColors : darkColors}
      onImport={async (entry) => {
        const updated = [...confirmedExamples, entry];
        setConfirmedExamples(updated);
        await savePreviewExamples(updated);
      }}
    />
    </>
  );
}
