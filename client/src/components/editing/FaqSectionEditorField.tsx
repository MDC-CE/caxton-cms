import { useEffect, useRef, useState } from "react";
import { HelpCircle, ListOrdered, MapPin, Plus, Sparkles, Tags } from "lucide-react";
import { IconAlertTriangle, IconChevronDown, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RelatedFeaturesPicker } from "@/components/editing/RelatedFeaturesPicker";
import { DbFieldValuesPicker } from "@/components/editing/DbFieldValuesPicker";
import {
  FaqItemsPicker,
  type FaqItemsPickerHandle,
  type FaqSearchMeta,
} from "@/components/editing/FaqItemsPicker";
import { MAX_FAQ_SECTION_TOPICS } from "@/lib/faqConstants";
import { cn } from "@/lib/utils";

const MIN_SEARCH_CHARS = 3;
const DEFAULT_FAQ_LIMIT = 9;
const FAQ_LIMIT_PRESETS = [3, 5, 6, 9, 12, 15] as const;
const MIN_FAQ_LIMIT = 1;
const MAX_FAQ_LIMIT = 50;

export interface FaqSectionEditorFieldProps {
  topics: string[];
  onTopicsChange: (value: string[]) => void;
  locations: string[];
  onLocationsChange: (value: string[]) => void;
  /** Raw YAML search value (may still be `{{ single.* }}`) — used by the edit popover. */
  searchPhrase: string;
  /**
   * Resolved search string for badge + list ranking. When omitted, `searchPhrase` is used.
   */
  resolvedSearchPhrase?: string;
  onSearchChange: (value: string | null) => void;
  permanentFilters: Array<{ item_property_slug: string; value: string | string[] }>;
  locale: string;
  hardcodedItems: Array<{ question: string; answer: string }>;
  ignoredEntries: string[];
  itemOverrides: Record<string, { hideOnLocations?: string[] }>;
  onItemOverridesChange: (overrides: Record<string, { hideOnLocations?: string[] }>) => void;
  onHardcodedEntriesChange: (entries: Array<{ question: string; answer: string }>) => void;
  onIgnoredEntriesChange: (keys: string[]) => void;
  onLocalizeDbEntry: (
    entry: { question: string; answer: string },
    ignoredKey: string,
  ) => void;
  sortField?: string;
  limit?: number;
  onLimitChange?: (value: number | null) => void;
  "data-testid"?: string;
}

