import type { ComparisonTableSection } from "@shared/schema";
import { Book, Briefcase, Check, Globe, MessageCircle, Monitor, School, Sparkles, TrendingUp, Users, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ComparisonTableProps {
  data: ComparisonTableSection;
}

const featureIcons: Record<string, typeof Briefcase> = {
  "Career Support": Briefcase,
  "Teacher: Student Ratio": Users,
  "AI-Powered Feedback": Sparkles,
  "1-on-1 Mentoring": MessageCircle,
  "Curriculum": Book,
  "% Hiring Rate": TrendingUp,
  "Community": Globe,
  "Class Format": Monitor,
  "Previous Knowledge": School,
};

function cellValueText(value: string | { text?: string }): string {
  return typeof value === "string" ? value : value.text ?? "";
}

function CellValue({
  value,
  isHighlighted,
}: {
  value: string | { text?: string };
  isHighlighted?: boolean;
}) {
  const text = cellValueText(value);
  if (text === "yes" || text === "Yes" || text === "✓") {
    return (
      <Check className="w-6 h-6 text-primary mx-auto" />
    );
  }
  if (text === "no" || text === "No" || text === "✗") {
    return (
      <X className="w-6 h-6 text-muted-foreground mx-auto" />
    );
  }

  if (isHighlighted) {
    return (
      <span className="flex items-center justify-center gap-2">
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  return <span>{text}</span>;
}

export function GeeksVsOthersComparison({ data }: ComparisonTableProps) {
  const highlightIndex = data.columns.findIndex(col => col.highlight);

  return (
    <section
      className={`${data.background || "bg-background"}`}
      data-testid="section-comparison-table"
    >
      <div className="max-w-6xl mx-auto px-4">
        {data.title && (
          <h2
            className="text-h2 text-center mb-4 text-foreground"
            data-testid="text-comparison-title"
          >
            {data.title}
          </h2>
        )}
        {data.subtitle && (
          <p
            className="text-body text-muted-foreground text-center mb-12 max-w-3xl mx-auto"
            data-testid="text-comparison-subtitle"
          >
            {data.subtitle}
          </p>
        )}

        <div className="hidden md:block">
          {/* Premium comparison table */}
          <div className="rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5" data-testid="table-comparison">
            {/* Header row */}
            <div className="grid grid-cols-3">
              {data.columns.map((column, colIndex) => {
                const isFeatureCol = colIndex === 0;
                const isHighlighted = column.highlight;

                return (
                  <div
                    key={colIndex}
                    className={`py-6 px-6 font-semibold text-body ${
                      isFeatureCol ? "text-left" : "text-center"
                    } ${
                      isHighlighted
                        ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md"
                        : "bg-muted text-foreground"
                    }`}
                    data-testid={`th-column-${colIndex}`}
                  >
                    <span>{column.name}</span>
                    {isHighlighted && (
                      <span className="block text-xs opacity-90 mt-1 font-medium">Our Approach</span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Table body */}
            {data.rows.map((row, rowIndex) => {
              const FeatureIcon = featureIcons[row.feature];

              return (
                <div
                  key={rowIndex}
                  className={`grid grid-cols-3 transition-colors hover:bg-primary/5 ${
                    rowIndex % 2 === 0 ? "bg-card" : "bg-muted/30"
                  }`}
                  data-testid={`tr-row-${rowIndex}`}
                >
                  {/* Feature name - left aligned with icon */}
                  <div className="py-5 px-6 font-medium text-foreground text-left flex items-center gap-2">
                    {FeatureIcon && (
                      <FeatureIcon className="w-4 h-4 text-primary flex items-center" />
                    )}
                    <div>
                      <span>{row.feature}</span>
                      {row.feature_description && (
                        <p className="text-sm text-muted-foreground font-normal mt-1">
                          {row.feature_description}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Values */}
                  {row.values.map((value, valIndex) => {
                    const isHighlightedCol = valIndex === highlightIndex - 1;

                    return (
                      <div
                        key={valIndex}
                        className={`py-5 px-6 text-center flex items-center justify-center ${
                          isHighlightedCol
                            ? "bg-primary/5 font-semibold text-foreground"
                            : "text-muted-foreground font-normal"
                        }`}
                        data-testid={`td-value-${rowIndex}-${valIndex}`}
                      >
                        <CellValue value={value} isHighlighted={isHighlightedCol} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="md:hidden">
          <Accordion type="single" collapsible className="flex flex-col gap-2">
            {data.rows.map((row, rowIndex) => (
              <AccordionItem
                key={rowIndex}
                value={`row-${rowIndex}`}
                className="rounded-card shadow-sm px-6 [&]:border-0 bg-card transition-colors duration-200 active:scale-[0.99] data-[state=open]:bg-primary/5 data-[state=open]:shadow-card"
                data-testid={`accordion-comparison-${rowIndex}`}
              >
                <AccordionTrigger className="hover:no-underline py-4 min-h-[56px] [&>svg]:w-5 [&>svg]:h-5">
                  <span className="font-semibold text-foreground text-base">
                    {row.feature}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pt-4 pb-6">
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                    {/* 4Geeks Academy side - highlighted with checkmark */}
                    <div className="bg-primary/5 rounded-card p-6 border-l-[3px] border-primary shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-primary/10 rounded-full p-1">
                          <Check className="w-5 h-5 text-primary" />
                        </span>
                        <p className="text-xs text-primary font-semibold">
                          {data.columns[1]?.name || "4Geeks Academy"}
                        </p>
                      </div>
                      <p className="text-base font-bold text-foreground mt-2">
                        <CellValue value={row.values[0]} />
                      </p>
                    </div>
                    {/* VS divider */}
                    <div className="flex items-center justify-center px-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">vs</span>
                    </div>
                    {/* Competitors side */}
                    <div className="bg-muted/30 rounded-card p-6">
                      <span className="inline-block px-2 py-0.5 bg-muted text-xs rounded-md text-muted-foreground font-medium mb-2">
                        {(data.columns[2]?.name || "Industry Average").replace(" / Competitors", "")}
                      </span>
                      <p className="text-sm text-muted-foreground mt-2">
                        <CellValue value={row.values[1]} />
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {data.footer_note && (
          <p
            className="text-sm text-muted-foreground text-center mt-8"
            data-testid="text-comparison-footer"
          >
            {data.footer_note}
          </p>
        )}
      </div>
    </section>
  );
}
export default GeeksVsOthersComparison;
