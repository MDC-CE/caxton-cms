import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { IconBrandMeta, IconSpeakerphone } from "@tabler/icons-react";
import { ToggleButtonBar, ToggleButtonBarTrigger } from "@/components/ui/toggle-button-bar";
import { PrivateHistoryBackButton } from "@/components/private/PrivateHistoryBackButton";
import { MetaAdsTab } from "@/components/settings/MetaAdsTab";

type AdsTab = "meta";

const ADS_TABS: { id: AdsTab; href: string; label: string; Icon: typeof IconBrandMeta }[] = [
  { id: "meta", href: "/private/settings/ads/meta", label: "Meta", Icon: IconBrandMeta },
];

function resolveAdsTab(pathname: string): AdsTab | null {
  if (pathname === "/private/settings/ads/meta") return "meta";
  return null;
}

export default function AdsSettingsPage() {
  const [pathname, setLocation] = useLocation();
  const activeTab = resolveAdsTab(pathname);

  useEffect(() => {
    if (pathname === "/private/settings/ads" || pathname === "/private/settings/ads/") {
      setLocation("/private/settings/ads/meta");
    }
  }, [pathname, setLocation]);

  if (!activeTab) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Redirecting…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-24 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <PrivateHistoryBackButton data-testid="button-ads-settings-back" />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <IconSpeakerphone className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-ads-settings-title">
                  Ads
                </h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect ad platforms so paid visits, spend and leads show up next to your pages. Reports live in{" "}
                <Link href="/private/diagnostics/ads" className="underline underline-offset-2 hover:text-foreground">
                  Diagnostics → Ads
                </Link>
                .
              </p>
            </div>
          </div>

          <ToggleButtonBar
            className="shrink-0"
            value={activeTab}
            onValueChange={(id) => {
              const tab = ADS_TABS.find((t) => t.id === id);
              if (tab) setLocation(tab.href);
            }}
            listTestId="ads-settings-tablist"
            listClassName="flex"
          >
            {ADS_TABS.map(({ id, label, Icon }) => (
              <ToggleButtonBarTrigger key={id} value={id} data-testid={`tab-ads-${id}`} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </ToggleButtonBarTrigger>
            ))}
          </ToggleButtonBar>
        </div>

        <div role="tabpanel">{activeTab === "meta" && <MetaAdsTab />}</div>
      </div>
    </div>
  );
}
