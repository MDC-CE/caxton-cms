import type { MenuView, ComponentItem } from "../types";
import { ArrowLeft, Blocks, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Registry list row (API) — distinct from catalog ComponentItem (label + icon). */
export type RegistryComponentRow = {
  type: string;
  name: string;
  description: string;
};

interface ComponentsViewProps {
  componentSearch: string;
  setComponentSearch: (v: string) => void;
  showComponentSearch: boolean;
  setShowComponentSearch: (v: boolean) => void;
  setMenuView: (v: MenuView) => void;
  filteredComponents: RegistryComponentRow[];
  componentRegistryData: unknown;
  componentIconMap: Record<string, ComponentItem["icon"] | undefined>;
}

export function ComponentsView({
  componentSearch,
  setComponentSearch,
  showComponentSearch,
  setShowComponentSearch,
  setMenuView,
  filteredComponents,
  componentRegistryData,
  componentIconMap,
}: ComponentsViewProps) {
  return (
    <>
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setMenuView("main"); setComponentSearch(""); setShowComponentSearch(false); }}
              className="p-1 rounded-md hover-elevate"
              data-testid="button-back-to-main"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {showComponentSearch ? (
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search components..."
                  value={componentSearch}
                  onChange={(e) => setComponentSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-component-search"
                  autoFocus
                />
              </div>
            ) : (
              <div>
                <h3 className="font-semibold text-sm">Gallery Registry</h3>
                <p className="text-xs text-muted-foreground">{filteredComponents.length} components</p>
              </div>
            )}
          </div>
          {showComponentSearch ? (
            <button
              onClick={() => { setShowComponentSearch(false); setComponentSearch(""); }}
              className="p-1.5 rounded hover-elevate"
              title="Cancel search"
              data-testid="button-cancel-component-search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 rounded hover-elevate"
                    title="Open component gallery"
                    data-testid="link-component-showcase"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={() => { window.location.href = "/private/component"; }}
                    data-testid="menu-component-gallery-new"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">New version</span>
                      <span className="text-xs text-muted-foreground">Under development</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { window.location.href = "/private/component-showcase"; }}
                    data-testid="menu-component-gallery-current"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Current version</span>
                      <span className="text-xs text-muted-foreground">Component showcase</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={() => setShowComponentSearch(true)}
                className="p-1.5 rounded hover-elevate"
                title="Search components"
                data-testid="button-toggle-component-search"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="overflow-y-auto overflow-x-hidden max-h-[280px]">
        <div className="p-2 space-y-1">
          {!componentRegistryData ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredComponents.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No components found
            </div>
          ) : (
            filteredComponents.map((component) => {
              const Icon = componentIconMap[component.type] || Blocks;
              return (
                <a
                  key={component.type}
                  href={`/private/component-showcase/${component.type}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover-elevate cursor-pointer"
                  data-testid={`link-component-${component.type}`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{component.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{component.description}</div>
                  </div>
                </a>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
