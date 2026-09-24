import { useState } from "react";
import { Briefcase, Building2, ChevronDown, Coins, Crown, FileText, Globe, HeartHandshake, Infinity, MessageCircle, MessageSquare, Mic, Rocket, Star, Target, TrendingUp, UserRound, Users } from "lucide-react";
import { Certificate } from "./Certificate";
import { Button } from "@/components/ui/button";

export interface CertificateDisplayBenefit {
  text: string;
}

export interface CertificateDisplayProps {
  programName: string;
  description?: string;
  benefits?: CertificateDisplayBenefit[];
  certificate_position?: "left" | "right";
  iconSetIndex?: number;
  useSolidCard?: boolean;
}

export function CertificateDisplay({ 
  programName,
  description,
  benefits = [],
  certificate_position = "left",
  iconSetIndex = 0,
  useSolidCard = false
}: CertificateDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isCertificateLeft = certificate_position === "left";
  const visibleBenefitsCount = 2;

  const certificateColumn = (
    <div className="flex justify-center">
      <div className="w-full max-w-md">
        <Certificate programName={programName} useSolidCard={useSolidCard} />
      </div>
    </div>
  );

  const textColumn = (
    <div className="px-4 md:ps-7">
      {description && (
        <p 
          className="text-body mb-8 leading-relaxed text-foreground"
          data-testid="text-certificate-description"
        >
          {description}
        </p>
      )}
      
      {benefits.length > 0 && (
        <div className="flex flex-col justify-center gap-3">
          {benefits.map((benefit, index) => {
            const iconSets = [
              [UserRound, FileText, Mic, HeartHandshake],
              [Target, Coins, Infinity, Users],
              [TrendingUp, Rocket, Crown, Briefcase],
              [Building2, Star, MessageCircle, Globe]
            ];
            const currentSet = iconSets[iconSetIndex % iconSets.length];
            const IconComponent = currentSet[index % currentSet.length];
            const isHiddenOnMobile = index >= visibleBenefitsCount && !isExpanded;
            return (
              <div 
                key={index} 
                className={`flex items-center gap-3 ${isHiddenOnMobile ? 'hidden md:flex' : ''}`}
                data-testid={`item-benefit-${index}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-primary flex-shrink-0">
                    <IconComponent size={20} />
                  </span>
                  <span className="w-px bg-border self-stretch flex-shrink-0"></span>
                  <span className="text-muted-foreground">{benefit.text}</span>
                </div>
              </div>
            );
          })}
          {benefits.length > visibleBenefitsCount && (
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden self-start text-primary"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid="button-see-more-benefits"
            >
              {isExpanded ? 'See less' : 'See more'}
              <ChevronDown 
                size={16} 
                className={`ml-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div 
      className="relative"
      data-testid="container-certificate-display"
    >
      {/* Background that covers full div on mobile, offset on desktop */}
      <div 
        className="absolute inset-y-0 lg:inset-y-7 bg-primary/5 rounded-3xl pointer-events-none"
        style={{ 
          left: '0',
          right: '0'
        }}
      />
      
      <div className="relative grid lg:grid-cols-2 gap-8 items-center pt-4 lg:pt-0">
        {isCertificateLeft ? (
          <>
            {certificateColumn}
            {textColumn}
          </>
        ) : (
          <>
            {textColumn}
            {certificateColumn}
          </>
        )}
      </div>
    </div>
  );
}
