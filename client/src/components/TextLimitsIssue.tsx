import type { TextLimitViolation } from "@shared/component-text-limits";

function violationLine(v: TextLimitViolation): string {
  if (v.kind === "items") return `${v.label}: ${v.actual} items (max ${v.max})`;
  return `${v.label}: ${v.actual} characters (max ${v.max})`;
}

export function TextLimitsIssue({
  message,
  violations,
  footer = "Go back and shorten it, or publish anyway.",
}: {
  message: string;
  violations: TextLimitViolation[];
  footer?: string;
}) {
  return (
    <div
      className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      data-testid="text-limits-issue"
    >
      <p>{message}</p>
      {violations.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5">
          {violations.map((v, i) => (
            <li key={`${v.section_path}-${v.label}-${i}`}>
              {violationLine(v)}
              {v.text ? (
                <span className="block truncate text-xs text-destructive/80" title={v.text}>
                  “{v.text}”
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p>{footer}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground/80">Read more (advanced)</summary>
        <p className="mt-1.5">
          Limits come from <code className="font-mono">text_limits</code> in the component’s{" "}
          <code className="font-mono">schema.yml</code> (hero:{" "}
          <code className="font-mono">shared/component-registry/hero/v1.0/schema.yml</code>). Characters are
          counted as visitors see them — HTML tags and comments are removed. Only text that changed versus the
          live page is checked. Agents cannot skip this step; only staff can publish anyway.
        </p>
      </details>
    </div>
  );
}
