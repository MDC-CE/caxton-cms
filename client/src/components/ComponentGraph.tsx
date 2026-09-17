import { useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { ForceGraphMethods, NodeObject, LinkObject } from "react-force-graph-2d";
import type { ComponentPairing } from "@shared/schema";

interface GraphNode extends Record<string, unknown> {
  id: string;
  degree: number;
}

interface GraphLink extends Record<string, unknown> {
  source: string | GraphNode;
  target: string | GraphNode;
  frequency: number;
  pmi: number;
}

interface ComponentGraphProps {
  pairings: ComponentPairing[];
  onNodeClick?: (componentName: string | null) => void;
  selectedNode?: string | null;
}

type EdgeMode = "top20" | "top40" | "all";
const EDGE_MODE_LABELS: Record<EdgeMode, string> = {
  top20: "Top 20 edges",
  top40: "Top 40 edges",
  all: "All edges",
};

const FADE_OPACITY = 0.08;
const NODE_BASE_RADIUS = 3;
const LABEL_FONT_PX = 11;

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function cssColor(varName: string, alpha = 1): string {
  const val = getCssVar(varName);
  if (!val) return `hsla(0,0%,50%,${alpha})`;
  return alpha < 1 ? `hsla(${val},${alpha})` : `hsl(${val})`;
}

function nodeId(n: string | GraphNode): string {
  return typeof n === "object" ? n.id : n;
}

export default function ComponentGraph({
  pairings,
  onNodeClick,
  selectedNode,
}: ComponentGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>>>();
  const [width, setWidth] = useState(600);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("top20");

  // Responsive width via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Derived graph data
  const { nodes, links, neighborSet, maxDegree, hubThreshold } = (() => {
    // Sort by PMI descending and slice to the edge limit
    const sorted = [...pairings].sort((a, b) => b.pmi - a.pmi);
    const limitMap: Record<EdgeMode, number> = { top20: 20, top40: 40, all: Infinity };
    const limit = limitMap[edgeMode];
    const chosen = sorted.slice(0, limit);

    // Compute per-node degree from chosen edges only
    const degreeMap = new Map<string, number>();
    for (const p of chosen) {
      degreeMap.set(p.from, (degreeMap.get(p.from) ?? 0) + 1);
      degreeMap.set(p.to, (degreeMap.get(p.to) ?? 0) + 1);
    }
    // Seed all component names (so isolated nodes still appear)
    for (const p of pairings) {
      if (!degreeMap.has(p.from)) degreeMap.set(p.from, 0);
      if (!degreeMap.has(p.to)) degreeMap.set(p.to, 0);
    }

    // Only include nodes that participate in at least one chosen edge
    const nodes: GraphNode[] = Array.from(degreeMap.entries())
      .filter(([, degree]) => degree > 0)
      .map(([id, degree]) => ({ id, degree }));

    const links: GraphLink[] = chosen.map((p) => ({
      source: p.from,
      target: p.to,
      frequency: p.frequency,
      pmi: p.pmi,
    }));

    // Build adjacency for hover/highlight
    const neighborSet = new Map<string, Set<string>>();
    for (const p of chosen) {
      if (!neighborSet.has(p.from)) neighborSet.set(p.from, new Set());
      if (!neighborSet.has(p.to)) neighborSet.set(p.to, new Set());
      neighborSet.get(p.from)!.add(p.to);
      neighborSet.get(p.to)!.add(p.from);
    }

    // Hub threshold: top 20% by degree, min 2
    const sortedDeg = nodes.map((n) => n.degree).sort((a, b) => b - a);
    const maxDegree = Math.max(sortedDeg[0] ?? 1, 1);
    const q80idx = Math.floor(sortedDeg.length * 0.2);
    const hubThreshold = Math.max(2, sortedDeg[q80idx] ?? 2);

    return { nodes, links, neighborSet, maxDegree, hubThreshold };
  })();

  // Tune d3 charge + link distance on mount and when nodes change.
  // We also call zoomToFit here after a short delay so the initial layout
  // is visible rather than waiting for engine stop.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const charge = (fg as any).d3Force("charge");
    if (charge) charge.strength(-70).distanceMax(300);
    // Higher PMI → shorter distance (nodes pulled closer)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkForce = (fg as any).d3Force("link");
    if (linkForce?.distance) {
      linkForce.distance((l: GraphLink) =>
        Math.max(60, Math.min(220, 120 - (l.pmi ?? 0) * 40)),
      );
    }
    // Reheat so the new forces take effect
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fg as any).d3ReheatSimulation?.();
    // Zoom to fit after simulation has had time to settle
    const timer = setTimeout(() => {
      fg.zoomToFit(800, 52);
    }, 3000);
    return () => clearTimeout(timer);
  }, [nodes, links]);

  // Also zoom to fit when simulation fully stops
  const handleEngineStop = () => {
    graphRef.current?.zoomToFit(400, 48);
  };

  // Node radius: min 3px, max ~8px
  const nodeRadius = (n: GraphNode) => NODE_BASE_RADIUS + (n.degree / maxDegree) * NODE_BASE_RADIUS * 2.5;

  const isNeighbor = (a: string, b: string) => neighborSet.get(a)?.has(b) ?? false;

  // ── Color callbacks ──────────────────────────────────────────────────────

  const nodeColor = (raw: NodeObject<GraphNode>): string => {
    const n = raw as GraphNode;
    const focused = hoveredNode ?? selectedNode;
    if (!focused) return cssColor("--primary");
    if (n.id === focused) return cssColor("--primary");
    if (isNeighbor(focused, n.id)) return cssColor("--primary", 0.55);
    return cssColor("--primary", FADE_OPACITY);
  };

  const linkColor = (raw: LinkObject<GraphNode, GraphLink>): string => {
    const l = raw as GraphLink;
    const focused = hoveredNode ?? selectedNode;
    const src = nodeId(l.source);
    const tgt = nodeId(l.target);
    // Edges always use --muted-foreground so they're light in both themes
    if (!focused) return cssColor("--muted-foreground", 0.3);
    if (src === focused || tgt === focused) return cssColor("--primary", 0.75);
    return cssColor("--muted-foreground", FADE_OPACITY);
  };

  // ── Custom canvas node drawing ───────────────────────────────────────────

  const nodeCanvasObject = (raw: NodeObject<GraphNode>, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = raw as GraphNode & { x: number; y: number };
    const focused = hoveredNode ?? selectedNode;
    const r = nodeRadius(n);
    const isHub = n.degree >= hubThreshold;
    const isFocused = focused === n.id;
    const isNeighborOfFocus = focused ? isNeighbor(focused, n.id) : false;

    // Circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = nodeColor(raw);
    ctx.fill();

    // Outline ring for selected node
    if (selectedNode === n.id) {
      ctx.strokeStyle = cssColor("--primary");
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Labels — always visible for all nodes; faded for non-focused when something is focused
    {
      const fadeAlpha = focused && !isFocused && !isNeighborOfFocus ? FADE_OPACITY * 1.5 : 1;
      const fontWeight = isHub ? 600 : 400;
      const fontPx = (isHub ? LABEL_FONT_PX + 1 : LABEL_FONT_PX) / globalScale;
      ctx.font = `${fontWeight} ${fontPx}px Inter,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = n.y + r + 3 / globalScale;
      const textW = ctx.measureText(n.id).width;
      const padX = 3 / globalScale;
      const padY = 2 / globalScale;
      const boxH = fontPx + padY * 2;

      // Solid pill background for maximum contrast
      const bgAlpha = focused && !isFocused && !isNeighborOfFocus ? 0.06 : 0.88;
      ctx.fillStyle = cssColor("--background", bgAlpha);
      ctx.beginPath();
      const rx = boxH / 2;
      const bx = n.x - textW / 2 - padX;
      const by = labelY - padY;
      const bw = textW + padX * 2;
      ctx.roundRect(bx, by, bw, boxH, rx);
      ctx.fill();

      // Label text
      ctx.fillStyle = cssColor("--foreground", fadeAlpha);
      ctx.fillText(n.id, n.x, labelY);
    }
  };

  // ── Interaction handlers ─────────────────────────────────────────────────

  const handleNodeHover = (raw: NodeObject<GraphNode> | null) => {
    const n = raw as GraphNode | null;
    setHoveredNode(n ? n.id : null);
    if (containerRef.current) {
      containerRef.current.style.cursor = n ? "pointer" : "default";
    }
  };

  const handleNodeClick = (raw: NodeObject<GraphNode>) => {
    const n = raw as GraphNode;
    if (onNodeClick) onNodeClick(selectedNode === n.id ? null : n.id);
  };

  if (pairings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">No pairings to display in graph.</p>
    );
  }

  const modes: EdgeMode[] = ["top20", "top40", "all"];

  return (
    <div className="space-y-3">
      {/* Edge density control */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-muted-foreground">Edges:</span>
        <div className="flex rounded-md border overflow-hidden text-xs">
          {modes.map((mode) => (
            <button
              key={mode}
              onClick={() => setEdgeMode(mode)}
              className={[
                "px-2.5 py-1 transition-colors border-r last:border-r-0",
                mode === edgeMode
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
              data-testid={`button-edge-mode-${mode}`}
            >
              {EDGE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="w-full relative" style={{ minHeight: 480 }}>
        <ForceGraph2D
          ref={graphRef}
          width={width}
          height={480}
          graphData={{ nodes, links }}
          nodeId="id"
          nodeVal={(n) => (n as GraphNode).degree}
          nodeLabel={(n) => {
            const node = n as GraphNode;
            // Tooltip label only for non-hub nodes (hubs get canvas labels)
            return node.degree < hubThreshold ? node.id : "";
          }}
          nodeColor={nodeColor}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "replace"}
          linkWidth={(l) => {
            const link = l as GraphLink;
            // 0.5–2px range: thicker for higher-frequency pairs
            return Math.max(0.5, Math.min(2, link.frequency * 12));
          }}
          linkColor={linkColor}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onEngineStop={handleEngineStop}
          backgroundColor="transparent"
          cooldownTicks={250}
          d3AlphaDecay={0.022}
          d3VelocityDecay={0.3}
          enableZoomInteraction
          enablePanInteraction
        />
      </div>
    </div>
  );
}
