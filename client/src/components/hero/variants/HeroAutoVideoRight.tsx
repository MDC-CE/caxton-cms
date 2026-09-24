import { createElement, useEffect, useState } from "react";
import { useInternalNav } from "@/hooks/useInternalNav";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { isLocalVideo } from "@/components/UniversalVideo";
import type { HeroAutoVideoRight as HeroAutoVideoRightData } from "@shared/schema";

interface HeroAutoVideoRightProps {
  data: HeroAutoVideoRightData;
}

/**
 * Copy on the left. The right side is a muted autoplaying video
 * that fades into the text (left on desktop, top on small screens).
 * Top-right and bottom-right corners are 20px.
 */
export default function HeroAutoVideoRight({ data }: HeroAutoVideoRightProps) {
  const handleLinkClick = useInternalNav();
  const titleHtml = (data.title ?? "").replace(/\sstyle="[^"]*"/gi, "");
  const videoUrl = data.video?.url?.trim() ?? "";
  const showVideo = videoUrl.length > 0 && isLocalVideo(videoUrl);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const playAmbient = Boolean(data.video?.autoplay) && !reduceMotion;

  return (
    <section data-testid="section-hero-auto-video-right" className="scroll-mt-24">
      <div>
        <div className="grid w-full grid-cols-1 md:grid-cols-[2fr_3fr] md:gap-x-gutter">
          <div className="flex flex-col gap-4 md:self-end md:pb-4">
            {data.eyebrow && (
              <p
                className="text-body-sm font-semibold text-primary"
                data-testid="text-hero-eyebrow"
              >
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-hidden />
                {data.eyebrow}
              </p>
            )}
            <h1
              className="m-0 text-foreground [&_em]:font-light [&_em]:not-italic [&_em]:text-primary"
              data-testid="text-hero-title"
              dangerouslySetInnerHTML={{ __html: titleHtml }}
            />
          </div>

          {showVideo && (
            <div
              className="max-md:order-3 md:row-span-2 md:col-start-2 md:row-start-1 flex items-center max-md:pt-6"
              data-testid="hero-auto-video-right"
            >
              <style>{`
                [data-testid="hero-auto-video-right"] .hero-auto-video-frame {
                  border-top-right-radius: 20px;
                  border-bottom-right-radius: 20px;
                  overflow: hidden;
                }
                [data-testid="hero-auto-video-right"] video {
                  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 32%);
                  mask-image: linear-gradient(to bottom, transparent 0%, black 32%);
                }
                @media (min-width: 768px) {
                  [data-testid="hero-auto-video-right"] video {
                    -webkit-mask-image: linear-gradient(to right, transparent 0%, black 46%);
                    mask-image: linear-gradient(to right, transparent 0%, black 46%);
                  }
                }
              `}</style>
              <div className="hero-auto-video-frame w-full">
              <video
                className="aspect-[16/10] w-full object-cover md:aspect-[4/3] md:max-h-[540px]"
                src={videoUrl}
                muted
                playsInline
                loop={data.video?.loop !== false}
                autoPlay={playAmbient}
                controls={reduceMotion}
                preload="metadata"
                aria-label={data.eyebrow || "Hero video"}
              />
              </div>
            </div>
          )}

          <div className="max-md:contents md:flex md:flex-col md:gap-[1.4rem] md:self-start md:pt-4">
            {data.body && (
              <p
                className="m-0 max-w-[65ch] text-body text-muted-foreground max-md:order-1 max-md:mt-4"
                data-testid="text-hero-body"
              >
                {data.body}
              </p>
            )}

            {data.cta_buttons && data.cta_buttons.length > 0 && (
              <div
                className="flex flex-wrap justify-start gap-3 max-md:order-2 max-md:mt-4"
                data-testid="hero-cta-buttons"
              >
                {data.cta_buttons.map((btn, i) => {
                  const external = /^https?:\/\//i.test(btn.url);
                  return (
                    <a
                      key={i}
                      href={btn.url}
                      onClick={handleLinkClick}
                      className={cn(
                        "site-action",
                        btn.variant === "primary" ? "site-action-primary" : "site-action-secondary",
                      )}
                      data-testid={`button-hero-cta-${i}`}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {btn.icon &&
                        (() => {
                          const Ic = getIcon(btn.icon);
                          return Ic ? (
                            <span aria-hidden="true" className="inline-flex">
                              {createElement(Ic, { className: "h-4 w-4" })}
                            </span>
                          ) : null;
                        })()}
                      {btn.text}
                    </a>
                  );
                })}
              </div>
            )}

            {data.stat && (
              <p
                className="m-0 text-body text-muted-foreground max-md:order-5 max-md:mt-4"
                data-testid="text-hero-stat"
              >
                <span className="[&_strong]:font-semibold [&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: data.stat }} />
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
