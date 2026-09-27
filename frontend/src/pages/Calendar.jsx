import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Cake } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { isoDate } from "../lib/dates";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const NOTIFY = [{ v: "", l: "Keine" }, { v: 3, l: "3h vorher" }, { v: 12, l: "12h vorher" }, { v: 24, l: "24h vorher" }, { v: 72, l: "72h vorher" }];

export default function CalendarPage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    const [ev, us] = await Promise.all([api.get("/events"), api.get("/users")]);
    setEvents(ev.data);
    setUsers(us.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWd = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // build events map (expand yearly birthdays)
  const eventsForDate = (iso) => {
    const [, m, d] = iso.split("-");
    return events.filter((e) => {
      if (e.yearly_repeat) {
        const [, em, ed] = e.date.split("-");
        return em === m && ed === d;
      }
      return e.date === iso;
    });
  };

  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthList = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = isoDate(new Date(year, month, d));
    const evs = eventsForDate(iso);
    if (evs.length) monthList.push({ iso, day: d, evs });
  }

  const remove = async (id) => { await api.delete(`/events/${id}`); load(); toast.success("Termin gelöscht"); };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Kalender</h1>
        <button data-testid="new-event-button" onClick={() => { setSelected(isoDate(new Date())); setModal(true); }} className="rounded-xl px-4 py-2 text-sm font-medium bg-amber-500 text-black flex items-center gap-2"><Plus className="h-4 w-4" /> Termin</button>
      </div>

      {/* month nav */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-4">
        <div className="flex items-center justify-between mb-4">
          <button data-testid="prev-month" onClick={() => setCursor(new Date(year, month - 1, 1))} className="h-9 w-9 grid place-items-center rounded-xl hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
          <div className="font-heading text-lg font-semibold">{MONTHS[month]} {year}</div>
          <button data-testid="next-month" onClick={() => setCursor(new Date(year, month + 1, 1))} className="h-9 w-9 grid place-items-center rounded-xl hover:bg-white/10"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WD.map((w) => <div key={w} className="text-center text-[11px] font-medium text-slate-500 py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = isoDate(d);
            const evs = eventsForDate(iso);
            const isToday = iso === isoDate(new Date());
            return (
              <button
                key={i}
                data-testid={`day-${iso}`}
                onClick={() => { setSelected(iso); setModal(true); }}
                className={`aspect-square rounded-xl p-1 flex flex-col items-center gap-0.5 transition-colors ${isToday ? "bg-amber-500/15 ring-1 ring-amber-500/40" : "hover:bg-white/5"}`}
              >
                <span className={`text-sm ${isToday ? "text-amber-400 font-bold" : "text-slate-300"}`}>{d.getDate()}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {evs.slice(0, 3).map((e) => <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* month list */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Termine im {MONTHS[month]}</div>
        {monthList.length === 0 && <p className="text-slate-500 text-sm py-4">Keine Termine in diesem Monat.</p>}
        {monthList.map(({ iso, day, evs }) => (
          <div key={iso} className="rounded-2xl border border-white/10 bg-card/40 p-3">
            <div className="text-sm font-medium text-slate-400 mb-2">{day}. {MONTHS[month]}</div>
            <div className="space-y-1.5">
              {evs.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2" data-testid={`event-${e.id}`}>
                  <span className="h-8 w-1 rounded-full" style={{ background: e.color }} />
                  {e.category === "birthday" && <Cake className="h-4 w-4 text-rose-400" />}
                  <div className="flex-1">
                    <div className="text-sm text-slate-200">{e.title}{e.time && <span className="text-slate-500 text-xs ml-2">{e.time}</span>}</div>
                    {e.user_name && <div className="text-[11px] text-slate-500">{e.user_name}</div>}
                  </div>
                  <button onClick={() => remove(e.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {modal && <EventModal date={selected} users={users} me={user} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />}
    </div>
  );
}

function EventModal({ date, users, me, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [d, setD] = useState(date);
  const [time, setTime] = useState("");
  const [category, setCategory] = useState("sonstiges");
  const [userId, setUserId] = useState(me?.id || "");
  const [yearly, setYearly] = useState(false);
  const [notify, setNotify] = useState("");

  const save = async () => {
    if (!title.trim()) return toast.error("Titel fehlt");
    try {
      await api.post("/events", {
        title, date: d, time, category,
        user_id: category === "birthday" ? null : userId,
        yearly_repeat: category === "birthday" ? true : yearly,
        notify_hours: notify === "" ? null : Number(notify),
      });
      toast.success("Termin erstellt");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-card p-6 space-y-3 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl font-semibold">Neuer Termin</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <input data-testid="event-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-amber-500/50" />
        <div className="grid grid-cols-2 gap-2">
          <input data-testid="event-date-input" type="date" value={d} onChange={(e) => setD(e.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none" />
          <input data-testid="event-time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none" />
        </div>
        <select data-testid="event-category-select" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none">
          <option value="sonstiges">Sonstiges</option>
          <option value="birthday">Geburtstag</option>
        </select>
        {category !== "birthday" && (
          <select data-testid="event-user-select" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none">
            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
          </select>
        )}
        {category !== "birthday" && (
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="rounded" /> Jährlich wiederholen</label>
        )}
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Push-Erinnerung</div>
          <select data-testid="event-notify-select" value={notify} onChange={(e) => setNotify(e.target.value)} className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none">
            {NOTIFY.map((n) => <option key={n.v} value={n.v}>{n.l}</option>)}
          </select>
        </div>
        <button data-testid="save-event-button" onClick={save} className="w-full rounded-xl py-3 font-semibold bg-amber-500 text-black">Termin speichern</button>
      </div>
    </div>
  );
}
