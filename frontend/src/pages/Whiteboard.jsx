import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Pen, Highlighter, Eraser, Minus, Square, Circle, Undo2, Redo2, Download, Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const BG = "#0B0F17";
const TOOLS = [
  { id: "pen", label: "Stift", icon: Pen },
  { id: "marker", label: "Marker", icon: Highlighter },
  { id: "eraser", label: "Radierer", icon: Eraser },
  { id: "line", label: "Linie", icon: Minus },
  { id: "rect", label: "Rechteck", icon: Square },
  { id: "circle", label: "Kreis", icon: Circle },
];

export default function Whiteboard() {
  const { user } = useAuth();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const strokesRef = useRef([]);
  const redoRef = useRef([]);
  const drawing = useRef(false);
  const startPt = useRef(null);
  const curPoints = useRef([]);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(user?.color || "#F59E0B");
  const [size, setSize] = useState(4);
  const toolRef = useRef(tool); const colorRef = useRef(color); const sizeRef = useRef(size);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { sizeRef.current = size; }, [size]);

  const drawStroke = (ctx, s) => {
    const st = s.stroke;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = st.size;
    ctx.strokeStyle = st.tool === "eraser" ? BG : s.color;
    ctx.fillStyle = s.color;
    if (st.tool === "marker") ctx.globalAlpha = 0.35;
    if (st.tool === "line") {
      ctx.beginPath(); ctx.moveTo(st.x0, st.y0); ctx.lineTo(st.x1, st.y1); ctx.stroke();
    } else if (st.tool === "rect") {
      ctx.strokeRect(st.x0, st.y0, st.x1 - st.x0, st.y1 - st.y0);
    } else if (st.tool === "circle") {
      const r = Math.hypot(st.x1 - st.x0, st.y1 - st.y0);
      ctx.beginPath(); ctx.arc(st.x0, st.y0, r, 0, Math.PI * 2); ctx.stroke();
    } else {
      const pts = st.points || [];
      if (pts.length) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const redraw = useCallback(() => {
    const ctx = ctxRef.current, canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((s) => drawStroke(ctx, s));
  }, []);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    canvas.width = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
    ctxRef.current = canvas.getContext("2d");
    redraw();
  }, [redraw]);

  useEffect(() => {
    fitCanvas();
    const ro = new ResizeObserver(fitCanvas);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [fitCanvas]);

  // realtime sync via WebSocket
  useEffect(() => {
    let ws;
    let closed = false;
    (async () => {
      try { const { data } = await api.get("/whiteboard"); strokesRef.current = data; redraw(); } catch {}
      const wsUrl = `${process.env.REACT_APP_BACKEND_URL.replace(/^http/, "ws")}/api/ws/whiteboard`;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.type === "add") {
            if (!strokesRef.current.some((s) => s.id === msg.item.id)) {
              strokesRef.current = [...strokesRef.current, msg.item]; redraw();
            }
          } else if (msg.type === "delete") {
            strokesRef.current = strokesRef.current.filter((s) => s.id !== msg.id); redraw();
          } else if (msg.type === "clear") {
            strokesRef.current = []; redraw();
          }
        };
      } catch {}
    })();
    return () => { closed = true; if (ws) ws.close(); void closed; };
  }, [redraw]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const down = (e) => {
    e.preventDefault();
    drawing.current = true;
    const p = pos(e);
    startPt.current = p;
    curPoints.current = [p];
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const t = toolRef.current;
    if (["pen", "marker", "eraser"].includes(t)) {
      curPoints.current.push(p);
      redraw();
      drawStroke(ctxRef.current, { color: colorRef.current, stroke: { tool: t, size: sizeRef.current, points: curPoints.current } });
    } else {
      redraw();
      drawStroke(ctxRef.current, { color: colorRef.current, stroke: { tool: t, size: sizeRef.current, x0: startPt.current.x, y0: startPt.current.y, x1: p.x, y1: p.y } });
    }
  };

  const up = async (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    const p = pos(e);
    const t = toolRef.current;
    let stroke;
    if (["pen", "marker", "eraser"].includes(t)) {
      if (curPoints.current.length < 2) curPoints.current.push({ x: p.x + 0.1, y: p.y + 0.1 });
      stroke = { tool: t, size: sizeRef.current, points: curPoints.current };
    } else {
      stroke = { tool: t, size: sizeRef.current, x0: startPt.current.x, y0: startPt.current.y, x1: p.x, y1: p.y };
    }
    const item = { id: crypto.randomUUID(), color: colorRef.current, stroke, user_name: user?.name };
    strokesRef.current = [...strokesRef.current, item];
    redoRef.current = [];
    redraw();
    try { await api.post("/whiteboard", { id: item.id, stroke, color: item.color }); } catch {}
  };

  const undo = async () => {
    const s = strokesRef.current[strokesRef.current.length - 1];
    if (!s) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, s].slice(-30);
    redraw();
    try { await api.delete(`/whiteboard/${s.id}`); } catch {}
  };

  const redo = async () => {
    const s = redoRef.current[redoRef.current.length - 1];
    if (!s) return;
    redoRef.current = redoRef.current.slice(0, -1);
    strokesRef.current = [...strokesRef.current, s];
    redraw();
    try { await api.post("/whiteboard", { id: s.id, stroke: s.stroke, color: s.color }); } catch {}
  };

  const clearAll = async () => {
    if (!window.confirm("Whiteboard wirklich leeren?")) return;
    strokesRef.current = []; redoRef.current = []; redraw();
    await api.delete("/whiteboard");
    toast.success("Whiteboard geleert");
  };

  const exportPng = () => {
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `whiteboard-${Date.now()}.png`; a.click();
    toast.success("Als PNG gespeichert");
  };

  const notify = async () => { await api.post("/whiteboard/notify"); toast.success("Benachrichtigung gesendet"); };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Whiteboard</h1>
        <button data-testid="notify-whiteboard-button" onClick={notify} className="text-sm text-amber-400 hover:text-amber-300">Familie benachrichtigen</button>
      </div>

      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-white/10 bg-card/50 p-2">
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} data-testid={`tool-${t.id}`} title={t.label} onClick={() => setTool(t.id)}
              className={`h-10 w-10 grid place-items-center rounded-xl transition-colors ${tool === t.id ? "bg-amber-500 text-black" : "text-slate-300 hover:bg-white/10"}`}>
              <t.icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <div className="w-px h-8 bg-white/10" />
        <input data-testid="color-picker" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 rounded-xl bg-transparent border border-white/10 cursor-pointer" />
        <div className="flex items-center gap-2 px-2">
          <input data-testid="size-slider" type="range" min="1" max="40" value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-amber-500" />
          <span className="text-xs text-slate-400 w-6">{size}</span>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <button data-testid="undo-button" onClick={undo} className="h-10 w-10 grid place-items-center rounded-xl text-slate-300 hover:bg-white/10"><Undo2 className="h-5 w-5" /></button>
        <button data-testid="redo-button" onClick={redo} className="h-10 w-10 grid place-items-center rounded-xl text-slate-300 hover:bg-white/10"><Redo2 className="h-5 w-5" /></button>
        <div className="flex-1" />
        <button data-testid="export-png-button" onClick={exportPng} className="h-10 px-3 rounded-xl text-slate-300 hover:bg-white/10 flex items-center gap-2 text-sm"><Download className="h-4 w-4" /> PNG</button>
        <button data-testid="clear-whiteboard-button" onClick={clearAll} className="h-10 px-3 rounded-xl text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 text-sm"><Trash2 className="h-4 w-4" /> Leeren</button>
      </div>

      {/* canvas */}
      <div ref={wrapRef} className="rounded-2xl border border-white/10 overflow-hidden" style={{ height: "min(70vh, 640px)", background: BG }}>
        <canvas
          ref={canvasRef}
          data-testid="whiteboard-canvas"
          className="touch-none block w-full h-full cursor-crosshair"
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}
        />
      </div>
      <p className="text-xs text-slate-500">Deine Stiftfarbe entspricht deiner Profilfarbe. Zeichnungen werden für alle Familienmitglieder synchronisiert.</p>
    </div>
  );
}
