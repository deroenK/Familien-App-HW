import React, { useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  LayoutGrid, Utensils, ShoppingBag, Calendar, User, ShieldCheck,
  Menu, X, LogOut, CheckSquare, Edit3, BookOpen, MapPin, Home,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/essensplan", label: "Essensplan", icon: Utensils },
  { to: "/einkaufsliste", label: "Einkaufsliste", icon: ShoppingBag },
  { to: "/kalender", label: "Kalender", icon: Calendar },
  { to: "/haushaltsplan", label: "Haushaltsplan", icon: CheckSquare },
  { to: "/whiteboard", label: "Whiteboard", icon: Edit3 },
  { to: "/notizbuch", label: "Notizbuch", icon: BookOpen },
  { to: "/postkarten", label: "Postkarten", icon: MapPin },
  { to: "/profil", label: "Profil", icon: User },
];

const BOTTOM = ["/", "/essensplan", "/einkaufsliste", "/kalender", "/profil"];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const items = [...NAV];
  if (user?.role === "admin") items.push({ to: "/admin", label: "Admin", icon: ShieldCheck });

  const doLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = (user?.name || user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="glass sticky top-0 z-50 border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <NavLink to="/" data-testid="logo-home-link" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
            <Home className="h-5 w-5 text-black" />
          </div>
          <span className="font-heading font-bold text-lg tracking-tight text-slate-50">Familien-App</span>
        </NavLink>
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-full grid place-items-center text-xs font-bold text-black overflow-hidden ring-2"
            style={{ background: user?.color || "#F59E0B", ["--tw-ring-color"]: (user?.color || "#F59E0B") + "66" }}
          >
            {user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <button
            data-testid="menu-toggle-button"
            onClick={() => setOpen((o) => !o)}
            className="h-9 w-9 rounded-xl grid place-items-center bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Dropdown menu */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed right-4 top-16 z-50 w-64 rounded-2xl glass border border-white/10 shadow-2xl p-2 animate-fade-up">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                data-testid={`menu-link-${it.label.toLowerCase()}`}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive ? "bg-amber-500/15 text-amber-400" : "text-slate-300 hover:bg-white/5"
                  }`
                }
              >
                <it.icon className="h-4.5 w-4.5 h-5 w-5" />
                {it.label}
              </NavLink>
            ))}
            <div className="my-2 h-px bg-white/10" />
            <button
              data-testid="logout-button"
              onClick={doLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="h-5 w-5" /> Abmelden
            </button>
          </div>
        </>
      )}

      {/* Main */}
      <main className="max-w-5xl mx-auto px-4 py-6 pb-28 md:pb-10">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/10 px-2 py-2 flex justify-around items-center md:hidden">
        {items.filter((it) => BOTTOM.includes(it.to)).map((it) => {
          const active = it.end ? location.pathname === it.to : location.pathname.startsWith(it.to);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              data-testid={`bottom-nav-${it.label.toLowerCase()}`}
              className={`flex flex-col items-center gap-1 text-[10px] font-medium px-2 transition-colors ${
                active ? "text-amber-400" : "text-slate-400"
              }`}
            >
              <it.icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
              {it.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
