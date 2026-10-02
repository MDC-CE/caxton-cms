import type { ListSinglePressMentionSection } from "@shared/schema";
import { UniversalImage } from "@/components/UniversalImage";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { sectionBackgroundStyle } from "@shared/theme-palette";

interface ListSinglePressMentionProps {
  data: ListSinglePressMentionSection;
}

export function ListSinglePressMention({ data }: ListSinglePressMentionProps) {
  const item = data.items?.[0];

  const image = item?.image ?? data.image;
  const title = item?.title ?? data.title;
  const subtitle = item?.subtitle ?? data.subtitle;
  const excerpt = item?.excerpt ?? data.excerpt;
  const organization = item?.organization ?? data.organization;
  const linkText = item?.link_text ?? data.link_text ?? "Read Article";
  const linkUrl = item?.link_url ?? data.link_url;
  if (!title && !image) return null;

  const bgStyle: React.CSSProperties = sectionBackgroundStyle(data.background);

  return (
    <section
      className="max-w-6xl mx-auto px-4 "
      style={bgStyle}
      data-testid="section-list-single-press-mention"
    >
      <div className="md:px-8">
        <div className="flex flex-col md:flex-row gap-8 items-center">
          {/* Left: Image */}
          {image && (
            <div className="w-full md:w-[50%] flex-shrink-0">
              <div className="rounded-md overflow-hidden aspect-video bg-muted">
                <UniversalImage
                  id={image}
                  alt={organization ?? title ?? "Press mention"}
                  className="w-full h-full"
                  loading="lazy"
                  fieldContext={{ srcField: "image" }}
                />
              </div>
            </div>
          )}

          {/* Right: Content */}
          <div
            className={`flex flex-col  gap-4 ${image ? "w-full md:w-[55%]" : "w-full"}`}
          >

            {title && (
              <h2 className="text-2xl md:text-3xl font-bold leading-tight text-foreground">
                {title}
              </h2>
            )}

            {subtitle && (
              <p className="text-sm font-medium text-muted-foreground">
                {subtitle}
              </p>
            )}

            {excerpt && (
              <p className="text-base text-muted-foreground leading-relaxed">
                {excerpt}
              </p>
            )}

            {linkUrl && (
              <div className="pt-2">
                <Button
                  asChild
                  variant="default"
                  data-testid="button-press-mention-cta"
                >
                  <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {linkText}
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ListSinglePressMention;
