import { useMemo, useState } from "react";
import { IconCheck, IconPlus, IconSelector, IconX } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

export type SearchableMultiComboboxOption = {
  value: string;
  label?: string;
};

export type SearchableMultiComboboxProps = {
  values: string[];
  onChange: (next: string[]) => void;
  options: SearchableMultiComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Allow typing a value not in options (Enter / custom row). Default true. */
  allowCustom?: boolean;
  isLoading?: boolean;
  /** Nested-popover open callback so a parent Dialog can avoid closing. */
  onOpenChange?: (open: boolean) => void;
  testId?: string;
  mono?: boolean;
  disabled?: boolean;
};

export function SearchableMultiCombobox({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  allowCustom = true,
  isLoading = false,
  onOpenChange,
  testId = "multi-combobox",
  mono = false,
  disabled = false,
}: SearchableMultiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const known = useMemo(() => {
    const set = new Set(options.map((o) => o.value.toLowerCase()));
    for (const v of values) set.add(v.toLowerCase());
    return set;
  }, [options, values]);

  const trimmedSearch = search.trim();
  const showCustom =
    allowCustom &&
    Boolean(trimmedSearch) &&
    !known.has(trimmedSearch.toLowerCase());

  const labelFor = (value: string) =>
    options.find((o) => o.value.toLowerCase() === value.toLowerCase())?.label ?? value;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setSearch("");
  }

  function toggle(value: string) {
    const exists = values.some((v) => v.toLowerCase() === value.toLowerCase());
    if (exists) {
      onChange(values.filter((v) => v.toLowerCase() !== value.toLowerCase()));
    } else {
      onChange([...values, value]);
    }
  }

  function addCustom() {
    if (!trimmedSearch || !allowCustom) return;
    toggle(trimmedSearch);
    setSearch("");
  }

  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? labelFor(values[0]!)
        : `${values.length} selected`;

  return (
    <div className="space-y-1.5">
      <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-8 w-full justify-between px-2 font-normal text-sm"
            data-testid={`button-${testId}`}
          >
            <span
              className={cn(
                "min-w-0 truncate",
                values.length === 0 && "text-muted-foreground",
                mono && values.length === 1 && "font-mono text-xs",
              )}
            >
              {triggerLabel}
            </span>
            <IconSelector className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          // Above Dialog (z-[10000]); matches ProposalProposerCombobox.
          className="z-[10001] w-[--radix-popover-trigger-width] min-w-[16rem] p-0 bg-popover"
          sideOffset={4}
          data-testid={`popover-${testId}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={true}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && trimmedSearch && allowCustom) {
                  e.preventDefault();
                  addCustom();
                }
              }}
              data-testid={`input-${testId}`}
            />
            <CommandList className="max-h-64">
              <CommandEmpty>
                {isLoading
                  ? "Loading…"
                  : trimmedSearch && allowCustom
                    ? `Press Enter to use “${trimmedSearch}”`
                    : emptyMessage}
              </CommandEmpty>
              {showCustom ? (
                <CommandGroup heading="Custom">
                  <CommandItem
                    value={`custom-${trimmedSearch}`}
                    onSelect={() => addCustom()}
                    className={cn(mono && "font-mono text-xs")}
                    data-testid={`option-${testId}-custom`}
                  >
                    <IconPlus className="mr-2 h-3.5 w-3.5 shrink-0" />
                    Use “{trimmedSearch}”
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {options.length > 0 ? (
                <CommandGroup>
                  {options.map((opt) => {
                    const selected = values.some(
                      (v) => v.toLowerCase() === opt.value.toLowerCase(),
                    );
                    return (
                      <CommandItem
                        key={opt.value}
                        value={`${opt.label ?? ""} ${opt.value}`}
                        onSelect={() => toggle(opt.value)}
                        className={cn(mono && "font-mono text-xs")}
                        data-testid={`option-${testId}-${opt.value}`}
                      >
                        <IconCheck
                          className={cn(
                            "mr-2 h-3.5 w-3.5 shrink-0",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 truncate">{opt.label ?? opt.value}</span>
                        {opt.label && opt.label !== opt.value ? (
                          <span className="ml-auto pl-2 font-mono text-[10px] text-muted-foreground truncate">
                            {opt.value}
                          </span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {(() => {
                const orphans = values.filter(
                  (v) => !options.some((o) => o.value.toLowerCase() === v.toLowerCase()),
                );
                if (orphans.length === 0) return null;
                return (
                  <CommandGroup heading="Selected">
                    {orphans.map((v) => (
                      <CommandItem
                        key={`orphan-${v}`}
                        value={v}
                        onSelect={() => toggle(v)}
                        className={cn(mono && "font-mono text-xs")}
                      >
                        <IconCheck className="mr-2 h-3.5 w-3.5 shrink-0 opacity-100" />
                        {v}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })()}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className={cn("gap-1 pr-1 font-normal", mono && "font-mono text-xs")}
            >
              <span className="truncate max-w-[10rem]">{labelFor(v)}</span>
              <button
                type="button"
                onClick={() => toggle(v)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                aria-label={`Remove ${v}`}
                data-testid={`button-remove-${testId}-${v}`}
              >
                <IconX className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
