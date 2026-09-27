import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { CATEGORIES } from "../lib/constants";

export default function Shopping() {
  const [items, setItems] = useState([]);
  const [top, setTop] = useState([]);
  const [quick, setQuick] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);

  const load = useCallback(async () => {
    const [it, tp] = await Promise.all([api.get("/shopping"), api.get("/products/top")]);
    setItems(it.data);
    setTop(tp.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const existingNames = new Set(items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()));

  const add = async (name, cat) => {
    if (!name.trim()) return;
    await api.post("/shopping", { name: name.trim(), category: cat || category });
    setQuick("");
    load();
  };

  const toggle = async (id) => { await api.put(`/shopping/${id}/toggle`); load(); };
  const del = async (id) => { await api.delete(`/shopping/${id}`); load(); };
  const cleardone = async () => { await api.delete("/shopping"); load(); toast.success("Erledigte gelöscht"); };

  const grouped = {};
  items.filter((i) => !i.checked).forEach((i) => { (grouped[i.category] = grouped[i.category] || []).push(i); });
  const checked = items.filter((i) => i.checked);
  const orderedCats = CATEGORIES.filter((c) => grouped[c]);

  return (
    <div className="space-y-6 animate-fade-up">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Einkaufsliste</h1>

      {/* quick add */}
      <div className="rounded-2xl border border-white/10 bg-card/50 p-4 space-y-3">
        <form onSubmit={(e) => { e.preventDefault(); add(quick); }} className="flex gap-2">
          <input
            data-testid="quick-add-input"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Artikel tippen + Enter…"
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-amber-500/50"
          />
          <select data-testid="category-select" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none max-w-[130px]">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button data-testid="quick-add-button" type="submit" className="rounded-xl px-4 bg-amber-500 text-black grid place-items-center"><Plus className="h-5 w-5" /></button>
        </form>
      </div>

      {/* templates */}
      {top.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Häufig verwendet</div>
          <div className="flex flex-wrap gap-2">
            {top.map((p) => {
              const inList = existingNames.has(p.name.toLowerCase());
              return (
                <button
                  key={p.name}
                  data-testid={`template-${p.name}`}
                  onClick={() => add(p.name, p.category)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                    inList ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* list */}
      <div className="space-y-5">
        {orderedCats.length === 0 && checked.length === 0 && (
          <p className="text-center text-slate-500 py-10">Die Liste ist leer. Füge oben Artikel hinzu.</p>
        )}
        {orderedCats.map((cat) => (
          <div key={cat}>
            <div className="text-xs uppercase tracking-wider text-amber-400/80 font-semibold mb-1.5">{cat}</div>
            <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
              {grouped[cat].map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3" data-testid={`item-${i.id}`}>
                  <button data-testid={`toggle-${i.id}`} onClick={() => toggle(i.id)} className="h-5 w-5 rounded-md border-2 border-white/20 grid place-items-center hover:border-emerald-400 transition-colors" />
                  <span className="flex-1 text-sm text-slate-200">{i.name}</span>
                  <button onClick={() => del(i.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {checked.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Erledigt ({checked.length})</div>
              <button data-testid="clear-done-button" onClick={cleardone} className="text-xs text-rose-400 hover:text-rose-300">Erledigte löschen</button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-card/20 divide-y divide-white/5">
              {checked.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggle(i.id)} className="h-5 w-5 rounded-md bg-emerald-500 grid place-items-center"><Check className="h-3.5 w-3.5 text-black" /></button>
                  <span className="flex-1 text-sm text-slate-500 line-through">{i.name}</span>
                  <button onClick={() => del(i.id)} className="text-slate-600 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
