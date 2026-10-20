import type { ReactNode } from "react";
import { ChevronDown, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import type { Section } from "@shared/schema";
import { getIcon } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LinkPicker } from "@/components/editing/LinkPicker";
import {
  collectVisibleContent,
  type ContentControl,
} from "@/components/editing/sectionContentControls";

interface SectionYamlContentFieldsProps {
  section: Record<string, unknown> | null;
  configuredFields: Record<string, string>;
  locale: string;
  allSections?: Section[];
  resolveImageSrc: (id: string) => string;
  onChange: (path: string, value: string | number | boolean) => void;
  onChangeArrayItem: (
    arrayPath: string,
    index: number,
    field: string,
    value: string | number | boolean,
  ) => void;
  onAddArrayItem: (arrayPath: string, item: Record<string, unknown> | string) => void;
  onRemoveArrayItem: (arrayPath: string, index: number) => void;
  onPickImage: (target: {
    fieldPath?: string;
    arrayPath?: string;
    index?: number;
    srcField?: string;
    currentSrc: string;
    currentAlt: string;
    label: string;
  }) => void;
  onPickIcon: (target: {
    fieldPath?: string;
    arrayPath?: string;
    index?: number;
    field?: string;
    currentIcon: string;
    label: string;
  }) => void;
}

function blankItem(sample: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!sample) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === "string") next[key] = "";
    else if (typeof value === "number") next[key] = 0;
    else if (typeof value === "boolean") next[key] = false;
  }
  return next;
}

