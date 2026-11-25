import React, { useMemo, useState } from "react";

const LAYER_STYLES = {
  entry: {
    label: "Entry / Core",
    fill: "#f59e0b",
    stroke: "#fde68a",
    glow: "rgba(245, 158, 11, 0.45)",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    edge: "rgba(52, 211, 153, 0.35)",
  },
  service: {
    label: "Services / Logic",
    fill: "#38bdf8",
    stroke: "#bae6fd",
    glow: "rgba(56, 189, 248, 0.45)",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    edge: "rgba(56, 189, 248, 0.32)",
  },
  ui: {
    label: "UI / Views",
    fill: "#a855f7",
    stroke: "#e9d5ff",
    glow: "rgba(168, 85, 247, 0.45)",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    edge: "rgba(192, 132, 252, 0.32)",
  },
  util: {
    label: "Utils / Data",
    fill: "#10b981",
    stroke: "#a7f3d0",
    glow: "rgba(16, 185, 129, 0.45)",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    edge: "rgba(52, 211, 153, 0.32)",
  },
};

function inferLayer(path = "", rawType = "") {
  const normalized = `${rawType} ${path}`.toLowerCase();
  if (normalized.includes("entry") || normalized.includes("main") || normalized.includes("app.")) {
    return "entry";
  }
  if (normalized.includes("component") || normalized.includes("ui") || normalized.includes("panel") || normalized.includes("view")) {
    return "ui";
  }
  if (normalized.includes("util") || normalized.includes("helper") || normalized.includes("model") || normalized.includes("schema") || normalized.includes("data")) {
    return "util";
  }
  return "service";
}

