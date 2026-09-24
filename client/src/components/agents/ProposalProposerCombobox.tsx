import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconCheck, IconPlus, IconSelector } from "@tabler/icons-react";
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
import { apiFetch } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export type ProposalPeopleSource = "proposers" | "reviewers";

const SOURCE_CONFIG: Record<
  ProposalPeopleSource,
  { endpoint: string; key: string; noun: string; testId: string }
> = {
  proposers: {
    endpoint: "/api/admin/proposals/proposers",
    key: "proposers",
    noun: "proposers",
    testId: "proposer",
  },
  reviewers: {
    endpoint: "/api/admin/proposals/reviewers",
    key: "reviewers",
    noun: "reviewers",
    testId: "reviewer",
  },
};

async function fetchRecentPeople(source: ProposalPeopleSource): Promise<string[]> {
  const cfg = SOURCE_CONFIG[source];
  const res = await apiFetch(`${cfg.endpoint}?days=30`);
  if (!res.ok) {
    throw new Error(`Failed to load ${cfg.noun} (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const list = data[cfg.key];
  return Array.isArray(list) ? (list as string[]) : [];
}

export type ProposalProposerComboboxProps = {
  value: string;
  onChange: (next: string) => void;
  /** Which people list to load; defaults to proposers. */
  source?: ProposalPeopleSource;
  /** When true, load recent people (e.g. while filters dialog is open). */
  enabled?: boolean;
  /** Nested-popover open callback so the parent dialog can avoid closing. */
  onOpenChange?: (open: boolean) => void;
};

export function ProposalProposerCombobox({
  value,
  onChange,
  source = "proposers",
  enabled = true,
  onOpenChange,
}: ProposalProposerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cfg = SOURCE_CONFIG[source];

  const peopleQuery = useQuery({
    queryKey: [cfg.endpoint, 30],
    queryFn: () => fetchRecentPeople(source),
    enabled,
    staleTime: 30_000,
  });

  const people = peopleQuery.data ?? [];
  const trimmedSearch = search.trim();
  const knownValues = useMemo(() => {
    const set = new Set(people.map((p) => p.toLowerCase()));
    return set;
  }, [people]);

  const showCustom =
    Boolean(trimmedSearch) && !knownValues.has(trimmedSearch.toLowerCase());

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setSearch("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setSearch("");
  }

  const triggerLabel = value.trim() || "Anyone";

  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id={`proposal-${cfg.testId}-username-filter`}
          className="h-8 w-full justify-between px-2 font-normal text-sm"
          data-testid={`button-proposal-${cfg.testId}-filter`}
        >
          <span className={cn("min-w-0 truncate", !value.trim() && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <IconSelector className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // Above Dialog (z-[10000]); SelectContent uses the same stack.
        className="z-[10001] w-[--radix-popover-trigger-width] min-w-[16rem] p-0 bg-popover"
        sideOffset={4}
        data-testid={`popover-proposal-${cfg.testId}-filter`}
      >
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={`Search ${cfg.noun}…`}
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmedSearch) {
                e.preventDefault();
                commit(trimmedSearch);
              }
            }}
            data-testid={`input-proposal-${cfg.testId}-filter`}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {trimmedSearch
                ? `Press Enter to use “${trimmedSearch}”`
                : peopleQuery.isLoading
                  ? "Loading…"
                  : `No ${cfg.noun} in the last 30 days`}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`anyone-all-${cfg.noun}`}
                onSelect={() => commit("")}
                data-testid={`option-proposal-${cfg.testId}-anyone`}
              >
                <IconCheck
                  className={cn(
                    "mr-2 h-3.5 w-3.5 shrink-0",
                    !value.trim() ? "opacity-100" : "opacity-0",
                  )}
                />
                Anyone
              </CommandItem>
            </CommandGroup>
            {showCustom ? (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`custom-${trimmedSearch}`}
                  onSelect={() => commit(trimmedSearch)}
                  className="font-mono text-xs"
                  data-testid={`option-proposal-${cfg.testId}-custom`}
                >
                  <IconPlus className="mr-2 h-3.5 w-3.5 shrink-0" />
                  Use “{trimmedSearch}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {people.length > 0 ? (
              <CommandGroup heading="Last 30 days">
                {people.map((username) => (
                  <CommandItem
                    key={username}
                    value={username}
                    onSelect={() => commit(username)}
                    className="font-mono text-xs"
                    data-testid={`option-proposal-${cfg.testId}-${username}`}
                  >
                    <IconCheck
                      className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0",
                        value.trim().toLowerCase() === username.toLowerCase()
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {username}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
