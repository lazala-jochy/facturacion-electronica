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

/** Ambiente certificación DGII (sandbox). Producción: reemplazá las URLs en perfil. */
const DGII_SANDBOX = {
  auth: "https://ecf.dgii.gov.do/ecf/autenticacion/api/Autenticacion",
  reception: "https://ecf.dgii.gov.do/ecf/recepcion/api/RecepcionFC",
  consult: "https://ecf.dgii.gov.do/ecf/consulta/api/ConsultaResultado",
} as const;

export default function CompanyProfile({ session, onProfileUpdated }: Props) {
  const [fullName, setFullName] = useState(session.user.full_name);
  const [cedula, setCedula] = useState(session.user.cedula);
  const [name, setName] = useState(session.company.name);
  const [rnc, setRnc] = useState(session.company.rnc);
  const [address, setAddress] = useState(session.company.address);
  const [phone, setPhone] = useState(session.company.phone ?? "");
  const [email, setEmail] = useState(session.company.email ?? "");
  const [regime, setRegime] = useState("Régimen general");
  const [dgiiEcfEndpoint, setDgiiEcfEndpoint] = useState(session.company.dgiiEcfEndpoint ?? "");
  const [dgiiAuthUrl, setDgiiAuthUrl] = useState(session.company.dgiiAuthUrl ?? "");
  const [dgiiReceptionUrl, setDgiiReceptionUrl] = useState(session.company.dgiiReceptionUrl ?? "");
  const [dgiiConsultUrl, setDgiiConsultUrl] = useState(session.company.dgiiConsultUrl ?? "");
  const [dgiiUsername, setDgiiUsername] = useState(session.company.dgiiUsername ?? "");
  const [dgiiPassword, setDgiiPassword] = useState(session.company.dgiiPassword ?? "");
  const [showDgiiPassword, setShowDgiiPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
  /** Tras guardar sin logo propio el backend deja logoUrl null (en el panel solo se muestra el ícono pequeño). */
  const [clearCompanyLogo, setClearCompanyLogo] = useState(false);

  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [certificateEncryptionSecret, setCertificateEncryptionSecret] = useState(
    session.company.certificate_keyphrase ?? "",
  );
  const [showP12Password, setShowP12Password] = useState(false);
  const [showEncryptionSecret, setShowEncryptionSecret] = useState(false);
  const [clearCertificate, setClearCertificate] = useState(false);

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    };
  }, [logoObjectUrl]);

  useEffect(() => {
    setDgiiEcfEndpoint(session.company.dgiiEcfEndpoint ?? "");
  }, [session.company.dgiiEcfEndpoint]);

  useEffect(() => {
    setDgiiAuthUrl(session.company.dgiiAuthUrl ?? "");
    setDgiiReceptionUrl(session.company.dgiiReceptionUrl ?? "");
    setDgiiConsultUrl(session.company.dgiiConsultUrl ?? "");
    setDgiiUsername(session.company.dgiiUsername ?? "");
    setDgiiPassword(session.company.dgiiPassword ?? "");
  }, [
    session.company.dgiiAuthUrl,
    session.company.dgiiReceptionUrl,
    session.company.dgiiConsultUrl,
    session.company.dgiiUsername,
    session.company.dgiiPassword,
  ]);

  useEffect(() => {
    setCertificateEncryptionSecret(session.company.certificate_keyphrase ?? "");
  }, [session.company.certificate_keyphrase]);

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
    setCertificatePassword("");
  };

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
    setSuccess("");
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
      return;
    }
    if (certificateFile && certificateEncryptionSecret.trim().length < 8) {
      setError("La clave de cifrado del certificado debe tener al menos 8 caracteres (la usarás al enviar e-CF).");
      return;
    }
    const encTrim = certificateEncryptionSecret.trim();
    const pwdTrim = certificatePassword.trim();
    if ((pwdTrim && !encTrim) || (!pwdTrim && encTrim)) {
      setError("Para actualizar solo la contraseña del .p12, completá contraseña del certificado y clave de cifrado.");
      return;
    }
    if (!certificateFile && pwdTrim && encTrim.length < 8) {
      setError("La clave de cifrado del certificado debe tener al menos 8 caracteres.");
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
        fd.append("dgii_ecf_endpoint", dgiiEcfEndpoint.trim());
        fd.append("dgii_auth_url", dgiiAuthUrl.trim());
        fd.append("dgii_reception_url", dgiiReceptionUrl.trim());
        fd.append("dgii_consult_url", dgiiConsultUrl.trim());
        fd.append("dgii_username", dgiiUsername.trim());
        fd.append("dgii_password", dgiiPassword.trim());
        fd.append("certificate_keyphrase", certificateEncryptionSecret.trim());
        if (logoFile) fd.append("logo", logoFile);
        if (certificateFile) {
          fd.append("certificate", certificateFile);
          fd.append("certificate_password", certificatePassword.trim());
          fd.append("certificate_encryption_secret", certificateEncryptionSecret.trim());
        } else if (pwdTrim && encTrim) {
          fd.append("certificate_password", pwdTrim);
          fd.append("certificate_encryption_secret", encTrim);
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
            dgii_ecf_endpoint: dgiiEcfEndpoint.trim(),
            dgii_auth_url: dgiiAuthUrl.trim(),
            dgii_reception_url: dgiiReceptionUrl.trim(),
            dgii_consult_url: dgiiConsultUrl.trim(),
            dgii_username: dgiiUsername.trim(),
            dgii_password: dgiiPassword.trim(),
            certificate_keyphrase: certificateEncryptionSecret.trim(),
            ...(pwdTrim && encTrim
              ? { certificate_password: pwdTrim, certificate_encryption_secret: encTrim }
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
      setCertificatePassword("");
      setCertificateEncryptionSecret(res.company.certificate_keyphrase ?? "");
      setDgiiAuthUrl(res.company.dgiiAuthUrl ?? "");
      setDgiiReceptionUrl(res.company.dgiiReceptionUrl ?? "");
      setDgiiConsultUrl(res.company.dgiiConsultUrl ?? "");
      setDgiiUsername(res.company.dgiiUsername ?? "");
      setDgiiPassword(res.company.dgiiPassword ?? "");
      setDgiiEcfEndpoint(res.company.dgiiEcfEndpoint ?? "");
      setClearCertificate(false);
      setSuccess("Perfil de empresa actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  };

  const canRestoreDefault =
    Boolean(session.company.logoUrl) || Boolean(logoFile);

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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">DGII e-CF (por empresa)</p>
          <p className="text-xs text-slate-600">
            Cada empresa usa sus propias URLs y credenciales. Valores por defecto: certificación DGII (sandbox). Para
            producción, reemplazá las URLs por las que indique la DGII y las credenciales del ambiente productivo.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-auth-url">
              URL autenticación
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
              URL recepción (XML firmado)
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
              URL consulta resultado
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
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="dgii-url-legacy">
              URL recepción legacy (opcional)
            </label>
            <input
              id="dgii-url-legacy"
              type="url"
              inputMode="url"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono text-[13px]"
              placeholder="Solo si usás envío directo sin credenciales DGII"
              value={dgiiEcfEndpoint}
              onChange={(e) => setDgiiEcfEndpoint(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Certificado digital (DGII)
          </p>
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
                  className="w-full rounded border border-slate-300 py-2 pl-3 pr-11 text-sm"
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
              <label className="block text-xs font-semibold text-slate-700" htmlFor="cert-enc-prof">
                Clave de cifrado (mín. 8 caracteres, se guarda en la empresa)
              </label>
              <div className="relative">
                <input
                  id="cert-enc-prof"
                  type={showEncryptionSecret ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 py-2 pl-3 pr-11 text-sm"
                  placeholder="Se usa al enviar e-CF a DGII"
                  value={certificateEncryptionSecret}
                  onChange={(e) => setCertificateEncryptionSecret(e.target.value)}
                />
                <span className="absolute inset-y-0 right-1 flex items-center">
                  <EyeToggle
                    visible={showEncryptionSecret}
                    onToggle={() => setShowEncryptionSecret((v) => !v)}
                    label={showEncryptionSecret ? "Ocultar clave de cifrado" : "Mostrar clave de cifrado"}
                  />
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Si ya tenés certificado guardado y solo querés corregir la contraseña del mismo .p12, completá contraseña y
                clave de cifrado sin elegir archivo nuevo.
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
                  setCertificateEncryptionSecret("");
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
