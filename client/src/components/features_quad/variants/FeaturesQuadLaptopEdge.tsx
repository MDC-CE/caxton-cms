
import type { FeatureQuadSection } from "@shared/schema";
import UniversalImage from "@/components/UniversalImage";
import { UniversalVideo } from "@/components/UniversalVideo";
import { Button } from "@/components/ui/button";
import { getIcon } from "@/lib/icons";
import { useInternalNav } from "@/hooks/useInternalNav";
import { useSectionContext } from "@/contexts/SectionContext";

const LAPTOP_IMAGE_FALLBACK_ID = "243f0f155c3d1683ecfaa1020801b365ad23092d-1769656566581";

function getButtonVariant(
  variant?: string,
): "default" | "secondary" | "outline" | "ghost" | "destructive" {
  const validVariants = [
    "default",
    "secondary",
    "outline",
    "ghost",
    "destructive",
  ];
  if (variant && validVariants.includes(variant)) {
    return variant as
      | "default"
      | "secondary"
      | "outline"
      | "ghost"
      | "destructive";
  }
  if (variant === "primary") return "default";
  return "default";
}

interface FeaturesQuadLaptopEdgeProps {
  data: FeatureQuadSection;
}

function CompactCard({
  card,
  index,
}: {
  card: { icon: string; title?: string; description?: string };
  index: number;
}) {
  const IconComponent = getIcon(card.icon);
  const hasTitle = !!card.title;
  const hasDescription = !!card.description;
  const hasOnlyOne =
    (hasTitle && !hasDescription) || (!hasTitle && hasDescription);

  return (
    <div
      className={`flex items-center gap-3 p-3 bg-card rounded-lg shadow-sm ${hasOnlyOne ? "justify-center" : ""}`}
      data-testid={`features-quad-card-compact-${index}`}
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        {IconComponent && <IconComponent className="text-primary" size={16} />}
      </div>
      {hasTitle && (
        <span className="text-sm font-medium text-foreground">
          {card.title}
        </span>
      )}
      {!hasTitle && hasDescription && (
        <span className="text-sm text-muted-foreground">
          {card.description}
        </span>
      )}
    </div>
  );
}

function FullCard({
  card,
  index,
}: {
  card: { icon: string; title?: string; description?: string };
  index: number;
}) {
  const IconComponent = getIcon(card.icon);
  const hasTitle = !!card.title;
  const hasDescription = !!card.description;
  const hasOnlyOne =
    (hasTitle && !hasDescription) || (!hasTitle && hasDescription);

  return (
    <div
      className={`flex items-start gap-4 p-4 bg-card rounded-lg shadow-sm ${hasOnlyOne ? "items-center" : ""}`}
      data-testid={`features-quad-card-${index}`}
    >
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        {IconComponent && <IconComponent className="text-primary" size={24} />}
      </div>
      <div className={`flex flex-col ${hasOnlyOne ? "justify-center" : ""}`}>
        {hasTitle && (
          <h3
            className={`font-semibold text-foreground ${hasDescription ? "mb-1" : ""}`}
          >
            {card.title}
          </h3>
        )}
        {hasDescription && (
          <p className="text-sm text-muted-foreground">{card.description}</p>
        )}
      </div>
    </div>
  );
}

// Normalize video config - handles both legacy string format and new object format
function normalizeVideo(
  video:
    | string
    | {
        url: string;
        ratio?: string;
        preview_image_url?: string;
        width?: string;
      }
    | undefined,
  videoRatio?: string,
  videoPreviewImage?: string,
): {
  url: string;
  ratio?: string;
  preview_image_url?: string;
  width?: string;
} | null {
  if (!video) return null;
  if (typeof video === "string") {
    return {
      url: video,
      ratio: videoRatio,
      preview_image_url: videoPreviewImage,
    };
  }
  return video;
}

