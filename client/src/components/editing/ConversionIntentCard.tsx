import { IconFileDescription, IconPencil, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONVERSION_INTENT_MAX_CHARS,
  CONVERSION_INTENT_MIN_CHARS,
  isConversionIntentFieldValid,
} from "@shared/conversionEventIntent";

const INTENT_FIELD_HINT = `2–4 sentences · ${CONVERSION_INTENT_MIN_CHARS}–${CONVERSION_INTENT_MAX_CHARS} characters. Agents match visitor CTA copy to these fields when choosing conversion_name.`;

function IntentCharCount({ value }: { value: string }) {
  const n = value.trim().length;
  const ok = isConversionIntentFieldValid(value);
  return (
    <span className={ok ? "text-muted-foreground" : "text-destructive"}>
      {n}/{CONVERSION_INTENT_MAX_CHARS}
      {n > 0 && n < CONVERSION_INTENT_MIN_CHARS
        ? ` · need ${CONVERSION_INTENT_MIN_CHARS - n} more`
        : ""}
    </span>
  );
}

export interface ConversionIntentCardProps {
  description: string;
  whenToUse: string;
  whenNotToUse: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onChange: (
    field: "description" | "when_to_use" | "when_not_to_use",
    value: string,
  ) => void;
  testIdPrefix?: string;
}

export function ConversionIntentCard({
  description,
  whenToUse,
  whenNotToUse,
  editing,
  onEditingChange,
  onChange,
  testIdPrefix = "event-intent",
}: ConversionIntentCardProps) {
  const intentOk =
    isConversionIntentFieldValid(whenToUse) &&
    isConversionIntentFieldValid(whenNotToUse);
  const descTrim = description.trim();
  const whenTrim = whenToUse.trim();
  const whenNotTrim = whenNotToUse.trim();

  return (
    <div
      className="rounded-md border bg-muted/20 p-3 space-y-3 overflow-hidden w-full min-w-0"
      data-testid={`card-${testIdPrefix}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <IconFileDescription className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">Intent &amp; description</span>
          <Badge
            variant={intentOk ? "outline" : "destructive"}
            className="text-[11px] px-1.5 py-0 leading-4 font-normal"
            data-testid={`badge-${testIdPrefix}-status`}
          >
            {intentOk ? "Ready" : "Needs intent"}
          </Badge>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 flex-shrink-0"
          onClick={() => onEditingChange(!editing)}
          data-testid={`button-edit-${testIdPrefix}`}
        >
          {editing ? (
            <IconX className="h-3.5 w-3.5" />
          ) : (
            <IconPencil className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {editing ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-snug">{INTENT_FIELD_HINT}</p>
          <p className="text-[11px] text-muted-foreground">
            Advanced:{" "}
            <code className="text-[10px]">site_*/settings.yml</code> →{" "}
            <code className="text-[10px]">tracking.conversion_events</code>; agents read via MCP{" "}
            <code className="text-[10px]">explain_site</code> topic{" "}
            <code className="text-[10px]">component-behaviors</code>.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor={`${testIdPrefix}-desc`} className="text-xs text-muted-foreground">
              Description{" "}
              <span className="font-normal">(optional)</span>
            </Label>
            <Input
              id={`${testIdPrefix}-desc`}
              placeholder="Short staff label"
              value={description}
              onChange={(e) => onChange("description", e.target.value)}
              data-testid={`input-${testIdPrefix}-desc`}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${testIdPrefix}-when-to-use`} className="text-xs text-muted-foreground">
                When to use
              </Label>
              <IntentCharCount value={whenToUse} />
            </div>
            <Textarea
              id={`${testIdPrefix}-when-to-use`}
              rows={3}
              maxLength={CONVERSION_INTENT_MAX_CHARS}
              placeholder="Visitor is applying / enrolling…"
              value={whenToUse}
              onChange={(e) => onChange("when_to_use", e.target.value)}
              data-testid={`input-${testIdPrefix}-when-to-use`}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor={`${testIdPrefix}-when-not-to-use`}
                className="text-xs text-muted-foreground"
              >
                When not to use
              </Label>
              <IntentCharCount value={whenNotToUse} />
            </div>
            <Textarea
              id={`${testIdPrefix}-when-not-to-use`}
              rows={3}
              maxLength={CONVERSION_INTENT_MAX_CHARS}
              placeholder="Soft info-only, downloads, newsletter…"
              value={whenNotToUse}
              onChange={(e) => onChange("when_not_to_use", e.target.value)}
              data-testid={`input-${testIdPrefix}-when-not-to-use`}
              className="text-sm"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 min-w-0">
          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground">Description</span>
            {descTrim ? (
              <p
                className="text-xs text-foreground line-clamp-2"
                data-testid={`text-${testIdPrefix}-desc`}
              >
                {descTrim}
              </p>
            ) : (
              <span
                className="text-xs text-muted-foreground italic"
                data-testid={`text-${testIdPrefix}-desc-empty`}
              >
                No description
              </span>
            )}
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground">When to use</span>
            {whenTrim ? (
              <p
                className="text-xs text-foreground line-clamp-3"
                data-testid={`text-${testIdPrefix}-when-to-use`}
              >
                {whenTrim}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not set</span>
            )}
          </div>

          <div className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground">When not to use</span>
            {whenNotTrim ? (
              <p
                className="text-xs text-foreground line-clamp-3"
                data-testid={`text-${testIdPrefix}-when-not-to-use`}
              >
                {whenNotTrim}
              </p>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not set</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
