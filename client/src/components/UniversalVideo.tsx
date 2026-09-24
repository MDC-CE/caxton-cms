import React, { useRef, useState, createElement } from "react";
import { Play, VolumeX, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import SolidCard from './SolidCard';
import UniversalImage from './UniversalImage';
import { getIcon } from "@/lib/icons";

export interface VideoOverlayOnMuted {
  title?: string;
  subtitle?: string;
  icon?: string;
  restart_video_on_click?: boolean;
}

export interface VideoConfig {
  url: string;
  ratio?: string;
  muted?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  preview_image_url?: string;
  with_shadow_border?: boolean;
  open_modal_on_click?: boolean;
  overlay_on_muted?: VideoOverlayOnMuted;
}

interface UniversalVideoProps extends Omit<VideoConfig, 'with_shadow_border'> {
  className?: string;
  withShadowBorder?: boolean;
  useSolidCard?: boolean;
  bordered?: boolean;
  mobileRatio?: string;
  compactPlayButton?: boolean;
}

/** Shared helpers exported for callers and unit tests. */
export const isLocalVideo = (url: string): boolean => {
  const localExtensions = [".mp4", ".webm", ".mov", ".ogg", ".m4v"];
  const lowerUrl = url?.toLowerCase();
  return localExtensions.some(ext => lowerUrl?.endsWith(ext)) || 
         (url?.startsWith("/") && !url?.includes("youtube") && !url?.includes("vimeo"));
};

export const isYouTubeUrl = (url: string): boolean => {
  return url?.includes("youtube.com") || url?.includes("youtu.be");
};

/** Local files and YouTube can muted-autoplay inline. */
export function canAutoplayInline(url?: string | null): boolean {
  if (!url) return false;
  return isLocalVideo(url) || isYouTubeUrl(url);
}

export function shouldShowMutedOverlay(opts: {
  url?: string | null;
  autoplay?: boolean;
  overlay_on_muted?: VideoOverlayOnMuted | null;
}): boolean {
  const { url, autoplay, overlay_on_muted } = opts;
  if (!url || !autoplay || overlay_on_muted == null) return false;
  return canAutoplayInline(url);
}

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url?.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

const getYouTubeThumbnail = (videoId: string): string => {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
};

const parseRatio = (ratio?: string): { paddingTop: string } => {
  if (!ratio) return { paddingTop: "56.25%" };
  const [w, h] = ratio.split(":").map(Number);
  if (w && h) {
    return { paddingTop: `${(h / w) * 100}%` };
  }
  return { paddingTop: "56.25%" };
};

const parseRatioValue = (ratio?: string): number => {
  if (!ratio) return 16 / 9;
  const [w, h] = ratio.split(":").map(Number);
  if (w && h) return w / h;
  return 16 / 9;
};

const usesMobileLayout = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
};

