import { memo } from "react";
import { Award, Briefcase, Check, Headset, Landmark, LucideIcon, ShieldCheck, Star, Trophy, Users } from "lucide-react";
import type { ValueProofPanelSection, EvidenceItem } from "@shared/schema";
import { UniversalVideo } from "@/components/UniversalVideo";
import UniversalImage from "@/components/UniversalImage";

interface ValueProofPanelProps {
  data: ValueProofPanelSection;
}

const iconMap: Record<string, LucideIcon> = {
  Trophy: Trophy,
  Headset: Headset,
  Users: Users,
  Certificate: Award,
  ShieldCheck: ShieldCheck,
  BuildingBank: Landmark,
  Briefcase: Briefcase,
  Award: Trophy,
  Star: Star,
  Check: Check,
};

function getIcon(iconName?: string): LucideIcon | null {
  if (!iconName) return null;
  return iconMap[iconName] || null;
}

function EvidenceCitation({ 
  icon, 
  title, 
  description,
  source,
  source_url,
  index 
}: { 
  icon?: string; 
  title: string; 
  description?: string;
  source?: string;
  source_url?: string;
  index: number;
}) {
  const IconComponent = getIcon(icon);
  
  return (
    <div 
      className="flex gap-4 py-4 border-l-2 border-primary/30 pl-4"
      data-testid={`citation-evidence-item-${index}`}
    >
      {IconComponent && (
        <div className="flex-shrink-0 mt-0.5">
          <IconComponent className="text-muted-foreground" size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-foreground mb-1" data-testid="text-evidence-title">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed mb-1" data-testid="text-evidence-description">
            {description}
          </p>
        )}
        {source && (
          <p className="text-sm text-muted-foreground/70 italic" data-testid="text-evidence-source">
            {source_url ? (
              <a 
                href={source_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors underline underline-offset-2"
              >
                — {source}
              </a>
            ) : (
              <>— {source}</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function MediaFrame({ 
  media, 
  style = "rounded" 
}: { 
  media: NonNullable<ValueProofPanelSection["media"]>;
  style?: "rounded" | "organic" | "circle";
}) {
  const aspectRatioClasses: Record<string, string> = {
    "1:1": "aspect-square",
    "4:3": "aspect-[4/3]",
    "16:9": "aspect-video",
    "3:4": "aspect-[3/4]",
  };
  
  const styleClasses: Record<string, string> = {
    rounded: "rounded-2xl",
    organic: "rounded-[2rem_0.5rem_2rem_0.5rem]",
    circle: "rounded-full",
  };
  
  const aspectClass = media.aspect_ratio ? aspectRatioClasses[media.aspect_ratio] : "aspect-[4/3]";
  const shapeClass = styleClasses[style];
  
  return (
    <div 
      className={`relative overflow-hidden ${aspectClass} ${shapeClass} bg-muted shadow-sm`}
      data-testid="media-frame"
    >
      {media.type === "video" ? (
        <UniversalVideo
          url={media.src}
          ratio={media.aspect_ratio || "4:3"}
          className="w-full h-full object-cover"
        />
      ) : (
      <UniversalImage
        id={
          ("image_id" in media && typeof media.image_id === "string" && media.image_id) ||
          media.src ||
          ""
        }
        alt={media.alt || ""}
        className="w-full h-full object-cover"
        fieldContext={{ fieldPath: "media.image_id" }}
      />
      )}
    </div>
  );
}

export const ValueProofPanel = memo(function ValueProofPanel({ data }: ValueProofPanelProps) {
  const {
    title,
    subtitle,
    evidence_items,
    media,
    background,
    reverse_layout = false,
    stacked_header = false,
  } = data;

  const backgroundClass = background === "muted" 
    ? "bg-muted" 
    : background === "card" 
      ? "bg-card" 
      : "bg-background";

  const contentOrder = reverse_layout ? "md:order-2" : "md:order-1";
  const mediaOrder = reverse_layout ? "md:order-1" : "md:order-2";

  return (
    <section 
      data-testid="section-value-proof-panel"
    >
      <div className="max-w-6xl mx-auto px-4">
        {/* Stacked Header - Full width above both columns */}
        {stacked_header && (
          <div className="mb-10 md:mb-12 text-center">
            <h2 
              className="text-h2 text-foreground mb-4"
              data-testid="text-value-proof-title"
            >
              {title}
            </h2>
            {subtitle && (
              <p 
                className="text-lg text-muted-foreground max-w-2xl mx-auto"
                data-testid="text-value-proof-subtitle"
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 ${stacked_header ? "items-center" : "items-start"}`}>
          {/* Content Column */}
          <div className={`col-span-1 ${media ? "md:col-span-7" : "md:col-span-12"} ${contentOrder}`}>
            {/* Header - only shown when not stacked */}
            {!stacked_header && (
              <div className="mb-8">
                <h2 
                  className="text-h2 text-foreground mb-4"
                  data-testid="text-value-proof-title"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p 
                    className="text-lg text-muted-foreground max-w-xl"
                    data-testid="text-value-proof-subtitle"
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            )}

            {/* Evidence Items */}
            <div className="space-y-2">
              {evidence_items.map((item: EvidenceItem, index: number) => (
                <EvidenceCitation
                  key={index}
                  index={index}
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                  source={item.source}
                  source_url={item.source_url}
                />
              ))}
            </div>
          </div>

          {/* Media Column - centered when stacked_header is true */}
          {media && (
            <div className={`col-span-1 md:col-span-5 ${mediaOrder}`}>
              <div className={stacked_header ? "" : "sticky top-8 z-50"}>
                <MediaFrame media={media} style={media.style} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});

export default ValueProofPanel;
