import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Check, ChevronsUpDown, MapPin, RefreshCw } from "lucide-react";
import type { Location } from "@shared/session";
import { cn } from "@/lib/utils";

type ConfirmMode = "override" | "auto-detect" | null;

type LocationOption = { slug: string; name: string; country: string; region: string };

function LocationSearchCombobox({
  value,
  onChange,
  locationsByRegion,
  regionLabels,
  disabled,
}: {
  value: string;
  onChange: (slug: string) => void;
  locationsByRegion: Record<string, LocationOption[]>;
  regionLabels: Record<string, string>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const flatOptions = useMemo(
    () => Object.values(locationsByRegion).flat(),
    [locationsByRegion],
  );

  const selected = flatOptions.find((loc) => loc.slug === value);
  const triggerLabel = selected
    ? `${selected.name}, ${selected.country}`
    : "Choose a location...";

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-9 px-3"
          data-testid="select-location-override"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-[10003] pointer-events-auto bg-popover"
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const input = e.currentTarget.querySelector<HTMLInputElement>("input");
          input?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder="Search locations..."
            data-testid="input-location-override-search"
          />
          <CommandList className="max-h-64">
            <CommandEmpty>No location found.</CommandEmpty>
            {Object.entries(locationsByRegion).map(([region, locs]) => (
              <CommandGroup key={region} heading={regionLabels[region] || region}>
                {locs.map((loc) => (
                  <CommandItem
                    key={loc.slug}
                    value={`${loc.name} ${loc.country} ${loc.slug} ${regionLabels[region] || region}`}
                    onSelect={() => {
                      onChange(loc.slug);
                      setOpen(false);
                    }}
                    data-testid={`option-location-override-${loc.slug}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        value === loc.slug ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">
                      {loc.name}, {loc.country}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface LocationOverrideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLocation: Location | null;
  selectedLocationSlug: string;
  setSelectedLocationSlug: (v: string) => void;
  currentLocationOverride: string | null;
  handleLocationOverride: () => void;
  handleClearLocationOverride: () => void;
  handleResetLocation: () => void | Promise<void>;
  isResetting?: boolean;
  locationsByRegion: Record<string, Array<{ slug: string; name: string; country: string; region: string }>>;
  regionLabels: Record<string, string>;
}

export function LocationOverrideModal(props: LocationOverrideModalProps) {
  const {
    open,
    onOpenChange,
    currentLocation,
    selectedLocationSlug,
    setSelectedLocationSlug,
    currentLocationOverride,
    handleLocationOverride,
    handleClearLocationOverride,
    handleResetLocation,
    isResetting = false,
    locationsByRegion,
    regionLabels,
  } = props;

  const [confirmMode, setConfirmMode] = useState<ConfirmMode>(null);

  useEffect(() => {
    if (!open) setConfirmMode(null);
  }, [open]);

  const regionLabel = currentLocation
    ? regionLabels[currentLocation.region] || currentLocation.region
    : null;

  const isConfirming = confirmMode !== null;

  const ignorePopoverOutside = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-radix-popper-content-wrapper]")) {
      e.preventDefault();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        forceOverlay
        className="sm:max-w-xl overflow-visible"
        onPointerDownOutside={ignorePopoverOutside}
        onFocusOutside={ignorePopoverOutside}
        onInteractOutside={ignorePopoverOutside}
      >
        <DialogHeader>
          <DialogTitle>Your current location</DialogTitle>
          {!isConfirming && (
            <DialogDescription>
              Based on your IP address and other geo-location data your current location is:
            </DialogDescription>
          )}
        </DialogHeader>

        <div
          className="rounded-md border border-border bg-muted/40 p-3 space-y-3"
          data-testid={
            confirmMode === "override"
              ? "card-edit-location"
              : confirmMode === "auto-detect"
                ? "card-auto-detect-location"
                : "card-current-location"
          }
        >
          {confirmMode === "override" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Choose the new location you want to mock
              </p>
              <LocationSearchCombobox
                value={selectedLocationSlug}
                onChange={setSelectedLocationSlug}
                locationsByRegion={locationsByRegion}
                regionLabels={regionLabels}
                disabled={isResetting}
              />
            </>
          ) : confirmMode === "auto-detect" ? (
            <div className="flex items-start gap-2">
              <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Clear current location and auto-detect
                </p>
                <p className="text-sm text-muted-foreground">
                  Your current location will be cleared. The system will detect it again like it
                  would for any anonymous visitor.
                </p>
                {currentLocation && (
                  <p className="text-xs text-muted-foreground pt-1">
                    Currently:{" "}
                    <span className="text-foreground">
                      {currentLocation.name}, {currentLocation.country}
                    </span>
                    {" · "}
                    <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                      {currentLocation.slug}
                    </code>
                  </p>
                )}
              </div>
            </div>
          ) : currentLocation ? (
            <>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {currentLocation.name}, {currentLocation.country}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                      {currentLocation.slug}
                    </code>
                    {regionLabel ? ` · ${regionLabel}` : null}
                  </p>
                </div>
              </div>
              {currentLocationOverride && (
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground pt-1 border-t border-border">
                  <span>
                    Overridden via{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      ?location={currentLocationOverride}
                    </code>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearLocationOverride}
                    className="h-6 px-2 text-xs"
                    data-testid="button-clear-location-override"
                  >
                    Clear
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Detecting…</p>
          )}
        </div>

        {isConfirming ? (
          <div className="flex gap-2 pt-1 justify-end">
            <Button
              variant="outline"
              onClick={() => setConfirmMode(null)}
              disabled={isResetting}
              data-testid="button-cancel-edit-location"
            >
              <ArrowLeft />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (confirmMode === "override") handleLocationOverride();
                else void handleResetLocation();
              }}
              disabled={
                isResetting ||
                (confirmMode === "override" && !selectedLocationSlug)
              }
              data-testid={
                confirmMode === "override"
                  ? "button-confirm-location-override"
                  : "button-confirm-auto-detect"
              }
            >
              {confirmMode === "override" ? (
                <>
                  <MapPin />
                  Apply
                </>
              ) : (
                <>
                  <RefreshCw className={isResetting ? "animate-spin" : undefined} />
                  {isResetting ? "Detecting…" : "Apply"}
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-2 rounded-md border border-border p-3 flex flex-col">
              <div className="space-y-1 flex-1">
                <h4 className="text-sm font-medium text-foreground">Override my current location</h4>
                <p className="text-xs text-muted-foreground">
                  You can change your location for debug and testing purposes
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setConfirmMode("override")}
                disabled={isResetting}
                data-testid="button-start-location-override"
              >
                <MapPin />
                Override my current location
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-border p-3 flex flex-col">
              <div className="space-y-1 flex-1">
                <h4 className="text-sm font-medium text-foreground">Auto-detect location</h4>
                <p className="text-xs text-muted-foreground">
                  System will calculate like it would do with any anonymous visitor
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setConfirmMode("auto-detect")}
                disabled={isResetting}
                data-testid="button-start-auto-detect"
              >
                <RefreshCw />
                Auto-detect location
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
