import { useState, type FormEvent } from "react";
import { apiFetch } from "../services/api";
import type { AuthCompany, AuthSession, AuthUser } from "../types/session";
import { formatPhoneInput, isValidPhone } from "../utils/phone";
import { cedulaDigits, formatCedulaInput } from "../utils/cedula";

type Props = {
  session: AuthSession;
  onProfileUpdated: (user: AuthUser, company: AuthCompany) => void;
};

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

    setLoading(true);
    try {
      const res = await apiFetch<{
        message: string;
        user: AuthUser;
        company: AuthCompany;
      }>("/auth/company", {
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
      onProfileUpdated(res.user, res.company);
      setSuccess("Perfil de empresa actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full px-4 sm:px-0 pb-10 pt-8 sm:pt-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">Perfil de empresa</h1>
        <p className="mt-1 text-sm text-slate-600">
          Actualiza los datos que se muestran en cotizaciones y PDF.
        </p>

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
