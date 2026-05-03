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

export default function CompanyProfile({ session, onProfileUpdated }: Props) {
  const [fullName, setFullName] = useState(session.user.full_name);
  const [cedula, setCedula] = useState(session.user.cedula);
  const [name, setName] = useState(session.company.name);
  const [rnc, setRnc] = useState(session.company.rnc);
  const [address, setAddress] = useState(session.company.address);
  const [phone, setPhone] = useState(session.company.phone ?? "");
  const [email, setEmail] = useState(session.company.email ?? "");
  const [regime, setRegime] = useState("Régimen general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
  /** Tras guardar sin logo propio el backend deja logoUrl null (en el panel solo se muestra el ícono pequeño). */
  const [clearCompanyLogo, setClearCompanyLogo] = useState(false);

  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [certificateEncryptionSecret, setCertificateEncryptionSecret] = useState("");
  const [clearCertificate, setClearCertificate] = useState(false);

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    };
  }, [logoObjectUrl]);

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
    setCertificateEncryptionSecret("");
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
        if (logoFile) fd.append("logo", logoFile);
        if (certificateFile) {
          fd.append("certificate", certificateFile);
          fd.append("certificate_password", certificatePassword.trim());
          fd.append("certificate_encryption_secret", certificateEncryptionSecret.trim());
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
          }),
        });
      }

      onProfileUpdated(res.user, res.company);
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
      setLogoObjectUrl(null);
      setLogoFile(null);
      setClearCompanyLogo(false);
      cancelPendingCertificate();
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

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Certificado digital (DGII)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Para enviar e-CF firmados necesitamos tu .p12 o .pfx. Se almacena cifrado en disco; la contraseña del archivo y
            una <span className="font-medium text-slate-700">clave de cifrado</span> que definís vos (mín. 8 caracteres) no se
            guardan en texto plano. Volvé a ingresar esa clave cada vez que envíes a DGII.
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
            {certificateFile ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700" htmlFor="cert-pass-prof">
                  Contraseña del certificado
                </label>
                <input
                  id="cert-pass-prof"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={certificatePassword}
                  onChange={(e) => setCertificatePassword(e.target.value)}
                />
                <label className="block text-xs font-semibold text-slate-700" htmlFor="cert-enc-prof">
                  Clave de cifrado (mín. 8 caracteres)
                </label>
                <input
                  id="cert-enc-prof"
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="La misma clave al enviar e-CF"
                  value={certificateEncryptionSecret}
                  onChange={(e) => setCertificateEncryptionSecret(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => cancelPendingCertificate()}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  Cancelar nueva carga de certificado
                </button>
              </div>
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
