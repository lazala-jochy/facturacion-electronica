import { useState, type FormEvent } from "react";
import {
  loginCompany,
  registerCompany,
} from "../services/auth";
import type { AuthCompany } from "../types/company";
type AuthMode = "login" | "register";

export default function Auth({
  onAuthenticated,
}: {
  onAuthenticated: (company: AuthCompany) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const isLogin = mode === "login";
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");
  const [rnc, setRnc] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (
      !email.trim() ||
      !password.trim() ||
      (!isLogin && !razonSocial.trim())
    ) {
      setError("Completa los campos requeridos.");
      return;
    }
    if (!isLogin && !/^[0-9]{9,11}$/.test(rnc.trim())) {
      setError("El RNC debe tener 9 a 11 digitos.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo electronico valido.");
      return;
    }

    if (password.length < 8) {
      setError("La contrasena debe tener minimo 8 caracteres.");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        const response = await loginCompany({ email: email.trim(), password });
        onAuthenticated(response.company);
      } else {
        await registerCompany({
          razonSocial: razonSocial.trim(),
          rnc: rnc.trim(),
          email: email.trim(),
          password,
          direccion: direccion.trim(),
        });
        setSuccess("Cuenta creada. Ahora inicia sesion.");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "No se pudo completar la autenticacion. Intenta nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen [font-family:Inter,system-ui,sans-serif] bg-gradient-to-br from-[#f5f6ff] via-[#f8f9ff] to-[#eef2ff] p-3 md:p-7 flex items-center justify-center overflow-x-auto">
      <section className="w-full min-w-[980px] max-w-7xl rounded-2xl border border-indigo-100/80 bg-white/70 backdrop-blur-xl shadow-[0_24px_65px_-24px_rgba(55,65,81,0.32)] overflow-hidden">
        <div className="grid grid-cols-[1fr_0.95fr] min-h-[680px]">
          <aside className="relative flex flex-col justify-between p-[clamp(1.25rem,2.8vw,3.5rem)] bg-gradient-to-br from-[#eff1ff] via-[#f3f4ff] to-[#eaedff]">
            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl" />
            <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-blue-200/20 blur-3xl" />

            <div className="relative z-10 max-w-sm">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white grid place-items-center shadow-lg shadow-indigo-300/60">
                <svg
                  viewBox="0 0 24 24"
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M8 3h7l5 5v13H4V3h4z" />
                  <path d="M15 3v5h5" />
                  <path d="M8 13h8M8 17h6M8 9h3" />
                </svg>
              </div>

              <h1 className="mt-7 text-[clamp(2.1rem,4.3vw,3.5rem)] leading-[1.06] font-bold tracking-tight text-slate-900">
                Facturacion
                <span className="block text-[#3f6ce8]">Electronica</span>
              </h1>
              <p className="mt-5 text-[clamp(1rem,1.5vw,1.5rem)] leading-relaxed text-slate-600">
                La solucion inteligente para gestionar tu facturacion de manera
                facil y segura.
              </p>
            </div>

            <div className="relative z-10 rounded-2xl border border-indigo-100 bg-white/75 p-4 shadow-lg shadow-slate-200/80">
              <div className="h-48 rounded-xl bg-gradient-to-br from-slate-50 to-indigo-50 border border-slate-200/80 p-3">
                <div className="h-2.5 w-16 rounded-full bg-indigo-200" />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="h-28 rounded-lg bg-white border border-slate-200" />
                  <div className="col-span-2 h-28 rounded-lg bg-white border border-slate-200" />
                </div>
              </div>
            </div>
          </aside>

          <div className="flex items-center justify-center p-[clamp(1rem,2.6vw,3rem)]">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200/90 bg-white p-[clamp(1.25rem,2.4vw,2.5rem)] shadow-[0_20px_45px_-24px_rgba(15,23,42,0.4)] transition-all duration-300">
              <div className="mx-auto h-16 w-16 rounded-full bg-indigo-50 text-[#3f6ce8] grid place-items-center">
                <svg
                  viewBox="0 0 24 24"
                  className="h-8 w-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  <circle cx="12" cy="16" r="1.2" />
                </svg>
              </div>

              <h2 className="mt-6 text-center text-[clamp(2rem,3.2vw,3rem)] font-bold tracking-tight text-slate-900">
                {isLogin ? "Iniciar sesion" : "Crear cuenta"}
              </h2>
              <p className="mt-2 text-center text-[clamp(1rem,1.7vw,1.35rem)] text-slate-600">
                {isLogin
                  ? "Ingresa con tu cuenta para continuar"
                  : "Completa tus datos para registrarte"}
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                {!isLogin && (
                  <div>
                    <div>
                      <label
                        htmlFor="name"
                        className="block text-sm font-semibold text-slate-800 mb-2"
                      >
                        Razon social
                      </label>
                      <input
                        id="razonSocial"
                        type="text"
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                        placeholder="razon social"
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value)}
                        autoComplete="razonSocial"
                        required={!isLogin}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="direccion"
                        className="block text-sm font-semibold text-slate-800 mb-2"
                      >
                        Direccion
                      </label>
                      <input
                        id="direccion"
                        type="text"
                        className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                        placeholder="Av principal, Santo Domingo, RD"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        autoComplete="direccion"
                        required={!isLogin}
                      />
                    </div>
                  </div>
                )}

                {!isLogin && (
                  <div>
                    <label
                      htmlFor="rnc"
                      className="block text-sm font-semibold text-slate-800 mb-2"
                    >
                      RNC
                    </label>
                    <input
                      id="rnc"
                      type="text"
                      inputMode="numeric"
                      className="w-full h-12 px-4 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                      placeholder="Ej: 101123456"
                      value={rnc}
                      onChange={(e) => setRnc(e.target.value)}
                      required={!isLogin}
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-slate-800 mb-2"
                  >
                    Correo electronico
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </span>
                    <input
                      id="email"
                      type="email"
                      className="w-full h-12 pl-11 pr-3 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                      placeholder="correo@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-semibold text-slate-800 mb-2"
                  >
                    Contrasena
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="w-full h-12 pl-4 pr-16 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                      placeholder="Minimo 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors ${
                        showPassword
                          ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                          : "text-slate-500 hover:text-indigo-700 hover:bg-indigo-50"
                      }`}
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword
                          ? "Ocultar contrasena"
                          : "Mostrar contrasena"
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                  {isLogin && (
                    <a
                      href="#"
                      className="mt-2 block text-right text-sm font-medium text-[#3f6ce8] hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                    >
                      Olvidaste tu contrasena?
                    </a>
                  )}
                </div>

                {!isLogin && (
                  <div>
                    <label
                      htmlFor="confirm-password"
                      className="block text-sm font-semibold text-slate-800 mb-2"
                    >
                      Confirmar contrasena
                    </label>
                    <div className="relative">
                      <input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        className="w-full h-12 pl-4 pr-16 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-[#3f6ce8] transition-all"
                        placeholder="Repite tu contrasena"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required={!isLogin}
                      />
                      <button
                        type="button"
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors ${
                          showConfirmPassword
                            ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                            : "text-slate-500 hover:text-indigo-700 hover:bg-indigo-50"
                        }`}
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={
                          showConfirmPassword
                            ? "Ocultar confirmacion de contrasena"
                            : "Mostrar confirmacion de contrasena"
                        }
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-sm rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2">
                    {success}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-[#3f6ce8] to-[#4b6cf0] text-white text-lg font-semibold shadow-md hover:from-[#355fd4] hover:to-[#3e63e8] disabled:cursor-not-allowed disabled:from-indigo-300 disabled:to-blue-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 transition-all duration-200"
                >
                  {isSubmitting
                    ? "Procesando..."
                    : isLogin
                      ? "Entrar"
                      : "Crear cuenta"}
                </button>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">o</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <p className="text-base text-center text-slate-600">
                  {isLogin ? "No tienes cuenta? " : "Ya tienes cuenta? "}
                  <button
                    type="button"
                    className="font-semibold text-[#3f6ce8] hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                    onClick={() => switchMode(isLogin ? "register" : "login")}
                  >
                    {isLogin ? "Registrate" : "Inicia sesion"}
                  </button>
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
