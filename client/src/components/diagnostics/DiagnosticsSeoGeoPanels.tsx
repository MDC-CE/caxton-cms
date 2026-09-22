import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Info } from "lucide-react";
import { SeoTab, GeoTab, DiagnosticsFunnelTab } from "@/pages/SeoGeoPage";
import { Skeleton } from "@/components/ui/skeleton";
import { DiagnosticsOrganicPanel } from "@/components/diagnostics/DiagnosticsOrganicPanel";
import { isDiagnosticsSeoOrganic } from "@/lib/diagnostics-tab";
import { cn } from "@/lib/utils";
import { getSessionHeaders } from "@/lib/sessionHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFormatSitePath } from "@/hooks/useFormatSitePath";

interface SeoOverview {
  intentDistribution: Record<string, Record<string, number>>;
  clusters: {
    pillarUrl: string;
    clusterSlugs: string[];
    clusterCount: number;
    keyword?: string | null;
    locale?: string;
    members?: {
      id: string;
      slug: string;
      contentType: string;
      locale: string;
      path: string;
      keyword?: string | null;
      lastmod?: string | null;
      updated_at?: string | null;
    }[];
  }[];
  orphanPages: {
    slug: string;
    contentType: string;
    intent: string;
    filePath: string;
    locale?: string;
    pillar_path?: string;
    reason?: "hub_not_found" | "hub_not_pillar";
  }[];
  clusterHealth?: {
    emptyHubCount: number;
    stats: Record<string, number>;
    byContentType: Record<string, Record<string, number>>;
    byLocale: Record<string, Record<string, number>>;
  };
  brokenClusterRefs?: Array<{
    slug: string;
    contentType: string;
    locale: string;
    reason: "hub_not_found" | "hub_not_pillar";
  }>;
  featureCoverage: Record<string, number>;
  faqCoverage: { slug: string; contentType: string; locale: string; faqCount: number }[];
  schemaCoverage: Record<string, number>;
  totals: {
    totalPages: number;
    withPillar: number;
    withIntent: number;
    withFocusFeatures: number;
    withFaq: number;
    withSchema: number;
    withKeyword?: number;
  };
}

interface BrandContext {
  brand?: { name?: string; tagline?: string; mission?: string };
  voice?: { tone?: string; style?: string; personality?: string };
  key_differentiators?: string[];
  forbidden_phrases?: { phrase: string; reason: string }[];
  target_audience?: {
    primary?: { description?: string; age_range?: string; motivations?: string[]; concerns?: string[] };
  };
}