export default function FeaturesQuadLaptopEdge({ data }: FeaturesQuadLaptopEdgeProps) {
  const { isPriority } = useSectionContext();
  const laptopImageId = data.laptop_image?.image_id ?? LAPTOP_IMAGE_FALLBACK_ID;
  const isCompact = data.compact !== null ? data.compact : false;
  const CardComponent = isCompact ? CompactCard : FullCard;
  const images = data.images || [];
  const cards = data.cards ?? [];
  const hasCards = cards.length > 0;
  const videoConfig = normalizeVideo(
    data.video,
    data.video_ratio,
    data.video_preview_image,
  );
  const hasVideo = !!videoConfig?.url;
  const hasMedia = hasVideo || images.length > 0;
  const handleLinkClick = useInternalNav();

  const renderMedia = (widthClass: string, testId: string) => {
    if (!hasVideo || !videoConfig) return null;
    const aspectRatio = videoConfig.ratio || "16:9";
    const videoWidth = videoConfig.width;
    return (
      <div
        className={`${widthClass} rounded-card overflow-hidden`}
        style={videoWidth ? { width: videoWidth } : undefined}
        data-testid={testId}
      >
        <UniversalVideo
          url={videoConfig.url}
          preview_image_url={videoConfig.preview_image_url}
          ratio={aspectRatio}
        />
      </div>
    );
  };

  return (
    <section
      className="relative overflow-hidden"
      data-testid="section-features-quad-laptop"
    >
      {/* Background split */}
      <div className="hidden lg:block">
        {/* Solid mask to prevent parent background from affecting the color */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[20%] bg-background rounded-lg"
          aria-hidden="true"
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-[20%] bg-primary/5 rounded-lg"
          aria-hidden="true"
        />
      </div>
      {/* Mobile/tablet full bg */}
      <div className="lg:hidden absolute inset-0 bg-muted" aria-hidden="true" />

      <div className="relative max-w-6xl mx-auto px-4 py-14">
        {/* ===== MOBILE LAYOUT ===== */}
        <div className="md:hidden space-y-4">
          {/* Media above title - aligned left */}
          <div className="flex justify-center">
            {hasMedia &&
              (hasVideo ? (
                renderMedia(
                  "w-full max-w-[280px]",
                  "video-features-quad-mobile",
                )
              ) : (
                <div
                  className="flex items-stretch gap-2 bg-primary/5 p-2 rounded-card h-[180px] w-64 w-fit"
                  data-testid="img-features-quad-mobile"
                >
                  {images.slice(0, 4).map((image, index) => (
                    <div key={index} className="w-16">
                      <UniversalImage
                        id={image.image_id}
                        alt={image.alt || `Image ${index + 1}`}
                        className="w-full h-full rounded-lg"
                        style={{
                          objectFit: image.object_fit || "cover",
                          objectPosition: image.object_position || "top",
                        }}
                        fieldContext={{ arrayPath: "images", index, srcField: "image_id" }}
                      />
                    </div>
                  ))}
                </div>
              ))}
          </div>
          {/* Title and description */}
          <div className="text-left">
            <h2
              className="text-2xl font-bold text-foreground mb-2"
              data-testid="text-features-quad-heading"
            >
              {data.heading}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {data.description}
            </p>
            {data.cta && (
              <Button
                variant={getButtonVariant(data.cta.variant)}
                asChild
                className="mt-4"
                data-testid="button-features-quad-cta-mobile"
              >
                <a href={data.cta.url} onClick={handleLinkClick} className="flex items-center gap-2">
                  {data.cta.icon && (() => { const Ic = getIcon(data.cta!.icon!); return Ic ? <Ic className="h-4 w-4" /> : null; })()}
                  {data.cta.text}
                </a>
              </Button>
            )}
          </div>
          {/* Cards stacked vertically - always compact on mobile */}
          {hasCards && (
            <div
              className="grid grid-cols-1 gap-2"
              data-testid="cards-features-quad-mobile"
            >
              {cards.map((card, index) => (
                <CompactCard key={index} card={card} index={index} />
              ))}
            </div>
          )}
          {data.footer_description && (
            <p className="text-xs text-muted-foreground leading-relaxed italic text-center">
              {data.footer_description}
            </p>
          )}
        </div>

        {/* ===== TABLET LAYOUT ===== */}
        <div className="hidden md:block lg:hidden space-y-8">
          <div className="flex gap-6 items-stretch">
            <div className="flex-1 text-left">
              <h2
                className="text-3xl font-bold text-foreground mb-3"
                data-testid="text-features-quad-heading-tablet"
              >
                {data.heading}
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                {data.description}
              </p>
              {data.cta && (
                <Button
                  variant={getButtonVariant(data.cta.variant)}
                  asChild
                  className="mt-4"
                  data-testid="button-features-quad-cta-tablet"
                >
                  <a href={data.cta.url} onClick={handleLinkClick} className="flex items-center gap-2">
                  {data.cta.icon && (() => { const Ic = getIcon(data.cta!.icon!); return Ic ? <Ic className="h-4 w-4" /> : null; })()}
                  {data.cta.text}
                </a>
                </Button>
              )}
            </div>
            {hasMedia &&
              (hasVideo ? (
                renderMedia("w-[300px]", "video-features-quad-tablet")
              ) : (
                <div
                  className="flex items-stretch gap-3 bg-primary/5 w-[300px] p-3 rounded-card max-h-[200px] h-32"
                  data-testid="img-features-quad-tablet"
                >
                  {images.slice(0, 4).map((image, index) => (
                    <div key={index} className="flex-1">
                      <UniversalImage
                        id={image.image_id}
                        alt={image.alt || `Image ${index + 1}`}
                        className="w-full h-full rounded-lg"
                        style={{
                          objectFit: image.object_fit || "cover",
                          objectPosition: image.object_position || "top",
                        }}
                        fieldContext={{ arrayPath: "images", index, srcField: "image_id" }}
                      />
                    </div>
                  ))}
                </div>
              ))}
          </div>
          {hasCards && (
            <div
              className="grid grid-cols-2 gap-4"
              data-testid="cards-features-quad-tablet"
            >
              {cards.map((card, index) => (
                <CardComponent key={index} card={card} index={index} />
              ))}
            </div>
          )}
          {data.footer_description && (
            <p className="text-sm text-muted-foreground leading-relaxed italic text-left">
              {data.footer_description}
            </p>
          )}
        </div>

        {/* ===== DESKTOP LAYOUT with laptop ===== */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-9 space-y-6 ">
              <div className={`relative flex justify-between items-stretch ${data.description_with_background ? "mb-8 p-4" : ""}`}>
                {data.description_with_background && (
                  <div
                    className="absolute inset-0 bg-primary/5 rounded-l-lg z-0"
                    style={{ right: "calc(-50vw + 50%)" }}
                    aria-hidden="true"
                  />
                )}
                <div className="text-left me-24">
                  <h2
                    className="text-4xl font-bold text-foreground mb-4"
                    data-testid="text-features-quad-heading-desktop"
                  >
                    {data.heading}
                  </h2>
                  <p className={`text-lg text-muted-foreground leading-relaxed ${hasMedia ? "max-w-xl" : ""}`}>
                    {data.description}
                  </p>
                  {data.cta && (
                    <Button
                      variant={getButtonVariant(data.cta.variant)}
                      asChild
                      className="mt-4"
                      data-testid="button-features-quad-cta-desktop"
                    >
                      <a href={data.cta.url} onClick={handleLinkClick} className="flex items-center gap-2">
                  {data.cta.icon && (() => { const Ic = getIcon(data.cta!.icon!); return Ic ? <Ic className="h-4 w-4" /> : null; })()}
                  {data.cta.text}
                </a>
                    </Button>
                  )}
                </div>
                {hasMedia &&
                  (hasVideo ? (
                    renderMedia("w-[300px]", "video-features-quad-desktop")
                  ) : (
                    <div
                      className="flex items-stretch gap-3 bg-primary/5 p-4 rounded-card w-[300px] h-36"
                      data-testid="img-features-quad-desktop"
                    >
                      {images.slice(0, 4).map((image, index) => (
                        <div key={index} className="flex-1">
                          <UniversalImage
                            id={image.image_id}
                            alt={image.alt || `Image ${index + 1}`}
                            className="w-full h-full rounded-lg"
                            style={{
                              objectFit: image.object_fit || "cover",
                              objectPosition: image.object_position || "top",
                            }}
                            fieldContext={{ arrayPath: "images", index, srcField: "image_id" }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
              {hasCards && (
                <div
                  className="grid grid-cols-2 gap-4"
                  data-testid="cards-features-quad-desktop"
                >
                  {cards.map((card, index) => (
                    <CardComponent key={index} card={card} index={index} />
                  ))}
                </div>
              )}
              {data.footer_description && (
                <p className="text-base text-muted-foreground leading-relaxed italic">
                  {data.footer_description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Laptop image - desktop only */}
      <div className="hidden lg:flex absolute lg:right-[-400px] xl:right-[-270px] top-0 bottom-0 w-[700px] items-center pointer-events-none">
        <UniversalImage
          id={laptopImageId}
          alt={data.laptop_image?.alt ?? "Code editor on laptop"}
          className="w-[90%] max-w-none h-auto object-contain object-left"
          data-testid="img-features-quad-laptop"
          fieldContext={{ fieldPath: "laptop_image.image_id" }}
        />
      </div>
    </section>
  );
}
