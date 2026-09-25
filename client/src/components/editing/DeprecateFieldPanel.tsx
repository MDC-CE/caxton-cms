import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { IconChevronDown } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeprecatedFieldConfig } from "@shared/deprecatedField";

const NO_REPLACEMENT = "__no_replacement__";

type FieldUsageResponse = {
  field: string;
  files: string[];
  default_value?: string | null;
};

export type DeprecateFieldChoice = { replaced_by: string | null; reason?: string };

function RetireEducation() {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div className="space-y-2 text-xs text-muted-foreground" data-testid="deprecate-field-education">
      <p>
        Retiring stops new entries from using this field. Entries that already have a value keep it and can
        still edit it. Nothing is copied to the replacement field.
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={() => setShowAdvanced((v) => !v)}
        data-testid="button-toggle-deprecate-education"
      >
        {showAdvanced ? "Hide advanced details" : "Read more (advanced)"}
        <IconChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
      </button>
      {showAdvanced ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
          <p>
            Saved as <code className="font-mono text-[10px]">editor.&lt;field&gt;.deprecated</code> in{" "}
            <code className="font-mono text-[10px]">content-types.yml</code>. An entry counts as &quot;old&quot; when
            its live <code className="font-mono text-[10px]">_common.yml</code> or{" "}
            <code className="font-mono text-[10px]">{"{locale}.yml"}</code> already stores a value (database types:
            the <code className="font-mono text-[10px]">field_overrides</code> bag). Drafts and defaults do not count.
          </p>
          <p>
            Every save path rejects new values with <code className="font-mono text-[10px]">deprecated_field</code>
            {" "}(Fields tab, agents, raw file edits, create, publish). Duplicating an entry drops the value.
            Agents see the replacement in the error and in field listings.
          </p>
          <p className="text-muted-foreground">
            Paths: <code className="font-mono text-[10px]">shared/deprecatedField.ts</code>,{" "}
            <code className="font-mono text-[10px]">server/deprecated-field-guard.ts</code>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Step two of the Required-for-publish dialog: pick a replacement and retire the field. */
export function DeprecateFieldForm({
  contentType,
  fieldName,
  replacementOptions,
  initial,
  requiredWillTurnOff,
  isDbBacked,
  blockedByReferrers,
  onBack,
  onConfirm,
}: {
  contentType: string;
  fieldName: string;
  replacementOptions: string[];
  initial: DeprecatedFieldConfig | null;
  requiredWillTurnOff: boolean;
  isDbBacked: boolean;
  /** Deprecated fields that already point at this one — retiring is blocked. */
  blockedByReferrers: string[];
  onBack: () => void;
  onConfirm: (choice: DeprecateFieldChoice) => void;
}) {
  const [replacement, setReplacement] = useState<string>(initial?.replaced_by ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");

  useEffect(() => {
    setReplacement(initial?.replaced_by ?? "");
    setReason(initial?.reason ?? "");
  }, [fieldName, initial?.replaced_by, initial?.reason]);

  const { data: usage, isLoading: usageLoading } = useQuery<FieldUsageResponse>({
    queryKey: ["/api/content-types", contentType, "fields", fieldName, "usages"],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-types/${encodeURIComponent(contentType)}/fields/${encodeURIComponent(fieldName)}/usages`,
      );
      if (!res.ok) throw new Error(`usages ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const picked = replacement !== "";
  const blocked = blockedByReferrers.length > 0;
  const defaultValue =
    usage?.default_value !== undefined && usage.default_value !== null && usage.default_value !== ""
      ? usage.default_value
      : null;

  return (
    <div className="space-y-3" data-testid="deprecate-field-form">
      <RetireEducation />
      {blocked ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" data-testid="text-deprecate-blocked">
          <code className="font-mono">{fieldName}</code> is the replacement for{" "}
          {blockedByReferrers.map((f) => (
            <code key={f} className="font-mono mr-1">{f}</code>
          ))}
          — change their replacement first.
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label className="text-xs">Use this field instead</Label>
        <Select value={replacement} onValueChange={setReplacement} disabled={blocked}>
          <SelectTrigger className="h-8 text-xs font-mono" data-testid="select-deprecate-replacement">
            <SelectValue placeholder="Pick a replacement…" />
          </SelectTrigger>
          <SelectContent className="z-[10001]">
            <SelectItem value={NO_REPLACEMENT} className="text-xs" data-testid="option-deprecate-no-replacement">
              No replacement
            </SelectItem>
            {replacementOptions.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs font-mono">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="input-deprecate-reason">
          Reason <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="input-deprecate-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Shown to staff and agents"
          className="h-8 text-xs"
          disabled={blocked}
          data-testid="input-deprecate-reason"
        />
      </div>
      <ul className="space-y-1.5 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground" data-testid="list-deprecate-warnings">
        {requiredWillTurnOff ? (
          <li className="flex gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
            <span>&quot;Required for publish&quot; will be turned off for this field.</span>
          </li>
        ) : null}
        <li className="flex gap-1.5" data-testid="text-deprecate-usages">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {usageLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking templates…
            </span>
          ) : usage && usage.files.length > 0 ? (
            <span>
              {usage.files.length} file{usage.files.length === 1 ? "" : "s"} still show this field. New entries will
              show {defaultValue ? "the default" : "nothing"} there until you switch them
              {picked && replacement !== NO_REPLACEMENT ? (
                <>
                  {" "}to <code className="font-mono">{`{{ entry.${replacement} }}`}</code>
                </>
              ) : null}
              .
              <span className="mt-1 block max-h-24 overflow-auto font-mono text-[10px]">
                {usage.files.slice(0, 12).map((f) => (
                  <span key={f} className="block truncate">{f}</span>
                ))}
                {usage.files.length > 12 ? <span className="block">…and {usage.files.length - 12} more</span> : null}
              </span>
            </span>
          ) : (
            <span>No templates reference this field.</span>
          )}
        </li>
        {defaultValue ? (
          <li className="flex gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              The default value <code className="font-mono">{String(defaultValue)}</code> still shows on entries
              without their own value.
            </span>
          </li>
        ) : null}
        {isDbBacked ? (
          <li className="flex gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Values coming from the database still show. Only new overrides are blocked.</span>
          </li>
        ) : null}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-deprecate-back">
          Back
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!picked || blocked}
          onClick={() =>
            onConfirm({
              replaced_by: replacement === NO_REPLACEMENT ? null : replacement,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            })
          }
          data-testid="button-deprecate-confirm"
        >
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          {initial ? "Save changes" : "Retire field"}
        </Button>
      </div>
    </div>
  );
}

/** Shown instead of the required toggles when the field is already retired. */
export function DeprecatedFieldState({
  config,
  onChange,
  onRestore,
}: {
  config: DeprecatedFieldConfig;
  onChange: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="deprecated-field-state">
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1.5">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <Archive className="h-3.5 w-3.5" aria-hidden />
          Retired
          {config.replaced_by ? (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
              use <code className="font-mono">{config.replaced_by}</code>
            </>
          ) : (
            <span className="font-normal text-muted-foreground">— no replacement</span>
          )}
        </p>
        {config.reason ? <p className="text-muted-foreground">{config.reason}</p> : null}
        <p className="text-muted-foreground">
          Old entries keep their value; new entries can&apos;t set it. It can&apos;t be required while retired.
        </p>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onRestore} data-testid="button-deprecate-restore">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Restore field
        </Button>
        <Button variant="outline" size="sm" onClick={onChange} data-testid="button-deprecate-change">
          Change replacement
        </Button>
      </div>
    </div>
  );
}