export function UniversalVideo({
  url,
  ratio = "16:9",
  mobileRatio,
  muted = true,
  autoplay = false,
  loop = true,
  preview_image_url,
  className = "",
  withShadowBorder = false,
  useSolidCard = false,
  bordered = false,
  compactPlayButton = false,
  open_modal_on_click = true,
  overlay_on_muted,
}: UniversalVideoProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPlayingInline, setIsPlayingInline] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [modalStartUnmuted, setModalStartUnmuted] = useState(false);
  /** After closing open_modal_on_click, show thumbnail+play instead of frozen autoplay. */
  const [forcePreviewAfterModal, setForcePreviewAfterModal] = useState(false);
  /** Local-only: seek modal player to this time (0 = restart). */
  const [modalStartTime, setModalStartTime] = useState(0);
  const autoplayVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoId] = useState(() => `video-${Math.random().toString(36).substr(2, 9)}`);
  const aspectRatio = parseRatio(ratio);
  const mobileAspectRatio = mobileRatio ? parseRatio(mobileRatio) : null;
  const ratioValue = parseRatioValue(ratio);
  const borderClasses = bordered ? "border-2 border-muted-foreground/40 rounded-lg" : "";
  const playButtonSizeClasses = compactPlayButton ? "w-10 h-10 md:w-12 md:h-12" : "w-16 h-16 md:w-20 md:h-20";
  const playIconSizeClasses = compactPlayButton ? "w-5 h-5 md:w-6 md:h-6" : "w-8 h-8 md:w-10 md:h-10";
  /** Desktop: modal by default; explicit false keeps playback inline. Mobile preview stays inline. */
  const openInModal = open_modal_on_click !== false;
  
  const responsiveStyles = mobileAspectRatio ? `
    #${videoId} { padding-top: ${mobileAspectRatio.paddingTop}; }
    @media (min-width: 768px) { #${videoId} { padding-top: ${aspectRatio.paddingTop}; } }
  ` : null;

  if (!url || url === "null" || url === "undefined" || /\{\{.*\}\}/.test(url)) return null;

  const isYouTube = isYouTubeUrl(url);
  const youtubeId = isYouTube ? extractYouTubeId(url) : null;
  
  const thumbnailUrl = preview_image_url || (youtubeId ? getYouTubeThumbnail(youtubeId) : null);

  const showMutedOverlay = shouldShowMutedOverlay({
    url,
    autoplay,
    overlay_on_muted,
  }) && !overlayDismissed && !forcePreviewAfterModal;

  const handleClick = () => {
    // Re-open modal after closing an open_modal_on_click session.
    if (openInModal && forcePreviewAfterModal) {
      setModalStartTime(0);
      setModalStartUnmuted(true);
      setIsModalOpen(true);
      return;
    }
    // Mobile: always inline (existing behavior). Desktop: honor open_modal_on_click.
    if (usesMobileLayout() || !openInModal) {
      setIsPlayingInline(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleStopInline = () => {
    setIsPlayingInline(false);
  };

  const handleOverlayClick = () => {
    const videoEl = autoplayVideoRef.current;
    const shouldRestart = overlay_on_muted?.restart_video_on_click === true;
    // Same as preview play: mobile stays inline; desktop honors open_modal_on_click.
    const shouldOpenModal = openInModal && !usesMobileLayout();

    if (isLocalVideo(url) && videoEl) {
      if (shouldRestart) {
        videoEl.currentTime = 0;
      }
      videoEl.muted = false;
    }
    setOverlayDismissed(true);

    if (shouldOpenModal) {
      if (isLocalVideo(url) && videoEl) {
        const t = shouldRestart ? 0 : videoEl.currentTime;
        setModalStartTime(Number.isFinite(t) ? t : 0);
        videoEl.pause();
      } else {
        setModalStartTime(0);
      }
      setForcePreviewAfterModal(false);
      setModalStartUnmuted(true);
      setIsModalOpen(true);
      return;
    }

    if (isLocalVideo(url) && videoEl) {
      videoEl.controls = true;
      void videoEl.play().catch(() => {});
    }
    // YouTube: remount iframe without mute (user gesture allows sound).
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setModalStartUnmuted(false);
      setModalStartTime(0);
      // After open_modal_on_click, fall back to thumbnail + play so the user can reopen.
      if (openInModal && overlayDismissed) {
        setForcePreviewAfterModal(true);
      }
    }
  };

  const applyModalStartTime = (el: HTMLVideoElement | null) => {
    if (!el || !isLocalVideo(url)) return;
    const t = modalStartTime;
    if (t > 0) {
      const seek = () => {
        try {
          el.currentTime = t;
        } catch {
          /* ignore seek errors before ready */
        }
      };
      if (el.readyState >= 1) seek();
      else el.addEventListener("loadedmetadata", seek, { once: true });
    }
  };

  const buildYouTubeEmbedUrl = (
    ytId: string,
    opts: {
      forInline?: boolean;
      muted?: boolean;
      loop?: boolean;
      restart?: boolean;
      /** YouTube chrome; false hides the control bar (e.g. while muted overlay is up). */
      controls?: boolean;
    } = {},
  ): string => {
    const {
      forInline = false,
      muted: embedMuted = false,
      loop: embedLoop = false,
      restart = false,
      controls = true,
    } = opts;
    const domain = "https://www.youtube-nocookie.com";
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      playsinline: forInline || embedMuted ? "1" : "0",
    });
    if (embedMuted) params.set("mute", "1");
    if (!controls) params.set("controls", "0");
    if (embedLoop) {
      params.set("loop", "1");
      // YouTube requires playlist= itself for loop to work on a single video.
      params.set("playlist", ytId);
    }
    if (restart) params.set("start", "0");
    return `${domain}/embed/${ytId}?${params.toString()}`;
  };

  const renderMutedOverlayCard = () => {
    if (!overlay_on_muted) return null;
    const title = overlay_on_muted.title?.trim();
    const subtitle = overlay_on_muted.subtitle?.trim();
    const iconName = overlay_on_muted.icon?.trim();
    const IconComponent = iconName ? getIcon(iconName) : null;
    const ariaLabel = subtitle || title || "Unmute video";

    return (
      <button
        type="button"
        className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer bg-transparent border-0 p-0"
        onClick={handleOverlayClick}
        aria-label={ariaLabel}
        data-testid="video-muted-overlay"
      >
        <div
          className="pointer-events-none mx-4 flex max-w-sm flex-col items-center gap-3 rounded-xl bg-primary px-6 py-5 text-center text-primary-foreground shadow-lg border border-primary-foreground/20"
          data-testid="video-muted-overlay-card"
        >
          {title ? (
            <p className="text-sm font-semibold leading-snug md:text-base">{title}</p>
          ) : null}
          {IconComponent ? (
            <span aria-hidden className="inline-flex">
              {createElement(IconComponent, {
                className: "h-10 w-10 md:h-12 md:w-12",
              })}
            </span>
          ) : (
            <VolumeX className="h-10 w-10 md:h-12 md:w-12" aria-hidden />
          )}
          {subtitle ? (
            <p className="text-xs leading-snug opacity-90 md:text-sm">{subtitle}</p>
          ) : null}
        </div>
      </button>
    );
  };

  const renderInlinePlayer = () => {
    return (
      <>
        {responsiveStyles && <style>{responsiveStyles}</style>}
        <div
          id={mobileAspectRatio ? videoId : undefined}
          className={`relative overflow-hidden rounded-lg bg-black ${borderClasses} ${className}`}
          style={mobileAspectRatio ? undefined : aspectRatio}
          data-testid="video-inline-playing"
        >
          {isYouTube && youtubeId ? (
            <iframe
              src={buildYouTubeEmbedUrl(youtubeId, { forInline: true })}
              title="Video"
              className="absolute inset-0 w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              data-testid="video-inline-player"
            />
          ) : isLocalVideo(url) ? (
            <video
              src={url}
              autoPlay
              loop={loop}
              muted={muted}
              playsInline
              controls
              className="absolute inset-0 w-full h-full object-contain rounded-lg bg-black"
              data-testid="video-inline-player"
            />
          ) : (
            <iframe
              src={url}
              title="Video"
              className="absolute inset-0 w-full h-full rounded-lg"
              allowFullScreen
              data-testid="video-inline-player"
            />
          )}
          <button
            onClick={handleStopInline}
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
            data-testid="button-close-inline-video"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </>
    );
  };

  const renderPreview = () => {
    if (isPlayingInline) {
      return renderInlinePlayer();
    }

    if (thumbnailUrl) {
      return (
        <>
          {responsiveStyles && <style>{responsiveStyles}</style>}
          <div 
            id={mobileAspectRatio ? videoId : undefined}
            className={`relative overflow-hidden rounded-lg cursor-pointer group ${borderClasses} ${className}`}
            style={mobileAspectRatio ? undefined : aspectRatio}
            onClick={handleClick}
            data-testid="video-preview"
          >
          <div className="absolute inset-0">
            <UniversalImage
              id={thumbnailUrl}
              alt="Video preview"
              className="w-full h-full"
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 800px"
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className={`${playButtonSizeClasses} rounded-full bg-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
              <Play className={`fill-current ${playIconSizeClasses} text-primary-foreground ml-1`} />
            </div>
          </div>
        </div>
        </>
      );
    }

    return (
      <>
        {responsiveStyles && <style>{responsiveStyles}</style>}
        <div 
          id={mobileAspectRatio ? videoId : undefined}
          className={`relative overflow-hidden rounded-lg cursor-pointer group bg-muted ${borderClasses} ${className}`}
          style={mobileAspectRatio ? undefined : aspectRatio}
          onClick={handleClick}
          data-testid="video-placeholder"
        >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className={`${playButtonSizeClasses} rounded-full bg-primary/80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
            <Play className={`fill-current ${playIconSizeClasses} text-primary-foreground ml-1`} />
          </div>
          <p className="text-sm text-muted-foreground text-center px-4">
            Video preview not available
          </p>
        </div>
      </div>
      </>
    );
  };

  const renderModalPlayer = () => {
    if (isYouTube && youtubeId) {
      return (
        <iframe
          src={buildYouTubeEmbedUrl(youtubeId, {
            muted: false,
            loop,
            restart: overlay_on_muted?.restart_video_on_click === true,
          })}
          title="Video"
          className="w-full h-full rounded-lg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-testid="video-modal-player"
        />
      );
    }

    if (isLocalVideo(url)) {
      return (
        <video
          ref={(el) => {
            modalVideoRef.current = el;
            applyModalStartTime(el);
          }}
          key={`modal-${modalStartTime}`}
          src={url}
          autoPlay
          loop={loop}
          muted={modalStartUnmuted ? false : muted}
          playsInline
          controls
          className="w-full h-full object-contain rounded-lg"
          data-testid="video-modal-player"
        />
      );
    }

    return (
      <iframe
        src={url}
        title="Video"
        className="w-full h-full rounded-lg"
        allowFullScreen
        data-testid="video-modal-player"
      />
    );
  };

  const renderAutoplayInlineVideo = () => {
    // Force muted while overlay is visible (browser autoplay policy + UX).
    const effectivelyMuted = showMutedOverlay ? true : muted;
    const showControls =
      overlayDismissed &&
      isLocalVideo(url) &&
      (!openInModal || usesMobileLayout());
    // YouTube autoplay is always muted until the overlay is dismissed (browser policy).
    // Without an overlay, stay muted for the whole autoplay session.
    const youtubeMuted = overlay_on_muted ? !overlayDismissed : true;

    return (
      <>
        {responsiveStyles && <style>{responsiveStyles}</style>}
        <div 
          id={mobileAspectRatio ? videoId : undefined}
          className={`relative overflow-hidden rounded-lg ${borderClasses} ${className}`}
          style={mobileAspectRatio ? undefined : aspectRatio}
          data-testid="video-inline"
        >
          {isYouTube && youtubeId ? (
            <iframe
              key={overlayDismissed ? "yt-unmuted" : "yt-muted"}
              src={buildYouTubeEmbedUrl(youtubeId, {
                forInline: true,
                muted: youtubeMuted,
                loop,
                // Hide YT chrome while the muted overlay card is up; restore after click.
                controls: !showMutedOverlay,
                restart:
                  overlayDismissed &&
                  overlay_on_muted?.restart_video_on_click === true,
              })}
              title="Video"
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              data-testid="video-inline-youtube"
            />
          ) : (
            <video
              ref={autoplayVideoRef}
              src={url}
              autoPlay
              loop={loop}
              muted={effectivelyMuted}
              playsInline
              controls={showControls}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {showMutedOverlay ? renderMutedOverlayCard() : null}
        </div>
      </>
    );
  };

  const shouldPlayInline = Boolean(
    autoplay &&
      canAutoplayInline(url) &&
      (!isYouTube || youtubeId) &&
      !forcePreviewAfterModal,
  );

  const previewContent = shouldPlayInline ? renderAutoplayInlineVideo() : renderPreview();

  const wrappedPreview = (withShadowBorder || useSolidCard) ? (
    <SolidCard className="!p-0 !min-h-0 overflow-hidden">
      {previewContent}
    </SolidCard>
  ) : previewContent;

  // Autoplay used to return early and never mount Dialog. Mount it when
  // open_modal_on_click can open the modal after unmute (or reopen from preview).
  const needsModal =
    !shouldPlayInline || openInModal || forcePreviewAfterModal;

  if ((shouldPlayInline || isPlayingInline) && !needsModal) {
    return wrappedPreview;
  }

  if (shouldPlayInline || isPlayingInline || forcePreviewAfterModal) {
    return (
      <>
        {wrappedPreview}
        <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
          <DialogContent 
            className="p-4 bg-black border-none overflow-hidden flex items-center justify-center"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              width: `min(90vw, calc(85vh * ${ratioValue}))`,
              height: `min(85vh, calc(90vw / ${ratioValue}))`,
            }}
            aria-describedby={undefined}
          >
            <VisuallyHidden>
              <DialogTitle>Video Player</DialogTitle>
            </VisuallyHidden>
            <div className="w-full h-full">
              {isModalOpen && renderModalPlayer()}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {wrappedPreview}
      
      <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent 
          className="p-4 bg-black border-none overflow-hidden flex items-center justify-center"
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            width: `min(90vw, calc(85vh * ${ratioValue}))`,
            height: `min(85vh, calc(90vw / ${ratioValue}))`,
          }}
          aria-describedby={undefined}
        >
          <VisuallyHidden>
            <DialogTitle>Video Player</DialogTitle>
          </VisuallyHidden>
          <div className="w-full h-full">
            {isModalOpen && renderModalPlayer()}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UniversalVideo;
