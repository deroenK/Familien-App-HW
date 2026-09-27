import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Utensils, ShoppingBag, Calendar, BookOpen, Edit3, CheckSquare,
  MapPin, User, ShieldCheck, ChevronLeft, ChevronRight, Cake,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { mondayOf, defaultWeekOffset, weekDates, formatShort, isoDate } from "../lib/dates";
import { WEEKDAYS } from "../lib/constants";

const TILES = [
  { id: "shopping", title: "Einkaufsliste", badge: "Schnell-Tippen", icon: ShoppingBag, to: "/einkaufsliste", color: "#10B981" },
  { id: "calendar", title: "Kalender", badge: "Termine & Geburtstage", icon: Calendar, to: "/kalender", color: "#3B82F6" },
  { id: "notebook", title: "Notizbuch", badge: "Notizen & Handschrift", icon: BookOpen, to: "/notizbuch", color: "#8B5CF6" },
  { id: "whiteboard", title: "Whiteboard", badge: "Zeichnen in Profilfarbe", icon: Edit3, to: "/whiteboard", color: "#06B6D4" },
  { id: "chores", title: "Haushaltsplan", badge: "Aufgaben", icon: CheckSquare, to: "/haushaltsplan", color: "#F43F5E" },
  { id: "postcards", title: "Postkarten", badge: "Erinnerungen", icon: MapPin, to: "/postkarten", color: "#10B981" },
  { id: "profile", title: "Profil & Stiftfarbe", badge: "Einstellungen", icon: User, to: "/profil", color: "#F59E0B" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(defaultWeekOffset());
  const [entries, setEntries] = useState({});
  const [upcoming, setUpcoming] = useState([]);
  const monday = mondayOf(weekOffset);
  const days = weekDates(monday);

  useEffect(() => {
    api.get(`/mealplan?start=${isoDate(monday)}&days=7`).then(({ data }) => setEntries(data.entries));
    // eslint-disable-next-line
  }, [weekOffset]);

  useEffect(() => {
    api.get("/events").then(({ data }) => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const end = new Date(today); end.setDate(end.getDate() + 21);
      const list = [];
      data.forEach((e) => {
        const occ = new Date(e.date + "T00:00:00");
        if (e.yearly_repeat) {
          occ.setFullYear(today.getFullYear());
          if (occ < today) occ.setFullYear(today.getFullYear() + 1);
        }
        if (occ >= today && occ <= end) list.push({ ...e, occ });
      });
      list.sort((a, b) => a.occ - b.occ);
      setUpcoming(list);
    }).catch(() => {});
  }, []);

  const tiles = [...TILES];
  if (user?.role === "admin")
    tiles.push({ id: "admin", title: "Admin-Bereich", badge: "Verwaltung", icon: ShieldCheck, to: "/admin", color: "#F43F5E" });

  const slotText = (d, slot) => {
    const iso = isoDate(d);
    const e = entries[iso]?.[slot];
    if (e?.name) return e.name;
    const wd = (d.getDay() + 6) % 7;
    if (slot === "lunch" && wd < 5) return "Arbeit";
    return "—";
  };

  const todayIso = isoDate(new Date());

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">Willkommen zurück</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight text-slate-50">
          Hallo {user?.name || user?.username} 👋
        </h1>
      </div>

      {/* Meal plan overview */}
      <section className="rounded-3xl border border-white/10 bg-card/60 p-5 sm:p-6" data-testid="dashboard-mealplan-overview">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-heading text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Utensils className="h-5 w-5 text-amber-400" /> Essensplan
          </h2>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              data-testid="dashboard-this-week"
              onClick={() => setWeekOffset(0)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${weekOffset === 0 ? "bg-amber-500 text-black" : "text-slate-300"}`}
            >
              Diese Woche
            </button>
            <button
              data-testid="dashboard-next-week"
              onClick={() => setWeekOffset(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${weekOffset === 1 ? "bg-amber-500 text-black" : "text-slate-300"}`}
            >
              Nächste Woche
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {days.map((d, i) => (
            <div
              key={i}
              className={`grid grid-cols-[110px_1fr_1fr] gap-3 items-center rounded-xl px-3 py-2 text-sm ${
                isoDate(d) === todayIso ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/[0.02]"
              }`}
            >
              <div className="font-medium text-slate-300">
                <div>{WEEKDAYS[i].slice(0, 2)}.</div>
                <div className="text-[11px] text-slate-500">{formatShort(d)}</div>
              </div>
              <div className="text-slate-400 truncate"><span className="text-slate-600 text-xs">Mittag: </span>{slotText(d, "lunch")}</div>
              <div className="text-slate-400 truncate"><span className="text-slate-600 text-xs">Abend: </span>{slotText(d, "dinner")}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate("/essensplan")}
          data-testid="dashboard-open-mealplan"
          className="mt-4 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
        >
          Plan bearbeiten <ChevronRight className="h-4 w-4" />
        </button>
      </section>

      {/* Upcoming 3 weeks */}
      <section>
        <h2 className="font-heading text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-400" /> Nächste 3 Wochen</h2>
        <div className="rounded-3xl border border-white/10 bg-card/50 p-4 space-y-2" data-testid="dashboard-upcoming">
          {upcoming.length === 0 && <p className="text-slate-500 text-sm py-3 text-center">Keine Termine vorhanden</p>}
          {upcoming.map((e) => (
            <div key={e.id + e.occ.toISOString()} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
              <span className="h-8 w-1.5 rounded-full" style={{ background: e.color }} />
              {e.category === "birthday" && <Cake className="h-4 w-4 text-slate-200" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-200 truncate">{e.title}</div>
                <div className="text-[11px] text-slate-500">{e.occ.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}{e.time ? ` · ${e.time}` : ""}{e.user_name ? ` · ${e.user_name}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tiles */}
      <section>
        <h2 className="font-heading text-lg font-semibold text-slate-200 mb-4">Bereiche</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {tiles.map((t) => (
            <button
              key={t.id}
              data-testid={`tile-${t.id}`}
              disabled={!t.to}
              onClick={() => t.to && navigate(t.to)}
              className={`group text-left rounded-2xl border border-white/10 bg-card/50 p-4 sm:p-5 transition-all ${
                t.to ? "hover:border-white/20 hover:-translate-y-0.5 hover:bg-card/80" : "opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="h-11 w-11 rounded-xl grid place-items-center mb-3 transition-transform group-hover:scale-110" style={{ background: t.color + "22" }}>
                <t.icon className="h-5.5 w-5.5 h-6 w-6" style={{ color: t.color }} />
              </div>
              <div className="font-heading font-semibold text-slate-100">{t.title}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{t.badge}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