function LoadingSection() {
  return (
    <div className="space-y-4 py-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function DiagnosticsSeoPanel() {
  const [pathname] = useLocation();
  const organic = isDiagnosticsSeoOrganic(pathname);

  return (
    <div className="space-y-4">
      <nav
        className="inline-flex h-auto items-center gap-0.5 rounded-md border border-muted-foreground/20 bg-muted/40 p-0.5"
        data-testid="seo-subnav"
      >
        <Link
          href="/private/diagnostics/seo"
          className={cn(
            "inline-flex items-center justify-center rounded-sm px-2 py-1.5 text-xs font-medium",
            !organic ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid="seo-subnav-overview"
        >
          Overview
        </Link>
        <div
          className={cn(
            "inline-flex items-center gap-0.5 rounded-sm px-2 py-1.5 text-xs font-medium",
            organic ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          <Link
            href="/private/diagnostics/seo/organic"
            className={cn(
              "inline-flex items-center justify-center",
              !organic && "hover:text-foreground",
            )}
            data-testid="seo-subnav-organic"
          >
            Opportunities
          </Link>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-5 w-5 shrink-0",
                  organic
                    ? "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="About Opportunities data"
                data-testid="seo-subnav-organic-info"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-80 space-y-2 text-sm text-muted-foreground leading-relaxed"
            >
              <p>
                Actions from Google Search performance, not total visits. Most cards use the last 7
                complete days; cannibalization uses 28 days; decay compares 7 or 28 days to the
                period before. Data lags about 2–3 days — use Search Console for yesterday and live
                queries.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
      {organic ? <DiagnosticsOrganicPanel /> : <DiagnosticsSeoOverview />}
    </div>
  );
}

function DiagnosticsSeoOverview() {
  const [organicMarket, setOrganicMarket] = useState("worldwide");
  const { data: overview, isLoading } = useQuery<SeoOverview>({
    queryKey: ["/api/seo/overview", organicMarket],
    queryFn: async () => {
      const res = await fetch(
        `/api/seo/overview?market=${encodeURIComponent(organicMarket)}`,
        { credentials: "include", headers: { ...getSessionHeaders() } },
      );
      if (!res.ok) throw new Error("Failed to load SEO overview");
      return res.json() as Promise<SeoOverview>;
    },
  });
  if (isLoading) return <LoadingSection />;
  if (!overview) {
    return <p className="text-muted-foreground text-sm text-center py-12">Failed to load SEO data</p>;
  }
  return (
    <SeoTab
      data={overview}
      organicMarket={organicMarket}
      onOrganicMarketChange={setOrganicMarket}
    />
  );
}

export function DiagnosticsFunnelPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const formatSitePath = useFormatSitePath();
  const { data: overview, isLoading } = useQuery<SeoOverview>({
    queryKey: ["/api/seo/overview"],
  });
  const { data: funnelSettings, isLoading: settingsLoading } = useQuery<{
    settings: { enforcement: boolean };
  }>({
    queryKey: ["/api/settings/funnel"],
  });
  const enforcement = funnelSettings?.settings?.enforcement === true;

  const saveMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await apiRequest("PUT", "/api/settings/funnel", { enforcement: next });
      return res.json() as Promise<{ settings: { enforcement: boolean } }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/settings/funnel"], { settings: data.settings });
      void queryClient.invalidateQueries({ queryKey: ["/api/settings/funnel"] });
      toast({
        title: data.settings.enforcement ? "Funnel enforcement on" : "Funnel enforcement off",
        description: data.settings.enforcement
          ? "Page diagnostics and funnel saves require stage and products on included content types."
          : "Funnel completeness checks and write gates are relaxed. Existing page tags are kept.",
      });
    },
    onError: (err) => {
      toast({
        title: "Failed to update funnel enforcement",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    },
  });

  if (isLoading || settingsLoading) return <LoadingSection />;
  if (!overview) {
    return <p className="text-muted-foreground text-sm text-center py-12">Failed to load funnel data</p>;
  }

  return (
    <div className="space-y-6">
      <Card data-testid="card-funnel-enforcement">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-sm font-medium">Funnel enforcement</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  aria-label="Read more (advanced)"
                  data-testid="button-funnel-enforcement-advanced"
                >
                  <Info className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 space-y-2 text-xs text-muted-foreground leading-relaxed"
              >
                <p className="font-medium text-foreground text-sm">Read more (advanced)</p>
                <p>
                  Stored in {formatSitePath("settings.yml")} as{" "}
                  <code className="font-mono text-[10px]">funnel.enforcement</code>. Per-type
                  opt-out: Content Type manage → Funnel monitoring (
                  <code className="font-mono text-[10px]">funnel.enforcement: false</code>).
                </p>
                <p>
                  Validator: <code className="font-mono text-[10px]">funnel-completeness</code>. Off
                  also relaxes funnel write gates (persona/audience).
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <Switch
            checked={enforcement}
            disabled={saveMutation.isPending}
            onCheckedChange={(checked) => saveMutation.mutate(checked)}
            data-testid="switch-funnel-enforcement"
          />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">
            When on, every included content type’s pages must have funnel stage and products;
            diagnostics and funnel saves enforce this. Turning off stops those checks; existing page
            tags are not deleted. Exclude a type with Funnel monitoring on Content Type manage.
          </p>
        </CardContent>
      </Card>
      <DiagnosticsFunnelTab data={overview} />
    </div>
  );
}

export function DiagnosticsGeoPanel() {
  const { data: overview, isLoading: overviewLoading } = useQuery<SeoOverview>({
    queryKey: ["/api/seo/overview"],
  });
  const { data: brandRaw, isLoading: brandLoading } = useQuery<BrandContext>({
    queryKey: ["/api/brand-context"],
  });
  const brand = brandRaw as BrandContext | null | undefined;
  if (overviewLoading || brandLoading) return <LoadingSection />;
  if (!overview) {
    return <p className="text-muted-foreground text-sm text-center py-12">Failed to load GEO data</p>;
  }
  return <GeoTab data={overview} brand={brand} />;
}
