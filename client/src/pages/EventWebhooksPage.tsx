import { Link } from "wouter";
import { IconChevronLeft, IconWebhook } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { EventWebhooksPanel } from "@/components/pipeline/EventWebhooksDialog";

export default function EventWebhooksPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-6">
      <div className="max-w-6xl mx-auto px-6 pt-6 space-y-6">
        <div className="space-y-3">
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

        <EventWebhooksPanel />
      </div>
    </div>
  );
}
