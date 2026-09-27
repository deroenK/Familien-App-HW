import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Fingerprint, Eye, EyeOff, Utensils, Loader2 } from "lucide-react";
import { api, API, apiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { serializeAssertion, base64urlToBuffer } from "../lib/webauthn";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(localStorage.getItem("last_user") || "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [webauthnAvail, setWebauthnAvail] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    if (!username) return;
    api.get(`/webauthn/available/${encodeURIComponent(username)}`)
      .then(({ data }) => setWebauthnAvail(data.available))
      .catch(() => setWebauthnAvail(false));
  }, [username]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("last_user", username);
      login(data.token, data.user);
      toast.success(`Willkommen, ${data.user.name || data.user.username}!`);
      navigate("/");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  const fingerprintLogin = async () => {
    if (!username) return toast.error("Bitte zuerst Benutzernamen eingeben.");
    setLoading(true);
    try {
      const { data: options } = await axios.post(`${API}/webauthn/authenticate/begin`, { username });
      options.challenge = base64urlToBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((c) => ({ ...c, id: base64urlToBuffer(c.id) }));
      }
      const assertion = await navigator.credentials.get({ publicKey: options });
      const { data } = await axios.post(`${API}/webauthn/authenticate/complete`, {
        username,
        credential: serializeAssertion(assertion),
      });
      localStorage.setItem("last_user", username);
      login(data.token, data.user);
      toast.success("Mit Fingerabdruck angemeldet!");
      navigate("/");
    } catch (err) {
      toast.error(apiError(err) || "Fingerabdruck-Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full blur-3xl opacity-20" style={{ background: "#F59E0B" }} />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full blur-3xl opacity-10" style={{ background: "#6366F1" }} />

      <div className="w-full max-w-md relative animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl grid place-items-center mb-4 shadow-xl" style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}>
            <Utensils className="h-8 w-8 text-black" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-50">Familien-App</h1>
          <p className="text-sm text-slate-400 mt-1">Anmelden, um fortzufahren</p>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400">Benutzername</label>
            <input
              data-testid="login-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-colors"
              placeholder="z. B. Admin"
            />
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400">Passwort</label>
            <div className="relative mt-1.5">
              <input
                data-testid="login-password-input"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 pr-11 text-sm text-slate-100 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-colors"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                {show ? <EyeOff className="h-4.5 w-4.5 h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            data-testid="login-submit-button"
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 font-semibold text-black transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#F59E0B,#D97706)" }}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Anmelden"}
          </button>

          {webauthnAvail && (
            <>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <div className="h-px flex-1 bg-white/10" /> oder <div className="h-px flex-1 bg-white/10" />
              </div>
              <button
                data-testid="webauthn-login-button"
                type="button"
                onClick={fingerprintLogin}
                disabled={loading}
                className="w-full rounded-xl py-3 font-medium text-amber-400 border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint className="h-5 w-5 animate-glow-ring rounded-full" />
                Mit Fingerabdruck anmelden
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
