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

async function fetchRecentProposers(): Promise<string[]> {
  const res = await apiFetch("/api/admin/proposals/proposers?days=30");
  if (!res.ok) {
    throw new Error(`Failed to load proposers (${res.status})`);
  }
  const data = (await res.json()) as { proposers?: string[] };
  return Array.isArray(data.proposers) ? data.proposers : [];
}

export type ProposalProposerComboboxProps = {
  value: string;
  onChange: (next: string) => void;
  /** When true, load recent proposers (e.g. while filters dialog is open). */
  enabled?: boolean;
  /** Nested-popover open callback so the parent dialog can avoid closing. */
  onOpenChange?: (open: boolean) => void;
};

export function ProposalProposerCombobox({
  value,
  onChange,
  enabled = true,
  onOpenChange,
}: ProposalProposerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const proposersQuery = useQuery({
    queryKey: ["/api/admin/proposals/proposers", 30],
    queryFn: fetchRecentProposers,
    enabled,
    staleTime: 30_000,
  });

  const proposers = proposersQuery.data ?? [];
  const trimmedSearch = search.trim();
  const knownValues = useMemo(() => {
    const set = new Set(proposers.map((p) => p.toLowerCase()));
    return set;
  }, [proposers]);

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
          id="proposal-proposer-username-filter"
          className="h-8 w-full justify-between px-2 font-normal text-sm"
          data-testid="button-proposal-proposer-filter"
        >
          <span className={cn("min-w-0 truncate", !value.trim() && "text-muted-foreground")}>
            {triggerLabel}
          </span>
          <IconSelector className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0 bg-popover"
        sideOffset={4}
        data-testid="popover-proposal-proposer-filter"
      >
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search proposers…"
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmedSearch) {
                e.preventDefault();
                commit(trimmedSearch);
              }
            }}
            data-testid="input-proposal-proposer-filter"
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {trimmedSearch
                ? `Press Enter to use “${trimmedSearch}”`
                : proposersQuery.isLoading
                  ? "Loading…"
                  : "No proposers in the last 30 days"}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="anyone-all-proposers"
                onSelect={() => commit("")}
                data-testid="option-proposal-proposer-anyone"
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
                  data-testid="option-proposal-proposer-custom"
                >
                  <IconPlus className="mr-2 h-3.5 w-3.5 shrink-0" />
                  Use “{trimmedSearch}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {proposers.length > 0 ? (
              <CommandGroup heading="Last 30 days">
                {proposers.map((username) => (
                  <CommandItem
                    key={username}
                    value={username}
                    onSelect={() => commit(username)}
                    className="font-mono text-xs"
                    data-testid={`option-proposal-proposer-${username}`}
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
