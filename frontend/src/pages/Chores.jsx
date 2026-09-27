import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, RotateCcw, CheckCircle2, CircleUser } from "lucide-react";
import { api } from "../lib/api";

export default function Chores() {
  const [period, setPeriod] = useState("week");
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get(`/chores?period=${period}`);
    setItems(data);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post("/chores", { title: title.trim(), period });
    setTitle("");
    load();
  };

  const toggle = async (id) => { await api.put(`/chores/${id}/toggle`); load(); };
  const del = async (id) => { await api.delete(`/chores/${id}`); load(); };
  const reset = async () => {
    if (!window.confirm("Plan wirklich zurücksetzen? Alle Haken werden entfernt.")) return;
    await api.post(`/chores/reset?period=${period}`);
    toast.success("Plan zurückgesetzt");
    load();
  };

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Haushaltsplan</h1>
        <button data-testid="reset-chores-button" onClick={reset} className="rounded-xl px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Zurücksetzen</button>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 border border-white/10 w-fit">
        <button data-testid="tab-week" onClick={() => setPeriod("week")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === "week" ? "bg-amber-500 text-black" : "text-slate-300"}`}>Wöchentlich</button>
        <button data-testid="tab-month" onClick={() => setPeriod("month")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === "month" ? "bg-amber-500 text-black" : "text-slate-300"}`}>Monatlich</button>
      </div>

      {/* progress */}
      <div className={`rounded-3xl border p-5 transition-all ${allDone ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)]" : "border-white/10 bg-card/50"}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
            {allDone && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
            {allDone ? "Alle Aufgaben erledigt! 🎉" : `${doneCount} von ${total} erledigt`}
          </span>
          <span className={`font-heading font-bold text-lg ${allDone ? "text-emerald-400" : "text-amber-400"}`}>{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: allDone ? "linear-gradient(90deg,#10B981,#34D399)" : "linear-gradient(90deg,#F59E0B,#FBBF24)" }} />
        </div>
      </div>

      {/* add */}
      <form onSubmit={add} className="flex gap-2">
        <input data-testid="chore-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Neue Aufgabe…" className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-amber-500/50" />
        <button data-testid="add-chore-button" type="submit" className="rounded-xl px-4 bg-amber-500 text-black grid place-items-center"><Plus className="h-5 w-5" /></button>
      </form>

      {/* list */}
      <div className="space-y-2">
        {items.length === 0 && <p className="text-center text-slate-500 py-8">Noch keine Aufgaben. Füge oben welche hinzu.</p>}
        {items.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/50 px-4 py-3" data-testid={`chore-${c.id}`}>
            <button data-testid={`toggle-chore-${c.id}`} onClick={() => toggle(c.id)} className={`h-6 w-6 rounded-lg grid place-items-center border-2 transition-colors ${c.done ? "bg-emerald-500 border-emerald-500" : "border-white/20 hover:border-emerald-400"}`}>
              {c.done && <Check className="h-4 w-4 text-black" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm ${c.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{c.title}</div>
              {c.done && c.done_by && <div className="text-[11px] text-emerald-400/80 flex items-center gap-1 mt-0.5"><CircleUser className="h-3 w-3" /> erledigt von {c.done_by}</div>}
            </div>
            <button onClick={() => del(c.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
