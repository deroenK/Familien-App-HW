import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Cake, CalendarPlus, RefreshCw } from "lucide-react";
import { api, apiError } from "../lib/api";
import { isoDate } from "../lib/dates";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const UNITS = [{ v: "minutes", l: "Minuten" }, { v: "hours", l: "Stunden" }, { v: "days", l: "Tage" }];

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(false);
  const [gConnected, setGConnected] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get("/events");
    setEvents(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/google/status").then(({ data }) => setGConnected(data.connected)).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      window.history.replaceState({}, "", "/kalender");
      setGConnected(true);
      api.post("/google/sync").then(({ data }) => { toast.success(`Google verbunden – ${data.pulled} geladen, ${data.pushed} gesendet`); load(); }).catch(() => {});
    } else if (params.get("google") === "error") {
      window.history.replaceState({}, "", "/kalender");
      toast.error("Google-Verbindung fehlgeschlagen");
    }
  }, [load]);

  const googleConnect = async () => { const { data } = await api.get("/google/login"); window.location.href = data.authorization_url; };
  const googleSync = async () => { try { const { data } = await api.post("/google/sync"); toast.success(`${data.pulled} geladen, ${data.pushed} gesendet`); load(); } catch (e) { toast.error(apiError(e)); } };
  const googleDisconnect = async () => { await api.post("/google/disconnect"); setGConnected(false); toast.success("Google getrennt"); };

  const subscribe = async () => {
    const { data } = await api.get("/calendar/feed");
    const url = `${process.env.REACT_APP_BACKEND_URL}${data.path}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    window.prompt("Diesen Link in Apple/Google Kalender als Abo-Kalender hinzufügen:", url);
    toast.success("Abo-Link bereit");
  };

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
        <div className="flex items-center gap-2 flex-wrap">
          {gConnected ? (
            <>
              <button data-testid="google-sync-button" onClick={googleSync} className="rounded-xl px-3 py-2 text-sm font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Google Sync</button>
              <button data-testid="google-disconnect-button" onClick={googleDisconnect} className="rounded-xl px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10">Trennen</button>
            </>
          ) : (
            <button data-testid="google-connect-button" onClick={googleConnect} className="rounded-xl px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Google verbinden</button>
          )}
          <button data-testid="subscribe-calendar-button" onClick={subscribe} className="rounded-xl px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><CalendarPlus className="h-4 w-4" /> Abonnieren</button>
          <button data-testid="new-event-button" onClick={() => { setSelected(isoDate(new Date())); setModal(true); }} className="rounded-xl px-4 py-2 text-sm font-medium bg-amber-500 text-black flex items-center gap-2"><Plus className="h-4 w-4" /> Termin</button>
        </div>
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
                  {e.category === "birthday" && <Cake className="h-4 w-4 text-slate-200" />}
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

      {modal && <EventModal date={selected} onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />}
    </div>
  );
}

function EventModal({ date, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [d, setD] = useState(date);
  const [time, setTime] = useState("");
  const [isBirthday, setIsBirthday] = useState(false);
  const [yearly, setYearly] = useState(false);
  const [reminders, setReminders] = useState([]);

  const addReminder = () => setReminders((r) => [...r, { value: 1, unit: "hours" }]);
  const updReminder = (i, k, v) => setReminders((r) => r.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  const delReminder = (i) => setReminders((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!title.trim()) return toast.error("Titel fehlt");
    try {
      await api.post("/events", {
        title, date: d, time,
        category: isBirthday ? "birthday" : "termin",
        yearly_repeat: isBirthday ? true : yearly,
        reminders: reminders.map((r) => ({ value: Number(r.value) || 0, unit: r.unit })),
      });
      toast.success("Termin erstellt");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-3xl border border-white/10 bg-card p-6 space-y-3 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl font-semibold">Neuer Termin</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <input data-testid="event-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm outline-none focus:border-amber-500/50" />
        <div className="grid grid-cols-2 gap-2">
          <input data-testid="event-date-input" type="date" value={d} onChange={(e) => setD(e.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none" />
          <input data-testid="event-time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl bg-white/5 border border-white/10 px-3 py-3 text-sm outline-none" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input data-testid="event-birthday-toggle" type="checkbox" checked={isBirthday} onChange={(e) => setIsBirthday(e.target.checked)} className="h-4 w-4 rounded accent-amber-500" /> Geburtstag (weiß markiert, jährlich)</label>
        {!isBirthday && (
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="h-4 w-4 rounded accent-amber-500" /> Jährlich wiederholen</label>
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs uppercase tracking-wider text-slate-500">Erinnerungen (frei wählbar)</div>
            <button data-testid="add-reminder-button" onClick={addReminder} className="text-xs text-amber-400 flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Erinnerung</button>
          </div>
          <div className="space-y-2">
            {reminders.length === 0 && <p className="text-xs text-slate-600">Keine Erinnerungen. Beliebig viele hinzufügbar.</p>}
            {reminders.map((r, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={`reminder-row-${i}`}>
                <input type="number" min="0" value={r.value} onChange={(e) => updReminder(i, "value", e.target.value)} className="w-20 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none" />
                <select value={r.unit} onChange={(e) => updReminder(i, "unit", e.target.value)} className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none">
                  {UNITS.map((u) => <option key={u.v} value={u.v}>{u.l} vorher</option>)}
                </select>
                <button onClick={() => delReminder(i)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-rose-500/10 text-rose-400"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
        <button data-testid="save-event-button" onClick={save} className="w-full rounded-xl py-3 font-semibold bg-amber-500 text-black">Termin speichern</button>
      </div>
    </div>
  );
}
