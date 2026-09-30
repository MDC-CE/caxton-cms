import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { IconBrandGoogle, IconBrandMeta, IconSpeakerphone } from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsShell, type SettingsSecondaryTab } from "@/components/settings/SettingsShell";
import { MetaAdsTab } from "@/components/settings/MetaAdsTab";

type AdsTab = "meta" | "google";

const ADS_TABS: SettingsSecondaryTab<AdsTab>[] = [
  { id: "meta", href: "/private/settings/ads/meta", label: "Meta", Icon: IconBrandMeta },
  { id: "google", href: "/private/settings/ads/google", label: "Google Ads", Icon: IconBrandGoogle },
];

function resolveAdsTab(pathname: string): AdsTab | null {
  if (pathname === "/private/settings/ads/meta") return "meta";
  if (pathname === "/private/settings/ads/google") return "google";
  return null;
}

function GoogleAdsComingSoon() {
  return (
    <Card data-testid="tab-panel-ads-google">
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        <IconBrandGoogle className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">Google Ads</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground" data-testid="text-ads-google-coming-soon">
          Coming soon. You&apos;ll be able to connect Google Ads here so its spend and leads show up next to your pages.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdsSettingsPage() {
  const [pathname, setLocation] = useLocation();
  const activeTab = resolveAdsTab(pathname);

  useEffect(() => {
    if (pathname === "/private/settings/ads" || pathname === "/private/settings/ads/") {
      setLocation("/private/settings/ads/meta", { replace: true });
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
    <SettingsShell
      section="ads"
      icon={IconSpeakerphone}
      title="Ads"
      titleTestId="text-ads-settings-title"
      backTestId="button-ads-settings-back"
      description={
        <>
          Connect ad platforms so paid visits, spend and leads show up next to your pages. Reports live in{" "}
          <Link href="/private/diagnostics/ads" className="underline underline-offset-2 hover:text-foreground">
            Diagnostics → Ads
          </Link>
          .
        </>
      }
      secondary={{
        value: activeTab,
        tabs: ADS_TABS,
        listTestId: "ads-settings-tablist",
        triggerTestId: (id) => `tab-ads-${id}`,
      }}
    >
      <div role="tabpanel">
        {activeTab === "meta" && <MetaAdsTab />}
        {activeTab === "google" && <GoogleAdsComingSoon />}
      </div>
    </SettingsShell>
  );
}
