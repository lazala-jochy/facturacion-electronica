import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  loginCompany,
  registerCompany,
} from "../services/auth";
import type { AuthSession } from "../types/session";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import { cedulaDigits, formatCedulaInput } from "../utils/cedula";
import { BuildingIcon } from "../icons/branding";
import {
  defaultDocumentTitle,
  documentTitleWithCompany,
  headlineWithCompany,
} from "../utils/productBranding";

/** Marca visible en registro (sin ETECA). */
const BRAND_PRODUCT = "Facturación Electrónica";

type AuthMode = "login" | "register";
type RegisterStep = 1 | 2 | 3;

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Auth({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const isLogin = mode === "login";
  const [razonSocial, setRazonSocial] = useState("");
  const [direccion, setDireccion] = useState("");
  const [rnc, setRnc] = useState("");
  const [nombrePersona, setNombrePersona] = useState("");
  const [cedulaPersona, setCedulaPersona] = useState("");
  const [telefonoEmpresa, setTelefonoEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [registerStep, setRegisterStep] = useState<RegisterStep>(1);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  useEffect(() => {
    if (isLogin) {
      document.title = defaultDocumentTitle;
    } else {
      document.title = documentTitleWithCompany(razonSocial);
    }
  }, [isLogin, razonSocial]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
    setRegisterStep(1);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    setLogoFile(null);
    if (nextMode === "login") {
      setNombrePersona("");
      setCedulaPersona("");
      setTelefonoEmpresa("");
    }
  };

  const handleLogoChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      setLogoFile(null);
      return;
    }
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  /** Valida desde el paso 1 hasta `step` inclusive (útil al avanzar o al confirmar todo). */
  const validateRegisterStep = (throughStep: RegisterStep): boolean => {
    if (throughStep >= 1) {
      if (!razonSocial.trim() || !direccion.trim() || !rnc.trim()) {
        setError("Completá razón social, RNC y dirección fiscal.");
        return false;
      }
      if (!/^[0-9]{9,11}$/.test(rnc.trim())) {
        setError("El RNC debe tener 9 a 11 dígitos.");
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError("Ingresá un correo electrónico válido.");
        return false;
      }
    }
    if (throughStep >= 2) {
      if (!nombrePersona.trim()) {
        setError("El nombre del representante es obligatorio.");
        return false;
      }
      if (!/^[0-9]{11}$/.test(cedulaDigits(cedulaPersona))) {
        setError("La cédula debe tener 11 dígitos.");
        return false;
      }
      if (!telefonoEmpresa.trim() || !isValidPhone(telefonoEmpresa)) {
        setError("El teléfono de la empresa debe tener formato xxx-xxx-xxxx.");
        return false;
      }
    }
    if (throughStep >= 3) {
      if (password.length < 8) {
        setError("La contraseña debe tener mínimo 8 caracteres.");
        return false;
      }
      if (password !== confirmPassword) {
        setError("Las contraseñas no coinciden.");
        return false;
      }
    }
    return true;
  };

  const handleRegisterNext = () => {
    setError("");
    if (registerStep === 1 && validateRegisterStep(1)) setRegisterStep(2);
    else if (registerStep === 2 && validateRegisterStep(2)) setRegisterStep(3);
  };

  const handleRegisterPrev = () => {
    setError("");
    setRegisterStep((s) => (s > 1 ? ((s - 1) as RegisterStep) : s));
  };

  const handleLogoDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleLogoChange(e.dataTransfer.files);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (isLogin) {
      if (!email.trim() || !password.trim()) {
        setError("Completa correo y contraseña.");
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
    } else {
      if (registerStep !== 3) return;
      if (!validateRegisterStep(3)) return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        const session = await loginCompany({
          email: email.trim(),
          password,
        });
        onAuthenticated(session);
      } else {
        const session = await registerCompany(
          {
            name: razonSocial.trim(),
            rnc: rnc.trim(),
            address: direccion.trim(),
            full_name: nombrePersona.trim(),
            cedula: cedulaDigits(cedulaPersona),
            email: email.trim(),
            company_phone: telefonoEmpresa.trim(),
            company_email: email.trim(),
            password,
          },
          logoFile,
        );
        onAuthenticated(session);
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
    <main
      className={`min-h-screen [font-family:Inter,system-ui,sans-serif] p-3 sm:p-5 md:p-6 flex items-center justify-center w-full overflow-x-hidden ${
        isLogin ? "bg-gradient-to-br from-[#eef7ff] via-[#f7fbff] to-[#eefcf3]" : "bg-[#eef1f7]"
      }`}
    >
      <section
        className={
          isLogin
            ? "w-full max-w-7xl rounded-2xl border border-indigo-100/80 bg-white/70 backdrop-blur-xl shadow-[0_24px_65px_-24px_rgba(55,65,81,0.32)] overflow-hidden"
            : "w-full max-w-[1200px] overflow-hidden rounded-2xl shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)]"
        }
      >
        <div
          className={
            isLogin
              ? "grid grid-cols-1 lg:grid-cols-[1fr_0.95fr] min-h-auto lg:min-h-[680px]"
              : "grid grid-cols-1 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:items-stretch bg-white"
          }
        >
          {isLogin ? (
            <aside className="hidden lg:flex relative flex-col justify-between p-[clamp(1.25rem,2.8vw,3.5rem)] bg-gradient-to-br from-[#edf6ff] via-[#f7fbff] to-[#ecfaf2]">
              <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-indigo-200/30 blur-3xl" />
              <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-blue-200/20 blur-3xl" />

              <div className="relative z-10 max-w-sm">
                <div className="h-16 w-16 rounded-2xl bg-white grid place-items-center shadow-lg shadow-slate-300/50 ring-1 ring-slate-200 text-[#2563eb]">
                  <BuildingIcon className="h-10 w-10" />
                </div>

                <h1 className="mt-7 text-[clamp(2.1rem,4.3vw,3.5rem)] leading-[1.06] font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-[#2e58d6] via-[#3f6ce8] to-[#5a86ff] bg-clip-text text-transparent">
                    {headlineWithCompany(null)}.
                  </span>
                </h1>
                <p className="mt-5 text-[clamp(1rem,1.5vw,1.5rem)] leading-relaxed text-slate-600">
                  La solución inteligente para gestionar tu facturación de manera
                  fácil y segura.
                </p>
              </div>

              <div className="relative z-10 rounded-2xl border border-[#c7e3d2] bg-white/85 p-4 shadow-lg shadow-slate-200/80">
                <div className="h-48 rounded-xl bg-gradient-to-br from-[#edf6ff] to-[#e9f9ef] border border-[#d5e8f7] p-4 grid place-items-center text-[#2563eb]">
                  <BuildingIcon className="h-24 w-24 opacity-90" />
                </div>
              </div>
            </aside>
          ) : (
            <aside className="relative flex flex-col border-b border-slate-200 lg:border-b-0 lg:border-r bg-gradient-to-b from-[#f0f9ff] to-[#ecfdf5]/60 px-6 py-8 lg:py-10">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.06)_0%,transparent_45%,rgba(34,197,94,0.05)_100%)] pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-8 min-h-[280px] lg:min-h-0">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 h-10 w-10 rounded-xl bg-white shadow-md ring-1 ring-slate-200/80 grid place-items-center text-[#2563eb]">
                    <BuildingIcon className="h-6 w-6" />
                  </div>
                  <div className="leading-tight min-w-0">
                    <span className="text-lg sm:text-xl font-bold text-[#1d4ed8] tracking-tight block">
                      {BRAND_PRODUCT}
                    </span>
                  </div>
                </div>

                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Registrar empresa</h1>
                  <p className="mt-1.5 text-sm text-slate-600 leading-snug">
                    Completa los pasos para registrar tu empresa y comenzar a facturar.
                  </p>
                </div>

                <nav className="relative" aria-label="Pasos del registro">
                  <div className="absolute left-[18px] top-8 bottom-8 w-px bg-slate-200" aria-hidden />
                  <ol className="space-y-6">
                    {(
                      [
                        {
                          step: 1 as const,
                          Icon: BuildingIcon,
                          title: "Datos de la empresa",
                          sub: "Información básica de tu empresa.",
                        },
                        {
                          step: 2 as const,
                          Icon: DocumentIcon,
                          title: "Datos legales",
                          sub: "Información legal y representante.",
                        },
                        {
                          step: 3 as const,
                          Icon: LockIcon,
                          title: "Cuenta y acceso",
                          sub: "Crea tu cuenta de acceso.",
                        },
                      ] as const
                    ).map(({ step, Icon, title, sub }) => {
                      const active = registerStep === step;
                      const done = registerStep > step;
                      return (
                        <li key={step} className="relative flex gap-3">
                          <div
                            className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 transition-colors ${
                              active || done
                                ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]"
                                : "border-slate-200 bg-white text-slate-400"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className={`min-w-0 pt-0.5 ${!active && !done ? "opacity-70" : ""}`}>
                            <p
                              className={`text-sm font-semibold leading-tight ${
                                active ? "text-[#1d4ed8]" : "text-slate-800"
                              }`}
                            >
                              {title}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 leading-snug">{sub}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </nav>

                <div className="mt-auto rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-4 text-sm text-emerald-900/95 shadow-sm">
                  <div className="flex gap-3">
                    <svg className="h-8 w-8 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.313-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-emerald-900">Seguro y confiable.</p>
                      <p className="mt-1 text-xs text-emerald-800/90 leading-relaxed">
                        Tu información está protegida y cumple con las normativas de la DGII.
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-emerald-700/95">
                        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        SSL 256-bit encriptado
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          )}

          <div
            className={
              isLogin
                ? "flex w-full items-center justify-center p-4 sm:p-6 lg:p-[clamp(1rem,2.6vw,3rem)]"
                : "flex w-full items-stretch lg:items-center justify-center p-4 sm:p-6 lg:p-7 lg:py-8"
            }
          >
            <div
              className={
                isLogin
                  ? "w-full max-w-xl rounded-3xl border border-slate-200/90 bg-white p-[clamp(1.25rem,2.4vw,2.5rem)] shadow-[0_20px_45px_-24px_rgba(15,23,42,0.4)]"
                  : "w-full max-w-none my-auto lg:my-0 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_24px_-6px_rgba(15,23,42,0.12)]"
              }
            >
              {isLogin ? (
                <>
                  <div className="mx-auto h-16 w-16 rounded-full bg-[#e8f0ff] text-[#0b57d0] grid place-items-center ring-1 ring-[#c8dbff]">
                    <LockIcon className="h-8 w-8" />
                  </div>

                  <h2 className="mt-6 text-center text-[clamp(2rem,3.2vw,3rem)] font-bold tracking-tight text-slate-900">
                    Iniciar sesión
                  </h2>
                  <p className="mt-2 text-center text-[clamp(1rem,1.7vw,1.35rem)] text-slate-600">
                    Ingresa con tu cuenta para continuar
                  </p>
                </>
              ) : (
                <>
                  <div className="flex lg:hidden gap-2 justify-center py-4 border-b border-slate-100 bg-slate-50/90">
                    {([1, 2, 3] as const).map((n) => (
                      <span
                        key={n}
                        className={`h-2 w-9 rounded-full transition-colors ${registerStep === n ? "bg-[#2563eb]" : registerStep > n ? "bg-[#93c5fd]" : "bg-slate-200"}`}
                        aria-hidden
                      />
                    ))}
                  </div>
                  <div className="px-6 pt-5 pb-4">
                    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
                      {[
                        {
                          Ico: (
                            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.313-.21-2.57-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                          ),
                          t: "Cumple con DGII",
                          s: "100% conforme",
                        },
                        {
                          Ico: (
                            <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-4a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          ),
                          t: "En minutos",
                          s: "Registro rápido",
                        },
                        {
                          Ico: (
                            <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          ),
                          t: "Seguro",
                          s: "Tus datos protegidos",
                        },
                      ].map(({ Ico, t, s }, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 bg-white px-3 py-3.5 text-left sm:justify-center sm:text-center sm:flex-col sm:items-center"
                        >
                          {Ico}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight text-slate-800">{t}</p>
                            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{s}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6">
                      <p className="text-sm font-semibold text-[#2563eb]">
                        Paso {registerStep} de 3
                      </p>
                      <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                        {registerStep === 1
                          ? "Datos de la empresa"
                          : registerStep === 2
                            ? "Datos legales"
                            : "Cuenta y acceso"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {registerStep === 1
                          ? "Completa la información básica de tu empresa."
                          : registerStep === 2
                            ? "Información del representante y contacto fiscal."
                            : "Define una contraseña segura para acceder."}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <form
                onSubmit={handleSubmit}
                noValidate={!isLogin}
                className={isLogin ? "mt-8 space-y-6" : "flex flex-col gap-5 px-6 pb-2"}
              >
                {isLogin ? (
                  <>
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
                      <Link
                        to="/recuperar"
                        className="mt-2 block text-right text-sm font-medium text-[#3f6ce8] hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                      >
                        Olvidaste tu contrasena?
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    {registerStep === 1 && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                        <div>
                          <label htmlFor="razonSocial" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Razón social <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="razonSocial"
                            type="text"
                            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                            placeholder="Ej: Mi Empresa SRL"
                            value={razonSocial}
                            onChange={(e) => setRazonSocial(e.target.value)}
                            autoComplete="organization"
                          />
                        </div>
                        <div>
                          <label htmlFor="rnc" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            RNC <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="rnc"
                            type="text"
                            inputMode="numeric"
                            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                            placeholder="Ej: 101123456"
                            value={rnc}
                            onChange={(e) => setRnc(e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                          <div>
                            <label htmlFor="direccion" className="block text-sm font-semibold text-slate-800 mb-1.5">
                              Dirección fiscal <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              id="direccion"
                              rows={4}
                              className="w-full resize-y min-h-[100px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb] leading-snug"
                              placeholder="Ej: Av. Principal, Santo Domingo, RD"
                              value={direccion}
                              onChange={(e) => setDireccion(e.target.value)}
                              autoComplete="street-address"
                            />
                            <p className="mt-1 text-[11px] text-slate-500">Dirección completa de tu empresa</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 mb-1.5">Logo de la empresa</p>
                            <label
                              htmlFor="reg-logo-input"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDrop={handleLogoDrop}
                              className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center transition-colors hover:border-[#2563eb]/50 hover:bg-slate-50"
                            >
                              <input
                                id="reg-logo-input"
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                                className="sr-only"
                                onChange={(e) => handleLogoChange(e.target.files)}
                              />
                              <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                              </svg>
                              {logoPreview ? (
                                <img src={logoPreview} alt="" className="max-h-20 max-w-full object-contain rounded" />
                              ) : (
                                <span className="text-xs text-slate-500">Opcional · se verá en el panel y documentos</span>
                              )}
                              <span className="text-xs font-medium text-slate-600">
                                Arrastra tu logo aquí o <span className="text-[#2563eb]">selecciona un archivo</span>
                              </span>
                              <span className="text-[11px] text-slate-500">PNG, JPG, WebP o GIF · máx. 2&nbsp;MB</span>
                            </label>
                            {logoFile ? (
                              <button
                                type="button"
                                className="mt-2 text-xs font-medium text-red-600 hover:underline"
                                onClick={() => handleLogoChange(null)}
                              >
                                Quitar archivo
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label htmlFor="email" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Correo electrónico <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16v12H4z" />
                                <path d="m4 7 8 6 8-6" />
                              </svg>
                            </span>
                            <input
                              id="email"
                              type="email"
                              className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                              placeholder="ejemplo@empresa.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              autoComplete="email"
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">Este será tu usuario para iniciar sesión</p>
                        </div>
                      </div>
                    )}

                    {registerStep === 2 && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                        <div className="sm:col-span-2">
                          <label htmlFor="nombrePersona" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Nombre del representante <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="nombrePersona"
                            type="text"
                            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                            placeholder="Ej: María Altagracia Sánchez"
                            value={nombrePersona}
                            onChange={(e) => setNombrePersona(e.target.value)}
                          />
                        </div>
                        <div>
                          <label htmlFor="cedulaPersona" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Cédula <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="cedulaPersona"
                            type="text"
                            inputMode="numeric"
                            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                            placeholder="001-1234567-8"
                            value={cedulaPersona}
                            onChange={(e) => setCedulaPersona(formatCedulaInput(e.target.value))}
                            maxLength={13}
                          />
                        </div>
                        <div>
                          <label htmlFor="telefonoEmpresa" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Teléfono empresa <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="telefonoEmpresa"
                            type="text"
                            inputMode="numeric"
                            className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                            placeholder="xxx-xxx-xxxx"
                            value={telefonoEmpresa}
                            onChange={(e) => setTelefonoEmpresa(formatPhoneInput(e.target.value))}
                            maxLength={12}
                          />
                        </div>
                      </div>
                    )}

                    {registerStep === 3 && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 max-w-2xl">
                        <div className="sm:col-span-2">
                          <label htmlFor="password" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Contraseña <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              className="w-full h-11 pl-3.5 pr-12 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                              placeholder="Mínimo 8 caracteres"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 ${showPassword ? "bg-blue-100 text-blue-800" : "text-slate-500"}`}
                              onClick={() => setShowPassword((p) => !p)}
                              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                            >
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-800 mb-1.5">
                            Confirmar contraseña <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              id="confirm-password"
                              type={showConfirmPassword ? "text" : "password"}
                              className="w-full h-11 pl-3.5 pr-12 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-[#2563eb]"
                              placeholder="Repite tu contraseña"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 ${showConfirmPassword ? "bg-blue-100 text-blue-800" : "text-slate-500"}`}
                              onClick={() => setShowConfirmPassword((p) => !p)}
                              aria-label={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
                            >
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className={isLogin ? "space-y-6" : "mt-4 space-y-4 border-t border-slate-100 pt-5"}>
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

                  {isLogin ? (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0b57d0] to-[#16a34a] text-white text-lg font-semibold shadow-md hover:from-[#0948ad] hover:to-[#15803d] disabled:cursor-not-allowed disabled:from-indigo-300 disabled:to-green-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 transition-all duration-200"
                    >
                      {isSubmitting ? "Procesando..." : "Entrar"}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {registerStep > 1 ? (
                        <button
                          type="button"
                          onClick={handleRegisterPrev}
                          className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          ← Atrás
                        </button>
                      ) : (
                        <span className="min-w-[1px]" aria-hidden />
                      )}
                      {registerStep < 3 ? (
                        <button
                          type="button"
                          onClick={handleRegisterNext}
                          className="ml-auto h-11 rounded-lg bg-[#2563eb] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4ed8] focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-300"
                        >
                          Siguiente →
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="ml-auto h-11 rounded-lg bg-[#2563eb] px-6 text-sm font-semibold text-white shadow-sm hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                          {isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs text-slate-400">o</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <p className="text-base text-center text-slate-600">
                    {isLogin ? "No tienes cuenta? " : "¿Ya tienes cuenta? "}
                    <button
                      type="button"
                      className="font-semibold text-[#2563eb] hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded"
                      onClick={() => switchMode(isLogin ? "register" : "login")}
                    >
                      {isLogin ? "Registrate" : "Inicia sesión"}
                    </button>
                  </p>
                </div>
              </form>
              {!isLogin && (
                <div className="border-t border-sky-100 bg-sky-50/90 px-6 py-2.5 text-center text-xs text-sky-950/80">
                  Todos los campos marcados con <span className="font-semibold text-red-500">*</span> son obligatorios.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
