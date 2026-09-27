import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Camera, Bell, BellRing, Save, KeyRound, Loader2, Trash2 } from "lucide-react";
import axios from "axios";
import { api, API, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PROFILE_COLORS } from "../lib/constants";
import { serializeRegistration, base64urlToBuffer } from "../lib/webauthn";
import { enablePush, disablePush, isPushSupported } from "../lib/push";

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const fileRef = useRef();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState([]);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    if (user) setForm({ ...user });
    api.get("/webauthn/credentials").then(({ data }) => setCreds(data)).catch(() => {});
    if (isPushSupported()) {
      navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setPushOn(!!s)).catch(() => {});
    }
  }, [user]);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/profile", {
        name: form.name, email: form.email, phone: form.phone,
        birthday: form.birthday, bio: form.bio, color: form.color, avatar: form.avatar,
      });
      await refreshUser();
      toast.success("Profil gespeichert");
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Bild zu groß (max. 2 MB)");
    const reader = new FileReader();
    reader.onload = () => upd("avatar", reader.result);
    reader.readAsDataURL(file);
  };

  const changePw = async () => {
    if (!pw.new_password) return toast.error("Neues Passwort fehlt");
    try {
      await api.post("/profile/password", pw);
      toast.success("Passwort geändert");
      setPw({ current_password: "", new_password: "" });
    } catch (e) { toast.error(apiError(e)); }
  };

  const registerFingerprint = async () => {
    try {
      const { data: options } = await api.post("/webauthn/register/begin");
      options.challenge = base64urlToBuffer(options.challenge);
      options.user.id = base64urlToBuffer(options.user.id);
      if (options.excludeCredentials) options.excludeCredentials = options.excludeCredentials.map((c) => ({ ...c, id: base64urlToBuffer(c.id) }));
      const cred = await navigator.credentials.create({ publicKey: options });
      await api.post("/webauthn/register/complete", serializeRegistration(cred));
      toast.success("Fingerabdruck registriert!");
      const { data } = await api.get("/webauthn/credentials");
      setCreds(data);
    } catch (e) { toast.error(apiError(e) || "Registrierung fehlgeschlagen"); }
  };

  const removeCred = async (id) => { await api.delete(`/webauthn/credentials/${id}`); setCreds((c) => c.filter((x) => x.id !== id)); toast.success("Entfernt"); };

  const togglePush = async () => {
    try {
      if (pushOn) { await disablePush(); setPushOn(false); toast.success("Push deaktiviert"); }
      else { await enablePush(); setPushOn(true); toast.success("Push aktiviert"); }
    } catch (e) { toast.error(apiError(e)); }
  };

  const setPref = async (key, val) => {
    const prefs = { ...(form.push_prefs || {}), [key]: val };
    upd("push_prefs", prefs);
    await api.put("/profile", { push_prefs: prefs });
  };

  const testPush = async () => {
    try { const { data } = await api.post("/push/test"); toast.success(data.sent ? "Test gesendet" : "Kein aktives Gerät abonniert"); }
    catch (e) { toast.error(apiError(e)); }
  };

  const initials = (form.name || form.username || "?").slice(0, 2).toUpperCase();
  const prefs = form.push_prefs || {};

  return (
    <div className="space-y-6 animate-fade-up max-w-2xl">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Profil</h1>

      {/* avatar + color */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 flex items-center gap-5 flex-wrap">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl grid place-items-center text-2xl font-bold text-black overflow-hidden ring-2" style={{ background: form.color || "#F59E0B", ["--tw-ring-color"]: (form.color || "#F59E0B") + "66" }}>
            {form.avatar ? <img src={form.avatar} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <button data-testid="avatar-upload-button" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 h-8 w-8 rounded-xl bg-amber-500 text-black grid place-items-center shadow-lg"><Camera className="h-4 w-4" /></button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Profilfarbe (= Stiftfarbe)</div>
          <div className="flex gap-2 flex-wrap">
            {PROFILE_COLORS.map((c) => (
              <button key={c.hex} data-testid={`color-${c.hex}`} onClick={() => upd("color", c.hex)} title={c.name}
                className={`h-8 w-8 rounded-full transition-transform ${form.color === c.hex ? "ring-2 ring-offset-2 ring-offset-card scale-110" : "hover:scale-105"}`}
                style={{ background: c.hex, ["--tw-ring-color"]: c.hex }} />
            ))}
          </div>
        </div>
      </div>

      {/* personal data */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold">Persönliche Daten</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" value={form.name} onChange={(v) => upd("name", v)} testId="profile-name" />
          <Field label="E-Mail" value={form.email} onChange={(v) => upd("email", v)} testId="profile-email" />
          <Field label="Telefon" value={form.phone} onChange={(v) => upd("phone", v)} testId="profile-phone" />
          <Field label="Geburtstag" type="date" value={form.birthday} onChange={(v) => upd("birthday", v)} testId="profile-birthday" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500">Bio</label>
          <textarea data-testid="profile-bio" value={form.bio || ""} onChange={(e) => upd("bio", e.target.value)} rows={2} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-amber-500/50" />
        </div>
        <button data-testid="save-profile-button" onClick={save} disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-amber-500 text-black flex items-center gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern</button>
      </div>

      {/* password */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-amber-400" /> Passwort ändern</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input data-testid="current-password" type="password" placeholder="Aktuelles Passwort" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none" />
          <input data-testid="new-password" type="password" placeholder="Neues Passwort" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none" />
        </div>
        <button data-testid="change-password-button" onClick={changePw} className="rounded-xl px-5 py-2.5 text-sm font-medium bg-white/5 border border-white/10">Passwort ändern</button>
      </div>

      {/* WebAuthn */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 space-y-3">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Fingerprint className="h-5 w-5 text-amber-400" /> Fingerabdruck-Login</h2>
        <p className="text-sm text-slate-400">Melde dich künftig ohne Passwort per Fingerabdruck oder Gesichtserkennung an.</p>
        {creds.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5">
            <span className="text-sm text-slate-300">Registriert am {new Date(c.created_at).toLocaleDateString("de-DE")}</span>
            <button onClick={() => removeCred(c.id)} className="text-slate-500 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button data-testid="register-fingerprint-button" onClick={registerFingerprint} className="rounded-xl px-5 py-2.5 text-sm font-medium text-amber-400 border border-amber-500/30 bg-amber-500/5 flex items-center gap-2"><Fingerprint className="h-4 w-4" /> Neuen Fingerabdruck registrieren</button>
      </div>

      {/* push */}
      <div className="rounded-3xl border border-white/10 bg-card/50 p-6 space-y-4">
        <h2 className="font-heading text-lg font-semibold flex items-center gap-2"><Bell className="h-5 w-5 text-amber-400" /> Push-Benachrichtigungen</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Benachrichtigungen auf diesem Gerät</span>
          <button data-testid="toggle-push-button" onClick={togglePush} className={`rounded-full px-4 py-2 text-sm font-medium flex items-center gap-2 ${pushOn ? "bg-emerald-500 text-black" : "bg-white/5 border border-white/10 text-slate-300"}`}>
            <BellRing className="h-4 w-4" /> {pushOn ? "Aktiviert" : "Aktivieren"}
          </button>
        </div>
        <div className="space-y-2">
          {[{ k: "calendar", l: "Kalendertermine" }, { k: "whiteboard", l: "Whiteboard-Nachrichten" }, { k: "chores", l: "Haushaltsaufgaben" }].map((p) => (
            <label key={p.k} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5">
              <span className="text-sm text-slate-300">{p.l}</span>
              <input data-testid={`pref-${p.k}`} type="checkbox" checked={prefs[p.k] !== false} onChange={(e) => setPref(p.k, e.target.checked)} className="h-5 w-5 rounded accent-amber-500" />
            </label>
          ))}
        </div>
        <button data-testid="test-push-button" onClick={testPush} className="text-sm text-amber-400 hover:text-amber-300">Test-Benachrichtigung senden</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testId }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-slate-500">{label}</label>
      <input data-testid={testId} type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm outline-none focus:border-amber-500/50" />
    </div>
  );
}