function normalizeGraphData(analysis, architecture) {
  const archObj = architecture && typeof architecture === "object" ? architecture : {};
  const sourceNodes =
    Array.isArray(archObj.nodes) && archObj.nodes.length
      ? archObj.nodes
      : Array.isArray(analysis?.files) && analysis.files.length
        ? analysis.files.slice(0, 36).map((f, idx) => {
            const path = typeof f === "string" ? f : f.path || f.name || `src/module_${idx + 1}.js`;
            return {
              id: path,
              label: path.split("/").pop(),
              path,
              layer: inferLayer(path, f.type || f.role || ""),
              loc: Number(f.lines || f.loc || 40 + ((idx * 29) % 260)),
              importsCount: Number(f.imports || (idx % 6) + 1),
            };
          })
        : null;

  if (sourceNodes) {
    const idSet = new Set(sourceNodes.map((n) => n.id));
    const rawEdges = Array.isArray(archObj.edges) ? archObj.edges : [];
    const validEdges = rawEdges
      .map((e, i) => ({
        id: e.id || `edge-${i}`,
        source: e.source || e.from,
        target: e.target || e.to,
      }))
      .filter((e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target);

    const fallbackEdges =
      validEdges.length > 0
        ? validEdges
        : sourceNodes.slice(1).map((node, i) => ({
            id: `auto-edge-${i}`,
            source: sourceNodes[i % Math.max(1, Math.min(4, sourceNodes.length))].id,
            target: node.id,
          }));

    return {
      nodes: sourceNodes.map((n, i) => ({
        id: n.id || `node-${i}`,
        label: n.label || n.name || (n.path ? n.path.split("/").pop() : `Node ${i + 1}`),
        path: n.path || n.id || `src/${n.label || `node-${i + 1}`}`,
        layer: LAYER_STYLES[n.layer] ? n.layer : inferLayer(n.path || n.label, n.layer || n.type),
        loc: Number(n.loc || n.lines || 60 + ((i * 23) % 240)),
        summary: n.summary || n.description || "Module participating in repository execution & data flow.",
      })),
      edges: fallbackEdges,
    };
  }

  // Fallback blueprint graph so the radial visualizer renders immediately
  const nodes = [
    { id: "src/App.jsx", label: "App.jsx", path: "src/App.jsx", layer: "entry", loc: 240, summary: "Root application shell, tab router, and analysis state coordinator." },
    { id: "backend/main.py", label: "main.py", path: "backend/main.py", layer: "entry", loc: 195, summary: "FastAPI entry point exposing repository analysis and report endpoints." },
    { id: "src/components/AnalyticsPanel.jsx", label: "AnalyticsPanel.jsx", path: "src/components/AnalyticsPanel.jsx", layer: "ui", loc: 165, summary: "Renders language distributions, commit velocity, and health metrics." },
    { id: "src/components/DonutChart.jsx", label: "DonutChart.jsx", path: "src/components/DonutChart.jsx", layer: "ui", loc: 95, summary: "SVG ring breakdown for language share and file composition." },
    { id: "src/components/ReportTab.jsx", label: "ReportTab.jsx", path: "src/components/ReportTab.jsx", layer: "ui", loc: 120, summary: "Triggers DOCX and PDF report generation from backend payloads." },
    { id: "src/components/ChatWidget.jsx", label: "ChatWidget.jsx", path: "src/components/ChatWidget.jsx", layer: "ui", loc: 150, summary: "Interactive repository Q&A assistant panel." },
    { id: "backend/services/analysis_service.py", label: "analysis_service.py", path: "backend/services/analysis_service.py", layer: "service", loc: 280, summary: "Orchestrates repository scanning, AST/language extraction, and caching." },
    { id: "backend/services/architecture_analyzer.py", label: "architecture_analyzer.py", path: "backend/services/architecture_analyzer.py", layer: "service", loc: 210, summary: "Builds dependency graph nodes, edges, and module layers." },
    { id: "backend/services/report_builder.py", label: "report_builder.py", path: "backend/services/report_builder.py", layer: "service", loc: 260, summary: "Exports formatted DOCX and PDF engineering reports." },
    { id: "src/utils/github.js", label: "github.js", path: "src/utils/github.js", layer: "util", loc: 88, summary: "Parses GitHub URLs and normalizes owner/repo identifiers." },
    { id: "src/utils/constants.js", label: "constants.js", path: "src/utils/constants.js", layer: "util", loc: 64, summary: "API endpoints, color palettes, and example repositories." },
    { id: "backend/utils/cache.py", label: "cache.py", path: "backend/utils/cache.py", layer: "util", loc: 75, summary: "In-memory / TTL cache for repeated repository scans." },
  ];

  const edges = [
    { id: "e1", source: "src/App.jsx", target: "src/components/AnalyticsPanel.jsx" },
    { id: "e2", source: "src/App.jsx", target: "src/components/ReportTab.jsx" },
    { id: "e3", source: "src/App.jsx", target: "src/components/ChatWidget.jsx" },
    { id: "e4", source: "src/App.jsx", target: "src/utils/github.js" },
    { id: "e5", source: "src/App.jsx", target: "src/utils/constants.js" },
    { id: "e6", source: "src/components/AnalyticsPanel.jsx", target: "src/components/DonutChart.jsx" },
    { id: "e7", source: "backend/main.py", target: "backend/services/analysis_service.py" },
    { id: "e8", source: "backend/main.py", target: "backend/services/report_builder.py" },
    { id: "e9", source: "backend/services/analysis_service.py", target: "backend/services/architecture_analyzer.py" },
    { id: "e10", source: "backend/services/analysis_service.py", target: "backend/utils/cache.py" },
  ];

  return { nodes, edges };
}

export default function ArchitecturePanel({ analysis = null, architecture = null }) {
  const { nodes, edges } = useMemo(
    () => normalizeGraphData(analysis, architecture),
    [analysis, architecture]
  );

  const [selectedLayer, setSelectedLayer] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id || null);
  const [zoom, setZoom] = useState(1);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return nodes.filter((n) => {
      const layerOk = selectedLayer === "all" || n.layer === selectedLayer;
      const queryOk = !q || n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q);
      return layerOk && queryOk;
    });
  }, [nodes, selectedLayer, searchQuery]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds]
  );

  // Arrange nodes radially around a circular arc / ring similar to the reference map
  const positionedNodes = useMemo(() => {
    const cx = 420;
    const cy = 320;
    const radius = 215;
    const count = Math.max(filteredNodes.length, 1);

    return filteredNodes.map((node, idx) => {
      const angle = -Math.PI * 0.85 + (idx / Math.max(count - 1, 1)) * (Math.PI * 1.65);
      const r = node.layer === "entry" ? radius * 0.68 : radius + ((idx % 3) - 1) * 18;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      const nodeRadius = Math.max(8, Math.min(20, 7 + Math.sqrt(node.loc) * 0.75));
      return { ...node, x, y, r: nodeRadius };
    });
  }, [filteredNodes]);

  const positionMap = useMemo(() => {
    const map = new Map();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  const activeNodeId = hoveredId || selectedId;
  const activeNode = positionedNodes.find((n) => n.id === activeNodeId) || positionedNodes[0] || null;

  const connectedIds = useMemo(() => {
    const set = new Set();
    if (!activeNodeId) return set;
    set.add(activeNodeId);
    visibleEdges.forEach((e) => {
      if (e.source === activeNodeId) set.add(e.target);
      if (e.target === activeNodeId) set.add(e.source);
    });
    return set;
  }, [activeNodeId, visibleEdges]);

  const incomingCount = activeNodeId
    ? visibleEdges.filter((e) => e.target === activeNodeId).length
    : 0;
  const outgoingCount = activeNodeId
    ? visibleEdges.filter((e) => e.source === activeNodeId).length
    : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 rounded-2xl border border-slate-800/90 bg-[#070b12] text-slate-100 p-4 shadow-2xl">
      {/* Left Sidebar: Layers, Stats & File Tree */}
      <aside className="xl:col-span-3 flex flex-col gap-3 rounded-xl border border-slate-800/80 bg-[#0b101b]/95 p-3.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
              Codebase Map
            </p>
            <h3 className="text-sm font-semibold text-white">Architecture Layers</h3>
          </div>
          <span className="rounded-md bg-slate-800/90 px-2 py-0.5 text-xs font-mono text-slate-300">
            {filteredNodes.length}/{nodes.length}
          </span>
        </div>

        {/* Mini KPI Strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 py-2 px-1">
            <div className="text-sm font-bold text-amber-400">{nodes.length}</div>
            <div className="text-[10px] text-slate-400">Nodes</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 py-2 px-1">
            <div className="text-sm font-bold text-emerald-400">{edges.length}</div>
            <div className="text-[10px] text-slate-400">Links</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 py-2 px-1">
            <div className="text-sm font-bold text-sky-400">4</div>
            <div className="text-[10px] text-slate-400">Layers</div>
          </div>
        </div>

        {/* Layer Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedLayer("all")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
              selectedLayer === "all"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50"
                : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
          >
            All
          </button>
          {Object.entries(LAYER_STYLES).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedLayer(selectedLayer === key ? "all" : key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition flex items-center gap-1.5 ${
                selectedLayer === key
                  ? cfg.badge
                  : "bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: cfg.fill }}
              />
              {cfg.label.split(" ")[0]}
            </button>
          ))}
        </div>

        {/* Filter Input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter files or modules..."
          className="w-full rounded-lg border border-slate-800 bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none"
        />

        {/* Module List */}
        <div className="flex-1 max-h-[340px] overflow-y-auto space-y-1 pr-1">
          {filteredNodes.map((node) => {
            const isSelected = node.id === activeNodeId;
            const style = LAYER_STYLES[node.layer] || LAYER_STYLES.service;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition border ${
                  isSelected
                    ? "bg-slate-800/90 border-emerald-500/40 text-white"
                    : "bg-transparent border-transparent text-slate-300 hover:bg-slate-900/80"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: style.fill }}
                  />
                  <span className="truncate font-mono">{node.label}</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">
                  {node.loc}L
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Center Canvas: Radial Dependency Visualizer */}
      <section className="xl:col-span-6 flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#05080f] p-3 relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/70 z-10">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-slate-300">
              Radial Dependency Topology
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))}
              className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              -
            </button>
            <span className="text-[11px] font-mono text-slate-400 w-11 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.15).toFixed(2))))}
              className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setSelectedLayer("all");
                setSearchQuery("");
              }}
              className="rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[420px] flex items-center justify-center overflow-hidden">
          <svg
            viewBox="0 0 840 640"
            className="w-full h-full max-h-[470px] transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            <defs>
              <radialGradient id="devflowBgGlow" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.08" />
                <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#05080f" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx="420" cy="320" r="275" fill="url(#devflowBgGlow)" />
            <circle
              cx="420"
              cy="320"
              r="215"
              fill="none"
              stroke="rgba(148, 163, 184, 0.12)"
              strokeDasharray="4 6"
            />
            <circle
              cx="420"
              cy="320"
              r="146"
              fill="none"
              stroke="rgba(148, 163, 184, 0.08)"
              strokeDasharray="2 6"
            />

            {/* Curved dependency arcs */}
            {visibleEdges.map((edge) => {
              const src = positionMap.get(edge.source);
              const dst = positionMap.get(edge.target);
              if (!src || !dst) return null;

              const isHighlighted =
                activeNodeId && (edge.source === activeNodeId || edge.target === activeNodeId);
              const ctrlX = 420 + ((src.x + dst.x) / 2 - 420) * 0.25;
              const ctrlY = 320 + ((src.y + dst.y) / 2 - 320) * 0.25;
              const d = `M ${src.x} ${src.y} Q ${ctrlX} ${ctrlY} ${dst.x} ${dst.y}`;

              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke={
                    isHighlighted
                      ? "#34d399"
                      : activeNodeId
                        ? "rgba(148, 163, 184, 0.08)"
                        : "rgba(52, 211, 153, 0.24)"
                  }
                  strokeWidth={isHighlighted ? 2.2 : 1.15}
                />
              );
            })}

            {/* Nodes */}
            {positionedNodes.map((node) => {
              const style = LAYER_STYLES[node.layer] || LAYER_STYLES.service;
              const isDimmed = activeNodeId && !connectedIds.has(node.id);
              const isSelected = node.id === activeNodeId;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => setSelectedId(node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="cursor-pointer transition-opacity duration-150"
                  style={{ opacity: isDimmed ? 0.22 : 1 }}
                >
                  {isSelected && (
                    <circle
                      r={node.r + 7}
                      fill="none"
                      stroke={style.fill}
                      strokeOpacity="0.45"
                      strokeWidth="2"
                    />
                  )}
                  <circle
                    r={node.r}
                    fill={style.fill}
                    stroke={isSelected ? "#ffffff" : style.stroke}
                    strokeWidth={isSelected ? 2.5 : 1.25}
                  />
                  <text
                    y={node.r + 14}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="10.5"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Right Inspector Drawer */}
      <aside className="xl:col-span-3 flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#0b101b]/95 p-3.5">
        {activeNode ? (
          <div className="space-y-4">
            <div className="border-b border-slate-800/80 pb-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    (LAYER_STYLES[activeNode.layer] || LAYER_STYLES.service).badge
                  }`}
                >
                  {(LAYER_STYLES[activeNode.layer] || LAYER_STYLES.service).label}
                </span>
                <span className="text-xs font-mono text-slate-400">{activeNode.loc} lines</span>
              </div>
              <h4 className="text-sm font-semibold text-white font-mono break-all">
                {activeNode.label}
              </h4>
              <p className="text-[11px] font-mono text-slate-400 break-all mt-0.5">
                {activeNode.path}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="text-xs text-slate-400">Imports / Out</div>
                <div className="text-base font-bold text-emerald-400 font-mono">
                  {outgoingCount}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                <div className="text-xs text-slate-400">Used By / In</div>
                <div className="text-base font-bold text-sky-400 font-mono">
                  {incomingCount}
                </div>
              </div>
            </div>

            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Role & Summary
              </h5>
              <p className="text-xs leading-relaxed text-slate-300 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
                {activeNode.summary}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-8 text-center">
            Select a module node to inspect its dependencies.
          </div>
        )}

        <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
          Tip: Hover or click any node to highlight incoming &amp; outgoing links.
        </div>
      </aside>
    </div>
  );
}