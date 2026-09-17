import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import { useInternalNav } from "@/hooks/useInternalNav";

function parseLogoHeight(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

export interface AwardBadgeItem {
  id: string;
  logo?: string;
  alt: string;
  logoHeight?: string;
  description?: string;
  link?: string;
  linkText?: string;
  source?: string;
  name?: string;
  year?: string;
}

export function AwardBadges({ data }: { data: any }) {
  const { variant = "simple", className = "", showBorder = false } = data;
  const items: AwardBadgeItem[] = Array.isArray(data.items) ? data.items : [];
  const handleLinkClick = useInternalNav();
  if (!items || items.length === 0) return null;

  const SimpleCard = ({ item, index }: { item: AwardBadgeItem; index: number }) => (
    <div 
      className="flex items-center justify-center transition-opacity duration-brand ease-brand hover:opacity-80"
      data-testid={`award-badge-${index}`}
    >
      {item.logo ? (
        <img 
          src={item.logo} 
          alt={item.alt}
          style={{ height: parseLogoHeight(item.logoHeight) || 48 }}
          className="w-auto object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex flex-col items-center text-center">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {item.source} {item.year && `${item.year}`}
          </span>
          <span className="text-sm font-medium text-foreground mt-0.5">
            {item.name}
          </span>
        </div>
      )}
    </div>
  );

  const DetailedCard = ({ item }: { item: AwardBadgeItem }) => (
    <div className="text-center flex flex-col items-center h-full justify-center">
      {item.logo ? (
        <img
          src={item.logo}
          alt={item.alt}
          style={{ height: parseLogoHeight(item.logoHeight) || 64 }}
          className="w-auto object-contain mb-4"
          loading="lazy"
          data-testid={`img-${item.id}`}
        />
      ) : (
        <div className="flex flex-col items-center text-center mb-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {item.source} {item.year && `${item.year}`}
          </span>
          <span className="text-sm font-medium text-foreground mt-0.5">
            {item.name}
          </span>
        </div>
      )}
      {item.description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          {item.description}
        </p>
      )}
      {item.link && (
        <a
          href={item.link}
          className="text-sm text-primary font-medium hover:underline"
          onClick={handleLinkClick}
          data-testid={`link-${item.id}`}
        >
          {item.linkText || "Learn more"}
        </a>
      )}
    </div>
  );

  const renderCard = (item: AwardBadgeItem, index: number) => {
    return variant === "simple" 
      ? <SimpleCard key={item.id} item={item} index={index} />
      : <DetailedCard key={item.id} item={item} />;
  };

  const borderClasses = showBorder ? "pt-8 border-t border-border" : "";
  const mobileHeight = variant === "detailed" ? "h-[240px]" : "h-[120px]";

  return (
    <div className={`${className} ${borderClasses}`} data-testid="award-badges">
      <div className="md:hidden">
        <Carousel
          opts={{
            align: "center",
            loop: true,
          }}
          plugins={[]}
          className="w-full max-w-sm mx-auto flex flex-col"
        >
          <div className={`${mobileHeight} flex items-center`}>
            <CarouselContent>
              {items.map((item, index) => (
                <CarouselItem key={item.id}>
                  {renderCard(item, index)}
                </CarouselItem>
              ))}
            </CarouselContent>
          </div>
          <div className="flex justify-center gap-4 mt-4">
            <CarouselPrevious
              className="!static !translate-y-0 !rounded-lg !bg-primary/10 !border-0 !text-primary hover:!bg-primary/20 !h-11 !w-11 [&>svg]:!h-[22px] [&>svg]:!w-[22px]"
              data-testid="button-award-prev"
            />
            <CarouselNext
              className="!static !translate-y-0 !rounded-lg !bg-primary/10 !border-0 !text-primary hover:!bg-primary/20 !h-11 !w-11 [&>svg]:!h-[22px] [&>svg]:!w-[22px]"
              data-testid="button-award-next"
            />
          </div>
        </Carousel>
      </div>

      <div className="hidden md:flex flex-wrap justify-center items-center gap-8 max-w-7xl mx-auto">
        {items.map((item, index) => renderCard(item, index))}
      </div>
    </div>
  );
}

export default AwardBadges;
