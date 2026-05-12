import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiUrl, getAuthToken } from "../services/api";
import type { AuthCompany, AuthSession, AuthUser } from "../types/session";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import { cedulaDigits, formatCedulaInput } from "../utils/cedula";
import { companyUploadedLogoUrl } from "../utils/companyLogo";

type Props = {
  session: AuthSession;
  onProfileUpdated: (user: AuthUser, company: AuthCompany) => void;
};
type ProfileFieldErrorKey =
  | "certificateFile"
  | "certificatePassword"
  | "dgiiSeedUrl"
  | "dgiiValidateSeedUrl";

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
      className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
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

/** URLs base del paso de pruebas DGII e-CF. */
const DGII_SANDBOX = {
  auth: "https://ecf.dgii.gov.do/CerteCF/Autenticacion",
  reception: "https://ecf.dgii.gov.do/CerteCF/Recepcion",
  consult: "https://ecf.dgii.gov.do/CerteCF/ConsultaResultado",
  consumerSummaryReception: "https://fc.dgii.gov.do/CerteCF/RecepcionFC",
  seed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/Semilla",
  validateSeed: "https://ecf.dgii.gov.do/CerteCF/Autenticacion/api/Autenticacion/ValidarSemilla",
} as const;

const trimTrailingSlashes = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeDgiiUrl = (value: string) =>
  trimTrailingSlashes(value).replace(/^(https?:\/\/[^/\s]+)\.CerteCF(?=\/|$)/i, "$1/CerteCF");
const normalizeAuthBaseUrl = (value: string) =>
  normalizeDgiiUrl(value).replace(/\/api\/Autenticacion(?:\/(?:Semilla|ValidarSemilla))?$/i, "");
const authBaseFromSeedUrl = (seedUrl?: string | null): string | null => {
  const seed = seedUrl?.trim();
  const suffix = "/api/Autenticacion/Semilla";
  if (!seed?.endsWith(suffix)) return null;
  return seed.slice(0, -suffix.length);
};
const resolveProfileUrl = (...values: Array<string | null | undefined>) =>
  values.map((v) => (v ? normalizeDgiiUrl(v) : "")).find((v): v is string => Boolean(v)) ?? "";
const seedUrlFromAuthBase = (authBase: string) => `${normalizeAuthBaseUrl(authBase)}/api/Autenticacion/Semilla`;
const validateSeedUrlFromAuthBase = (authBase: string) =>
  `${normalizeAuthBaseUrl(authBase)}/api/Autenticacion/ValidarSemilla`;

