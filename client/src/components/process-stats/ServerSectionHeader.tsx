import { useLocation } from "wouter";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";

export function ServerSectionHeader({
  section,
  title,
  description,
}: {
  section: "logs" | "performance";
  title: string;
  description: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">{description}</p>
      </div>
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
  );
}
