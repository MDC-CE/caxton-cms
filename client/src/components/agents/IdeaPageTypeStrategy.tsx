import { useState } from "react";

export type IdeaContentTypeStrategyPayload = {
  contentType: string;
  role: "pitched" | "accepted";
  purpose?: string;
  constraints?: string[];
  missing?: true;
};

function typeLabel(contentType: string): string {
  const words = contentType.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : contentType;
}

export function IdeaPageTypeStrategy({
  strategies,
}: {
  strategies: IdeaContentTypeStrategyPayload[];
}) {
  const [advanced, setAdvanced] = useState(false);
  if (!strategies.length) return null;

  const accepted = strategies.find((s) => s.role === "accepted");
  const pitched = strategies.filter((s) => s.role === "pitched");
  const typeChanged = Boolean(accepted && pitched.length);
  const hasConstraints = strategies.some((s) => (s.constraints?.length ?? 0) > 0);

  return (
    <div
      className="basis-full space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"
      data-testid="proposal-idea-page-type-strategy"
    >
      {typeChanged ? (
        <p className="text-muted-foreground" data-testid="text-idea-type-changed">
          Pitched as <span className="font-medium text-foreground">{typeLabel(pitched[0].contentType)}</span>,
          accepted as <span className="font-medium text-foreground">{typeLabel(accepted!.contentType)}</span>.
          The accepted page type is what follow-up edits must fit.
        </p>
      ) : null}
      {strategies.map((s) => (
        <p
          key={`${s.role}-${s.contentType}`}
          className="leading-5"
          data-testid={`text-idea-type-purpose-${s.contentType}`}
        >
          <span className="font-semibold text-foreground">
            {typeLabel(s.contentType)}
            {typeChanged ? ` (${s.role})` : ""}
          </span>
          {s.missing || !s.purpose ? (
            <span className="text-muted-foreground">
              {" "}
              — this page type has no strategy yet. Set one on the content type&apos;s Strategy tab.
            </span>
          ) : (
            <span className="text-muted-foreground"> — {s.purpose}</span>
          )}
        </p>
      ))}
      {hasConstraints ? (
        <>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            data-testid="button-idea-type-strategy-advanced"
            onClick={() => setAdvanced((v) => !v)}
          >
            {advanced ? "Hide advanced" : "Read more (advanced)"}
          </button>
          {advanced ? (
            <div className="space-y-2 border-t border-border pt-2 text-muted-foreground leading-5">
              {strategies
                .filter((s) => s.constraints?.length)
                .map((s) => (
                  <div key={`c-${s.role}-${s.contentType}`}>
                    <p className="font-medium text-foreground">
                      {typeLabel(s.contentType)} constraints{typeChanged ? ` (${s.role})` : ""}
                    </p>
                    <ul className="list-disc pl-4">
                      {s.constraints!.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              <p>
                From <code className="font-mono">strategy</code> in{" "}
                <code className="font-mono">content-types.yml</code>. Reviewers see the same text as a
                &quot;fits page type&quot; check. Editing it does not change existing pages.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