export default function CompanyProfile({ session, onProfileUpdated }: Props) {
  const [fullName, setFullName] = useState(session.user.full_name);
  const [cedula, setCedula] = useState(session.user.cedula);
  const [name, setName] = useState(session.company.name);
  const [rnc, setRnc] = useState(session.company.rnc);
  const [address, setAddress] = useState(session.company.address);
  const [phone, setPhone] = useState(session.company.phone ?? "");
  const [email, setEmail] = useState(session.company.email ?? "");
  const [regime, setRegime] = useState("Régimen general");
  const [dgiiEcfEndpoint, setDgiiEcfEndpoint] = useState(
    resolveProfileUrl(session.company.dgiiEcfEndpoint, DGII_SANDBOX.consumerSummaryReception),
  );
  const [dgiiAuthUrl, setDgiiAuthUrl] = useState(
    resolveProfileUrl(session.company.dgiiAuthUrl, authBaseFromSeedUrl(session.company.dgiiSeedUrl), DGII_SANDBOX.auth),
  );
  const [dgiiReceptionUrl, setDgiiReceptionUrl] = useState(
    resolveProfileUrl(session.company.dgiiReceptionUrl, session.company.dgiiEcfReceiveUrl, DGII_SANDBOX.reception),
  );
  const [dgiiConsultUrl, setDgiiConsultUrl] = useState(
    resolveProfileUrl(session.company.dgiiConsultUrl, session.company.dgiiTrackUrl, session.company.dgiiStatusUrl, DGII_SANDBOX.consult),
  );
  const [dgiiEnvironment, setDgiiEnvironment] = useState<"CERTIFICACION" | "PRODUCCION">(
    session.company.dgiiEnvironment === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION",
  );
  const [dgiiUsername, setDgiiUsername] = useState(session.company.dgiiUsername ?? "");
  const [dgiiPassword, setDgiiPassword] = useState(session.company.dgiiPassword ?? "");
  const [showDgiiPassword, setShowDgiiPassword] = useState(false);
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
  /** Tras guardar sin logo propio el backend deja logoUrl null (en el panel solo se muestra el ícono pequeño). */
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
    setDgiiEcfEndpoint(resolveProfileUrl(session.company.dgiiEcfEndpoint, DGII_SANDBOX.consumerSummaryReception));
    setDgiiAuthUrl(resolveProfileUrl(session.company.dgiiAuthUrl, authBaseFromSeedUrl(session.company.dgiiSeedUrl), DGII_SANDBOX.auth));
    setDgiiReceptionUrl(resolveProfileUrl(session.company.dgiiReceptionUrl, session.company.dgiiEcfReceiveUrl, DGII_SANDBOX.reception));
    setDgiiConsultUrl(resolveProfileUrl(session.company.dgiiConsultUrl, session.company.dgiiTrackUrl, session.company.dgiiStatusUrl, DGII_SANDBOX.consult));
    setDgiiEnvironment(session.company.dgiiEnvironment === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION");
    setDgiiUsername(session.company.dgiiUsername ?? "");
    setDgiiPassword(session.company.dgiiPassword ?? "");
  }, [
    session.company.dgiiAuthUrl,
    session.company.dgiiReceptionUrl,
    session.company.dgiiConsultUrl,
    session.company.dgiiSeedUrl,
    session.company.dgiiEcfReceiveUrl,
    session.company.dgiiEcfEndpoint,
    session.company.dgiiTrackUrl,
    session.company.dgiiStatusUrl,
    session.company.dgiiEnvironment,
    session.company.dgiiUsername,
    session.company.dgiiPassword,
  ]);

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
    const dgiiAuthBase = normalizeAuthBaseUrl(dgiiAuthUrl || DGII_SANDBOX.auth);
    const dgiiReceptionBase = normalizeDgiiUrl(dgiiReceptionUrl || DGII_SANDBOX.reception);
    const dgiiConsultBase = normalizeDgiiUrl(dgiiConsultUrl || DGII_SANDBOX.consult);
    const dgiiConsumerSummaryBase = normalizeDgiiUrl(dgiiEcfEndpoint || DGII_SANDBOX.consumerSummaryReception);

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
        fd.append("dgii_ecf_endpoint", dgiiConsumerSummaryBase);
        fd.append("dgii_auth_url", dgiiAuthBase);
        fd.append("dgii_reception_url", dgiiReceptionBase);
        fd.append("dgii_consult_url", dgiiConsultBase);
        fd.append("dgii_seed_url", seedUrlFromAuthBase(dgiiAuthBase));
        fd.append("dgii_validate_seed_url", validateSeedUrlFromAuthBase(dgiiAuthBase));
        fd.append("dgii_ecf_receive_url", dgiiReceptionBase);
        fd.append("dgii_track_url", "");
        fd.append("dgii_status_url", "");
        fd.append("dgii_environment", dgiiEnvironment);
        fd.append("dgii_username", dgiiUsername.trim());
        fd.append("dgii_password", dgiiPassword.trim());
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

        const response = await fetch(`${apiUrl}/auth/company`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
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
            dgii_ecf_endpoint: dgiiConsumerSummaryBase,
            dgii_auth_url: dgiiAuthBase,
            dgii_reception_url: dgiiReceptionBase,
            dgii_consult_url: dgiiConsultBase,
            dgii_seed_url: seedUrlFromAuthBase(dgiiAuthBase),
            dgii_validate_seed_url: validateSeedUrlFromAuthBase(dgiiAuthBase),
            dgii_ecf_receive_url: dgiiReceptionBase,
            dgii_track_url: "",
            dgii_status_url: "",
            dgii_environment: dgiiEnvironment,
            dgii_username: dgiiUsername.trim(),
            dgii_password: dgiiPassword.trim(),
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
      setDgiiAuthUrl(resolveProfileUrl(res.company.dgiiAuthUrl, authBaseFromSeedUrl(res.company.dgiiSeedUrl), DGII_SANDBOX.auth));
      setDgiiReceptionUrl(resolveProfileUrl(res.company.dgiiReceptionUrl, res.company.dgiiEcfReceiveUrl, DGII_SANDBOX.reception));
      setDgiiConsultUrl(resolveProfileUrl(res.company.dgiiConsultUrl, DGII_SANDBOX.consult));
      setDgiiEnvironment(res.company.dgiiEnvironment === "PRODUCCION" ? "PRODUCCION" : "CERTIFICACION");
      setDgiiUsername(res.company.dgiiUsername ?? "");
      setDgiiPassword(res.company.dgiiPassword ?? "");
      setDgiiEcfEndpoint(resolveProfileUrl(res.company.dgiiEcfEndpoint, DGII_SANDBOX.consumerSummaryReception));
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
      if (lower.includes("semilla")) {
        next.dgiiSeedUrl = "Revisá URL de semilla.";
      }
      if (lower.includes("validar semilla")) {
        next.dgiiValidateSeedUrl = "Revisá URL de ValidarSemilla.";
      }
      if (Object.keys(next).length > 0) {
        setFieldErrors(next);
      }
    } finally {
      setLoading(false);
    }
  };

  const canRestoreDefault =
    Boolean(session.company.logoUrl) || Boolean(logoFile);

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
      }>(
        "/auth/company/dgii/test",
        { method: "POST" },
      );
      setTestResult(`${out.message}${out.signatureModeUsed ? ` · modo firma: ${out.signatureModeUsed}` : ""}`);
      setDgiiToken(out.token ?? "");
      setCertTest(out.certificate ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error probando conexión DGII.");
    } finally {
      setTestingDgii(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-0 pb-10 pt-4 sm:pt-5">
      <div className="mx-auto max-w-2xl mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-extrabold text-[#0b57d0]">Perfil de empresa</h1>
        <p className="text-slate-600">Actualiza los datos que se muestran en cotizaciones y PDF.</p>
        <p className="text-xs text-slate-500 mt-1">{session.company.name} · RNC {session.company.rnc}</p>
      </div>
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Logo</p>
          <p className="mt-1 text-xs text-slate-600">
            Sin logo subido, en la barra lateral solo se muestra el ícono pequeño de la app; con archivo, tu marca aparece
            también en cotizaciones y PDF.
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner grid place-items-center">
              {previewImageSrc ? (
                <img src={previewImageSrc} alt="" className="max-h-[90%] max-w-[90%] object-contain p-2 bg-white rounded-lg" />
              ) : (
                <span className="text-lg font-bold tracking-tight text-slate-500 select-none" aria-hidden>
                  {companyInitials(name || session.company.name)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 min-w-0">
              <label className="inline-flex w-fit cursor-pointer items-center rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] shadow-sm">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
                  className="sr-only"
                  onChange={(e) => onPickLogo(e.target.files)}
                />
                Cambiar logo
              </label>
              {canRestoreDefault ? (
                <button
                  type="button"
                  onClick={() => {
                    clearPendingUpload();
                    setClearCompanyLogo(true);
                  }}
                  className="w-fit text-left text-sm font-medium text-slate-600 underline-offset-2 hover:text-red-700 hover:underline"
                >
                  Quitar logo
                </button>
              ) : null}
              {logoFile ? (
                <button
                  type="button"
                  onClick={() => resetPendingLogo()}
                  className="w-fit text-sm text-slate-500 hover:text-slate-800"
                >
                  Cancelar nueva imagen
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">DGII Integration</p>
          <p className="text-xs text-slate-600">
            Cada empresa usa sus propias URLs y credenciales. Valores por defecto: certificación DGII (sandbox). Para
            producción, reemplazá las URLs por las que indique la DGII y las credenciales del ambiente productivo.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-env">
              Ambiente DGII
            </label>
            <select
              id="dgii-env"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={dgiiEnvironment}
              onChange={(e) => setDgiiEnvironment(e.target.value as "CERTIFICACION" | "PRODUCCION")}
            >
              <option value="CERTIFICACION">CERTIFICACION</option>
              <option value="PRODUCCION">PRODUCCION</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-auth-url">
              Servicio de autenticación
            </label>
            <input
              id="dgii-auth-url"
              type="url"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono text-[13px]"
              placeholder={DGII_SANDBOX.auth}
              value={dgiiAuthUrl}
              onChange={(e) => setDgiiAuthUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-reception-url">
              Servicio de recepción e-CF
            </label>
            <input
              id="dgii-reception-url"
              type="url"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono text-[13px]"
              placeholder={DGII_SANDBOX.reception}
              value={dgiiReceptionUrl}
              onChange={(e) => setDgiiReceptionUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-consult-url">
              Servicio de consulta de envío
            </label>
            <input
              id="dgii-consult-url"
              type="url"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono text-[13px]"
              placeholder={DGII_SANDBOX.consult}
              value={dgiiConsultUrl}
              onChange={(e) => setDgiiConsultUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-fc-reception-url">
              Servicio de recepción de resúmenes de factura de consumo menor a RD$ 250,000.00
            </label>
            <input
              id="dgii-fc-reception-url"
              type="url"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono text-[13px]"
              placeholder={DGII_SANDBOX.consumerSummaryReception}
              value={dgiiEcfEndpoint}
              onChange={(e) => setDgiiEcfEndpoint(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-user-prof">
                Usuario DGII
              </label>
              <input
                id="dgii-user-prof"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                autoComplete="off"
                value={dgiiUsername}
                onChange={(e) => setDgiiUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-pass-prof">
                Contraseña DGII
              </label>
              <div className="relative mt-1">
                <input
                  id="dgii-pass-prof"
                  type={showDgiiPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 py-2 pl-3 pr-11 text-sm"
                  value={dgiiPassword}
                  onChange={(e) => setDgiiPassword(e.target.value)}
                />
                <span className="absolute inset-y-0 right-1 flex items-center">
                  <EyeToggle
                    visible={showDgiiPassword}
                    onToggle={() => setShowDgiiPassword((v) => !v)}
                    label={showDgiiPassword ? "Ocultar contraseña DGII" : "Mostrar contraseña DGII"}
                  />
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            El RNC del emisor es el de la empresa (campo RNC más abajo). Con usuario y contraseña, el backend obtiene un
            token en memoria por empresa y envía el e-CF firmado a la URL de recepción.
          </p>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Digital Certificate</p>
          <p className="mt-1 text-xs text-slate-600">
            Subí tu .p12 o .pfx: el archivo queda cifrado en disco. La{" "}
            <span className="font-medium text-slate-700">contraseña del archivo</span> (exportación del certificado) no se
            guarda en texto plano; la <span className="font-medium text-slate-700">clave de cifrado</span> (mín. 8
            caracteres) sí se guarda en tu empresa para poder enviar e-CF desde Cotizaciones sin volver a escribirla.
            Podés verla u ocultarla con el ícono del ojo.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            Estado:{" "}
            <span className={session.company.certificateConfigured ? "text-emerald-700" : "text-amber-700"}>
              {session.company.certificateConfigured ? "Certificado configurado" : "Sin certificado"}
            </span>
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <label className="inline-flex w-fit cursor-pointer items-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">
              <input
                type="file"
                accept=".p12,.pfx,application/x-pkcs12"
                className="sr-only"
                onChange={(e) => {
                  setClearCertificate(false);
                  setCertificateFile(e.target.files?.[0] ?? null);
                }}
              />
              {certificateFile ? "Cambiar archivo de certificado" : "Seleccionar .p12 / .pfx"}
            </label>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700" htmlFor="cert-pass-prof">
                Contraseña del certificado (.p12 / .pfx)
              </label>
              <div className="relative">
                <input
                  id="cert-pass-prof"
                  type={showP12Password ? "text" : "password"}
                  autoComplete="new-password"
                className={`w-full rounded border py-2 pl-3 pr-11 text-sm ${
                  fieldErrors.certificatePassword ? "border-red-400 bg-red-50" : "border-slate-300"
                }`}
                  placeholder={
                    session.company.certificateConfigured
                      ? "Dejá vacío si no cambiás la contraseña; o completá con la nueva"
                      : "Obligatoria al subir un archivo nuevo"
                  }
                  value={certificatePassword}
                  onChange={(e) => setCertificatePassword(e.target.value)}
                />
                <span className="absolute inset-y-0 right-1 flex items-center">
                  <EyeToggle
                    visible={showP12Password}
                    onToggle={() => setShowP12Password((v) => !v)}
                    label={showP12Password ? "Ocultar contraseña del certificado" : "Mostrar contraseña del certificado"}
                  />
                </span>
              </div>
              {fieldErrors.certificatePassword ? (
                <p className="mt-1 text-xs text-red-700">{fieldErrors.certificatePassword}</p>
              ) : null}
              <p className="text-[11px] text-slate-500">
                Esta contraseña se usa para abrir el .p12 y también como clave interna de cifrado de la app.
              </p>
            </div>
            {certificateFile ? (
              <button
                type="button"
                onClick={() => cancelPendingCertificate()}
                className="w-fit text-sm text-slate-600 hover:text-slate-900"
              >
                Cancelar nueva carga de certificado
              </button>
            ) : null}
            {!certificateFile && session.company.certificateConfigured ? (
              <button
                type="button"
                onClick={() => {
                  setClearCertificate(true);
                  cancelPendingCertificate();
                }}
                className="w-fit text-sm font-medium text-red-700 hover:underline"
              >
                Quitar certificado guardado
              </button>
            ) : null}
            {clearCertificate ? (
              <p className="text-xs text-amber-800">
                Se eliminará el certificado al guardar los cambios.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Nombre de la persona</p>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Cedula de la persona</p>
            <input
              inputMode="numeric"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
              value={cedula}
              onChange={(e) => setCedula(formatCedulaInput(e.target.value))}
              placeholder="001-1234567-8"
              maxLength={13}
              required
            />
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nombre empresa</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">RNC</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
              value={rnc}
              onChange={(e) => setRnc(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Dirección</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Teléfono</label>
              <input
                inputMode="numeric"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="xxx-xxx-xxxx"
                maxLength={12}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Correo</label>
              <input
                type="email"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Régimen</label>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
            />
          </div>

          {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && (
            <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </p>
          )}
          {testResult && (
            <p className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
              {testResult}
            </p>
          )}
          {dgiiToken && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold shrink-0">Token DGII:</span>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(dgiiToken)}
                  className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700"
                >
                  Copiar
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] max-h-32 overflow-y-auto">
                {dgiiToken}
              </pre>
            </div>
          )}
          {certTest && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-1">
              <p><span className="font-semibold">Owner:</span> {certTest.subject}</p>
              <p><span className="font-semibold">Issuer:</span> {certTest.issuer}</p>
              <p><span className="font-semibold">Valid until:</span> {new Date(certTest.validUntil).toLocaleString()}</p>
              <p>
                <span className="font-semibold">Chain status:</span>{" "}
                {certTest.chainCount} cert(s) · key {certTest.privateKey ? "OK" : "missing"} · signature{" "}
                {certTest.signatureTestPassed ? "OK" : "failed"} · {certTest.validNow ? "vigente" : "vencido/no vigente"}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void runDgiiTest()}
            disabled={testingDgii || loading}
            className="mr-2 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {testingDgii ? "Probando..." : "Test DGII Signature"}
          </button>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </div>
  );
}
