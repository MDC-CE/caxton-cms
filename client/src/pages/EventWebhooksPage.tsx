import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  IconChevronLeft,
  IconListDetails,
  IconSettings,
  IconWebhook,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { EventWebhooksPanel } from "@/components/pipeline/EventWebhooksDialog";

export type WebhooksTab = "hooks" | "logs";

const WEBHOOKS_TABS: {
  id: WebhooksTab;
  href: string;
  label: string;
  Icon: typeof IconSettings;
}[] = [
  { id: "hooks", href: "/private/webhooks/hooks", label: "Hooks", Icon: IconSettings },
  { id: "logs", href: "/private/webhooks/logs", label: "Logs", Icon: IconListDetails },
];

function resolveWebhooksTab(pathname: string): WebhooksTab | null {
  if (pathname === "/private/webhooks/hooks") return "hooks";
  if (pathname === "/private/webhooks/logs") return "logs";
  return null;
}

export default function EventWebhooksPage() {
  const [pathname, setLocation] = useLocation();
  const pathOnly = pathname.split("?")[0];
  const activeTab = resolveWebhooksTab(pathOnly);

  useEffect(() => {
    if (pathOnly === "/private/webhooks" || pathOnly === "/private/webhooks/") {
      setLocation("/private/webhooks/hooks");
    }
  }, [pathOnly, setLocation]);

  if (!activeTab) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Redirecting…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-6">
      <div className="max-w-6xl mx-auto px-6 pt-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3 min-w-0 flex-1">
            <Button
              variant="ghost"
              asChild
              className="-ml-2 h-10 gap-1.5 px-3 text-sm text-muted-foreground"
            >
              <Link href="/private/background-pipeline">
                <IconChevronLeft className="h-5 w-5" />
                Agent Pipeline
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <IconWebhook className="h-6 w-6" />
                Event webhooks
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-6">
                Notify one or more external URLs when proposal events fire. Each hook can send every
                event or every N events (max 50). Turning a hook off or changing its URL drops that
                hook&apos;s waiting events — you will be warned. Config is saved with site content
                (GitHub). Call history stays on this server for 48 hours. This does not change
                proposals or the pipeline.
              </p>
            </div>
          </div>

          <ToggleButtonBar
            className="shrink-0"
            value={activeTab}
            onValueChange={(id) => {
              const tab = WEBHOOKS_TABS.find((t) => t.id === id);
              if (!tab) return;
              // Hooks: clean path (strip filters). Logs: start without query unless already there.
              setLocation(tab.href);
            }}
            listTestId="event-webhooks-tablist"
            listClassName="flex"
          >
            {WEBHOOKS_TABS.map(({ id, label, Icon }) => (
              <ToggleButtonBarTrigger
                key={id}
                value={id}
                data-testid={`tab-webhooks-${id}`}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </ToggleButtonBarTrigger>
            ))}
          </ToggleButtonBar>
        </div>

        <EventWebhooksPanel tab={activeTab} />
      </div>
    </div>
  );
}
