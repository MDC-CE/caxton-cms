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

export default function AnswerHighlightsDefault({ data }: AnswerHighlightsDefaultProps) {
  const { heading, background, items } = data;

  if (!items?.length) return null;

  return (
    <section
      className={cn("py-12 md:py-16", background)}
      data-testid="section-answer-highlights"
    >
      <div className="max-w-6xl mx-auto px-4">
        {heading && (
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground font-heading mb-10 max-w-3xl"
            data-testid="text-answer-highlights-heading"
          >
            {heading}
          </h2>
        )}

        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
          data-testid="answer-highlights-grid"
        >
          {items.map((item, index) => {
            const Icon = item.icon ? getIcon(item.icon) : null;
            return (
              <div
                key={`${item.title}-${index}`}
                className="flex flex-col gap-3 p-card-padding rounded-card bg-primary/5 border border-transparent"
                data-testid={`card-answer-highlight-${index}`}
              >
                {Icon && (
                  <Icon
                    className="w-7 h-7 text-primary shrink-0"
                    data-testid={`icon-answer-highlight-${index}`}
                  />
                )}
                <h3
                  className="text-base font-bold text-foreground font-heading leading-snug"
                  data-testid={`text-answer-highlight-title-${index}`}
                >
                  {item.title}
                </h3>
                <p
                  className="text-base text-muted-foreground leading-relaxed"
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
