import { IconUserPlus } from "@tabler/icons-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CountsAsLeadChoice = boolean | null;

export interface CountsAsLeadCardProps {
  /** null = undecided (blocks save) */
  value: CountsAsLeadChoice;
  onChange: (value: boolean) => void;
  /** When set, hide the switch and show read-only copy */
  authMode?: "signup" | "login" | null;
  testIdPrefix?: string;
  className?: string;
}

/**
 * Staff must choose Include / Don't include for lead KPIs.
 * Signup is always on; login is always off (authMode).
 */
export function CountsAsLeadCard({
  value,
  onChange,
  authMode = null,
  testIdPrefix = "counts-as-lead",
  className,
}: CountsAsLeadCardProps) {
  if (authMode === "signup") {
    return (
      <div
        className={cn("rounded-md border bg-muted/20 p-3 space-y-1.5", className)}
        data-testid={`card-${testIdPrefix}`}
      >
        <div className="flex items-center gap-1.5">
          <IconUserPlus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">Count as lead</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-${testIdPrefix}-signup`}>
          Always counted as a lead. Account create is included in product journey lead metrics;
          you cannot turn this off.
        </p>
      </div>
    );
  }

  if (authMode === "login") {
    return (
      <div
        className={cn("rounded-md border bg-muted/20 p-3 space-y-1.5", className)}
        data-testid={`card-${testIdPrefix}`}
      >
        <div className="flex items-center gap-1.5">
          <IconUserPlus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">Count as lead</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-${testIdPrefix}-login`}>
          Not counted as a lead. Login is an auth event, not a lead conversion for reports.
        </p>
      </div>
    );
  }

  const decided = value !== null;

  return (
    <div
      className={cn("rounded-md border bg-muted/20 p-3 space-y-3", className)}
      data-testid={`card-${testIdPrefix}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <IconUserPlus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">Count as lead</span>
        </div>
        {decided ? (
          <div className="flex items-center gap-2 shrink-0">
            <Label
              htmlFor={`${testIdPrefix}-switch`}
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Include in lead counts
            </Label>
            <Switch
              id={`${testIdPrefix}-switch`}
              checked={value === true}
              onCheckedChange={onChange}
              data-testid={`switch-${testIdPrefix}`}
            />
          </div>
        ) : null}
      </div>

      {!decided ? (
        <div className="space-y-2" data-testid={`${testIdPrefix}-undecided`}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose whether this event is included in lead counts on product journey metrics and
            reports. You must pick before saving. Tracking still fires either way; ads platforms
            only count it if you map this event name there.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => onChange(true)}
              data-testid={`button-${testIdPrefix}-yes`}
            >
              Include in lead counts
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onChange(false)}
              data-testid={`button-${testIdPrefix}-no`}
            >
              Don&apos;t include
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground leading-relaxed">
          When on, this event is included in lead counts on product journey metrics and reports.
          The form still fires to GTM either way. Ads platforms only count it if you map this
          event name as a conversion there.
        </p>
      )}
    </div>
  );
}
