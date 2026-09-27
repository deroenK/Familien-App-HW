import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, X, Users, ArrowRightLeft, Loader2, ChefHat,
} from "lucide-react";
import { api, apiError } from "../lib/api";
import { mondayOf, defaultWeekOffset, weekDates, formatShort, isoDate } from "../lib/dates";
import { WEEKDAYS, CATEGORIES } from "../lib/constants";

export default function MealPlan() {
  const [weekOffset, setWeekOffset] = useState(defaultWeekOffset());
  const [entries, setEntries] = useState({});
  const [holidays, setHolidays] = useState({});
  const [dishes, setDishes] = useState([]);
  const [persons, setPersons] = useState(Number(localStorage.getItem("persons") || 2));
  const [editing, setEditing] = useState(null); // {date, slot}
  const [dishModal, setDishModal] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const monday = mondayOf(weekOffset);
  const days = weekDates(monday);

  const load = useCallback(async () => {
    const start = isoDate(monday);
    const [mp, dsh] = await Promise.all([
      api.get(`/mealplan?start=${start}&days=7`),
      api.get("/dishes"),
    ]);
    setEntries(mp.data.entries);
    setDishes(dsh.data);
    const year = monday.getFullYear();
    const years = [...new Set([year, days[6].getFullYear()])];
    const hs = await Promise.all(years.map((y) => api.get(`/holidays?year=${y}`)));
    setHolidays(Object.assign({}, ...hs.map((r) => r.data)));
    // eslint-disable-next-line
  }, [weekOffset]);

  useEffect(() => { load(); }, [load]);

  const setPersonsPersist = (n) => { setPersons(n); localStorage.setItem("persons", n); };

  const slotDisplay = (d, slot) => {
    const iso = isoDate(d);
    const e = entries[iso]?.[slot];
    if (e?.name) return { text: e.name, hasEntry: true, dishId: e.dish_id };
    const wd = (d.getDay() + 6) % 7;
    const isHoliday = holidays[iso];
    if (slot === "lunch" && wd < 5 && !isHoliday) return { text: "Arbeit", hasEntry: false, isDefault: true };
    return { text: "", hasEntry: false };
  };

  const saveEntry = async (date, slot, name, dishId) => {
    await api.put("/mealplan/entry", { date, slot, name, dish_id: dishId || null });
    setEditing(null);
    load();
    toast.success("Gespeichert");
  };

  const deleteEntry = async (date, slot) => {
    await api.delete(`/mealplan/entry?date=${date}&slot=${slot}`);
    load();
  };

  const transfer = async () => {
    setTransferring(true);
    try {
      const { data } = await api.post(`/mealplan/to-shopping?start=${isoDate(monday)}&days=7&persons=${persons}`);
      toast.success(`${data.added} Zutaten in die Einkaufsliste übertragen`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Essensplan</h1>
        <button
          data-testid="manage-dishes-button"
          onClick={() => setDishModal(true)}
          className="rounded-xl px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-2"
        >
          <ChefHat className="h-4 w-4" /> Gerichte
        </button>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 border border-white/10">
          <button data-testid="tab-this-week" onClick={() => setWeekOffset(0)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${weekOffset === 0 ? "bg-amber-500 text-black" : "text-slate-300"}`}>Aktuelle Woche</button>
          <button data-testid="tab-next-week" onClick={() => setWeekOffset(1)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${weekOffset === 1 ? "bg-amber-500 text-black" : "text-slate-300"}`}>Nächste Woche</button>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white/5 p-1 border border-white/10">
          <Users className="h-4 w-4 text-slate-400 ml-2" />
          <button data-testid="persons-1" onClick={() => setPersonsPersist(1)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${persons === 1 ? "bg-emerald-500 text-black" : "text-slate-300"}`}>1 Person</button>
          <button data-testid="persons-2" onClick={() => setPersonsPersist(2)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${persons === 2 ? "bg-emerald-500 text-black" : "text-slate-300"}`}>2 Personen</button>
        </div>
      </div>

      {/* days */}
      <div className="space-y-3">
        {days.map((d, i) => {
          const iso = isoDate(d);
          const holiday = holidays[iso];
          return (
            <div key={iso} className="rounded-2xl border border-white/10 bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-heading font-semibold text-slate-100">{WEEKDAYS[i]}, {formatShort(d)}{d.getFullYear()}</span>
                {holiday && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">{holiday}</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {["lunch", "dinner"].map((slot) => {
                  const info = slotDisplay(d, slot);
                  return (
                    <div key={slot} className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{slot === "lunch" ? "Mittagessen" : "Abendessen"}</div>
                      {editing?.date === iso && editing?.slot === slot ? (
                        <EntryEditor
                          dishes={dishes}
                          initial={info.text}
                          onCancel={() => setEditing(null)}
                          onSave={(name, dishId) => saveEntry(iso, slot, name, dishId)}
                        />
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm ${info.text ? "text-slate-200" : "text-slate-600 italic"} ${info.isDefault ? "text-slate-400" : ""}`}>
                            {info.text || "frei"}
                          </span>
                          <div className="flex items-center gap-1">
                            <button data-testid={`edit-${iso}-${slot}`} onClick={() => setEditing({ date: iso, slot })} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-white/10 text-slate-400"><Pencil className="h-3.5 w-3.5" /></button>
                            {info.hasEntry && <button data-testid={`delete-${iso}-${slot}`} onClick={() => deleteEntry(iso, slot)} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-rose-500/10 text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        data-testid="transfer-to-shopping-button"
        onClick={transfer}
        disabled={transferring}
        className="w-full rounded-2xl py-4 font-semibold text-black transition-transform hover:scale-[1.005] flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg,#10B981,#059669)" }}
      >
        {transferring ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRightLeft className="h-5 w-5" />}
        Zutaten der Woche in Einkaufsliste übertragen
      </button>

      {dishModal && <DishManager dishes={dishes} onClose={() => { setDishModal(false); load(); }} />}
    </div>
  );
}

function EntryEditor({ dishes, initial, onCancel, onSave }) {
  const [text, setText] = useState(initial || "");
  const [dishId, setDishId] = useState("");
  return (
    <div className="space-y-2">
      <input
        data-testid="entry-name-input"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Gericht eingeben…"
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-amber-500/50"
      />
      {dishes.length > 0 && (
        <select
          data-testid="entry-dish-select"
          value={dishId}
          onChange={(e) => { setDishId(e.target.value); const dd = dishes.find((x) => x.id === e.target.value); if (dd) setText(dd.name); }}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none"
        >
          <option value="">Aus Gerichten wählen…</option>
          {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <button data-testid="entry-save" onClick={() => onSave(text, dishId)} className="flex-1 rounded-lg py-2 text-sm font-medium bg-amber-500 text-black">Speichern</button>
        <button onClick={onCancel} className="rounded-lg px-3 py-2 text-sm bg-white/5 text-slate-300"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function DishManager({ dishes, onClose }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState([]);

  const startNew = () => { setEditing("new"); setName(""); setIngredients([]); };
  const startEdit = (d) => { setEditing(d.id); setName(d.name); setIngredients(d.ingredients || []); };

  const addIng = () => setIngredients((x) => [...x, { name: "", category: CATEGORIES[0], amount1: "", amount2: "" }]);
  const updIng = (i, k, v) => setIngredients((x) => x.map((ing, idx) => idx === i ? { ...ing, [k]: v } : ing));
  const delIng = (i) => setIngredients((x) => x.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim()) return toast.error("Name fehlt");
    const body = { name, ingredients: ingredients.filter((i) => i.name.trim()) };
    if (editing === "new") await api.post("/dishes", body);
    else await api.put(`/dishes/${editing}`, body);
    toast.success("Gericht gespeichert");
    setEditing(null);
    onClose();
  };

  const remove = async (id) => { await api.delete(`/dishes/${id}`); toast.success("Gelöscht"); onClose(); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-card p-6 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl font-semibold">Gerichte verwalten</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>

        {editing ? (
          <div className="space-y-3">
            <input data-testid="dish-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name des Gerichts" className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-amber-500/50" />
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Zutaten (Menge für 1 / 2 Personen)</div>
              {ingredients.map((ing, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-start rounded-xl bg-white/[0.03] p-2">
                  <div className="space-y-1.5">
                    <input value={ing.name} onChange={(e) => updIng(i, "name", e.target.value)} placeholder="Zutat" className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-sm outline-none" />
                    <div className="grid grid-cols-3 gap-1.5">
                      <select value={ing.category} onChange={(e) => updIng(i, "category", e.target.value)} className="rounded-lg bg-white/5 border border-white/10 px-1.5 py-1.5 text-xs outline-none">
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input value={ing.amount1} onChange={(e) => updIng(i, "amount1", e.target.value)} placeholder="1 Pers." className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none" />
                      <input value={ing.amount2} onChange={(e) => updIng(i, "amount2", e.target.value)} placeholder="2 Pers." className="rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none" />
                    </div>
                  </div>
                  <button onClick={() => delIng(i)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-rose-500/10 text-rose-400 mt-0.5"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <button data-testid="add-ingredient" onClick={addIng} className="text-sm text-amber-400 flex items-center gap-1"><Plus className="h-4 w-4" /> Zutat hinzufügen</button>
            </div>
            <div className="flex gap-2 pt-2">
              <button data-testid="save-dish" onClick={save} className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-amber-500 text-black">Speichern</button>
              <button onClick={() => setEditing(null)} className="rounded-xl px-4 py-2.5 text-sm bg-white/5">Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <button data-testid="new-dish-button" onClick={startNew} className="w-full rounded-xl py-3 text-sm font-medium border border-dashed border-white/20 text-amber-400 flex items-center justify-center gap-2 hover:bg-white/5"><Plus className="h-4 w-4" /> Neues Gericht</button>
            {dishes.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                <div>
                  <div className="font-medium text-slate-100">{d.name}</div>
                  <div className="text-xs text-slate-500">{(d.ingredients || []).length} Zutaten</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(d)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 text-slate-400"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(d.id)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-rose-500/10 text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