export function SectionYamlContentFields({
  section,
  configuredFields,
  locale,
  allSections,
  resolveImageSrc,
  onChange,
  onChangeArrayItem,
  onAddArrayItem,
  onRemoveArrayItem,
  onPickImage,
  onPickIcon,
}: SectionYamlContentFieldsProps) {
  const controls = collectVisibleContent(section, configuredFields);
  if (!controls.length) return null;

  const write = (
    control: ContentControl,
    value: string | number | boolean,
    array?: { path: string; index: number },
  ) => {
    if (array) onChangeArrayItem(array.path, array.index, control.path, value);
    else onChange(control.path, value);
  };

  const renderControl = (
    control: ContentControl,
    array?: { path: string; index: number },
  ): ReactNode => {
    const testId = `props-content-${control.path.replace(/\./g, "-")}${
      array ? `-${array.index}` : ""
    }`;

    if (control.kind === "group") {
      return (
        <div key={control.path} className="space-y-2 rounded-md border border-border p-3">
          <Label className="text-sm font-medium">{control.label}</Label>
          <div className="space-y-3">
            {control.fields.map((field) => renderControl(field, array))}
          </div>
        </div>
      );
    }

    if (control.kind === "strings") {
      return (
        <div key={control.path} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">
              {control.label} ({control.values.length})
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => onAddArrayItem(control.path, "")}
              data-testid={`${testId}-add`}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {control.values.map((line, index) => (
              <div key={index} className="flex items-start gap-2">
                <Textarea
                  value={line}
                  rows={2}
                  className="text-sm"
                  onChange={(e) => onChangeArrayItem(control.path, index, "$item", e.target.value)}
                  data-testid={`${testId}-${index}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onRemoveArrayItem(control.path, index)}
                  data-testid={`${testId}-remove-${index}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (control.kind === "array") {
      const sample = array
        ? undefined
        : (section &&
            control.path.split(".").reduce<unknown>((cur, part) => {
              if (!cur || typeof cur !== "object") return undefined;
              return (cur as Record<string, unknown>)[part];
            }, section));
      const first =
        Array.isArray(sample) && sample[0] && typeof sample[0] === "object"
          ? (sample[0] as Record<string, unknown>)
          : undefined;
      return (
        <div key={`${control.path}-${array?.index ?? "root"}`} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">
              {control.label} ({control.items.length})
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => onAddArrayItem(control.path, blankItem(first))}
              data-testid={`${testId}-add`}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-2">
            {control.items.map((item, index) => (
              <Collapsible key={index} className="rounded-md border border-border">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted/50"
                    data-testid={`${testId}-item-${index}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 border-t border-border p-3">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-destructive"
                        onClick={() => onRemoveArrayItem(control.path, index)}
                        data-testid={`${testId}-remove-${index}`}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                    {item.fields.map((field) =>
                      renderControl(field, { path: control.path, index }),
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      );
    }

    if (control.kind === "boolean") {
      return (
        <div key={control.path} className="flex items-center justify-between gap-3">
          <Label className="text-sm font-medium">{control.label}</Label>
          <Switch
            checked={control.value}
            onCheckedChange={(checked) => write(control, checked, array)}
            data-testid={testId}
          />
        </div>
      );
    }

    if (control.kind === "number") {
      return (
        <div key={control.path} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{control.label}</Label>
          <Input
            type="number"
            value={String(control.value)}
            className="h-8 text-sm"
            onChange={(e) => {
              const next = e.target.value === "" ? 0 : Number(e.target.value);
              write(control, next, array);
            }}
            data-testid={testId}
          />
        </div>
      );
    }

    if (control.kind === "image") {
      const src = resolveImageSrc(control.value);
      return (
        <div key={control.path} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{control.label}</Label>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left hover:bg-muted/50"
            onClick={() =>
              onPickImage(
                array
                  ? {
                      arrayPath: array.path,
                      index: array.index,
                      srcField: control.path,
                      currentSrc: control.value,
                      currentAlt: control.alt,
                      label: control.label,
                    }
                  : {
                      fieldPath: control.path,
                      currentSrc: control.value,
                      currentAlt: control.alt,
                      label: control.label,
                    },
              )
            }
            data-testid={testId}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {src ? (
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm">{control.alt || "Choose photo"}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {control.value || "No photo yet"}
              </span>
            </span>
          </button>
        </div>
      );
    }

    if (control.kind === "icon") {
      const Icon = control.value ? getIcon(control.value) : null;
      return (
        <div key={control.path} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{control.label}</Label>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-muted/50"
            onClick={() =>
              onPickIcon(
                array
                  ? {
                      arrayPath: array.path,
                      index: array.index,
                      field: control.path,
                      currentIcon: control.value,
                      label: control.label,
                    }
                  : {
                      fieldPath: control.path,
                      currentIcon: control.value,
                      label: control.label,
                    },
              )
            }
            data-testid={testId}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded border bg-muted/40">
              {Icon ? <Icon className="h-4 w-4" /> : null}
            </span>
            <span className="text-sm">{control.value || "Choose icon"}</span>
          </button>
        </div>
      );
    }

    if (control.kind === "link") {
      return (
        <div key={control.path} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{control.label}</Label>
          <LinkPicker
            value={control.value}
            onChange={(url) => write(control, url, array)}
            locale={locale}
            allSections={allSections}
            testId={testId}
          />
        </div>
      );
    }

    if (control.kind === "longtext") {
      return (
        <div key={control.path} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{control.label}</Label>
          <Textarea
            value={control.value}
            rows={3}
            className="text-sm"
            onChange={(e) => write(control, e.target.value, array)}
            data-testid={testId}
          />
        </div>
      );
    }

    return (
      <div key={control.path} className="space-y-1">
        <Label className="text-xs text-muted-foreground">{control.label}</Label>
        <Input
          value={control.value}
          className="h-8 text-sm"
          onChange={(e) => write(control, e.target.value, array)}
          data-testid={testId}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="props-section-content">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Section content</Label>
        <p className="text-xs text-muted-foreground">
          Every piece of this section. Edit it here and save; each photo, line of text, and icon is its own field.
        </p>
      </div>
      {controls.map((control) => renderControl(control))}
    </div>
  );
}
