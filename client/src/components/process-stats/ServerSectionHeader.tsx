import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";

export function ServerSectionHeader({
  section,
  title,
  description,
}: {
  section: "logs" | "performance";
  title: string;
  description: ReactNode;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <ToggleButtonBar
          value={section}
          listTestId="tabs-server"
          onValueChange={(value) => {
            setLocation(value === "performance" ? "/private/server/performance" : "/private/server/error-log");
          }}
        >
          <ToggleButtonBarTrigger value="logs" data-testid="tab-server-logs">Logs</ToggleButtonBarTrigger>
          <ToggleButtonBarTrigger value="performance" data-testid="tab-server-performance">Performance</ToggleButtonBarTrigger>
        </ToggleButtonBar>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
    </div>
  );
}
