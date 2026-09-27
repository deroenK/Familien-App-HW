import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import Tesseract from "tesseract.js";
import {
  Plus, Trash2, Share2, BookOpen, Heart, Star, ChefHat, Plane, GraduationCap,
  Bold, Italic, Underline, List, ListOrdered, Type, PenTool, ScanText, Save, ChevronLeft, Loader2,
} from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const ICONS = { book: BookOpen, heart: Heart, star: Star, chef: ChefHat, plane: Plane, grad: GraduationCap };
const ICON_KEYS = Object.keys(ICONS);
const CW = 600, CH = 848;

export default function Notebook() {
  const { user } = useAuth();
  const [books, setBooks] = useState([]);
  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(null);

  const loadBooks = useCallback(async () => { const { data } = await api.get("/notebooks"); setBooks(data); }, []);
  useEffect(() => { loadBooks(); }, [loadBooks]);

  const openBook = async (b) => {
    setBook(b); setPage(null);
    const { data } = await api.get(`/notebooks/${b.id}/pages`);
    setPages(data);
  };

  const createBook = async () => {
    const title = window.prompt("Name des Buches:");
    if (!title) return;
    await api.post("/notebooks", { title, icon: ICON_KEYS[Math.floor(Math.random() * ICON_KEYS.length)] });
    loadBooks();
  };

  const share = async (b, e) => {
    e.stopPropagation();
    const { data } = await api.put(`/notebooks/${b.id}`, { shared: !b.shared });
    toast.success(data.shared ? "Buch geteilt" : "Teilen aufgehoben");
    loadBooks();
  };

  const delBook = async (b, e) => {
    e.stopPropagation();
    if (!window.confirm(`Buch "${b.title}" löschen?`)) return;
    await api.delete(`/notebooks/${b.id}`);
    if (book?.id === b.id) { setBook(null); setPages([]); }
    loadBooks();
  };

  const addPage = async () => {
    const { data } = await api.post(`/notebooks/${book.id}/pages`, {});
    setPages((p) => [...p, data]);
    setPage(data);
  };

  const delPage = async (p) => {
    if (!window.confirm("Seite löschen?")) return;
    await api.delete(`/pages/${p.id}`);
    setPages((x) => x.filter((y) => y.id !== p.id));
    if (page?.id === p.id) setPage(null);
  };

  // Book list view
  if (!book) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Notizbuch</h1>
          <button data-testid="create-book-button" onClick={createBook} className="rounded-xl px-4 py-2 text-sm font-medium bg-amber-500 text-black flex items-center gap-2"><Plus className="h-4 w-4" /> Neues Buch</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {books.map((b) => {
            const Icon = ICONS[b.icon] || BookOpen;
            return (
              <div key={b.id} data-testid={`book-${b.id}`} onClick={() => openBook(b)} className="group cursor-pointer rounded-2xl border border-white/10 bg-card/50 p-5 hover:border-white/20 hover:-translate-y-0.5 transition-all">
                <div className="h-12 w-12 rounded-xl grid place-items-center mb-3 bg-amber-500/15"><Icon className="h-6 w-6 text-amber-400" /></div>
                <div className="font-heading font-semibold text-slate-100 truncate">{b.title}</div>
                <div className="text-[11px] text-slate-500">{b.page_count} Seiten · {b.owner_name}</div>
                <div className="flex items-center gap-1 mt-3">
                  <button onClick={(e) => share(b, e)} title="Teilen" className={`h-7 px-2 rounded-lg text-[11px] flex items-center gap-1 ${b.shared ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-slate-400 hover:bg-white/10"}`}><Share2 className="h-3 w-3" /> {b.shared ? "Geteilt" : "Teilen"}</button>
                  {(b.is_owner || user?.role === "admin") && <button onClick={(e) => delBook(b, e)} className="h-7 w-7 grid place-items-center rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            );
          })}
          {books.length === 0 && <p className="col-span-full text-center text-slate-500 py-10">Noch keine Bücher. Erstelle dein erstes Buch.</p>}
        </div>
      </div>
    );
  }

  // Page editor view
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-3">
        <button data-testid="back-to-books" onClick={() => setBook(null)} className="h-9 w-9 grid place-items-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-50">{book.title}</h1>
      </div>

      {!page ? (
        <div className="space-y-2">
          <button data-testid="add-page-button" onClick={addPage} className="w-full rounded-xl py-3 text-sm font-medium border border-dashed border-white/20 text-amber-400 flex items-center justify-center gap-2 hover:bg-white/5"><Plus className="h-4 w-4" /> Neue Seite</button>
          {pages.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-card/50 px-4 py-3">
              <button data-testid={`page-${p.id}`} onClick={() => setPage(p)} className="flex-1 text-left text-sm text-slate-200">{p.title}</button>
              <button onClick={() => delPage(p)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {pages.length === 0 && <p className="text-center text-slate-500 py-6">Keine Seiten. Füge eine hinzu.</p>}
        </div>
      ) : (
        <PageEditor page={page} onBack={() => setPage(null)} onSaved={(pp) => { setPages((x) => x.map((y) => y.id === pp.id ? pp : y)); setPage(pp); }} />
      )}
    </div>
  );
}

function PageEditor({ page, onBack, onSaved }) {
  const [mode, setMode] = useState("text");
  const [title, setTitle] = useState(page.title);
  const [saving, setSaving] = useState(false);
  const [ocr, setOcr] = useState(false);
  const editorRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = page.content_html || "";
  }, [page.id]);

  const setupCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    c.width = CW; c.height = CH;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CW, CH);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0B0F17"; ctx.lineWidth = 3;
    ctxRef.current = ctx;
    if (page.canvas_data) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, CW, CH); img.src = page.canvas_data; }
  };
  useEffect(() => { if (mode === "draw") setTimeout(setupCanvas, 0); /* eslint-disable-next-line */ }, [mode]);

  const cpos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: (t.clientX - rect.left) * (CW / rect.width), y: (t.clientY - rect.top) * (CH / rect.height) };
  };
  const cdown = (e) => { e.preventDefault(); drawing.current = true; const p = cpos(e); ctxRef.current.beginPath(); ctxRef.current.moveTo(p.x, p.y); };
  const cmove = (e) => { if (!drawing.current) return; e.preventDefault(); const p = cpos(e); ctxRef.current.lineTo(p.x, p.y); ctxRef.current.stroke(); };
  const cup = () => { drawing.current = false; };

  const cmd = (c) => { document.execCommand(c, false, null); editorRef.current?.focus(); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { title, content_html: editorRef.current?.innerHTML ?? page.content_html };
      if (mode === "draw" && canvasRef.current) body.canvas_data = canvasRef.current.toDataURL("image/png");
      const { data } = await api.put(`/pages/${page.id}`, body);
      onSaved(data);
      toast.success("Seite gespeichert");
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const runOcr = async () => {
    if (!canvasRef.current) return;
    setOcr(true);
    try {
      const { data } = await Tesseract.recognize(canvasRef.current.toDataURL("image/png"), "deu+eng");
      const text = (data.text || "").trim();
      if (!text) { toast.error("Kein Text erkannt"); return; }
      setMode("text");
      setTimeout(() => {
        if (editorRef.current) editorRef.current.innerHTML += `<p>${text.replace(/\n/g, "<br/>")}</p>`;
      }, 50);
      toast.success("Handschrift erkannt");
    } catch (e) { toast.error("OCR fehlgeschlagen"); } finally { setOcr(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="h-9 w-9 grid place-items-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
        <input data-testid="page-title-input" value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 min-w-[140px] rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-amber-500/50" />
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 border border-white/10">
          <button data-testid="mode-text" onClick={() => setMode("text")} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${mode === "text" ? "bg-amber-500 text-black" : "text-slate-300"}`}><Type className="h-3.5 w-3.5" /> Text</button>
          <button data-testid="mode-draw" onClick={() => setMode("draw")} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${mode === "draw" ? "bg-amber-500 text-black" : "text-slate-300"}`}><PenTool className="h-3.5 w-3.5" /> Handschrift</button>
        </div>
        <button data-testid="save-page-button" onClick={save} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-500 text-black flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern</button>
      </div>

      {mode === "text" ? (
        <div>
          <div className="flex items-center gap-1 mb-2 rounded-xl bg-white/5 p-1 border border-white/10 w-fit">
            {[{ c: "bold", i: Bold }, { c: "italic", i: Italic }, { c: "underline", i: Underline }, { c: "insertUnorderedList", i: List }, { c: "insertOrderedList", i: ListOrdered }].map((b) => (
              <button key={b.c} data-testid={`fmt-${b.c}`} onClick={() => cmd(b.c)} className="h-9 w-9 grid place-items-center rounded-lg text-slate-300 hover:bg-white/10"><b.i className="h-4 w-4" /></button>
            ))}
          </div>
          <div
            ref={editorRef}
            data-testid="rich-text-editor"
            contentEditable
            suppressContentEditableWarning
            className="mx-auto w-full max-w-[600px] min-h-[600px] aspect-[210/297] bg-[#F8FAFC] text-[#0B0F17] rounded-xl p-8 outline-none overflow-auto shadow-2xl leading-relaxed"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
          />
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button data-testid="ocr-button" onClick={runOcr} disabled={ocr} className="rounded-xl px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2">{ocr ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />} Handschrift erkennen (OCR)</button>
            <span className="text-xs text-slate-500">Deutsch + Englisch</span>
          </div>
          <canvas
            ref={canvasRef}
            data-testid="handwriting-canvas"
            className="mx-auto w-full max-w-[600px] aspect-[210/297] bg-white rounded-xl touch-none shadow-2xl cursor-crosshair"
            onMouseDown={cdown} onMouseMove={cmove} onMouseUp={cup} onMouseLeave={cup}
            onTouchStart={cdown} onTouchMove={cmove} onTouchEnd={cup}
          />
        </div>
      )}
    </div>
  );
}
