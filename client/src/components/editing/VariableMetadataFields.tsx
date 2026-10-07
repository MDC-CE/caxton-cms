import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VARIABLE_CATEGORIES,
  VARIABLE_CATEGORY_HINTS,
  VARIABLE_CATEGORY_LABELS,
  VARIABLE_UNITS,
  VARIABLE_UNIT_LABELS,
  isFigureCategory,
} from "@shared/variable-metadata";
import { cn } from "@/lib/utils";

export interface VariableMetadataDraft {
  description: string;
  category: string;
  unit: string;
  deprecated: boolean;
  replaced_by: string;
}

export const EMPTY_METADATA_DRAFT: VariableMetadataDraft = {
  description: "",
  category: "",
  unit: "",
  deprecated: false,
  replaced_by: "",
};

export function metadataDraftFrom(def?: {
  description?: string;
  category?: string;
  unit?: string;
  deprecated?: boolean;
  replaced_by?: string;
} | null): VariableMetadataDraft {
  return {
    description: def?.description ?? "",
    category: def?.category ?? "",
    unit: def?.unit ?? "",
    deprecated: def?.deprecated === true,
    replaced_by: def?.replaced_by ?? "",
  };
}

export function metadataDraftReady(draft: VariableMetadataDraft): boolean {
  return draft.description.trim() !== "" && draft.category.trim() !== "";
}

export function metadataDraftToBody(draft: VariableMetadataDraft): Record<string, unknown> {
  return {
    description: draft.description.trim(),
    category: draft.category,
    unit: draft.unit || null,
    deprecated: draft.deprecated,
    replaced_by: draft.deprecated && draft.replaced_by ? draft.replaced_by : null,
  };
}

const NONE = "__none__";

export function VariableMetadataFields({
  draft,
  onChange,
  showOptional = true,
  replacementOptions = [],
  errorField,
  testIdPrefix = "variable-meta",
}: {
  draft: VariableMetadataDraft;
  onChange: (next: VariableMetadataDraft) => void;
  showOptional?: boolean;
  replacementOptions?: string[];
  errorField?: "description" | "category" | null;
  testIdPrefix?: string;
}) {
  const set = (patch: Partial<VariableMetadataDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground" htmlFor={`${testIdPrefix}-description`}>
          Description <span className="text-destructive">*</span>
        </label>
        <Textarea
          id={`${testIdPrefix}-description`}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="What this fact is and when to use it (e.g. Full-stack tuition, one-time payment)"
          rows={2}
          className={cn(errorField === "description" && "border-destructive")}
          data-testid={`${testIdPrefix}-description`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">
            Category <span className="text-destructive">*</span>
          </label>
          <Select value={draft.category || undefined} onValueChange={(v) => set({ category: v })}>
            <SelectTrigger
              className={cn(errorField === "category" && "border-destructive")}
              data-testid={`${testIdPrefix}-category`}
            >
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent className="z-[10002]">
              {VARIABLE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} data-testid={`${testIdPrefix}-category-${c}`}>
                  {VARIABLE_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.category && (
            <p className="text-xs text-muted-foreground">
              {VARIABLE_CATEGORY_HINTS[draft.category as keyof typeof VARIABLE_CATEGORY_HINTS] ?? ""}
              {isFigureCategory(draft.category) ? " Changes get extra review." : ""}
            </p>
          )}
        </div>

        {showOptional && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Unit</label>
            <Select value={draft.unit || NONE} onValueChange={(v) => set({ unit: v === NONE ? "" : v })}>
              <SelectTrigger data-testid={`${testIdPrefix}-unit`}>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent className="z-[10002]">
                <SelectItem value={NONE}>None</SelectItem>
                {VARIABLE_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {VARIABLE_UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {showOptional && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Deprecated</p>
              <p className="text-xs text-muted-foreground">
                Hidden from agents for new content. Pick a replacement so they know what to use instead.
              </p>
            </div>
            <Switch
              checked={draft.deprecated}
              onCheckedChange={(checked) => set({ deprecated: checked, replaced_by: checked ? draft.replaced_by : "" })}
              data-testid={`${testIdPrefix}-deprecated`}
            />
          </div>
          {draft.deprecated && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Use this instead</label>
              {replacementOptions.length > 0 ? (
                <Select
                  value={draft.replaced_by || NONE}
                  onValueChange={(v) => set({ replaced_by: v === NONE ? "" : v })}
                >
                  <SelectTrigger data-testid={`${testIdPrefix}-replaced-by`}>
                    <SelectValue placeholder="No replacement" />
                  </SelectTrigger>
                  <SelectContent className="z-[10002] max-h-72">
                    <SelectItem value={NONE}>No replacement</SelectItem>
                    {replacementOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        <span className="font-mono text-xs">{name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={draft.replaced_by}
                  onChange={(e) => set({ replaced_by: e.target.value })}
                  placeholder="global.other_variable"
                  className="font-mono text-xs"
                  data-testid={`${testIdPrefix}-replaced-by`}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
