import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset, resetPasswordWithToken } from "../services/auth";
import { defaultDocumentTitle } from "../utils/productBranding";

export default function ForgotPassword() {
  const [phase, setPhase] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = `Recuperar contraseña · ${defaultDocumentTitle}`;
  }, []);

  const onCheckEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      if (!res.exists || !res.reset_token) {
        setError("No hay cuenta registrada con ese correo electrónico.");
        setPhase("email");
        setResetToken(null);
        return;
      }
      setResetToken(res.reset_token);
      setPhase("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar el correo.");
    } finally {
      setLoading(false);
    }
  };

  const onSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!resetToken) {
      setError("Volvé atrás y verificá el correo primero.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener mínimo 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const msg = await resetPasswordWithToken(resetToken, password);
      setSuccess(msg.message);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setLoading(false);
    }
  };

  const changeEmailAgain = () => {
    setPhase("email");
    setResetToken(null);
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
  };

  return (
    <main className="min-h-screen [font-family:Inter,system-ui,sans-serif] p-3 sm:p-5 flex items-center justify-center bg-gradient-to-br from-[#eef7ff] via-[#f7fbff] to-[#eefcf3]">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-8 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.35)]">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Olvidé mi contraseña</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {phase === "email"
            ? "Ingresá el correo con el que te registraste. Si existe una cuenta, podrás establecer una contraseña nueva."
            : "Elegí una contraseña segura. Esta etapa tiene una vigencia de una hora desde que validamos el correo."}
        </p>

        {phase === "email" ? (
          <form className="mt-6 space-y-4" onSubmit={onCheckEmail}>
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-semibold text-slate-800 mb-2">
                Correo electrónico
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                className="w-full h-12 px-3 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8]"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-[#2563eb] text-white font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
            >
              {loading ? "Comprobando…" : "Continuar"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSavePassword}>
            <p className="text-xs text-slate-500">
              Correo: <span className="font-medium text-slate-700">{email}</span>{" "}
              <button
                type="button"
                onClick={changeEmailAgain}
                className="text-[#3f6ce8] underline hover:text-indigo-700"
              >
                Cambiar correo
              </button>
            </p>

            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-slate-800 mb-2">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full h-12 pl-3 pr-14 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8]"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-indigo-700"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-800 mb-2">
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full h-12 pl-3 pr-14 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8]"
                  placeholder="Repite la nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-indigo-700"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {success}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || Boolean(success)}
              className="w-full h-12 rounded-xl bg-[#2563eb] text-white font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
            >
              {loading ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center">
          <Link to="/" className="text-sm font-medium text-[#3f6ce8] hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
