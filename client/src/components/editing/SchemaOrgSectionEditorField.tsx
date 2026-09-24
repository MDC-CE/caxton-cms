import { useMemo, useState } from "react";
import { Code2 } from "lucide-react";
import { IconChevronDown } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { buildSchemaOrgPreviewDocument } from "@shared/schema-org-transform";
import { cn } from "@/lib/utils";

/** Curated schema.org @types used on this site (+ Other for free text). */
export const SCHEMA_ORG_CURATED_TYPES = [
  "Person",
  "Organization",
  "WebSite",
  "Course",
  "LocalBusiness",
  "ProfilePage",
  "Article",
  "BlogPosting",
] as const;

const OTHER_VALUE = "__other__";

export interface SchemaOrgSectionEditorFieldProps {
  schemaType: string;
  properties: Record<string, unknown>;
  locale?: string;
  onSchemaTypeChange: (value: string) => void;
  "data-testid"?: string;
}

export function SchemaOrgSectionEditorField({
  schemaType,
  properties,
  locale = "en",
  onSchemaTypeChange,
  "data-testid": testId,
}: SchemaOrgSectionEditorFieldProps) {
  const trimmedType = schemaType.trim();
  const isCurated = (SCHEMA_ORG_CURATED_TYPES as readonly string[]).includes(trimmedType);
  const [forceOther, setForceOther] = useState(false);
  const showOther = forceOther || (!!trimmedType && !isCurated);
  const selectValue = showOther ? OTHER_VALUE : trimmedType || "";
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const previewDoc = useMemo(() => {
    const typeForPreview = trimmedType || "Thing";
    const props =
      properties && typeof properties === "object" && !Array.isArray(properties)
        ? properties
        : {};
    return buildSchemaOrgPreviewDocument(typeForPreview, props, locale);
  }, [trimmedType, properties, locale]);

  const previewJson = useMemo(
    () => JSON.stringify(previewDoc, null, 2),
    [previewDoc],
  );

  return (
    <div
      className="rounded-md border border-input bg-background"
      data-testid={testId || "schema-org-section-editor-field"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-input bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Schema.org</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
          <Select
            value={selectValue || undefined}
            onValueChange={(v) => {
              if (v === OTHER_VALUE) {
                setForceOther(true);
                if (isCurated || !trimmedType) {
                  onSchemaTypeChange("");
                }
                return;
              }
              setForceOther(false);
              onSchemaTypeChange(v);
            }}
          >
            <SelectTrigger
              className="h-8 w-[180px] text-xs"
              data-testid="select-schema-org-type"
            >
              <SelectValue placeholder="Pick @type" />
            </SelectTrigger>
            <SelectContent className="z-[10001]">
              {SCHEMA_ORG_CURATED_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs font-mono">
                  {t}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_VALUE} className="text-xs">
                Other…
              </SelectItem>
            </SelectContent>
          </Select>
          {showOther && (
            <Input
              value={trimmedType}
              onChange={(e) => onSchemaTypeChange(e.target.value)}
              placeholder="Custom @type"
              className="h-8 w-[160px] text-xs font-mono"
              data-testid="input-schema-org-type-other"
            />
          )}
        </div>
      </div>

      <div className="px-3 py-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Pick <code className="font-mono text-foreground">@type</code>; the JSON-LD below is
          what SSR emits. Edit <code className="font-mono text-foreground">properties</code> in
          the Code tab — changing type does not wipe properties.
        </p>
        <pre
          className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] font-mono leading-relaxed text-foreground"
          data-testid="schema-org-jsonld-preview"
        >
          {previewJson}
        </pre>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-schema-org-advanced-read-more"
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
                  site_learning-mdc-edu/component-registry/schema_org/v1.0/field-editors.ts
                </span>
              </p>
              <p>
                SSR contributor:{" "}
                <span className="text-foreground">server/schema-components/schema_org.ts</span>
              </p>
              <p>
                Key transform / preview:{" "}
                <span className="text-foreground">shared/schema-org-transform.ts</span>
              </p>
              <p>
                UI:{" "}
                <span className="text-foreground">
                  client/src/components/editing/SchemaOrgSectionEditorField.tsx
                </span>
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
