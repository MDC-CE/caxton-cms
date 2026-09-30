import { useEffect, useMemo, useState } from "react";
import { IconAlertTriangle, IconCookie, IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import {
  COOKIE_BANNER_KEYS,
  DEFAULT_ASK_COUNTRIES,
  DEFAULT_COOKIE_BANNER_COPY,
  REJECT_RISK_THRESHOLD_DAYS,
  resolveCookieBannerCopy,
  type ConsentMode,
  type ConsentWindowSettings,
  type CookieBannerKey,
} from "@shared/consent";

type WindowResponse = {
  window: ConsentWindowSettings;
  effective_ask_countries: string[];
  reject_duration_risky: boolean;
  copy: Record<CookieBannerKey, Record<string, string>>;
  default_locale: string;
};

type LocaleOption = { code: string; label?: string };

const COPY_LABELS: Record<CookieBannerKey, string> = {
  cookie_banner_ask: "Message (must choose)",
  cookie_banner_notice: "Message (notice only)",
  cookie_banner_accept: "Accept button",
  cookie_banner_reject: "Reject button",
  cookie_banner_ok: "OK button",
  cookie_banner_privacy_link: "Privacy link text",
};

function parseCountryList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)),
    ),
  ).sort();
}

function BannerPreview({
  mode,
  copy,
}: {
  mode: ConsentMode;
  copy: ReturnType<typeof resolveCookieBannerCopy>;
}) {
  return (
    <div className="dark rounded-md border border-border overflow-hidden">
      <div className="bg-background text-foreground px-3 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-snug text-foreground/85">
          {mode === "notice" ? copy.cookie_banner_notice : copy.cookie_banner_ask}{" "}
          <span className="underline underline-offset-2">{copy.cookie_banner_privacy_link}</span>
        </p>
        <div className="flex gap-2 shrink-0">
          {mode === "notice" ? (
            <span className="rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-xs">
              {copy.cookie_banner_ok}
            </span>
          ) : (
            <>
              <span className="rounded-md border border-border px-2.5 py-1 text-xs">{copy.cookie_banner_reject}</span>
              <span className="rounded-md border border-border px-2.5 py-1 text-xs">{copy.cookie_banner_accept}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConsentWindowCard({
  locales,
  defaultLocale,
}: {
  locales: LocaleOption[];
  defaultLocale: string;
}) {
  const { toast } = useToast();
  const { hasCapability } = useDebugAuth();
  const canEdit = hasCapability("ads_settings");

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ["/api/settings/consent/window"],
    queryFn: async () => {
      const res = await apiFetch("/api/settings/consent/window");
      if (!res.ok) throw new Error(res.status === 403 ? "You need the Manage Ads settings permission." : "Failed to load");
      return res.json() as Promise<WindowResponse>;
    },
    retry: false,
  });

  const [useDefaultList, setUseDefaultList] = useState(true);
  const [customList, setCustomList] = useState("");
  const [unknownMode, setUnknownMode] = useState<ConsentMode>("notice");
  const [acceptDays, setAcceptDays] = useState(365);
  const [rejectDays, setRejectDays] = useState(5);
  const [copy, setCopy] = useState<Record<string, Record<string, string>>>({});
  const [previewLocale, setPreviewLocale] = useState(defaultLocale);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data || dirty) return;
    const w = data.window;
    setUseDefaultList(w.ask_countries === "default");
    setCustomList(Array.isArray(w.ask_countries) ? w.ask_countries.join(", ") : DEFAULT_ASK_COUNTRIES.join(", "));
    setUnknownMode(w.unknown_country_mode);
    setAcceptDays(w.accept_days);
    setRejectDays(w.reject_days);
    setCopy(data.copy ?? {});
  }, [data, dirty]);

  const previewCopy = useMemo(
    () => resolveCookieBannerCopy(copy as Record<CookieBannerKey, Record<string, string>>, previewLocale),
    [copy, previewLocale],
  );
  const customCodes = useMemo(() => parseCountryList(customList), [customList]);
  const rejectRisky = rejectDays < REJECT_RISK_THRESHOLD_DAYS;

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function setCopyValue(key: CookieBannerKey, locale: string, value: string) {
    setCopy((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [locale]: value } }));
    setDirty(true);
  }

  async function save() {
    if (!useDefaultList && customCodes.length === 0) {
      toast({ title: "Add at least one country code", description: "Or switch back to the default list.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/consent/window", {
        ask_countries: useDefaultList ? "default" : customCodes,
        unknown_country_mode: unknownMode,
        accept_days: acceptDays,
        reject_days: rejectDays,
        copy,
      });
      setDirty(false);
      toast({ title: "Consent window saved" });
      await refetch();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4" data-testid="card-consent-window">
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        <IconCookie className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base flex-1">Consent Window</CardTitle>
        {canEdit && data ? (
          <Button size="sm" onClick={save} disabled={!dirty || saving} data-testid="button-save-consent-window">
            {saving ? <IconLoader2 className="h-4 w-4 mr-1 animate-spin" /> : <IconDeviceFloppy className="h-4 w-4 mr-1" />}
            Save
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Visitors from the countries below must press Accept or Reject before we measure which ads and pages bring
          them in. Everyone else sees a short notice. The site works the same for everyone; lead forms and their
          checkboxes above are not affected.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <IconLoader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error || !data ? (
          <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Failed to load"}</p>
        ) : (
          <fieldset disabled={!canEdit} className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Countries that must choose</p>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={useDefaultList}
                    onChange={() => touch(setUseDefaultList)(true)}
                    data-testid="radio-consent-default-countries"
                  />
                  Default list — EU, EEA, UK and Switzerland ({DEFAULT_ASK_COUNTRIES.length} countries)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!useDefaultList}
                    onChange={() => touch(setUseDefaultList)(false)}
                    data-testid="radio-consent-custom-countries"
                  />
                  Custom list
                </label>
              </div>
              {!useDefaultList ? (
                <div className="space-y-1">
                  <Input
                    value={customList}
                    onChange={(e) => touch(setCustomList)(e.target.value)}
                    placeholder="ES, FR, DE, GB"
                    className="font-mono text-xs"
                    data-testid="input-consent-custom-countries"
                  />
                  <p className="text-xs text-muted-foreground">
                    Two-letter country codes, separated by commas. {customCodes.length} recognized.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">When we can't tell the country</p>
              <select
                value={unknownMode}
                onChange={(e) => touch(setUnknownMode)(e.target.value as ConsentMode)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                data-testid="select-consent-unknown-mode"
              >
                <option value="notice">Show the notice</option>
                <option value="ask">Ask to accept or reject</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="input-consent-accept-days">
                  Remember an accept for (days)
                </label>
                <Input
                  id="input-consent-accept-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={acceptDays}
                  onChange={(e) => touch(setAcceptDays)(Number(e.target.value) || 1)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="input-consent-reject-days">
                  Ask again after a reject (days)
                </label>
                <Input
                  id="input-consent-reject-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={rejectDays}
                  onChange={(e) => touch(setRejectDays)(Number(e.target.value) || 1)}
                />
              </div>
            </div>
            {rejectRisky ? (
              <div
                className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200"
                data-testid="warning-consent-reject-days"
              >
                <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                <p>
                  Asking again after a reject sooner than 6 months can be seen as pressuring visitors in the EU and UK.
                  Regulators generally expect about 6 months.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Banner text</p>
                <select
                  value={previewLocale}
                  onChange={(e) => setPreviewLocale(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="select-consent-preview-locale"
                >
                  {locales.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label ?? l.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3">
                {COOKIE_BANNER_KEYS.map((key) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{COPY_LABELS[key]}</label>
                    <Input
                      value={copy[key]?.[previewLocale] ?? ""}
                      placeholder={DEFAULT_COOKIE_BANNER_COPY[key][previewLocale] ?? DEFAULT_COOKIE_BANNER_COPY[key].en}
                      onChange={(e) => setCopyValue(key, previewLocale, e.target.value)}
                      data-testid={`input-consent-copy-${key}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Leave a field empty to use the built-in text shown in grey.</p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Preview</p>
                <BannerPreview mode="ask" copy={previewCopy} />
                <BannerPreview mode="notice" copy={previewCopy} />
              </div>
            </div>
          </fieldset>
        )}

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Read more (advanced)</summary>
          <div className="mt-1 space-y-1 leading-snug">
            <p>
              Countries, unknown-country mode and durations are stored in{" "}
              <code className="font-mono">site_*/settings.yml</code> under <code className="font-mono">consent.window</code>.
              Banner text is stored as <code className="font-mono">reserved.cookie_banner_*</code> in{" "}
              <code className="font-mono">variables.yml</code> (default locale + <code className="font-mono">conditions</code>).
            </p>
            <p>
              The choice is saved in the <code className="font-mono">4g_consent</code> cookie by{" "}
              <code className="font-mono">POST /api/consent</code>. Until it says granted, Google Consent Mode stays
              denied, the Meta pixel is revoked, the <code className="font-mono">4g_ads</code> cookie is not set, and
              marketing fields in <code className="font-mono">4g_ctx</code> stay in memory only. In notice countries,
              OK or the first scroll counts as consent. Default locale: <code className="font-mono">{defaultLocale}</code>.
              Full cookie list: <code className="font-mono">docs/cookies.md</code>.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
