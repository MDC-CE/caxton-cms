import { createElement, useEffect, useMemo, useState } from "react";
import type { NumberedStepsPhotoTimeline } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { UniversalImage } from "@/components/UniversalImage";
import { useInternalNav } from "@/hooks/useInternalNav";
import { getIcon } from "@/lib/icons";
import { photoCornerRadiusClass, photoFrameKind, photoFrameOuterStyle } from "@/lib/photoFrame";
import { ceButtonUiVariant } from "@/lib/ceLandingUi";
import { cn } from "@/lib/utils";

function StepMarker({
  index,
  icon,
  showConnector,
  active,
}: {
  index: number;
  icon?: string;
  showConnector: boolean;
  active?: boolean;
}) {
  const Icon = icon?.trim() ? getIcon(icon.trim()) : null;
  return (
    <div className="flex w-10 flex-none flex-col items-center self-stretch">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-4 ring-background transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-primary/25 text-primary",
        )}
        aria-hidden
      >
        {Icon
          ? createElement(Icon, {
              className: "h-5 w-5",
              width: "20",
              height: "20",
              size: 20,
              strokeWidth: 2,
            })
          : (
            <span className="text-sm font-bold leading-none">{index + 1}</span>
            )}
      </span>
      {showConnector ? (
        <span
          className={cn("mt-1 w-0.5 flex-1", active ? "bg-primary/40" : "bg-border")}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function resolveSlides(data: NumberedStepsPhotoTimeline) {
  const fromPhotos = (data.photos ?? []).filter((p) => !!p.image_id?.trim());
  if (fromPhotos.length) return fromPhotos;
  if (data.image_id?.trim()) {
    return [{ image_id: data.image_id.trim(), image_alt: data.image_alt }];
  }
  return [];
}

export default function NumberedStepsPhotoTimeline({ data }: { data: NumberedStepsPhotoTimeline }) {
  const handleLinkClick = useInternalNav();
  const cta = data.cta;
  const frame = photoFrameOuterStyle(
    data.frame,
    data.frame_color || (photoFrameKind(data.frame) === "glow" ? "hsl(var(--primary))" : undefined),
    data.radius,
  );
  const corner = photoCornerRadiusClass(data.radius);
  const useIcons = data.steps.some((step) => !!step.icon?.trim());
  const ListTag = useIcons ? "ul" : "ol";
  const slides = useMemo(() => resolveSlides(data), [data]);
  const canRotate = slides.length > 1;
  const reduceMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const rotateMs = Math.round((data.rotate_seconds ?? 4) * 1000);
  const safeIndex = slides.length ? active % slides.length : 0;
  const current = slides[safeIndex];
  /** When photos align 1:1 with steps, highlight the matching step. */
  const highlightSteps = canRotate && slides.length === data.steps.length;

  useEffect(() => {
    if (!canRotate || reduceMotion) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, rotateMs);
    return () => window.clearInterval(id);
  }, [canRotate, reduceMotion, rotateMs, slides.length]);

  return (
    <section data-testid="section-numbered-photo-timeline">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.25fr)]">
        <div className={`mx-auto w-full max-w-sm md:mx-0 ${frame.className}`} style={frame.style}>
          <div className={`aspect-[4/5] min-h-0 overflow-hidden ${corner}`}>
            {current ? (
              <UniversalImage
                key={`${current.image_id}-${safeIndex}`}
                fit="cover"
                id={current.image_id}
                alt={current.image_alt}
                className="h-full w-full object-cover"
                sizes="(min-width: 679px) 28vw, 80vw"
                fieldContext={{
                  fieldPath: data.photos?.length ? `photos.${safeIndex}.image_id` : "image_id",
                }}
              />
            ) : data.image_id?.trim() ? (
              <UniversalImage
                fit="cover"
                id={data.image_id}
                alt={data.image_alt}
                className="h-full w-full object-cover"
                sizes="(min-width: 679px) 28vw, 80vw"
                fieldContext={{ fieldPath: "image_id" }}
              />
            ) : null}
          </div>
        </div>
        <div>
          {data.eyebrow ? (
            <span className="inline-flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.12em] text-primary before:h-0.5 before:w-6 before:bg-current before:content-['']">
              {data.eyebrow}
            </span>
          ) : null}
          <h2 className="mt-2 font-heading text-h2 text-foreground">{data.title}</h2>
          <ListTag className="mt-7 list-none space-y-6 p-0">
            {data.steps.map((step, index) => {
              const isActive = highlightSteps ? index === safeIndex : true;
              return (
                <li
                  key={step.title}
                  className={cn(
                    "flex items-start gap-4 transition-opacity",
                    highlightSteps && !isActive ? "opacity-45" : "opacity-100",
                  )}
                >
                  <StepMarker
                    index={index}
                    icon={step.icon}
                    showConnector={index < data.steps.length - 1}
                    active={isActive}
                  />
                  <div className="min-w-0 pt-1.5">
                    <strong className="block text-lg text-foreground">{step.title}</strong>
                    {step.text ? <p className="mt-1 text-muted-foreground">{step.text}</p> : null}
                  </div>
                </li>
              );
            })}
          </ListTag>
          {cta ? (
            <div className="mt-6">
              <Button variant={ceButtonUiVariant(data.button_style, cta)} size="lg" asChild>
                <a href={cta.url} onClick={handleLinkClick}>
                  {cta.text}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
