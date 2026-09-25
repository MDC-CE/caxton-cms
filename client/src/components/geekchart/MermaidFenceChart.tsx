import { useState } from "react";
import { Geekchart } from "geekchart";
import "geekchart/fonts.css";

export {
  collectHastText,
  durationFromMeta,
  isMermaidCodeNode,
  remarkFenceMeta,
  speedFromMeta,
} from "./mermaidFence";

export interface MermaidFenceChartProps {
  source: string;
  speed?: number;
  duration?: number;
  /** Column width in CSS px the chart is laid out for. */
  display?: number;
  play?: "loop" | "once" | "in-view";
  motion?: boolean;
  /** List the renderer's warnings under the chart (writer-facing). */
  showWarnings?: boolean;
  /**
   * Second, unseen render at the phone column width — the only way to learn
   * that a chart will be "about N screens tall on a phone" (DESIGN 1.7).
   * Doubles the drawing work, so only authoring previews turn it on.
   */
  phoneCheck?: boolean;
  onError?: (error: Error) => void;
  onRender?: (info: { summary: string; cycle: number; warnings: string[] }) => void;
}

/** A ```mermaid fence drawn in the browser with geekchart. */
export function MermaidFenceChart({
  source,
  speed,
  duration,
  display = 612,
  play = "once",
  motion,
  showWarnings = false,
  phoneCheck = false,
  onError,
  onRender,
}: MermaidFenceChartProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [phoneWarnings, setPhoneWarnings] = useState<string[]>([]);
  const all = showWarnings ? [...warnings, ...phoneWarnings] : [];
  return (
    <figure className="geekchart">
      <Geekchart
        source={source}
        play={play}
        motion={motion}
        speed={duration ? undefined : speed}
        duration={duration}
        display={display}
        onError={onError}
        onRender={(info) => {
          setWarnings(info.warnings);
          onRender?.(info);
        }}
      />
      {phoneCheck && (
        <div style={{ display: "none" }} aria-hidden="true">
          <Geekchart
            source={source}
            motion={false}
            display={358}
            onRender={(info) => setPhoneWarnings(info.warnings.filter((w) => w.startsWith("1.7")))}
          />
        </div>
      )}
      {all.length > 0 && (
        <ul className="mt-2 text-xs text-muted-foreground list-disc pl-4">
          {all.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </figure>
  );
}
