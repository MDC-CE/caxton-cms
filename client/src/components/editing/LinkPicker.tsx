import { useState, useEffect, useMemo, type ReactElement } from "react";
import { ArrowDown, Check, ExternalLink, Layers, Link, PanelBottom, Search } from "lucide-react";
import { IconChevronDown, IconPencil, IconPlus, IconX } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { filterSitemapEntries, sitemapPathname, type SitemapSearchEntry } from "@/lib/sitemapSearch";
import type { Section } from "@shared/schema";
import addSectionImg from "@assets/add-section-explanation_1771275660234.png";

type LinkType = "internal" | "external" | "modal" | "scroll" | "inline";

interface SectionOption {
  id: string;
  label: string;
  type: string;
}

interface RemoteSection {
  type: string;
  section_id: string | null;
  label: string;
}

interface QsParam {
  id: string;
  key: string;
  valueType: "static" | "fromUrl";
  value: string;
  /** Only for valueType="fromUrl": value to use when the param is absent from the visitor URL */
  fallback?: string;
}

function detectLinkType(value: string, modals: SectionOption[], scrollSections: SectionOption[]): LinkType {
  if (!value) return "internal";
  if (value.startsWith("inline#")) return "inline";
  if (value.startsWith("http://") || value.startsWith("https://")) return "external";
  if (value.startsWith("#")) {
    const anchor = value.slice(1).split("?")[0];
    if (modals.some((m) => m.id === anchor)) return "modal";
    if (scrollSections.some((s) => s.id === anchor)) return "scroll";
    return "scroll";
  }
  return "internal";
}

/** Parse a URL into its base and query params (handles {qs:param} and {qs:param|fallback} tokens) */
function parseUrlParts(url: string): { base: string; params: QsParam[] } {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return { base: url, params: [] };
  const base = url.slice(0, qIdx);
  const qs = url.slice(qIdx + 1);
  const pairs = qs.split("&").filter(Boolean);
  const params: QsParam[] = pairs.map((pair, i) => {
    const eqIdx = pair.indexOf("=");
    const k = eqIdx === -1 ? pair : pair.slice(0, eqIdx);
    const v = eqIdx === -1 ? "" : pair.slice(eqIdx + 1);
    const qsTokenMatch = v.match(/^\{qs:([^|}\s]+)(?:\|([^}]*))?\}$/);
    if (qsTokenMatch) {
      return {
        id: `${k}-${i}-${Date.now()}`,
        key: k,
        valueType: "fromUrl",
        value: qsTokenMatch[1],
        fallback: qsTokenMatch[2], // undefined if no fallback was written
      };
    }
    return {
      id: `${k}-${i}-${Date.now()}`,
      key: k,
      valueType: "static",
      value: v,
    };
  });
  return { base, params };
}

/** Rebuild URL from base + params list */
function buildUrlWithQs(base: string, params: QsParam[]): string {
  if (params.length === 0) return base;
  const parts = params.map(p => {
    if (p.valueType === "fromUrl") {
      const token = p.fallback !== undefined && p.fallback !== ""
        ? `{qs:${p.value}|${p.fallback}}`
        : `{qs:${p.value}}`;
      return `${p.key}=${token}`;
    }
    return `${p.key}=${p.value}`;
  });
  return `${base}?${parts.join("&")}`;
}

function extractSectionsFromYaml(allSections?: Section[]): {
  modals: SectionOption[];
  scrollSections: SectionOption[];
  inlineSections: SectionOption[];
} {
  const modals: SectionOption[] = [];
  const scrollSections: SectionOption[] = [
    { id: "top", label: "Top of page", type: "built-in" },
    { id: "bottom", label: "Bottom of page", type: "built-in" },
  ];
  const inlineSections: SectionOption[] = [];
  if (!allSections) return { modals, scrollSections, inlineSections };

  allSections.forEach((section, index) => {
    const raw = section as Record<string, unknown>;
    const sectionType = (raw.type as string) || "";
    const sectionId = (raw.section_id as string) || "";
    const title = (raw.title as string) || (raw.heading as string) || (raw.path_name as string) || "";

    if (sectionType === "modal") {
      if (sectionId) {
        modals.push({ id: sectionId, label: title || sectionId, type: sectionType });
      }
    } else {
      const id = sectionId || `${sectionType}-${index}`;
      scrollSections.push({
        id,
        label: title || `${sectionType} (section ${index + 1})`,
        type: sectionType,
      });
      if (sectionId) {
        inlineSections.push({ id: sectionId, label: title || sectionId, type: sectionType });
      }
    }
  });

  return { modals, scrollSections, inlineSections };
}

