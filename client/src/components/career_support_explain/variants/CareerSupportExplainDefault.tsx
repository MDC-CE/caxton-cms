
import { useState, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Circle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UniversalImage } from "@/components/UniversalImage";
import type {
  CareerSupportExplainSection,
  CareerSupportTab,
  CareerSupportTestimonial,
} from "@shared/schema";
import { sectionBackgroundStyle } from "@shared/theme-palette";
import { getIcon } from "@/lib/icons";

interface CareerSupportExplainProps {
  data: CareerSupportExplainSection;
}

function resolveIcon(name: string) {
  return getIcon(name) ?? Circle;
}

function ThreeColumnsLayout({ tab, tabIndex }: { tab: CareerSupportTab; tabIndex: number }) {
  const [isMobileCol2Expanded, setIsMobileCol2Expanded] = useState(false);
  const hasCol2Content = Boolean(
    tab.col2_description || (tab.col2_bullets && tab.col2_bullets.length > 0),
  );

  return (
    <div
      className="flex flex-col lg:flex-row gap-4 h-full"
      data-testid="grid-tab-content"
    >
      <Card
        className="bg-card p-6 flex flex-col rounded-lg flex-1"
        data-testid="col-1-info"
      >
        {tab.col1_subtitle && (
          <h3
            className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-3"
            data-testid="text-col1-subtitle"
          >
            {tab.col1_subtitle}
          </h3>
        )}
        <div className="flex flex-col md:gap-4 flex-1">
          <div className="flex-1">
            {tab.col1_description && (
              <div
                className="text-sm text-muted-foreground leading-snug"
                data-testid="text-col1-description"
                dangerouslySetInnerHTML={{ __html: tab.col1_description }}
              />
            )}
          </div>

          {tab.col1_boxes && tab.col1_boxes.length > 0 && (
            <div className="mt-auto pt-4 md:pt-0 flex-1">
              {tab.col1_tagline && (
                <p className="font-semibold text-primary mb-2">
                  {tab.col1_tagline}
                </p>
              )}
              <div className="flex flex-wrap gap-2" data-testid="boxes-col1">
                {tab.col1_boxes.map((box, i) => {
                  const IconComp = box.icon ? resolveIcon(box.icon) : null;
                  return (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-primary/10"
                      data-testid={`box-item-${i}`}
                    >
                      {IconComp && (
                        <IconComp className="w-4 h-4 text-primary" />
                      )}
                      <span className="lg:text-xs text-foreground">
                        {box.text}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 flex-1 lg:flex-[2.55] lg:contents">
        <Card
          className="bg-primary/5 p-6 flex-1 flex-col text-muted-foreground rounded-lg"
          data-testid="col-2-bullets"
        >
          {tab.col2_heading && (
            <button
              type="button"
              onClick={() => hasCol2Content && setIsMobileCol2Expanded((prev) => !prev)}
              className={cn(
                "flex md:hidden w-full items-center justify-between gap-3 text-left",
                hasCol2Content ? "cursor-pointer" : "cursor-default",
              )}
              aria-expanded={hasCol2Content ? isMobileCol2Expanded : true}
              data-testid="button-col2-mobile-toggle"
            >
              <span
                className="text-lg font-semibold leading-snug text-primary"
                data-testid="text-col2-heading-mobile"
              >
                {tab.col2_heading}
              </span>
              {hasCol2Content && (
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300",
                    isMobileCol2Expanded && "rotate-180",
                  )}
                />
              )}
            </button>
          )}

          {tab.col2_heading && (
            <p
              className="hidden md:block text-lg md:text-xl lg:text-2xl font-semibold text-primary mb-2 leading-snug"
              data-testid="text-col2-heading"
            >
              {tab.col2_heading}
            </p>
          )}

          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out md:overflow-visible",
              tab.col2_heading
                ? isMobileCol2Expanded
                  ? "max-h-[600px] opacity-100 mt-3 md:mt-0"
                  : "max-h-0 opacity-0 md:max-h-none md:opacity-100 md:mt-0"
                : "max-h-[600px] opacity-100",
            )}
          >
            {tab.col2_description && (
              <p
                className="text-sm text-muted-foreground leading-relaxed mb-4"
                data-testid="text-col2-description"
              >
                {tab.col2_description}
              </p>
            )}

            {tab.col2_bullets && tab.col2_bullets.length > 0 && (
              <div className="flex flex-col gap-4" data-testid="bullets-col2">
                {tab.col2_bullets.map((bullet, i) => {
                  const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3"
                      data-testid={`bullet-item-${i}`}
                    >
                      {IconComp && (
                        <Card className="flex-shrink-0 p-1.5 !rounded-lg">
                          <IconComp className="w-4 h-4 text-primary" />
                        </Card>
                      )}
                      <span className="text-sm lg:text-base">{bullet.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div
          className="relative overflow-hidden rounded-lg sm:flex-1 lg:flex-[1.55] min-h-[200px] sm:min-h-0 h-[110px] sm:h-auto"
          data-testid="col-3-image"
        >
          {tab.col3_image_id && (
            <UniversalImage
              id={tab.col3_image_id}
              className="w-full h-full absolute inset-0"
              style={{
                objectFit:
                  (tab.col3_object_fit as React.CSSProperties["objectFit"]) ||
                  "cover",
                objectPosition: tab.col3_object_position || "center",
              }}
              data-testid="img-tab-content"
              fieldContext={{ arrayPath: "tabs", index: tabIndex, srcField: "col3_image_id" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TwoColumnCardsLayout({ tab, tabIndex }: { tab: CareerSupportTab; tabIndex: number }) {
  const [isMobileRightExpanded, setIsMobileRightExpanded] = useState(false);
  const rightBullets = tab.right_bullets ?? [];
  const initialMobileRightBullets = rightBullets.slice(0, 2);
  const extraMobileRightBullets = rightBullets.slice(2);
  const hasMobileRightExpandableContent =
    extraMobileRightBullets.length > 0 || (tab.right_logos?.length ?? 0) > 0;
  const toggleMobileRightExpanded = () => {
    if (!hasMobileRightExpandableContent) return;
    setIsMobileRightExpanded((prev) => !prev);
  };

  return (
    <div
      className="flex flex-col lg:flex-row gap-4 h-full items-center"
      data-testid="grid-two-column-cards"
    >
      <Card
        className="flex flex-col flex-[2.5] p-6 overflow-hidden h-full"
        data-testid="card-left"
      >
        {tab.title && (
          <h3
            className="text-2xl md:text-3xl lg:text-4xl lg:me-[200px] font-bold text-foreground"
            data-testid="text-tab-title"
          >
            {tab.title}
          </h3>
        )}

        <div className="lg:hidden flex flex-col flex-1">
          <p
            className="text-sm md:text-base text-muted-foreground mt-2 whitespace-pre-line"
            data-testid="text-left-content-mobile"
          >
            {"Once your profile is ready, visibility becomes the focus."}
            {tab.left_text ? `\n${tab.left_text}` : ""}
          </p>

          {tab.left_image_id && (
            <div
              className="relative rounded-lg mt-3"
              data-testid="img-left-container-mobile"
            >
              <UniversalImage
                id={tab.left_image_id}
                className="w-full h-auto rounded-lg mt-2"
                style={{
                  objectFit:
                    (tab.left_image_object_fit as React.CSSProperties["objectFit"]) ||
                    "cover",
                  objectPosition: tab.left_image_object_position || "center",
                }}
                data-testid="img-left-content-mobile"
                fieldContext={{ arrayPath: "tabs", index: tabIndex, srcField: "left_image_id" }}
              />
            </div>
          )}

          {tab.left_stat && (
            <div className="mt-auto pt-4" data-testid="stat-left-mobile">
              <span className="text-5xl font-bold text-primary">
                {tab.left_stat.value}
              </span>
              <p className="text-sm text-muted-foreground mt-1">
                {tab.left_stat.label}
              </p>
            </div>
          )}
        </div>

        <div className="hidden lg:flex flex-col flex-1">
          <div className="flex items-start flex-1 mt-5">
            <div className="flex gap-3 flex-1">
              <div className="flex flex-col flex-1 leading-snug">
                {tab.left_text && (
                  <p
                    className="text-base text-muted-foreground whitespace-pre-line"
                    data-testid="text-left-content"
                  >
                    {tab.left_text}
                  </p>
                )}
              </div>

              {tab.left_image_id && (
                <div
                  className="relative rounded-lg flex-[1.2]"
                  data-testid="img-left-container"
                >
                  <UniversalImage
                    id={tab.left_image_id}
                    className="w-full h-auto rounded-lg mt-2"
                    style={{
                      objectFit:
                        (tab.left_image_object_fit as React.CSSProperties["objectFit"]) ||
                        "cover",
                      objectPosition:
                        tab.left_image_object_position || "center",
                    }}
                    data-testid="img-left-content"
                    fieldContext={{ arrayPath: "tabs", index: tabIndex, srcField: "left_image_id" }}
                  />
                </div>
              )}
            </div>
          </div>
          {tab.left_stat && (
            <div className="flex items-end h-full">
              <div className="mt-auto pt-4" data-testid="stat-left">
                <span className="text-5xl font-bold text-primary">
                  {tab.left_stat.value}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {tab.left_stat.label}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card
        className={cn(
          "relative flex flex-col flex-1 p-6 bg-primary/5 h-full",
          hasMobileRightExpandableContent && "cursor-pointer lg:cursor-default",
        )}
        onClick={toggleMobileRightExpanded}
        onKeyDown={(event) => {
          if (!hasMobileRightExpandableContent) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleMobileRightExpanded();
          }
        }}
        role={hasMobileRightExpandableContent ? "button" : undefined}
        tabIndex={hasMobileRightExpandableContent ? 0 : undefined}
        aria-expanded={hasMobileRightExpandableContent ? isMobileRightExpanded : undefined}
        data-testid="card-right"
      >
        {hasMobileRightExpandableContent && (
          <div
            className="absolute top-4 right-4 flex items-center justify-center lg:hidden pointer-events-none"
            data-testid="button-card-right-mobile-toggle"
          >
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform duration-300",
                isMobileRightExpanded && "rotate-180",
              )}
            />
          </div>
        )}

        <div
          className="flex flex-col gap-4 pr-8 lg:hidden"
          data-testid="bullets-right-mobile"
        >
          {initialMobileRightBullets.map((bullet, i) => {
            const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
            return (
              <div
                key={i}
                className="flex items-start gap-3"
                data-testid={`right-bullet-${i}`}
              >
                {IconComp && (
                  <Card className="flex-shrink-0 p-1.5">
                    <IconComp className="w-4 h-4 text-primary" />
                  </Card>
                )}
                <span className="text- text-muted-foreground">
                  {bullet.text}
                </span>
              </div>
            );
          })}

          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              isMobileRightExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <div className="flex flex-col gap-4 pt-4">
              {extraMobileRightBullets.map((bullet, i) => {
                const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
                const bulletIndex = i + initialMobileRightBullets.length;

                return (
                  <div
                    key={bulletIndex}
                    className="flex items-start gap-3"
                    data-testid={`right-bullet-${bulletIndex}`}
                  >
                    {IconComp && (
                      <Card className="flex-shrink-0 p-1.5">
                        <IconComp className="w-4 h-4 text-primary" />
                      </Card>
                    )}
                    <span className="text- text-muted-foreground">
                      {bullet.text}
                    </span>
                  </div>
                );
              })}

              {tab.right_logos && tab.right_logos.length > 0 && (
                <div className="pt-2" data-testid="logos-right-mobile">
                  <div className="flex flex-wrap items-center gap-1 justify-center">
                    {tab.right_logos.map((logo, i) => (
                      <Card
                        key={i}
                        className="flex h-10 items-center border border-muted-foreground/10 shadow-none bg-opacity-0 rounded-lg px-2 py-1"
                        data-testid={`logo-right-mobile-${i}`}
                      >
                        <UniversalImage
                          id={logo.image_id}
                          alt={logo.alt || ""}
                          className="h-full max-h-full w-auto max-w-full object-contain"
                        />
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:flex lg:flex-col lg:h-full">
          {tab.right_bullets && tab.right_bullets.length > 0 && (
            <div className="flex flex-col gap-4 mb-6" data-testid="bullets-right">
              {tab.right_bullets.map((bullet, i) => {
                const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3"
                    data-testid={`right-bullet-${i}`}
                  >
                    {IconComp && (
                      <Card className="flex-shrink-0 p-1.5">
                        <IconComp className="w-4 h-4 text-primary" />
                      </Card>
                    )}
                    <span className="text- text-muted-foreground">
                      {bullet.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {tab.right_logos && tab.right_logos.length > 0 && (
            <div className="mt-auto" data-testid="logos-right">
              <div className="flex flex-wrap items-center gap-1 justify-center">
                {tab.right_logos.map((logo, i) => (
                  <Card
                    key={i}
                    className="flex h-10 md:h-[var(--logo-height)] items-center border border-muted-foreground/10 shadow-none bg-opacity-0 rounded-lg px-2 py-1"
                    style={{ "--logo-height": logo.logoHeight || "40px" } as React.CSSProperties}
                    data-testid={`logo-right-${i}`}
                  >
                    <UniversalImage
                      id={logo.image_id}
                      alt={logo.alt || ""}
                      className="h-full max-h-full w-auto max-w-full object-contain"
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function TextAndImageLayout({ tab, tabIndex }: { tab: CareerSupportTab; tabIndex: number }) {
  return (
    <div
      className="flex flex-col lg:flex-row gap-8 h-full"
      data-testid="grid-text-and-image"
    >
      <div
        className="flex flex-col justify-start flex-1"
        data-testid="col-text-content"
      >
        {tab.title && (
          <h3
            className="text-2xl md:text-2xl lg:text-4xl font-bold text-foreground mb-4"
            data-testid="text-tab-title"
          >
            {tab.title}
          </h3>
        )}
        {tab.left_description && (
          <div
            className="text-sm md:text-base text-muted-foreground leading-relaxed mb-6"
            data-testid="text-left-description"
            dangerouslySetInnerHTML={{ __html: tab.left_description }}
          />
        )}
        {tab.left_bullets && tab.left_bullets.length > 0 && (
          <div className="flex flex-col gap-3" data-testid="bullets-left">
            {tab.left_bullets.map((bullet, i) => {
              const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3"
                  data-testid={`left-bullet-${i}`}
                >
                  {IconComp && (
                    <Card className="flex-shrink-0 p-1.5">
                      <IconComp className="w-4 h-4 text-primary" />
                    </Card>
                  )}
                  <span className="text-foreground">{bullet.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="flex-[1.1] rounded-2xl lg:rounded-l-2xl lg:rounded-r-none border lg:border-r-0 border-border flex items-center justify-center px-8 pb-8 pt-0 lg:py-16 lg:ps-16 lg:pe-0 lg:px-0"
        style={{
          background:
            tab.right_panel_background ?? "hsl(var(--primary) / 0.15)",
        }}
        data-testid="panel-right-image"
      >
        {tab.right_image_id && (
          <UniversalImage
            id={tab.right_image_id}
            className="w-full h-full rounded-lg shadow-lg"
            style={{
              objectFit:
                (tab.right_image_object_fit as React.CSSProperties["objectFit"]) ??
                "cover",
              objectPosition: tab.right_image_object_position ?? "center",
            }}
            data-testid="img-right-content"
            fieldContext={{ arrayPath: "tabs", index: tabIndex, srcField: "right_image_id" }}
          />
        )}
      </div>
    </div>
  );
}

function TestimonialSlide({
  testimonial,
  tabIndex,
  testimonialIndex,
}: {
  testimonial: CareerSupportTestimonial;
  tabIndex: number;
  testimonialIndex: number;
}) {
  return (
    <div
      className="flex flex-col sm:flex-row gap-4 h-full min-w-0"
      data-testid="testimonial-slide"
    >
      <div
        className="sm:flex-1 rounded-lg overflow-hidden max-h-[190px] md:max-h-none"
        data-testid="testimonial-image-col"
      >
        {testimonial.image_id && (
          <UniversalImage
            id={testimonial.image_id}
            className="w-full h-full"
            style={{
              objectFit:
                (testimonial.image_object_fit as React.CSSProperties["objectFit"]) ??
                "cover",
              objectPosition: testimonial.image_object_position ?? "center",
              minHeight: "160px",
            }}
            data-testid="testimonial-image"
            fieldContext={{ arrayPath: `tabs.${tabIndex}.testimonials`, index: testimonialIndex, srcField: "image_id" }}
          />
        )}
      </div>

      <div
        className="sm:flex-1 flex flex-col gap-4 p-5 bg-primary/5 rounded-lg"
        data-testid="testimonial-info-col"
      >
        {testimonial.contributor_logos &&
          testimonial.contributor_logos.length > 0 && (
            <div
              className="flex items-center gap-3"
              data-testid="testimonial-logos"
            >
              {testimonial.contributor_logos.map((logo, i) => (
                <Card
                  key={i}
                  className="p-1 bg-transparent shadow-none border-muted-foreground/10"
                >
                  <UniversalImage
                    id={logo.image_id}
                    className="h-12 w-auto object-contain"
                    data-testid={`testimonial-logo-${i}`}
                  />
                </Card>
              ))}
            </div>
          )}

        {testimonial.description && (
          <p
            className="text-muted-foreground leading-relaxed"
            data-testid="testimonial-description"
          >
            {testimonial.description}
          </p>
        )}

        {testimonial.achievement && (
          <Card className="p-4 mt-auto" data-testid="testimonial-achievement">
            <Flag className="w-4 h-4 text-primary mb-1" />

            <span className="font-medium text-foreground flex inline-flex items-end">
              {testimonial.achievement}
            </span>
          </Card>
        )}
      </div>
    </div>
  );
}

function TextWithTestimonialsCarouselLayout({
  tab,
  tabIndex,
}: {
  tab: CareerSupportTab;
  tabIndex: number;
}) {
  const testimonials = tab.testimonials ?? [];
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = testimonials.length;

  const goNext = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const goPrev = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  return (
    <div
      className="flex flex-col lg:flex-row gap-8 h-full"
      data-testid="grid-text-with-testimonials"
    >
      <div className="flex-[1.2] min-w-0" data-testid="col-left-text">
        {tab.title && (
          <h3
            className="text-2xl md:text-2xl lg:text-3xl font-bold text-foreground mb-4"
            data-testid="text-testimonials-title"
          >
            {tab.title}
          </h3>
        )}
        {tab.left_description && (
          <div
            className="text-sm lg:text-base text-muted-foreground leading-relaxed mb-6"
            data-testid="text-testimonials-description"
            dangerouslySetInnerHTML={{ __html: tab.left_description }}
          />
        )}
        {tab.left_bullets && tab.left_bullets.length > 0 && (
          <div
            className="flex flex-col gap-3"
            data-testid="bullets-testimonials"
          >
            {tab.left_bullets.map((bullet, i) => {
              const IconComp = bullet.icon ? resolveIcon(bullet.icon) : null;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3"
                  data-testid={`testimonial-bullet-${i}`}
                >
                  {IconComp && (
                    <Card className="flex-shrink-0 p-1.5">
                      <IconComp className="w-4 h-4 text-primary" />
                    </Card>
                  )}
                  <span className="text-sm md:text-base text-foreground">
                    {bullet.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="flex-[2] flex flex-col gap-3 min-w-0"
        data-testid="col-testimonials-carousel"
      >
        {totalSlides > 0 && (
          <>
            <div className="relative overflow-hidden rounded-lg flex-1">
              <div
                className="flex h-full transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {testimonials.map((testimonial, i) => (
                  <div key={i} className="w-full flex-shrink-0 h-full">
                    <TestimonialSlide testimonial={testimonial} tabIndex={tabIndex} testimonialIndex={i} />
                  </div>
                ))}
              </div>
            </div>

            {totalSlides > 1 && (
              <div
                className="flex items-center justify-between"
                data-testid="carousel-controls"
              >
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={goPrev}
                  data-testid="button-carousel-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <div
                  className="flex items-center gap-2"
                  data-testid="carousel-dots"
                >
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentSlide(i)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors",
                        i === currentSlide
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                      )}
                      data-testid={`carousel-dot-${i}`}
                    />
                  ))}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={goNext}
                  data-testid="button-carousel-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyLayout() {
  return (
    <div
      className="flex items-center justify-center h-full rounded-[0.8rem] border border-dashed border-border"
      data-testid="tab-empty"
    >
      <p className="text-muted-foreground text-sm">Content coming soon</p>
    </div>
  );
}

function TabContent({ tab, tabIndex }: { tab: CareerSupportTab; tabIndex: number }) {
  switch (tab.layout) {
    case "three_columns":
      return <ThreeColumnsLayout tab={tab} tabIndex={tabIndex} />;
    case "two_column_cards":
      return <TwoColumnCardsLayout tab={tab} tabIndex={tabIndex} />;
    case "text_and_image":
      return <TextAndImageLayout tab={tab} tabIndex={tabIndex} />;
    case "text_with_testimonials_carousel":
      return <TextWithTestimonialsCarouselLayout tab={tab} tabIndex={tabIndex} />;
    default:
      return <EmptyLayout />;
  }
}

export default function CareerSupportExplain({ data }: CareerSupportExplainProps) {
  const { tabs, heading, description } = data;
  const [activeTab, setActiveTab] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setActiveTab((prev) => (prev + 1) % tabs.length);
      } else {
        setActiveTab((prev) => (prev - 1 + tabs.length) % tabs.length);
      }
    }
    touchStartX.current = null;
  };

  return (
    <section
      className="w-full"
      style={sectionBackgroundStyle(data.background)}
      data-testid="section-career-support-explain"
    >
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {(heading || description) && (
          <div className="text-center mb-10">
            {heading && (
              <h2
                className="text-3xl md:text-4xl font-bold text-foreground mb-3"
                data-testid="text-career-heading"
              >
                {heading}
              </h2>
            )}
            {description && (
              <p
                className="text-lg text-muted-foreground max-w-2xl mx-auto"
                data-testid="text-career-description"
              >
                {description}
              </p>
            )}
          </div>
        )}

        {tabs.length > 1 && (
          <div
            className=" mb-2 md:mb-8 w-full"
            data-testid="tabs-selector"
          >
            <div className="hidden md:flex w-full">
              <div className="grid grid-cols-4 gap-3 border border-border bg-background rounded-lg w-full p-1">
                {tabs.map((tab, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    className={cn(
                      "py-1 rounded-lg text-sm font-medium transition-colors duration-200 col-span-1 w-full pt-[10px] pb-[10px]",
                      i === activeTab
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover-elevate"
                    )}
                    data-testid={`button-tab-${i}`}
                  >
                    {tab.tab_label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex md:hidden items-center gap-2 w-full justify-center">
              <div className="bg-primary w-full flex justify-between items-center rounded-lg py-1 px-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-lg"
                  onClick={() =>
                    setActiveTab((activeTab - 1 + tabs.length) % tabs.length)
                  }
                  aria-label="Previous tab"
                  data-testid="button-tab-prev-mobile"
                >
                  <ChevronLeft className="w-4 h-4 text-primary-foreground" />
                </Button>
                <span className="text-primary-foreground font-extrabold rounded-lg px-4 py-1 text-lg font-medium">
                  {tabs[activeTab]?.tab_label}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-lg"
                  onClick={() => setActiveTab((activeTab + 1) % tabs.length)}
                  aria-label="Next tab"
                  data-testid="button-tab-next-mobile"
                >
                  <ChevronRight className="w-4 h-4 text-primary-foreground" />
                </Button>
              </div>
            </div>
            {tabs.length > 1 && (
              <div
                className="flex md:hidden items-center justify-center gap-2 mt-4"
                data-testid="tab-tracking-dots"
              >
                {tabs.map((tab, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveTab(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      i === activeTab ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                    aria-label={tab.tab_label ? `Go to tab: ${tab.tab_label}` : `Go to tab ${i + 1}`}
                    data-testid={`tab-dot-${i}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="h-auto lg:h-[480px] mx-2 md:mx-6 lg:mx-12"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <TabContent tab={tabs[activeTab]} tabIndex={activeTab} />
        </div>
      </div>
    </section>
  );
}

