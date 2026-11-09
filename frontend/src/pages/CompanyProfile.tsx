import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { apiFetch, authenticatedFetch, getAuthToken } from "../services/api";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import type { AuthCompany, AuthSession, AuthUser } from "../types/session";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import { cedulaDigits, formatCedulaInput } from "../utils/cedula";
import { companyUploadedLogoUrl } from "../utils/companyLogo";

type Props = {
  session: AuthSession;
  onProfileUpdated: (user: AuthUser, company: AuthCompany) => void;
};
type ProfileFieldErrorKey = "certificateFile" | "certificatePassword";

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const inputCls =
  "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-[#0b57d0] focus:outline-none focus:ring-2 focus:ring-[#0b57d0]/15";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-300"}`}
        aria-hidden
      />
      {label}
    </span>
  );
}

function EyeToggle({
  visible,
  onToggle,
  label,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      aria-label={label}
      aria-pressed={visible}
    >
      {visible ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M3 3l18 18M10.5 10.5a3 3 0 004 4M9.88 9.88A3 3 0 0112 5c4 0 7.33 3 9 5a12.8 12.8 0 01-2.54 2.88M6.12 6.12A12.8 12.8 0 003 10c1.67 2 5 5 9 5a9 9 0 002.12-.25" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0948ad] disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnGhost =
  "text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50";

export default function CompanyProfile({ session, onProfileUpdated }: Props) {
  const [fullName, setFullName] = useState(session.user.full_name);
  const [cedula, setCedula] = useState(session.user.cedula);
  const [name, setName] = useState(session.company.name);
  const [rnc, setRnc] = useState(session.company.rnc);
  const [address, setAddress] = useState(session.company.address);
  const [phone, setPhone] = useState(session.company.phone ?? "");
  const [email, setEmail] = useState(session.company.email ?? "");
  const [regime, setRegime] = useState("Régimen general");
  const [dgiiUsername, setDgiiUsername] = useState(session.company.dgiiUsername ?? "");
  const [dgiiPassword, setDgiiPassword] = useState(session.company.dgiiPassword ?? "");
  const [showDgiiPassword, setShowDgiiPassword] = useState(false);
  const [ecfGatewayBaseUrl, setEcfGatewayBaseUrl] = useState(session.company.ecfGatewayBaseUrl ?? "");
  const [ecfGatewayApiKey, setEcfGatewayApiKey] = useState(session.company.ecfGatewayApiKey ?? "");
  const [showEcfGatewayApiKey, setShowEcfGatewayApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testingDgii, setTestingDgii] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ProfileFieldErrorKey, string>>>({});
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState("");
  const [dgiiToken, setDgiiToken] = useState("");
  const [certTest, setCertTest] = useState<{
    subject: string;
    issuer: string;
    validFrom: string;
    validUntil: string;
    chainCount: number;
    privateKey: boolean;
    signatureTestPassed: boolean;
    validNow: boolean;
  } | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
  const [clearCompanyLogo, setClearCompanyLogo] = useState(false);

  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState(session.company.certificate_keyphrase ?? "");
  const [showP12Password, setShowP12Password] = useState(false);
  const [clearCertificate, setClearCertificate] = useState(false);

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    };
  }, [logoObjectUrl]);

  useEffect(() => {
    setDgiiUsername(session.company.dgiiUsername ?? "");
    setDgiiPassword(session.company.dgiiPassword ?? "");
  }, [session.company.dgiiUsername, session.company.dgiiPassword]);

  useEffect(() => {
    setEcfGatewayBaseUrl(session.company.ecfGatewayBaseUrl ?? "");
    setEcfGatewayApiKey(session.company.ecfGatewayApiKey ?? "");
  }, [session.company.ecfGatewayBaseUrl, session.company.ecfGatewayApiKey]);

  const uploadedFromSession = companyUploadedLogoUrl(session.company);
  const previewImageSrc =
    logoObjectUrl ?? (!clearCompanyLogo && uploadedFromSession ? uploadedFromSession : null);

  const clearPendingUpload = () => {
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    setLogoObjectUrl(null);
    setLogoFile(null);
  };

  const resetPendingLogo = () => {
    clearPendingUpload();
    setClearCompanyLogo(false);
  };

  const cancelPendingCertificate = () => {
    setCertificateFile(null);
  };

  useEffect(() => {
    setCertificatePassword(session.company.certificate_keyphrase ?? "");
  }, [session.company.certificate_keyphrase]);

  const onPickLogo = (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    setLogoObjectUrl(URL.createObjectURL(f));
    setLogoFile(f);
    setClearCompanyLogo(false);
    setClearCertificate(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setSuccess("");
    setTestResult("");
    setCertTest(null);
    if (phone.trim() && !isValidPhone(phone)) {
      setError("El telefono debe tener formato xxx-xxx-xxxx.");
      return;
    }
    if (!/^[0-9]{11}$/.test(cedulaDigits(cedula))) {
      setError("La cedula debe tener 11 digitos.");
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setError("Sesión caducada. Iniciá sesión de nuevo.");
      return;
    }

    if (certificateFile && !certificatePassword.trim()) {
      setError("Indicá la contraseña del certificado (.p12) que vas a guardar.");
      setFieldErrors({ certificatePassword: "Contraseña requerida para el .p12 seleccionado." });
      return;
    }
    const pwdTrim = certificatePassword.trim();
    if (pwdTrim && pwdTrim.length < 8) {
      setError("La contraseña del certificado debe tener al menos 8 caracteres.");
      setFieldErrors({ certificatePassword: "Debe tener al menos 8 caracteres." });
      return;
    }
    if (!session.company.certificateConfigured && !certificateFile && pwdTrim) {
      setError("No hay certificado guardado. Seleccioná un archivo .p12/.pfx y guardá para configurarlo.");
      setFieldErrors({ certificatePassword: "Primero subí el archivo .p12/.pfx." });
      return;
    }
    setLoading(true);
    try {
      type ProfileRes = { message: string; user: AuthUser; company: AuthCompany };

      let res: ProfileRes;

      const needsMultipart =
        Boolean(logoFile) ||
        Boolean(certificateFile) ||
        clearCompanyLogo ||
        clearCertificate;

      if (needsMultipart) {
        const fd = new FormData();
        fd.append("full_name", fullName.trim());
        fd.append("cedula", cedulaDigits(cedula));
        fd.append("name", name.trim());
        fd.append("rnc", rnc.trim());
        fd.append("address", address.trim());
        fd.append("phone", phone.trim());
        fd.append("email", email.trim());
        fd.append("regime", regime.trim() || "Régimen general");
        fd.append("dgii_username", dgiiUsername.trim());
        fd.append("dgii_password", dgiiPassword.trim());
        fd.append("ecf_gateway_base_url", ecfGatewayBaseUrl.trim());
        fd.append("ecf_gateway_api_key", ecfGatewayApiKey.trim());
        if (certificateFile || session.company.certificateConfigured) {
          fd.append("certificate_keyphrase", certificatePassword.trim());
        }
        if (logoFile) fd.append("logo", logoFile);
        if (certificateFile) {
          fd.append("certificate", certificateFile);
          fd.append("certificate_password", certificatePassword.trim());
          fd.append("certificate_encryption_secret", certificatePassword.trim());
        } else if (pwdTrim && session.company.certificateConfigured) {
          fd.append("certificate_password", pwdTrim);
          fd.append("certificate_encryption_secret", pwdTrim);
        }
        if (clearCompanyLogo) fd.append("clear_logo", "true");
        if (clearCertificate) fd.append("clear_certificate", "true");

        const response = await authenticatedFetch("/auth/company", {
          method: "PUT",
          body: fd,
        });
        const data = (await response.json()) as ProfileRes & { message?: string };
        if (!response.ok) throw new Error(data.message ?? "No se pudo actualizar.");
        res = data as ProfileRes;
      } else {
        res = await apiFetch<ProfileRes>("/auth/company", {
          method: "PUT",
          body: JSON.stringify({
            full_name: fullName.trim(),
            cedula: cedulaDigits(cedula),
            name: name.trim(),
            rnc: rnc.trim(),
            address: address.trim(),
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            regime: regime.trim() || undefined,
            dgii_username: dgiiUsername.trim(),
            dgii_password: dgiiPassword.trim(),
            ecf_gateway_base_url: ecfGatewayBaseUrl.trim(),
            ecf_gateway_api_key: ecfGatewayApiKey.trim(),
            ...(session.company.certificateConfigured || pwdTrim
              ? { certificate_keyphrase: certificatePassword.trim() }
              : {}),
            ...(pwdTrim && session.company.certificateConfigured
              ? { certificate_password: pwdTrim, certificate_encryption_secret: pwdTrim }
              : {}),
          }),
        });
      }

      onProfileUpdated(res.user, res.company);
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
      setLogoObjectUrl(null);
      setLogoFile(null);
      setClearCompanyLogo(false);
      setCertificateFile(null);
      setCertificatePassword(res.company.certificate_keyphrase ?? "");
      setDgiiUsername(res.company.dgiiUsername ?? "");
      setDgiiPassword(res.company.dgiiPassword ?? "");
      setEcfGatewayBaseUrl(res.company.ecfGatewayBaseUrl ?? "");
      setEcfGatewayApiKey(res.company.ecfGatewayApiKey ?? "");
      setClearCertificate(false);
      setSuccess("Perfil de empresa actualizado.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar.";
      setError(message);
      const lower = message.toLowerCase();
      const next: Partial<Record<ProfileFieldErrorKey, string>> = {};
      if (lower.includes("contraseña del certificado") || lower.includes("(.p12) obligatoria")) {
        next.certificatePassword = "Este campo es obligatorio para guardar el certificado.";
      }
      if (Object.keys(next).length > 0) {
        setFieldErrors(next);
      }
    } finally {
      setLoading(false);
    }
  };

  const canRestoreDefault = Boolean(session.company.logoUrl) || Boolean(logoFile);

  const runDgiiTest = async () => {
    setTestingDgii(true);
    setError("");
    setSuccess("");
    setTestResult("");
    setDgiiToken("");
    try {
      const out = await apiFetch<{
        seedOk: boolean;
        tokenOk: boolean;
        token?: string;
        message: string;
        signatureModeUsed?: "legacy-sha1" | "modern-sha256";
        certificate?: {
          subject: string;
          issuer: string;
          validFrom: string;
          validUntil: string;
          chainCount: number;
          privateKey: boolean;
          signatureTestPassed: boolean;
          validNow: boolean;
        };
      }>("/auth/company/dgii/test", { method: "POST" });
      setTestResult(`${out.message}${out.signatureModeUsed ? ` · modo firma: ${out.signatureModeUsed}` : ""}`);
      setDgiiToken(out.token ?? "");
      setCertTest(out.certificate ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error probando conexión DGII.");
    } finally {
      setTestingDgii(false);
    }
  };

  const certOk = Boolean(session.company.certificateConfigured);
  const dgiiOk = Boolean(dgiiUsername.trim());
  const logoOk = Boolean(previewImageSrc);

  return (
    <PageShell>
      <form id="company-profile-form" onSubmit={onSubmit} className="space-y-4 sm:space-y-6">
        <PageHeaderCard
          title="Perfil de empresa"
          description="Datos del emisor, credenciales DGII y certificado digital para cotizaciones, e-CF y representación impresa."
          company={{ name: session.company.name, rnc: session.company.rnc }}
          stats={
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <StatusLine ok={certOk} label={certOk ? "Certificado configurado" : "Sin certificado"} />
              <StatusLine ok={dgiiOk} label={dgiiOk ? "Usuario DGII" : "Usuario DGII pendiente"} />
              <StatusLine ok={logoOk} label={logoOk ? "Logo personalizado" : "Logo por defecto"} />
            </div>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => void runDgiiTest()}
                disabled={testingDgii || loading}
                className={btnSecondary}
              >
                {testingDgii ? "Probando…" : "Probar conexión DGII"}
              </button>
              <button type="submit" disabled={loading} className={btnPrimary}>
                {loading ? "Guardando…" : "Guardar cambios"}
              </button>
            </>
          }
        />

        {(error || success || testResult || dgiiToken || certTest) && (
          <div className="space-y-2">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
                {success}
              </p>
            ) : null}
            {testResult ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">{testResult}</p>
            ) : null}
            {dgiiToken ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">Token DGII (prueba)</span>
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(dgiiToken)}
                    className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    Copiar
                  </button>
                </div>
                <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-white p-2 font-mono text-xs text-slate-600">
                  {dgiiToken}
                </pre>
              </div>
            ) : null}
            {certTest ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-1">
                <p>
                  <span className="font-medium text-slate-900">Titular:</span> {certTest.subject}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Emisor CA:</span> {certTest.issuer}
                </p>
                <p>
                  <span className="font-medium text-slate-900">Válido hasta:</span>{" "}
                  {new Date(certTest.validUntil).toLocaleString("es-DO")}
                </p>
                <p className="text-slate-600">
                  Cadena: {certTest.chainCount} certificado(s) · clave {certTest.privateKey ? "OK" : "ausente"} · firma{" "}
                  {certTest.signatureTestPassed ? "OK" : "falló"} · {certTest.validNow ? "vigente" : "no vigente"}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {/* Logo */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="Logo de la empresa"
              description="Se muestra en la barra lateral, cotizaciones y PDF de representación impresa."
            />
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                {previewImageSrc ? (
                  <img src={previewImageSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-[#0b57d0]" aria-hidden>
                    {companyInitials(name || session.company.name)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{name || session.company.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">PNG, JPG, GIF o WebP · recomendado cuadrado</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className={`${btnPrimary} cursor-pointer`}>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                      className="sr-only"
                      onChange={(e) => onPickLogo(e.target.files)}
                    />
                    {logoFile ? "Cambiar imagen" : "Subir logo"}
                  </label>
                  {canRestoreDefault ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearPendingUpload();
                        setClearCompanyLogo(true);
                      }}
                      className={`${btnGhost} text-red-600 hover:text-red-700`}
                    >
                      Quitar logo
                    </button>
                  ) : null}
                  {logoFile ? (
                    <button type="button" onClick={() => resetPendingLogo()} className={btnGhost}>
                      Descartar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Account */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="Responsable de la cuenta"
              description="Persona vinculada al usuario que opera la plataforma."
            />
            <div className="grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Nombre completo" htmlFor="prof-fullname">
                <input
                  id="prof-fullname"
                  className={inputCls}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Cédula" htmlFor="prof-cedula">
                <input
                  id="prof-cedula"
                  inputMode="numeric"
                  className={`${inputCls} font-mono`}
                  value={cedula}
                  onChange={(e) => setCedula(formatCedulaInput(e.target.value))}
                  placeholder="001-1234567-8"
                  maxLength={13}
                  required
                />
              </Field>
            </div>
          </section>

          {/* Emisor */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="Datos del emisor"
              description="Información fiscal que aparece en el XML y la representación impresa del e-CF."
            />
            <div className="grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Razón social / nombre comercial" htmlFor="prof-name">
                  <input
                    id="prof-name"
                    className={inputCls}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="RNC emisor" htmlFor="prof-rnc">
                <input
                  id="prof-rnc"
                  className={`${inputCls} font-mono`}
                  value={rnc}
                  onChange={(e) => setRnc(e.target.value)}
                  required
                />
              </Field>
              <Field label="Régimen tributario" htmlFor="prof-regime">
                <input id="prof-regime" className={inputCls} value={regime} onChange={(e) => setRegime(e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Dirección fiscal" htmlFor="prof-address">
                  <input
                    id="prof-address"
                    className={inputCls}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Teléfono" htmlFor="prof-phone">
                <input
                  id="prof-phone"
                  inputMode="numeric"
                  className={inputCls}
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  placeholder="809-555-0000"
                  maxLength={12}
                />
              </Field>
              <Field label="Correo de contacto" htmlFor="prof-email">
                <input
                  id="prof-email"
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* DGII */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="Integración DGII"
              description="Credenciales del portal para obtener token al enviar e-CF. Las URLs de recepción se configuran en Pruebas DGII."
            />
            <div className="grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Usuario DGII" htmlFor="dgii-user-prof">
                <input
                  id="dgii-user-prof"
                  className={inputCls}
                  autoComplete="off"
                  value={dgiiUsername}
                  onChange={(e) => setDgiiUsername(e.target.value)}
                />
              </Field>
              <Field label="Contraseña DGII" htmlFor="dgii-pass-prof">
                <div className="relative">
                  <input
                    id="dgii-pass-prof"
                    type={showDgiiPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${inputCls} pr-10`}
                    value={dgiiPassword}
                    onChange={(e) => setDgiiPassword(e.target.value)}
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-1 pt-1">
                    <EyeToggle
                      visible={showDgiiPassword}
                      onToggle={() => setShowDgiiPassword((v) => !v)}
                      label={showDgiiPassword ? "Ocultar contraseña DGII" : "Mostrar contraseña DGII"}
                    />
                  </span>
                </div>
              </Field>
            </div>
          </section>

          {/* ECF Gateway Connector */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="DGII Communication Gateway (conector local)"
              description="URL y API key del connector que registraste en el panel admin del gateway (sección Connectors del tenant). Se generan ahí una sola vez; si la perdiste, revocá y creá uno nuevo."
            />
            <div className="grid max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="URL del gateway" htmlFor="gateway-url-prof">
                <input
                  id="gateway-url-prof"
                  className={inputCls}
                  autoComplete="off"
                  placeholder="https://ecf-gateway.onrender.com"
                  value={ecfGatewayBaseUrl}
                  onChange={(e) => setEcfGatewayBaseUrl(e.target.value)}
                />
              </Field>
              <Field label="API key del connector" htmlFor="gateway-key-prof">
                <div className="relative">
                  <input
                    id="gateway-key-prof"
                    type={showEcfGatewayApiKey ? "text" : "password"}
                    autoComplete="off"
                    className={`${inputCls} pr-10`}
                    placeholder="4.255152011f967a46d1e304dfc85c655e4bfd493c81b274ac"
                    value={ecfGatewayApiKey}
                    onChange={(e) => setEcfGatewayApiKey(e.target.value)}
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-1 pt-1">
                    <EyeToggle
                      visible={showEcfGatewayApiKey}
                      onToggle={() => setShowEcfGatewayApiKey((v) => !v)}
                      label={showEcfGatewayApiKey ? "Ocultar API key" : "Mostrar API key"}
                    />
                  </span>
                </div>
              </Field>
            </div>
          </section>

          {/* Certificate */}
          <section className="px-6 py-8 sm:px-8">
            <SectionTitle
              title="Certificado digital"
              description="Archivo .p12 o .pfx cifrado en el servidor. La contraseña abre el certificado y actúa como clave de cifrado (mín. 8 caracteres)."
            />
            <div className="max-w-2xl space-y-5">
              <StatusLine
                ok={certOk}
                label={certOk ? "Certificado guardado en el servidor" : "Aún no hay certificado cargado"}
              />
              {certificateFile ? (
                <p className="text-sm text-slate-600">
                  Archivo seleccionado: <span className="font-medium text-slate-900">{certificateFile.name}</span>
                </p>
              ) : null}

              <label className={`${btnSecondary} w-fit cursor-pointer`}>
                <input
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  className="sr-only"
                  onChange={(e) => {
                    setClearCertificate(false);
                    setCertificateFile(e.target.files?.[0] ?? null);
                  }}
                />
                {certificateFile ? "Cambiar archivo" : "Seleccionar .p12 o .pfx"}
              </label>

              <Field
                label="Contraseña del certificado"
                htmlFor="cert-pass-prof"
                hint={
                  session.company.certificateConfigured
                    ? "Dejá vacío para no cambiarla"
                    : "Obligatoria al subir un archivo nuevo"
                }
              >
                <div className="relative">
                  <input
                    id="cert-pass-prof"
                    type={showP12Password ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${inputCls} pr-10 ${
                      fieldErrors.certificatePassword ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""
                    }`}
                    value={certificatePassword}
                    onChange={(e) => setCertificatePassword(e.target.value)}
                  />
                  <span className="absolute inset-y-0 right-0 flex items-center pr-1 pt-1">
                    <EyeToggle
                      visible={showP12Password}
                      onToggle={() => setShowP12Password((v) => !v)}
                      label={
                        showP12Password
                          ? "Ocultar contraseña del certificado"
                          : "Mostrar contraseña del certificado"
                      }
                    />
                  </span>
                </div>
                {fieldErrors.certificatePassword ? (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.certificatePassword}</p>
                ) : null}
              </Field>

              <div className="flex flex-wrap gap-4">
                {certificateFile ? (
                  <button type="button" onClick={() => cancelPendingCertificate()} className={btnGhost}>
                    Cancelar archivo nuevo
                  </button>
                ) : null}
                {!certificateFile && session.company.certificateConfigured ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClearCertificate(true);
                      cancelPendingCertificate();
                    }}
                    className={`${btnGhost} text-red-600 hover:text-red-700`}
                  >
                    Quitar certificado guardado
                  </button>
                ) : null}
              </div>

              {clearCertificate ? (
                <p className="text-sm text-amber-800">El certificado se eliminará al guardar los cambios.</p>
              ) : null}
            </div>
          </section>
        </div>

        <p className="pb-2 text-center text-xs text-slate-400 sm:text-left">
          Los cambios en logo, certificado y datos del emisor se aplican al guardar.
        </p>
      </form>
    </PageShell>
  );
}