function extractSectionsFromRemote(remoteSections: RemoteSection[]): {
  modals: SectionOption[];
  scrollSections: SectionOption[];
  inlineSections: SectionOption[];
} {
  const modals: SectionOption[] = [];
  const scrollSections: SectionOption[] = [
    { id: "top", label: "Top of page", type: "built-in" },
    { id: "bottom", label: "Bottom of page", type: "built-in" },
  ];
  const inlineSections: SectionOption[] = [];

  remoteSections.forEach((s, index) => {
    if (s.type === "modal") {
      if (s.section_id) {
        modals.push({ id: s.section_id, label: s.label, type: s.type });
      }
    } else {
      const id = s.section_id || `${s.type}-${index}`;
      scrollSections.push({ id, label: s.label, type: s.type });
      if (s.section_id) {
        inlineSections.push({ id: s.section_id, label: s.label, type: s.type });
      }
    }
  });

  return { modals, scrollSections, inlineSections };
}

// ─── QsParamDialog ───────────────────────────────────────────────────────────

interface QsParamDialogProps {
  open: boolean;
  baseUrl: string;
  initialParams: QsParam[];
  onSave: (params: QsParam[]) => void;
  onClose: () => void;
}

const DRAFT_ID = "__new__";

function QsParamDialog({ open, baseUrl, initialParams, onSave, onClose }: QsParamDialogProps) {
  const [params, setParams] = useState<QsParam[]>([]);
  // editingId: id of param being edited inline (DRAFT_ID = new unsaved row)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editFallback, setEditFallback] = useState("");
  const [editType, setEditType] = useState<"static" | "fromUrl">("static");
  const [editError, setEditError] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setParams(initialParams);
      setEditingId(null);
      setEditKey("");
      setEditValue("");
      setEditFallback("");
      setEditType("static");
      setEditError("");
      setTypeOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startEditing = (p: QsParam) => {
    setEditingId(p.id);
    setEditKey(p.key);
    setEditValue(p.value);
    setEditFallback(p.fallback ?? "");
    setEditType(p.valueType);
    setEditError("");
  };

  const addNewRow = () => {
    // Only one draft at a time
    setParams(prev => prev.filter(p => p.id !== DRAFT_ID));
    setParams(prev => [...prev, { id: DRAFT_ID, key: "", value: "", valueType: "static" }]);
    setEditingId(DRAFT_ID);
    setEditKey("");
    setEditValue("");
    setEditFallback("");
    setEditType("static");
    setEditError("");
  };

  const confirmEdit = () => {
    const k = editKey.trim();
    const v = editValue.trim();
    if (!k) { setEditError("Key name is required"); return; }
    if (!v) { setEditError("Value is required"); return; }
    if (params.some(p => p.key === k && p.id !== editingId)) {
      setEditError("Key already exists"); return;
    }
    const fallbackVal = editType === "fromUrl" ? editFallback.trim() : undefined;
    if (editingId === DRAFT_ID) {
      setParams(prev => prev.map(p =>
        p.id === DRAFT_ID
          ? { id: `${k}-${Date.now()}`, key: k, value: v, valueType: editType, fallback: fallbackVal }
          : p
      ));
    } else {
      setParams(prev => prev.map(p =>
        p.id === editingId ? { ...p, key: k, value: v, valueType: editType, fallback: fallbackVal } : p
      ));
    }
    setEditingId(null);
    setEditError("");
  };

  const cancelEdit = () => {
    if (editingId === DRAFT_ID) {
      setParams(prev => prev.filter(p => p.id !== DRAFT_ID));
    }
    setEditingId(null);
    setEditError("");
  };

  const removeParam = (id: string) => {
    setParams(prev => prev.filter(p => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const handleApply = () => {
    onSave(params.filter(p => p.id !== DRAFT_ID));
  };

  const committed = params.filter(p => p.id !== DRAFT_ID);
  const preview = buildUrlWithQs(baseUrl, committed);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="z-[10002] max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            Query params
            <code className="text-xs font-normal bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{baseUrl}</code>
          </DialogTitle>
        </DialogHeader>

        {/* Params list */}
        <div className="space-y-2">
          {params.map(p => {
            const isEditing = p.id === editingId;

            if (isEditing) {
              // ── EDIT ROW ─────────────────────────────────────────────
              return (
                <div key={p.id} className="space-y-1.5 bg-muted rounded-md px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder="key"
                      value={editKey}
                      onChange={e => { setEditKey(e.target.value); setEditError(""); }}
                      className="h-7 text-xs w-24 shrink-0"
                      onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }}
                      autoFocus
                    />
                    <Input
                      placeholder="value"
                      value={editValue}
                      onChange={e => { setEditValue(e.target.value); setEditError(""); }}
                      className="h-7 text-xs flex-1 min-w-0"
                      onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }}
                    />
                    <span className="text-xs text-muted-foreground shrink-0">value from</span>
                    {/* Custom dropdown — no Radix, safe inside Dialog focus trap */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        className="h-7 text-xs w-32 px-2 flex items-center justify-between gap-1 rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        onClick={e => { e.stopPropagation(); setTypeOpen(o => !o); }}
                        onKeyDown={e => { if (e.key === "Escape") setTypeOpen(false); }}
                      >
                        <span>{editType === "fromUrl" ? "current page URL" : "static value"}</span>
                        <IconChevronDown size={12} className="opacity-50 shrink-0" />
                      </button>
                      {typeOpen && (
                        <div className="absolute top-full mt-1 left-0 min-w-full z-[10003] bg-popover border border-input rounded-md shadow-md overflow-hidden">
                          {(["fromUrl", "static"] as const).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              className={`w-full text-left px-3 py-1.5 text-xs hover-elevate flex items-center gap-2 ${editType === opt ? "text-primary font-medium" : "text-foreground"}`}
                              onClick={e => { e.stopPropagation(); setEditType(opt); setTypeOpen(false); setEditError(""); }}
                            >
                              {opt === "fromUrl" ? "current page URL" : "static value"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Confirm */}
                    <button
                      onClick={confirmEdit}
                      className="text-primary hover-elevate rounded p-1 shrink-0"
                      title="Confirm"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                  </div>
                  {/* Fallback field — only for fromUrl */}
                  {editType === "fromUrl" && (
                    <div className="flex items-center gap-1.5 pl-0">
                      <span className="text-xs text-muted-foreground shrink-0 w-24">Fallback</span>
                      <Input
                        placeholder="value if param absent (optional)"
                        value={editFallback}
                        onChange={e => setEditFallback(e.target.value)}
                        className="h-7 text-xs flex-1 min-w-0"
                        onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    </div>
                  )}
                  {/* Hint text — always visible based on type */}
                  {!editError && editType === "fromUrl" && (
                    <p className="text-xs text-muted-foreground">
                      Reads <code className="bg-muted px-1 rounded">?{editValue || "param"}=…</code> from the visitor's URL.
                      {editFallback ? <> Uses <code className="bg-muted px-1 rounded">{editFallback}</code> if absent.</> : <> Omits the param if absent.</>}
                    </p>
                  )}
                  {!editError && editType === "static" && (
                    <p className="text-xs text-muted-foreground">
                      Always appends a fixed <code className="bg-muted px-1 rounded">{editKey || "key"}={editValue || "value"}</code> to the link.
                    </p>
                  )}
                  {editError && <p className="text-xs text-destructive">{editError}</p>}
                </div>
              );
            }

            // ── VIEW ROW ──────────────────────────────────────────────
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 text-xs bg-muted rounded-md px-2 py-2"
              >
                <code className="font-medium text-foreground shrink-0">{p.key}</code>
                <span className="text-muted-foreground shrink-0">=</span>
                <code className="text-foreground flex-1 min-w-0 truncate">
                  {p.valueType === "fromUrl"
                    ? (p.fallback ? `{qs:${p.value}|${p.fallback}}` : `{qs:${p.value}}`)
                    : p.value}
                </code>
                <span className="text-muted-foreground/60 text-[10px] shrink-0">
                  {p.valueType === "fromUrl"
                    ? (p.fallback ? "from URL / fallback" : "from URL")
                    : "static"}
                </span>
                <button
                  onClick={() => startEditing(p)}
                  className="text-muted-foreground hover-elevate rounded p-0.5 shrink-0"
                  title="Edit"
                >
                  <IconPencil size={12} />
                </button>
                <button
                  onClick={() => removeParam(p.id)}
                  className="text-muted-foreground hover-elevate rounded p-0.5 shrink-0"
                  title="Remove"
                >
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Add param button — tight to the list */}
        <button
          type="button"
          onClick={addNewRow}
          className="flex items-center gap-1 text-xs text-muted-foreground hover-elevate px-1.5 py-0.5 rounded-md w-fit -mt-1"
        >
          <IconPlus size={12} />
          Add param
        </button>

        {/* URL preview — always visible, full URL with domain */}
        <div className="border-t pt-2">
          <p className="text-[13px] text-muted-foreground font-medium">Result</p>
          <code className="text-[10px] text-muted-foreground break-all">
            {preview.startsWith("http") ? preview : `${window.location.origin}${preview}`}
          </code>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── LinkPickerProps ──────────────────────────────────────────────────────────

interface LinkPickerProps {
  value: string;
  onChange: (value: string) => void;
  locale?: string;
  allSections?: Section[];
  contextPath?: string;
  testId?: string;
  portalContainer?: HTMLElement | null;
  compact?: boolean;
  allowedTypes?: LinkType[];
  allowInlineRender?: boolean;
}

export function LinkPicker({ value, onChange, locale = "en", allSections, contextPath, testId = "link-picker", portalContainer, compact = false, allowedTypes, allowInlineRender = false }: LinkPickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customUrl, setCustomUrl] = useState(value || "");
  const [customError, setCustomError] = useState("");

  // QsParamDialog state
  const [qsOpen, setQsOpen] = useState(false);
  const [qsBaseUrl, setQsBaseUrl] = useState("");
  const [qsInitialParams, setQsInitialParams] = useState<QsParam[]>([]);

  const { data: remoteSectionsData, isLoading: remoteSectionsLoading } = useQuery<{ sections: RemoteSection[] }>({
    queryKey: ["/api/page-sections", contextPath, locale],
    queryFn: async () => {
      const response = await fetch(`/api/page-sections?path=${encodeURIComponent(contextPath!)}&locale=${locale}`);
      if (!response.ok) throw new Error("Failed to load page sections");
      return response.json();
    },
    enabled: !!contextPath && open,
  });

  const { modals, scrollSections, inlineSections } = (() => {
    if (contextPath && remoteSectionsData) {
      return extractSectionsFromRemote(remoteSectionsData.sections);
    }
    return extractSectionsFromYaml(allSections);
  })();

  const [activeType, setActiveType] = useState<LinkType>(() => detectLinkType(value, modals, scrollSections));

  useEffect(() => {
    setCustomUrl(value || "");
    setActiveType(detectLinkType(value, modals, scrollSections));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const { data: sitemapUrls = [], isLoading: sitemapLoading } = useQuery<SitemapSearchEntry[]>({
    queryKey: ["/api/sitemap-urls", locale],
    queryFn: async () => {
      const response = await fetch(`/api/sitemap-urls?locale=${locale}`);
      if (!response.ok) throw new Error("Failed to load sitemap URLs");
      return response.json();
    },
  });

  const filteredSitemapUrls = useMemo(
    () => filterSitemapEntries(sitemapUrls, searchQuery),
    [sitemapUrls, searchQuery],
  );

  const handleSelect = (url: string) => {
    onChange(url);
    setOpen(false);
    setSearchQuery("");
  };

  const hasLocalePrefix = (url: string) => /^\/[a-z]{2}(\/|$)/i.test(url.trim());

  const handleExternalSubmit = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setCustomError("External URLs must start with http:// or https://");
      return;
    }
    setCustomError("");
    onChange(trimmed);
    setOpen(false);
  };

  const handleInternalCustomSubmit = () => {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    if (hasLocalePrefix(trimmed)) {
      setCustomError("URLs cannot start with a locale prefix like /en/ or /es/. Use the page search above instead.");
      return;
    }
    if (trimmed.startsWith("http")) {
      setCustomError("Use the 'External URL' tab for http links.");
      return;
    }
    setCustomError("");
    onChange(trimmed);
    setOpen(false);
  };

  // Open QsParamDialog for a given row URL
  const openQsForRow = (rowUrl: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const { base: rowBase } = parseUrlParts(rowUrl);
    const { base: valBase, params: valParams } = parseUrlParts(value || "");
    const isCurrentRow = valBase === rowBase;
    setQsBaseUrl(rowBase);
    setQsInitialParams(isCurrentRow ? valParams : []);
    setQsOpen(true);
  };

  const handleQsSave = (params: QsParam[]) => {
    const finalUrl = buildUrlWithQs(qsBaseUrl, params);
    onChange(finalUrl);
    setQsOpen(false);
    setOpen(false);
  };

  // Render the ?params button for a list row
  const renderParamsBtn = (rowUrl: string, rowIndex: number) => {
    const { base: rowBase } = parseUrlParts(rowUrl);
    const { base: valBase, params: valParams } = parseUrlParts(value || "");
    const isThisRow = valBase === rowBase;
    const hasParams = isThisRow && valParams.length > 0;
    return (
      <button
        key={`qs-${rowIndex}`}
        onClick={e => openQsForRow(rowUrl, e)}
        data-testid={`${testId}-qs-btn-${rowIndex}`}
        className={cn(
          "shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md hover-elevate whitespace-nowrap",
          hasParams
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        <IconPlus size={10} className="shrink-0" />
        {hasParams
          ? valParams.map(p => p.key).join(", ")
          : "params"}
      </button>
    );
  };

  const allTypeOptions: { type: LinkType; icon: typeof Link; label: string }[] = [
    { type: "internal", icon: Link, label: "Page" },
    { type: "external", icon: ExternalLink, label: "External" },
    { type: "modal", icon: PanelBottom, label: "Modal" },
    { type: "scroll", icon: ArrowDown, label: "Section" },
    ...(allowInlineRender ? [{ type: "inline" as LinkType, icon: Layers, label: "Render inline" }] : []),
  ];
  const typeOptions = allowedTypes
    ? allTypeOptions.filter((o) => allowedTypes.includes(o.type))
    : allTypeOptions;

  const displayValue = value || "No link set";
  const isExternal = value?.startsWith("http");
  const isHash = value?.startsWith("#");
  const isInlineLink = value?.startsWith("inline#");

  const displayIcon = isInlineLink
    ? Layers
    : isExternal
      ? ExternalLink
      : isHash
        ? (modals.some(m => `#${m.id}` === parseUrlParts(value || "").base) ? PanelBottom : ArrowDown)
        : Link;

  const DisplayIconComponent = displayIcon;

  const sectionsLoading = !!contextPath && remoteSectionsLoading;

  // Check if external customUrl is valid enough to show params button
  const externalUrlValid = customUrl.startsWith("http://") || customUrl.startsWith("https://");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "group inline-flex items-center gap-1.5 text-xs rounded-md transition-colors hover-elevate",
              compact ? "p-1" : "px-2 py-1 max-w-full",
              value
                ? "text-primary/80 bg-primary/5"
                : "text-muted-foreground"
            )}
            data-testid={testId}
          >
            <DisplayIconComponent className="h-3.5 w-3.5 flex-shrink-0" />
            {!compact && <span className="truncate">{displayValue}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-96 p-0 z-[10001] pointer-events-auto"
          align="start"
          container={portalContainer}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex border-b">
            {typeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.type}
                  onClick={() => {
                    setActiveType(opt.type);
                    setSearchQuery("");
                    setCustomError("");
                    setCustomUrl(value || "");
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2",
                    activeType === opt.type
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                  data-testid={`${testId}-tab-${opt.type}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {activeType === "internal" && (
            <>
              <div className="p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search pages..."
                    className="h-8 pl-8 text-sm"
                    autoFocus
                    data-testid={`${testId}-internal-search`}
                  />
                </div>
              </div>
              <div className="h-[200px] overflow-y-auto">
                {sitemapLoading ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">Loading pages...</div>
                ) : filteredSitemapUrls.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    {searchQuery ? "No pages found" : "No pages available"}
                  </div>
                ) : (
                  <div className="p-1">
                    {filteredSitemapUrls.map((entry, index) => {
                      const path = sitemapPathname(entry.loc);
                      return (
                        <button
                          key={path}
                          onClick={() => handleSelect(path)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate flex items-center gap-2",
                            parseUrlParts(value || "").base === path && "bg-primary/10"
                          )}
                          data-testid={`${testId}-internal-option-${index}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground truncate text-xs">{entry.label}</div>
                            <div className="text-xs text-muted-foreground truncate">{path}</div>
                          </div>
                          {renderParamsBtn(path, index)}
                          {parseUrlParts(value || "").base === path && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-2 border-t space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={customUrl}
                    onChange={(e) => { setCustomUrl(e.target.value.replace(/\s+/g, "-")); setCustomError(""); }}
                    placeholder="/custom-path"
                    className="h-8 text-sm flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleInternalCustomSubmit(); }}
                    data-testid={`${testId}-internal-custom-input`}
                  />
                  <Button
                    size="sm"
                    onClick={handleInternalCustomSubmit}
                    data-testid={`${testId}-internal-custom-save`}
                  >
                    Save
                  </Button>
                </div>
                {customError && <p className="text-xs text-destructive">{customError}</p>}
              </div>
            </>
          )}

          {activeType === "external" && (
            <div className="p-3 space-y-3">
              <p className="text-xs text-muted-foreground">Enter an external URL:</p>
              <div className="flex gap-2">
                <Input
                  value={customUrl}
                  onChange={(e) => { setCustomUrl(e.target.value); setCustomError(""); }}
                  placeholder="https://example.com"
                  className="h-8 text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleExternalSubmit(); }}
                  data-testid={`${testId}-external-input`}
                />
                <Button
                  size="sm"
                  onClick={handleExternalSubmit}
                  data-testid={`${testId}-external-save`}
                >
                  Save
                </Button>
              </div>
              {customError && <p className="text-xs text-destructive">{customError}</p>}
              {externalUrlValid && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    const { base, params } = parseUrlParts(customUrl);
                    setQsBaseUrl(base);
                    setQsInitialParams(params);
                    setQsOpen(true);
                  }}
                  className={cn(
                    "w-full flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border hover-elevate",
                    parseUrlParts(customUrl).params.length > 0
                      ? "border-primary/40 text-primary bg-primary/5"
                      : "border-border text-muted-foreground"
                  )}
                  data-testid={`${testId}-external-qs-btn`}
                >
                  <IconPlus size={12} className="shrink-0" />
                  {parseUrlParts(customUrl).params.length > 0
                    ? `Query params: ${parseUrlParts(customUrl).params.map(p => p.key).join(", ")}`
                    : "Add query params"}
                </button>
              )}
            </div>
          )}

          {activeType === "modal" && (
            <div className="h-[200px] overflow-y-auto">
              {sectionsLoading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Loading sections...</div>
              ) : modals.length === 0 ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground text-center">No modals on this page</p>
                  <p className="text-xs text-muted-foreground">
                    Modal links open a popup overlay when clicked. To add a modal, add a section with <code className="bg-muted px-1 py-0.5 rounded text-xs">type: modal</code> in your page YAML or using the manual editor with "Edit Mode". It will then appear here for selection.
                  </p>
                  {!contextPath && <img src={addSectionImg} alt="Use the Add button between sections to insert a new modal section" className="w-full rounded border" />}
                </div>
              ) : (
                <div className="p-1">
                  {modals.map((modal, index) => {
                    const hashValue = `#${modal.id}`;
                    return (
                      <button
                        key={modal.id}
                        onClick={() => handleSelect(hashValue)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate flex items-center gap-2",
                          parseUrlParts(value || "").base === hashValue && "bg-primary/10"
                        )}
                        data-testid={`${testId}-modal-option-${index}`}
                      >
                        <PanelBottom className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate text-xs">{modal.label}</div>
                          <div className="text-xs text-muted-foreground truncate">{hashValue}</div>
                        </div>
                        {renderParamsBtn(hashValue, index)}
                        {parseUrlParts(value || "").base === hashValue && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeType === "scroll" && (
            <div className="h-[200px] overflow-y-auto">
              {sectionsLoading ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Loading sections...</div>
              ) : scrollSections.length === 0 ? (
                <div className="p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground text-center">No sections available</p>
                  <p className="text-xs text-muted-foreground">
                    Section links scroll the visitor to a specific part of the page. Sections are listed here automatically. To give a section a custom anchor, add a <code className="bg-muted px-1 py-0.5 rounded text-xs">section_id</code> field in your page YAML. The link will use <code className="bg-muted px-1 py-0.5 rounded text-xs">#your-section-id</code>.
                  </p>
                </div>
              ) : (
                <div className="p-1">
                  {scrollSections.map((section, index) => {
                    const hashValue = `#${section.id}`;
                    return (
                      <button
                        key={section.id}
                        onClick={() => handleSelect(hashValue)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate flex items-center gap-2",
                          parseUrlParts(value || "").base === hashValue && "bg-primary/10"
                        )}
                        data-testid={`${testId}-scroll-option-${index}`}
                      >
                        <ArrowDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate text-xs">{section.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {hashValue}
                            <span className="ml-1 opacity-60">({section.type})</span>
                          </div>
                        </div>
                        {renderParamsBtn(hashValue, index)}
                        {parseUrlParts(value || "").base === hashValue && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeType === "inline" && (
            <div className="h-[200px] overflow-y-auto">
              {inlineSections.length === 0 ? (
                <div className="p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground text-center">No sections with an ID on this page</p>
                  <p className="text-xs text-muted-foreground">
                    Add a{" "}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">section_id</code> field to any section to make it available as an inline render target.
                  </p>
                </div>
              ) : (
                <div className="p-1">
                  {inlineSections.map((section, index) => {
                    const inlineValue = `inline#${section.id}`;
                    return (
                      <button
                        key={section.id}
                        onClick={() => handleSelect(inlineValue)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate flex items-center gap-2",
                          parseUrlParts(value || "").base === inlineValue && "bg-primary/10"
                        )}
                        data-testid={`${testId}-inline-option-${index}`}
                      >
                        <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate text-xs">{section.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            inline#{section.id}
                            <span className="ml-1 opacity-60">({section.type})</span>
                          </div>
                        </div>
                        {renderParamsBtn(inlineValue, index)}
                        {parseUrlParts(value || "").base === inlineValue && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <QsParamDialog
        open={qsOpen}
        baseUrl={qsBaseUrl}
        initialParams={qsInitialParams}
        onSave={handleQsSave}
        onClose={() => setQsOpen(false)}
      />
    </>
  );
}
