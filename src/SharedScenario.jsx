import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Activity, Sparkles, GitBranch } from 'lucide-react';
import { getScenarioBySlug } from './scenarios.js';
import {
  NODE_CATEGORIES, NODE_W, NODE_H, PORT_Y,
  WhiteboardNode, NodeCard, EdgesLayer, TextBlockEl,
  computeFunnel, fmt,
} from './FunnelLab.jsx';

/**
 * Public read-only view of a shared scenario.
 * Strips out: palette, save, edit, right-panel, all write affordances.
 * Keeps: canvas, Lab/Whiteboard toggle, pan, zoom, flow animation, headline metrics.
 */
export default function SharedScenario() {
  const { slug } = useParams();
  const [status, setStatus] = useState('loading'); // loading | ready | missing | error
  const [scenario, setScenario] = useState(null);
  const [viewMode, setViewMode] = useState('whiteboard'); // clients see whiteboard first
  const [animating, setAnimating] = useState(true);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [expandedNodeId, setExpandedNodeId] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const sc = await getScenarioBySlug(slug);
        if (!sc) setStatus('missing');
        else {
          setScenario(sc);
          setStatus('ready');
        }
      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    })();
  }, [slug]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setExpandedNodeId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { metrics, summary } = useMemo(() => {
    if (!scenario) return { metrics: {}, summary: {} };
    return computeFunnel(scenario.nodes, scenario.edges);
  }, [scenario]);

  const onCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current || e.target.dataset?.bg === '1') {
      setExpandedNodeId(null);
      setPanning({ startX: e.clientX, startY: e.clientY, origX: panOffset.x, origY: panOffset.y });
    }
  };

  const onCanvasMouseMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({
      x: (e.clientX - rect.left - panOffset.x) / zoom,
      y: (e.clientY - rect.top - panOffset.y) / zoom,
    });
    if (panning) {
      setPanOffset({
        x: panning.origX + (e.clientX - panning.startX),
        y: panning.origY + (e.clientY - panning.startY),
      });
    }
  };

  const onCanvasMouseUp = () => setPanning(null);

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setZoom(z => Math.max(0.4, Math.min(2, z * delta)));
    }
  };

  // Loading / error states
  if (status === 'loading') {
    return (
      <div className="w-full h-screen flex items-center justify-center text-zinc-500 text-sm" style={{ background: '#000' }}>
        Loading…
      </div>
    );
  }
  if (status === 'missing') {
    return (
      <div className="w-full h-screen flex items-center justify-center text-center px-6" style={{ background: '#000' }}>
        <div>
          <div className="text-zinc-400 text-lg mb-2">Scenario not found</div>
          <div className="text-zinc-600 text-sm">This link may have been unpublished or never existed.</div>
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="w-full h-screen flex items-center justify-center text-red-400 text-sm" style={{ background: '#000' }}>
        Something went wrong loading this scenario.
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col text-zinc-200 font-ui overflow-hidden select-none"
         style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "var(--bg-0)" }}>

      {/* Styles — mirrors the main app so rendering matches */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Azeret+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        :root {
          --brand: #ff5a00;
          --brand-bright: #ff7a2e;
          --brand-deep: #cc4800;
          --bg-0: #000000;
          --bg-1: #08070a;
          --bg-2: #0d0c10;
          --border-1: #1a1920;
          --border-2: #26242c;
        }
        .font-display { font-family: 'Azeret Mono', 'JetBrains Mono', monospace; letter-spacing: -0.04em; font-feature-settings: 'tnum' 1, 'ss01' 1; }
        .font-mono-data { font-family: 'JetBrains Mono', monospace; font-feature-settings: 'tnum' 1; }
        .grid-bg {
          background-image: radial-gradient(circle, rgba(255,90,0,0.045) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .paper-bg {
          background-color: #0e0b0a;
          background-image:
            radial-gradient(ellipse at 50% 50%, rgba(255,90,0,0.025), transparent 70%),
            radial-gradient(circle at 16px 16px, rgba(255,255,255,0.14) 1.2px, transparent 1.4px);
          background-size: auto, 32px 32px;
        }
        @keyframes flow {
          from { stroke-dashoffset: 20; }
          to   { stroke-dashoffset: 0; }
        }
        .edge-flow { stroke-dasharray: 4 6; animation: flow 1.2s linear infinite; }
        .text-block-inline :is(h1,h2,h3,p) { margin: 0; }
        .text-block-inline h1 { font-family: 'Space Grotesk', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; color: #fafaf9; }
        .text-block-inline h2 { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.15; color: #f4f4f5; }
        .text-block-inline h3 { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; color: #e4e4e7; text-transform: uppercase; }
        .text-block-inline p  { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 400; line-height: 1.55; color: #a1a1aa; }
        .text-block-inline b, .text-block-inline strong { color: #fafaf9; font-weight: 600; }
        .whiteboard .text-block-inline h1 { color: #ffffff; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 38px; letter-spacing: -0.02em; }
        .whiteboard .text-block-inline h2 { color: #f4f4f5; font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 26px; letter-spacing: -0.015em; }
        .whiteboard .text-block-inline h3 { color: #d4d4d8; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; }
        .whiteboard .text-block-inline p  { color: #a1a1aa; font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.55; }
        .whiteboard .text-block-inline b, .whiteboard .text-block-inline strong { color: #ffffff; }
      `}</style>

      {/* ---------- Public top bar ---------- */}
      <header className="flex items-center justify-between px-5 py-3 border-b z-30 relative"
              style={{ borderColor: "var(--border-1)", background: "rgba(5,4,7,0.92)", backdropFilter: "blur(10px)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #ff5a00 0%, #cc4800 100%)",
              boxShadow: "0 0 20px rgba(255,90,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <GitBranch size={15} className="text-black" strokeWidth={2.5}/>
          </div>
          <div className="leading-none">
            <div className="text-[15px] text-white font-display" style={{ fontWeight: 600 }}>
              {scenario.name}
            </div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500 mt-1">
              Shared by Digital Plane
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border overflow-hidden" style={{ borderColor: "var(--border-2)" }}>
            <button
              onClick={() => setViewMode("whiteboard")}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition ${viewMode === "whiteboard" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              style={viewMode === "whiteboard" ? { background: "rgba(255,90,0,0.12)", color: "var(--brand-bright)" } : { background: "var(--bg-2)" }}
            >
              <Sparkles size={11}/> Whiteboard
            </button>
            <button
              onClick={() => setViewMode("lab")}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition border-l ${viewMode === "lab" ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              style={{
                borderColor: "var(--border-2)",
                ...(viewMode === "lab" ? { background: "rgba(255,90,0,0.12)", color: "var(--brand-bright)" } : { background: "var(--bg-2)" })
              }}
            >
              <Activity size={11}/> Lab
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3 font-mono-data text-xs ml-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">REV</span>
              <span className="text-zinc-300">{fmt.money(summary.totalRevenue || 0)}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">ROAS</span>
              <span className="text-[color:var(--brand-bright)]">{fmt.x(summary.roas || 0)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- Canvas ---------- */}
      <main
        ref={canvasRef}
        data-bg="1"
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={onCanvasMouseUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex-1 relative overflow-hidden ${viewMode === "whiteboard" ? "paper-bg whiteboard" : "grid-bg"} ${panning ? "cursor-grabbing" : "cursor-grab"}`}
        style={viewMode === "lab"
          ? { background: "radial-gradient(ellipse at 85% 15%, rgba(255,90,0,0.06), transparent 55%), radial-gradient(ellipse at 15% 85%, rgba(255,90,0,0.03), transparent 60%), var(--bg-0)" }
          : {}
        }
      >
        {/* Digital Plane footer watermark */}
        <div className="absolute bottom-5 right-5 pointer-events-none select-none z-10">
          <div className="font-display text-[9px] tracking-[0.3em] uppercase"
               style={{ color: viewMode === "whiteboard" ? "rgba(255,255,255,0.18)" : "rgba(255,90,0,0.3)" }}>
            // funnel.digitalplane.pt
          </div>
        </div>

        <div
          data-bg="1"
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}
        >
          <EdgesLayer
            nodes={scenario.nodes}
            edges={scenario.edges}
            metrics={metrics}
            animating={animating && viewMode === "lab"}
            summary={summary}
            connecting={null}
            mousePos={mousePos}
            onRemoveEdge={() => {}}
            viewMode={viewMode}
          />

          {(scenario.textBlocks || []).map(block => (
            <TextBlockEl
              key={block.id}
              block={block}
              selected={false}
              onMouseDown={(e) => e.stopPropagation()}
              onSelect={() => {}}
              onChange={() => {}}
              onRemove={() => {}}
            />
          ))}

          {scenario.nodes.map(node => {
            const cat = NODE_CATEGORIES[node.category];
            const typeDef = cat.types[node.type];
            const m = metrics[node.id] || {};
            const commonProps = {
              node, cat, typeDef, m,
              selected: false,
              expanded: expandedNodeId === node.id,
              onToggleExpand: () => setExpandedNodeId(prev => prev === node.id ? null : node.id),
              onUpdateAssets: () => {}, // no-op for clients
              readonlyAssets: true,
              onMouseDown: (e) => e.stopPropagation(),
              onSelect: () => {},
              onStartConnect: () => {},
              onRemove: () => {},
              onRename: () => {},
            };
            return viewMode === "whiteboard"
              ? <WhiteboardNode key={node.id} {...commonProps} />
              : <NodeCard key={node.id} {...commonProps} />;
          })}
        </div>

        {/* Zoom control */}
        <div
          className="absolute bottom-5 left-5 flex items-center gap-1 rounded-md border overflow-hidden"
          style={{ borderColor: "var(--border-2)", background: "rgba(8,7,10,0.8)", backdropFilter: "blur(8px)" }}
        >
          <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="px-2 py-1 text-xs text-zinc-400 hover:text-white">−</button>
          <div className="px-2 text-xs font-mono-data text-zinc-400 min-w-[48px] text-center">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-2 py-1 text-xs text-zinc-400 hover:text-white">+</button>
          <button
            onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-[color:var(--brand-bright)] border-l"
            style={{ borderColor: "var(--border-2)" }}
          >fit</button>
        </div>
      </main>
    </div>
  );
}
