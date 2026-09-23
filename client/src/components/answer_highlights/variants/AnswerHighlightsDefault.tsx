import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface AnswerHighlightItem {
  icon?: string;
  title: string;
  description: string;
}

export interface AnswerHighlightsSectionData {
  type: string;
  version?: string;
  variant?: string;
  heading?: string;
  background?: string;
  items: AnswerHighlightItem[];
}

interface AnswerHighlightsDefaultProps {
  data: AnswerHighlightsSectionData;
}

function resolveSectionIcon(name?: string) {
  if (!name) return null;
  const aliases: Record<string, string> = {
    IconHeartbeat: "Heart",
    IconTool: "Wrench",
  };
  const Icon = getIcon(aliases[name] ?? name);
  if (!Icon || Icon.displayName?.startsWith("CustomIcon(")) return null;
  return Icon;
}

export default function AnswerHighlightsDefault({ data }: AnswerHighlightsDefaultProps) {
  const { heading, background, items } = data;

  if (!items?.length) return null;

  return (
    <section
      className={cn("scroll-mt-24 py-section", background)}
      data-testid="section-answer-highlights"
    >
      <div className="page-shell">
        {heading && (
          <h2
            className="mb-6 max-w-3xl text-foreground"
            data-testid="text-answer-highlights-heading"
          >
            {heading}
          </h2>
        )}

        <div
          className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-4"
          data-testid="answer-highlights-grid"
        >
          {items.map((item, index) => {
            const Icon = resolveSectionIcon(item.icon);
            return (
              <div
                key={`${item.title}-${index}`}
                className="flex flex-col gap-4 rounded-card bg-card p-card-padding text-card-foreground shadow-card transition-shadow duration-brand ease-brand hover:shadow-elevation"
                data-testid={`card-answer-highlight-${index}`}
              >
                {Icon && (
                  <span className="flex h-[55px] w-[60px] items-center justify-center rounded-[25px] border border-border bg-card shadow-card">
                    <Icon
                      className="h-6 w-6 text-primary"
                      aria-hidden
                      data-testid={`icon-answer-highlight-${index}`}
                    />
                  </span>
                )}
                <h3
                  className="text-foreground"
                  data-testid={`text-answer-highlight-title-${index}`}
                >
                  {item.title}
                </h3>
                <p
                  className="text-body text-muted-foreground"
                  data-testid={`text-answer-highlight-description-${index}`}
                >
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
