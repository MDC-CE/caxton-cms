/**
 * Multi/single relation picker backed by `/api/query-options`.
 * Omits locale so options include entries present in any locale (deduped by value).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/queryClient";
import { buildQueryOptionsUrl } from "@shared/parseFormFieldSource";
import { deslugifyLabel } from "@shared/relation-field";

export type RelationFieldPickerProps = {
  fieldKey: string;
  source: string;
  valuePath?: string;
  labelPath?: string;
  multiple?: boolean;
  required?: boolean;
  value: unknown;
  onChange: (next: string | string[] | null) => void;
};

function asPointers(value: unknown, multiple: boolean): string[] {
  if (value == null || value === "") return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim());
  }
  return [];
}

export function RelationFieldPicker({
  fieldKey,
  source,
  valuePath = "slug",
  labelPath = "name",
  multiple = false,
  required = false,
  value,
  onChange,
}: RelationFieldPickerProps) {
  const [search, setSearch] = useState("");
  const selected = asPointers(value, multiple);

  const { data, isLoading, isError, error } = useQuery<{
    options: Array<{ value: string; label: string }>;
  }>({
    queryKey: ["/api/query-options", source, valuePath, labelPath, "any-locale"],
    enabled: !!source,
    staleTime: 60_000,
    queryFn: async () => {
      const url = buildQueryOptionsUrl(
        { content_type: source, value_path: valuePath, label_path: labelPath },
        // Omit locale → all locales; server dedupes by value
        undefined,
      );
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const options = useMemo(() => {
    const opts = data?.options ?? [];
    const byValue = new Map<string, string>();
    for (const o of opts) {
      if (!o.value || byValue.has(o.value)) continue;
      byValue.set(o.value, o.label || deslugifyLabel(o.value));
    }
    // Keep selected values even if missing from options (broken refs)
    for (const s of selected) {
      if (!byValue.has(s)) byValue.set(s, deslugifyLabel(s));
    }
    return Array.from(byValue.entries()).map(([v, label]) => ({ value: v, label }));
  }, [data?.options, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, search]);

  if (!source) {
    return (
      <p className="text-[11px] text-destructive" data-testid={`text-relation-no-source-${fieldKey}`}>
        Relation field is missing editor.source
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
        Loading options from {source}…
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-[11px] text-destructive" data-testid={`text-relation-error-${fieldKey}`}>
        Failed to load options: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }

  if (!multiple) {
    const current = selected[0] ?? "";
    return (
      <div className="space-y-2" data-testid={`relation-single-${fieldKey}`}>
        <p className="text-[11px] text-muted-foreground">
          Stores a pointer slug to <code className="text-foreground">{source}</code>. Related Person
          fields live on that entry — do not paste objects here.
        </p>
        <Select
          value={current || undefined}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger className="h-8 text-sm" data-testid={`select-relation-${fieldKey}`}>
            <SelectValue placeholder={required ? "Select…" : "None"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!required && current && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline"
            onClick={() => onChange(null)}
            data-testid={`button-clear-relation-${fieldKey}`}
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  const toggle = (optValue: string) => {
    if (selected.includes(optValue)) {
      const next = selected.filter((s) => s !== optValue);
      onChange(next);
    } else {
      onChange([...selected, optValue]);
    }
  };

  const movePrimary = (optValue: string) => {
    if (!selected.includes(optValue)) return;
    onChange([optValue, ...selected.filter((s) => s !== optValue)]);
  };

  return (
    <div className="space-y-2" data-testid={`relation-multi-${fieldKey}`}>
      <p className="text-[11px] text-muted-foreground">
        Stores slug pointers (array). First selected order = primary. Options come from{" "}
        <code className="text-foreground">{source}</code> (any locale).
      </p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((slug, i) => {
            const label = options.find((o) => o.value === slug)?.label ?? deslugifyLabel(slug);
            return (
              <Badge key={slug} variant={i === 0 ? "default" : "secondary"} className="gap-1">
                {i === 0 ? "Primary: " : ""}
                {label}
                {i > 0 && (
                  <button
                    type="button"
                    title="Make primary"
                    className="text-[10px] underline"
                    onClick={() => movePrimary(slug)}
                    data-testid={`button-primary-relation-${fieldKey}-${slug}`}
                  >
                    ↑
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggle(slug)}
                  data-testid={`button-remove-relation-${fieldKey}-${slug}`}
                >
                  <IconX className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className="h-8 text-sm"
        data-testid={`input-relation-search-${fieldKey}`}
      />
      <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No options</p>
        ) : (
          filtered.map((opt) => {
            const isSelected = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover-elevate ${
                  isSelected ? "text-foreground" : "text-muted-foreground"
                }`}
                data-testid={`button-relation-${fieldKey}-${opt.value}`}
              >
                <span className="flex-1">{opt.label}</span>
                {isSelected && <IconCheck className="h-3.5 w-3.5 flex-shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
