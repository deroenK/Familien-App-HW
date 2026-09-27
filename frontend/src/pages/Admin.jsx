import React, { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { UserPlus, Trash2, KeyRound, Pencil, X, Download, Upload, RotateCcw, Save } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PROFILE_COLORS } from "../lib/constants";

export default function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const fileRef = useRef();

  const load = useCallback(async () => { const { data } = await api.get("/users"); setUsers(data); }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm("Benutzer wirklich löschen?")) return;
    try { await api.delete(`/users/${id}`); toast.success("Gelöscht"); load(); } catch (e) { toast.error(apiError(e)); }
  };

  const resetPw = async (id) => {
    const np = window.prompt("Neues Passwort:");
    if (!np) return;
    await api.post(`/users/${id}/reset-password`, { new_password: np });
    toast.success("Passwort zurückgesetzt");
  };

  const exportData = async () => {
    const { data } = await api.get("/admin/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `familien-app-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Daten exportiert");
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const payload = JSON.parse(reader.result);
        await api.post("/admin/import", payload);
        toast.success("Daten importiert");
        load();
      } catch (err) { toast.error("Import fehlgeschlagen: ungültige Datei"); }
    };
    reader.readAsText(file);
  };

  const resetData = async () => {
    if (!window.confirm("Alle Inhalte (Gerichte, Plan, Liste, Termine) zurücksetzen? Benutzer bleiben erhalten.")) return;
    await api.post("/admin/reset");
    toast.success("Daten zurückgesetzt");
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Admin-Bereich</h1>
        <button data-testid="create-user-button" onClick={() => setCreating(true)} className="rounded-xl px-4 py-2 text-sm font-medium bg-amber-500 text-black flex items-center gap-2"><UserPlus className="h-4 w-4" /> Benutzer</button>
      </div>

      {/* users */}
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/50 px-4 py-3" data-testid={`admin-user-${u.username}`}>
            <div className="h-10 w-10 rounded-xl grid place-items-center text-sm font-bold text-black overflow-hidden" style={{ background: u.color }}>
              {u.avatar ? <img src={u.avatar} alt="" className="h-full w-full object-cover" /> : (u.name || u.username).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-100 flex items-center gap-2">{u.name || u.username}
                {u.role === "admin" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">Admin</span>}
              </div>
              <div className="text-xs text-slate-500 truncate">@{u.username} {u.email && `· ${u.email}`}</div>
            </div>
            <button onClick={() => setEditing(u)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 text-slate-400"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => resetPw(u.id)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 text-slate-400"><KeyRound className="h-4 w-4" /></button>
            {u.id !== me?.id && <button onClick={() => del(u.id)} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-rose-500/10 text-rose-400"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
      </div>

      {/* data mgmt */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold">Datenverwaltung</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <button data-testid="export-button" onClick={exportData} className="rounded-xl py-3 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Exportieren</button>
          <button data-testid="import-button" onClick={() => fileRef.current?.click()} className="rounded-xl py-3 text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-2"><Upload className="h-4 w-4" /> Importieren</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importData} />
          <button data-testid="reset-button" onClick={resetData} className="rounded-xl py-3 text-sm font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center gap-2"><RotateCcw className="h-4 w-4" /> Zurücksetzen</button>
        </div>
      </div>

      {creating && <UserForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const [form, setForm] = useState(user || { username: "", password: "", name: "", email: "", phone: "", birthday: "", bio: "", color: "#3B82F6", role: "user" });
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    try {
      if (isEdit) {
        await api.put(`/users/${user.id}`, { name: form.name, email: form.email, phone: form.phone, birthday: form.birthday, bio: form.bio, color: form.color, role: form.role });
        toast.success("Benutzer aktualisiert");
      } else {
        if (!form.username || !form.password) return toast.error("Benutzername & Passwort erforderlich");
        await api.post("/users", form);
        toast.success("Benutzer erstellt");
      }
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 bg-card p-6 space-y-3 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl font-semibold">{isEdit ? "Benutzer bearbeiten" : "Neuer Benutzer"}</h3>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        {!isEdit && (
          <>
            <In label="Benutzername" value={form.username} onChange={(v) => upd("username", v)} testId="new-username" />
            <In label="Passwort" type="password" value={form.password} onChange={(v) => upd("password", v)} testId="new-password-field" />
          </>
        )}
        <In label="Name" value={form.name} onChange={(v) => upd("name", v)} testId="uf-name" />
        <div className="grid grid-cols-2 gap-2">
          <In label="E-Mail" value={form.email} onChange={(v) => upd("email", v)} />
          <In label="Telefon" value={form.phone} onChange={(v) => upd("phone", v)} />
        </div>
        <In label="Geburtstag" type="date" value={form.birthday} onChange={(v) => upd("birthday", v)} />
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500">Profilfarbe</label>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {PROFILE_COLORS.map((c) => <button key={c.hex} onClick={() => upd("color", c.hex)} className={`h-7 w-7 rounded-full ${form.color === c.hex ? "ring-2 ring-offset-2 ring-offset-card" : ""}`} style={{ background: c.hex, ["--tw-ring-color"]: c.hex }} />)}
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500">Rolle</label>
          <select data-testid="uf-role" value={form.role} onChange={(e) => upd("role", e.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none">
            <option value="user">Benutzer</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <button data-testid="save-user-button" onClick={save} className="w-full rounded-xl py-3 font-semibold bg-amber-500 text-black flex items-center justify-center gap-2"><Save className="h-4 w-4" /> Speichern</button>
      </div>
    </div>
  );
}

function In({ label, value, onChange, type = "text", testId }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500">{label}</label>
      <input data-testid={testId} type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-amber-500/50" />
    </div>
  );
}
