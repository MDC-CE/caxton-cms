/**
 * Legal diagnostics payload (Diagnostics → Legal). Consent banner counters only —
 * no visitor identifiers.
 */

export type ConsentRegionRate = {
  region: "ask" | "notice" | "unknown";
  shown: number;
  accept_pct: number | null;
  reject_pct: number | null;
  ignore_pct: number | null;
};

export type LegalIssueCode = "consent_rate_drop";

export type LegalIssue = {
  id: string;
  code: LegalIssueCode;
  severity: "warning" | "info";
  title: string;
  why: string;
  how_to_fix: string;
};

export type LegalDiagnosticsStatus = "ok" | "warnings" | "no_data";

export type LegalDiagnostics = {
  generated_at: string;
  window_days: number;
  status: LegalDiagnosticsStatus;
  kpis: {
    banners_shown: number;
    accept_pct: number | null;
    reject_pct: number | null;
    ignore_pct: number | null;
  };
  consent: ConsentRegionRate[];
  issues: LegalIssue[];
};

export type LegalDiagnosticsSummary = {
  status: LegalDiagnosticsStatus;
  open_warnings: number;
};