export function FaqSectionEditorField({
  topics,
  onTopicsChange,
  locations,
  onLocationsChange,
  searchPhrase,
  resolvedSearchPhrase,
  onSearchChange,
  permanentFilters,
  locale,
  hardcodedItems,
  ignoredEntries,
  itemOverrides,
  onItemOverridesChange,
  onHardcodedEntriesChange,
  onIgnoredEntriesChange,
  onLocalizeDbEntry,
  sortField,
  limit,
  onLimitChange,
  "data-testid": testId,
}: FaqSectionEditorFieldProps) {
  const faqListRef = useRef<FaqItemsPickerHandle>(null);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState(searchPhrase);
  const [draftLimit, setDraftLimit] = useState(
    String(limit && limit > 0 ? limit : DEFAULT_FAQ_LIMIT),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [searchMeta, setSearchMeta] = useState<FaqSearchMeta | null>(null);

  useEffect(() => {
    setDraftSearch(searchPhrase);
  }, [searchPhrase]);

  useEffect(() => {
    setDraftLimit(String(limit && limit > 0 ? limit : DEFAULT_FAQ_LIMIT));
  }, [limit]);

  const topicCount = topics.length;
  const locationCount = locations.length;
  const effectiveSearch = (resolvedSearchPhrase ?? searchPhrase).trim();
  const hasSearch = effectiveSearch.length >= MIN_SEARCH_CHARS;
  const draftTrimmed = draftSearch.trim();
  const canApply = draftTrimmed.length >= MIN_SEARCH_CHARS;
  const isFallback = hasSearch && searchMeta != null && searchMeta.semantic === false;
  const effectiveLimit = limit && limit > 0 ? limit : DEFAULT_FAQ_LIMIT;
  const hasCustomLimit = typeof limit === "number" && limit > 0;
  const draftLimitNum = Number.parseInt(draftLimit, 10);
  const canApplyLimit =
    Number.isFinite(draftLimitNum) &&
    draftLimitNum >= MIN_FAQ_LIMIT &&
    draftLimitNum <= MAX_FAQ_LIMIT;

  return (
    <div
      className="rounded-md border border-input bg-background"
      data-testid={testId || "faq-section-editor-field"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-input bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">FAQs</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "relative",
                  isFallback && "border-amber-500/50 text-amber-600 dark:text-amber-400",
                )}
                data-testid="button-faq-search"
                title={
                  isFallback
                    ? `Semantic search unavailable — keyword only: ${effectiveSearch}`
                    : hasSearch
                      ? `Semantic search: ${effectiveSearch}`
                      : "Filter FAQs by meaning (semantic search)"
                }
              >
                {isFallback && (
                  <span
                    className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm pointer-events-none text-[9px] font-bold leading-none"
                    data-testid="badge-faq-search-unavailable"
                    aria-label="Vector search unavailable"
                  >
                    !
                  </span>
                )}
                <Sparkles className="h-3.5 w-3.5" />
                {hasSearch && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    1
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 z-[10001]"
              align="end"
              data-testid="popover-faq-search"
            >
              <div className="p-2 border-b space-y-1">
                <p className="text-xs font-medium text-foreground">Search by meaning</p>
                <p className="text-[11px] text-muted-foreground">
                  Phrase is saved on this section and used to rank FAQs from the database
                  (then Topics/Locations still apply). Min {MIN_SEARCH_CHARS} characters.
                </p>
              </div>
              <div className="p-3 space-y-3">
                <Input
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  placeholder="e.g. job guarantee after graduation"
                  className="h-8 text-sm"
                  data-testid="input-faq-search"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canApply) {
                      e.preventDefault();
                      onSearchChange(draftTrimmed);
                      setSearchOpen(false);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canApply}
                    onClick={() => {
                      onSearchChange(draftTrimmed);
                      setSearchOpen(false);
                    }}
                    data-testid="button-faq-search-apply"
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={!hasSearch && !draftTrimmed}
                    onClick={() => {
                      setDraftSearch("");
                      onSearchChange(null);
                      setSearchMeta(null);
                    }}
                    data-testid="button-faq-search-clear"
                  >
                    Clear
                  </Button>
                </div>
                {draftTrimmed.length > 0 && draftTrimmed.length < MIN_SEARCH_CHARS && (
                  <p className="text-[11px] text-muted-foreground">
                    Enter at least {MIN_SEARCH_CHARS} characters to apply.
                  </p>
                )}
                {isFallback && (
                  <div
                    className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1"
                    data-testid="faq-search-fallback-banner"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      <IconAlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Keyword matching only
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {searchMeta?.fallback_message ??
                        "Semantic search could not run, so results use exact keyword matching."}
                    </p>
                  </div>
                )}
                <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-1.5">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    {searchMeta?.fetching ? (
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                    )}
                    How search works here
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    When the FAQ database has semantic search enabled and Qdrant is healthy,
                    this phrase ranks questions by{" "}
                    <span className="text-foreground font-medium">meaning</span>. Topics and
                    locations still filter the ranked list. If the list is short, remaining
                    slots are filled from filter-only matches. JSON-LD uses the in-memory cache
                    when warm; otherwise a keyword approximation.
                  </p>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {onLimitChange && (
            <Popover open={limitOpen} onOpenChange={setLimitOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative"
                  data-testid="button-faq-limit"
                  title={`Show up to ${effectiveLimit} questions`}
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {effectiveLimit}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-72 p-0 z-[10001]"
                align="end"
                data-testid="popover-faq-limit"
              >
                <div className="p-2 border-b space-y-1">
                  <p className="text-xs font-medium text-foreground">Questions to show</p>
                  <p className="text-[11px] text-muted-foreground">
                    Caps total FAQs in this section (manually added count first; remaining
                    slots come from the database). Saved as{" "}
                    <span className="font-mono text-foreground">dynamic_entries.limit</span>.
                  </p>
                </div>
                <div className="p-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {FAQ_LIMIT_PRESETS.map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={effectiveLimit === n ? "default" : "outline"}
                        className="h-7 min-w-9 px-2 text-xs"
                        onClick={() => {
                          onLimitChange(n);
                          setDraftLimit(String(n));
                          setLimitOpen(false);
                        }}
                        data-testid={`button-faq-limit-preset-${n}`}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={MIN_FAQ_LIMIT}
                      max={MAX_FAQ_LIMIT}
                      value={draftLimit}
                      onChange={(e) => setDraftLimit(e.target.value)}
                      className="h-8 text-sm"
                      data-testid="input-faq-limit"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canApplyLimit) {
                          e.preventDefault();
                          onLimitChange(draftLimitNum);
                          setLimitOpen(false);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      disabled={!canApplyLimit}
                      onClick={() => {
                        onLimitChange(draftLimitNum);
                        setLimitOpen(false);
                      }}
                      data-testid="button-faq-limit-apply"
                    >
                      Apply
                    </Button>
                  </div>
                  {!canApplyLimit && draftLimit.trim().length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Enter a number from {MIN_FAQ_LIMIT} to {MAX_FAQ_LIMIT}.
                    </p>
                  )}
                  {hasCustomLimit && effectiveLimit !== DEFAULT_FAQ_LIMIT && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-0"
                      onClick={() => {
                        onLimitChange(DEFAULT_FAQ_LIMIT);
                        setDraftLimit(String(DEFAULT_FAQ_LIMIT));
                      }}
                      data-testid="button-faq-limit-reset"
                    >
                      Reset to {DEFAULT_FAQ_LIMIT}
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Popover open={topicsOpen} onOpenChange={setTopicsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative"
                data-testid="button-faq-topics"
                title={
                  topicCount > 0
                    ? `Topics (${topicCount}/${MAX_FAQ_SECTION_TOPICS})`
                    : "Filter FAQs by topic"
                }
              >
                <Tags className="h-3.5 w-3.5" />
                {topicCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {topicCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-80 p-0 z-[10001]"
              align="end"
              data-testid="popover-faq-topics"
            >
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-foreground">
                  Filter FAQs by topic
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select up to {MAX_FAQ_SECTION_TOPICS} topics to pull matching questions
                  from the FAQ database.
                </p>
              </div>
              <div className="p-3">
                <RelatedFeaturesPicker
                  value={topics}
                  onChange={onTopicsChange}
                  locale={locale}
                  permanentFilters={permanentFilters}
                  hideLabel
                />
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={locationsOpen} onOpenChange={setLocationsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative"
                data-testid="button-faq-locations"
                title={
                  locationCount > 0
                    ? `Locations (${locationCount})`
                    : "Filter FAQs by location"
                }
              >
                <MapPin className="h-3.5 w-3.5" />
                {locationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {locationCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72 p-0 z-[10001]"
              align="end"
              data-testid="popover-faq-locations"
            >
              <div className="p-2 border-b">
                <p className="text-xs font-medium text-foreground">
                  Filter FAQs by location
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Only show database questions tagged for these locations. Leave empty to
                  include all.
                </p>
              </div>
              <DbFieldValuesPicker
                database="frequently_asked_questions"
                field="locations"
                value={locations}
                onChange={onLocationsChange}
                panelOnly
              />
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => faqListRef.current?.openAdd()}
            data-testid="button-faq-add-item"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      <div className="px-3 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Topics and locations filter the centralized FAQ database. Optional semantic search
          ranks by meaning first. The list below is what this section will show —{" "}
          <span className="font-medium text-foreground">manually added</span> means hardcoded
          on this page; <span className="font-medium text-foreground">DB</span> means matched
          from the bank.
        </p>

        {(topicCount > 0 || locationCount > 0 || hasSearch || hasCustomLimit) && (
          <div className="flex items-center gap-2 flex-wrap">
            {hasSearch && (
              <Badge variant="secondary" className="text-xs font-normal max-w-[220px] truncate">
                Search: {effectiveSearch}
              </Badge>
            )}
            {hasCustomLimit && (
              <Badge variant="secondary" className="text-xs font-normal">
                Limit: {effectiveLimit}
              </Badge>
            )}
            {topicCount > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {topicCount} topic{topicCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {locationCount > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {locationCount} location{locationCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}

        <FaqItemsPicker
          ref={faqListRef}
          variant="embedded"
          permanentFilters={permanentFilters}
          searchPhrase={hasSearch ? effectiveSearch : undefined}
          onSearchMeta={setSearchMeta}
          locale={locale}
          hardcodedItems={hardcodedItems}
          ignoredEntries={ignoredEntries}
          itemOverrides={itemOverrides}
          onChange={onItemOverridesChange}
          onHardcodedEntriesChange={onHardcodedEntriesChange}
          onIgnoredEntriesChange={onIgnoredEntriesChange}
          onLocalizeDbEntry={onLocalizeDbEntry}
          sortField={sortField}
          limit={limit}
        />

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-faq-advanced-read-more"
            >
              Read more (advanced)
              <IconChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-md border border-border bg-muted/20 p-2.5 space-y-1.5 text-[11px] text-muted-foreground font-mono leading-relaxed">
              <p>
                Field editor:{" "}
                <span className="text-foreground">
                  site_learning-mdc-edu/component-registry/faq/v1.0/field-editors.ts
                </span>
              </p>
              <p>
                Filters / search / limit:{" "}
                <span className="text-foreground">dynamic_entries.permanent_filters</span>,{" "}
                <span className="text-foreground">dynamic_entries.search</span>,{" "}
                <span className="text-foreground">dynamic_entries.limit</span>
              </p>
              <p>
                Shared search:{" "}
                <span className="text-foreground">server/database-search.ts</span> (L1 memory +
                L2 GCS; invalidate on reindex)
              </p>
              <p>
                Overrides / local:{" "}
                <span className="text-foreground">item_overrides</span>,{" "}
                <span className="text-foreground">hardcoded_entries</span>
              </p>
              <p>
                UI:{" "}
                <span className="text-foreground">
                  client/src/components/editing/FaqSectionEditorField.tsx
                </span>
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
