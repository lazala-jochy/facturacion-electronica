import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listClients, type ClientListItem } from "../services/clients";
import { ApiError, readAuthSessionFromStorage, refreshAuthSessionFromServer } from "../services/api";
import {
  deleteCotizacion,
  downloadCotizacionPDF,
  getCotizacion,
  submitEcf,
  type CotizacionDetail,
} from "../services/cotizaciones";

// Helper para formatear moneda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
  }).format(value);
};

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

/** Icono carpeta + lupa: intención “buscar archivo en el equipo”. */
function CertBrowseIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10 22h12l4 4h20a4 4 0 014 4v18a4 4 0 01-4 4H14a4 4 0 01-4-4V26a4 4 0 014-4z"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinejoin="round"
        className="text-slate-300"
      />
      <path
        d="M10 22V18a4 4 0 014-4h10l4 4h4"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#2563eb]"
      />
      <circle cx={38} cy={38} r={9} stroke="#2563eb" strokeWidth={2.5} />
      <path d="M45 45l10 10" stroke="#2563eb" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export default function Clients() {
  const session = readAuthSessionFromStorage();
  const company = session?.company;
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sendingEcfId, setSendingEcfId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string>("");
  const [ecfError, setEcfError] = useState<string>("");
  const [ecfSuccess, setEcfSuccess] = useState<string>("");
  const [ecfNeedCertForId, setEcfNeedCertForId] = useState<number | null>(null);
  const [modalCertFile, setModalCertFile] = useState<File | null>(null);
  const [modalCertPassword, setModalCertPassword] = useState("");
  /** Clave definida al guardar el .p12; obligatoria en cada envío si ya hay certificado. */
  const [ecfEncryptionSecret, setEcfEncryptionSecret] = useState("");
  const [modalEncryptionSecret, setModalEncryptionSecret] = useState("");
  const [ecfCertModalLoading, setEcfCertModalLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "rnc" | "number" | "total" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<CotizacionDetail | null>(null);
  const [crudMessage, setCrudMessage] = useState("");
  const [crudError, setCrudError] = useState("");

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const id = company?.id;
    if (id == null || typeof sessionStorage === "undefined") return;
    const saved = sessionStorage.getItem(`fe_cert_enc_${id}`);
    const fromProfile = company?.certificate_keyphrase?.trim() ?? "";
    if (fromProfile) {
      setEcfEncryptionSecret((prev) => (prev.trim().length > 0 ? prev : fromProfile));
    } else if (saved) {
      setEcfEncryptionSecret((prev) => (prev.trim().length > 0 ? prev : saved));
    }
  }, [company?.id, company?.certificate_keyphrase]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { clients } = await listClients();
        setClients(clients);
      } catch (error) {
        console.error("Error al cargar clientes", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  const handleDownload = async (cotizacionId: number, clientName: string) => {
    setDownloadingId(cotizacionId);
    setDownloadError("");
    try {
      await downloadCotizacionPDF(cotizacionId, `cotizacion-${clientName}.pdf`);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Error al descargar el PDF";
      setDownloadError(errorMsg);
      console.error("Error al descargar PDF:", error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendEcf = async (cotizacionId: number) => {
    if (!isOnline) {
      setEcfError("Debes conectarte a internet para enviar a DGII.");
      return;
    }
    setSendingEcfId(cotizacionId);
    setEcfError("");
    setEcfSuccess("");
    const encForSend =
      ecfEncryptionSecret.trim() || company?.certificate_keyphrase?.trim() || "";
    if (company?.certificateConfigured && encForSend.length < 8) {
      setEcfError(
        "No hay clave de cifrado del certificado. Guardala en Perfil de empresa (mín. 8 caracteres) o ingresala abajo antes de enviar.",
      );
      setSendingEcfId(null);
      return;
    }
    try {
      const out = await submitEcf(cotizacionId, {
        certificateEncryptionSecret:
          company?.certificateConfigured && encForSend.length >= 8 ? encForSend : undefined,
      });
      setEcfSuccess(`e-CF enviado (Track ID: ${out.track_id}).`);
      setClients((prev) =>
        prev.map((client) => ({
          ...client,
          cotizaciones: client.cotizaciones.map((row) =>
            row.id === cotizacionId
              ? {
                  ...row,
                  dgii_status: out.status,
                  dgii_track_id: out.track_id,
                  dgii_submitted_at: new Date().toISOString(),
                }
              : row,
          ),
        })),
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 428 || error.body?.code === "CERTIFICATE_REQUIRED")
      ) {
        setModalCertFile(null);
        setModalCertPassword("");
        setModalEncryptionSecret(ecfEncryptionSecret.trim());
        setEcfNeedCertForId(cotizacionId);
        return;
      }
      const errorMsg =
        error instanceof Error ? error.message : "Error al enviar e-CF";
      setEcfError(errorMsg);
      console.error("Error al enviar e-CF:", error);
    } finally {
      setSendingEcfId(null);
    }
  };

  const handleSubmitCertAndResend = async () => {
    const id = ecfNeedCertForId;
    if (id === null || !modalCertFile) {
      setEcfError("Seleccioná tu archivo .p12 o .pfx.");
      return;
    }
    if (!modalCertPassword.trim()) {
      setEcfError("Indicá la contraseña del certificado.");
      return;
    }
    if (modalEncryptionSecret.trim().length < 8) {
      setEcfError("La clave de cifrado del certificado debe tener al menos 8 caracteres.");
      return;
    }
    if (!isOnline) {
      setEcfError("Debes conectarte a internet para enviar a DGII.");
      return;
    }
    setEcfCertModalLoading(true);
    setEcfError("");
    setEcfSuccess("");
    try {
      const out = await submitEcf(id, {
        certificate: modalCertFile,
        certificatePassword: modalCertPassword,
        certificateEncryptionSecret: modalEncryptionSecret.trim(),
      });
      if (out.certificate_saved) {
        await refreshAuthSessionFromServer();
      }
      setEcfNeedCertForId(null);
      setModalCertFile(null);
      setModalCertPassword("");
      const enc = modalEncryptionSecret.trim();
      setModalEncryptionSecret("");
      setEcfEncryptionSecret(enc);
      if (company?.id && enc.length >= 8) {
        sessionStorage.setItem(`fe_cert_enc_${company.id}`, enc);
      }
      setEcfSuccess(`e-CF enviado (Track ID: ${out.track_id}).`);
      setClients((prev) =>
        prev.map((client) => ({
          ...client,
          cotizaciones: client.cotizaciones.map((row) =>
            row.id === id
              ? {
                  ...row,
                  dgii_status: out.status,
                  dgii_track_id: out.track_id,
                  dgii_submitted_at: new Date().toISOString(),
                }
              : row,
          ),
        })),
      );
    } catch (error) {
      setEcfError(error instanceof Error ? error.message : "Error al enviar e-CF");
    } finally {
      setEcfCertModalLoading(false);
    }
  };

  const handleOpenDetail = async (cotizacionId: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    try {
      const out = await getCotizacion(cotizacionId);
      setDetail(out.cotizacion);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "No se pudo cargar el detalle.",
      );
    } finally {
      setDetailLoading(false);
    }
  };


  const refreshClients = async () => {
    const { clients: out } = await listClients();
    setClients(out);
  };


  const handleDeleteClient = async (client: ClientListItem) => {
    const last = client.cotizaciones?.[0];
    if (!last) {
      setCrudError("Este cliente no tiene cotización para eliminar.");
      return;
    }
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar la cotización #${last.number} de "${client.name}"?`,
    );
    if (!confirmed) return;
    setCrudError("");
    setCrudMessage("");
    try {
      await deleteCotizacion(last.id);
      await refreshClients();
      setCrudMessage("Cotización eliminada correctamente.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo eliminar la cotización.";
      setCrudError(message);
    }
  };

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const withLast = clients
      .map((client) => {
        const last = client.cotizaciones?.[0];
        return { client, last };
      })
      .filter(({ client, last }) => {
        if (!normalizedQuery) return true;
        const raw = [
          client.name,
          client.rnc_cedula,
          client.phone ?? "",
          client.email ?? "",
          last ? String(last.number) : "",
          last ? String(last.total) : "",
          last?.dgii_status ?? "",
          last?.dgii_track_id ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return raw.includes(normalizedQuery);
      });

    const sorted = [...withLast].sort((a, b) => {
      const aStatus = a.last?.dgii_status ?? "";
      const bStatus = b.last?.dgii_status ?? "";
      const aNumber = a.last?.number ?? -1;
      const bNumber = b.last?.number ?? -1;
      const aTotal = a.last?.total ?? -1;
      const bTotal = b.last?.total ?? -1;

      let compare = 0;
      if (sortBy === "name") compare = a.client.name.localeCompare(b.client.name);
      if (sortBy === "rnc") compare = a.client.rnc_cedula.localeCompare(b.client.rnc_cedula);
      if (sortBy === "number") compare = aNumber - bNumber;
      if (sortBy === "total") compare = aTotal - bTotal;
      if (sortBy === "status") compare = aStatus.localeCompare(bStatus);
      return sortDir === "asc" ? compare : -compare;
    });
    return sorted;
  }, [clients, query, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="w-full px-4 sm:px-6 md:px-8 py-6 sm:py-8 pt-4 sm:pt-5">
      {/* Header */}
      <div className="mb-6 sm:mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-3xl font-extrabold text-[#0b57d0]">Clientes</h1>
        <p className="text-slate-600">Gestiona tus clientes y sus cotizaciones</p>
        {company ? (
          <p className="text-xs text-slate-500 mt-1">{company.name} · RNC {company.rnc}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to="/cotizaciones/nueva"
            className="rounded-xl bg-[#0b57d0] px-4 sm:px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#0948ad] transition whitespace-nowrap"
          >
            + Nueva cotización
          </Link>
        </div>
      </div>

      {/* Tabla Desktop / Cards Mobile */}
      {!isOnline && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          Sin conexion a internet. El envio a DGII estara deshabilitado hasta reconectar.
        </div>
      )}
      {company?.certificateConfigured ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-sm shadow-sm">
          <label htmlFor="ecf-enc-clients" className="block font-semibold text-slate-800">
            Clave de cifrado del certificado (DGII)
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Si la guardaste en <strong className="font-medium text-slate-800">Perfil de empresa</strong>, no hace falta
            volver a escribirla. Podés sobreescribirla acá solo para esta sesión; también se puede recordar en este
            navegador al salir del campo.
          </p>
          <input
            id="ecf-enc-clients"
            type="password"
            autoComplete="new-password"
            className="mt-2 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Contraseña de cifrado (no es la del .p12)"
            value={ecfEncryptionSecret}
            onChange={(e) => setEcfEncryptionSecret(e.target.value)}
            onBlur={(e) => {
              if (!company?.id) return;
              const t = e.target.value.trim();
              if (t.length >= 8) sessionStorage.setItem(`fe_cert_enc_${company.id}`, t);
            }}
          />
        </div>
      ) : null}
      <div className="rounded-3xl border border-gray-200 bg-white shadow-lg overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50/70 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, RNC, correo, estado..."
              className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "rnc" | "number" | "total" | "status")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="name">Ordenar por Nombre</option>
              <option value="rnc">Ordenar por RNC/Cedula</option>
              <option value="number">Ordenar por No. Cotizacion</option>
              <option value="total">Ordenar por Total</option>
              <option value="status">Ordenar por Estado e-CF</option>
            </select>
            <div className="flex gap-2">
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            Cargando clientes...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            No hay resultados para ese filtro.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 sm:px-6 py-4 text-left">Nombre</th>
                    <th className="px-4 sm:px-6 py-4 text-left">RNC / Cédula</th>
                    <th className="hidden lg:table-cell px-4 sm:px-6 py-4 text-left">Teléfono</th>
                    <th className="hidden xl:table-cell px-4 sm:px-6 py-4 text-left">Correo</th>
                    <th className="px-4 sm:px-6 py-4 text-left">N° Cotización</th>
                    <th className="px-4 sm:px-6 py-4 text-left">Total</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Detalle</th>
                    <th className="px-4 sm:px-6 py-4 text-center">e-CF</th>
                    <th className="px-4 sm:px-6 py-4 text-center">PDF</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {pageRows.map(({ client, last }) => {
                    const alreadySent =
                      last?.dgii_status === "accepted" || last?.dgii_status === "rejected";

                    return (
                      <tr key={client.id} className="hover:bg-indigo-50/40 transition">
                        <td className="px-4 sm:px-6 py-4 font-semibold text-gray-900 text-sm">
                          {client.name}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.rnc_cedula}
                        </td>

                        <td className="hidden lg:table-cell px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.phone || "-"}
                        </td>

                        <td className="hidden xl:table-cell px-4 sm:px-6 py-4 text-gray-600 text-sm">
                          {client.email || "-"}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-indigo-600 font-medium text-sm">
                          {last ? `#${last.number}` : "-"}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-gray-700 font-medium text-sm">
                          {last ? formatCurrency(last.total) : "-"}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleOpenDetail(last.id)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                              title="Ver detalle"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleSendEcf(last.id)}
                              disabled={sendingEcfId === last.id || alreadySent || !isOnline}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                alreadySent
                                  ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                  : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                              }`}
                              title={
                                !isOnline
                                  ? "Sin internet: no se puede enviar a DGII"
                                  : alreadySent
                                    ? "e-CF ya enviado"
                                    : "Enviar e-CF"
                              }
                            >
                              {sendingEcfId === last.id
                                ? "Enviando..."
                                : alreadySent
                                  ? "Enviado"
                                  : "Enviar DGII"}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-center">
                          {last ? (
                            <button
                              onClick={() => handleDownload(last.id, client.name)}
                              disabled={downloadingId === last.id}
                              className="p-2 rounded-lg hover:bg-indigo-100 transition inline-block disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Descargar PDF"
                            >
                              {downloadingId === last.id ? (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <circle
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    fill="none"
                                    opacity="0.25"
                                  />
                                  <path
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                                  />
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              to={last ? `/cotizaciones/${last.id}/editar` : "#"}
                              className="rounded border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Editar
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(client)}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {pageRows.map(({ client, last }) => {
                const alreadySent =
                  last?.dgii_status === "accepted" || last?.dgii_status === "rejected";

                return (
                  <div key={client.id} className="p-4 hover:bg-indigo-50/40 transition">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate text-sm sm:text-base">
                          {client.name}
                        </h3>
                        <p className="text-sm text-gray-500">RNC: {client.rnc_cedula}</p>
                      </div>
                      {last ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenDetail(last.id)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                            title="Ver detalle de cotización"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleSendEcf(last.id)}
                            disabled={sendingEcfId === last.id || alreadySent || !isOnline}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                              alreadySent
                                ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                                : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                            }`}
                            title={
                              !isOnline
                                ? "Sin internet: no se puede enviar a DGII"
                                : alreadySent
                                  ? "e-CF ya enviado"
                                  : "Enviar e-CF"
                            }
                          >
                            {sendingEcfId === last.id
                              ? "..."
                              : alreadySent
                                ? "Enviado"
                                : "Enviar DGII"}
                          </button>
                          <button
                            onClick={() => handleDownload(last.id, client.name)}
                            disabled={downloadingId === last.id}
                            className="p-2 rounded-lg hover:bg-indigo-100 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Descargar PDF"
                          >
                            {downloadingId === last.id ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 text-indigo-600 animate-spin"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  fill="none"
                                  opacity="0.25"
                                />
                                <path
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 text-indigo-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Teléfono</p>
                        <p className="text-gray-900 font-medium">{client.phone || "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Correo</p>
                        <p className="text-gray-900 font-medium truncate">{client.email || "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">N° Cotización</p>
                        <p className="text-indigo-600 font-medium">{last ? `#${last.number}` : "-"}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Total</p>
                        <p className="text-gray-900 font-medium">{last ? formatCurrency(last.total) : "-"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        to={last ? `/cotizaciones/${last.id}/editar` : "#"}
                        className="rounded border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteClient(client)}
                        className="rounded border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-600">
              <span>
                Mostrando {pageRows.length} de {rows.length} registros
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-gray-300 px-2.5 py-1 disabled:opacity-50"
                >
                  Anterior
                </button>
                <span>
                  Pagina {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-gray-300 px-2.5 py-1 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {crudError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error en clientes</p>
          <p className="mt-1">{crudError}</p>
        </div>
      )}
      {crudMessage && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">
          <p className="font-semibold">Clientes</p>
          <p className="mt-1">{crudMessage}</p>
        </div>
      )}
      {downloadError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error al descargar</p>
          <p className="mt-1">{downloadError}</p>
        </div>
      )}
      {ecfError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          <p className="font-semibold">Error en e-CF</p>
          <p className="mt-1">{ecfError}</p>
        </div>
      )}
      {ecfSuccess && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">
          <p className="font-semibold">Flujo e-CF listo</p>
          <p className="mt-1">{ecfSuccess}</p>
        </div>
      )}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="mx-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Detalle de cotización
              </h3>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            {detailLoading && (
              <p className="text-sm text-slate-500">Cargando detalle...</p>
            )}
            {detailError && <p className="text-sm text-red-600">{detailError}</p>}
            {!detailLoading && !detailError && detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-semibold">Cotización:</span> #{detail.number}
                  </p>
                  <p>
                    <span className="font-semibold">Estado DGII:</span>{" "}
                    {detail.dgii_status ?? "Pendiente"}
                  </p>
                  <p>
                    <span className="font-semibold">Cliente:</span> {detail.client.name}
                  </p>
                  <p>
                    <span className="font-semibold">RNC/Cédula:</span>{" "}
                    {detail.client.rnc_cedula}
                  </p>
                  <p>
                    <span className="font-semibold">Fecha de cotización:</span>{" "}
                    {formatDate(detail.created_at)}
                  </p>
                  <p>
                    <span className="font-semibold">Forma de pago:</span>{" "}
                    {detail.payment_method ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Condiciones:</span>{" "}
                    {detail.payment_terms ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Ejecutivo:</span>{" "}
                    {detail.account_manager ?? "-"}
                  </p>
                  <p>
                    <span className="font-semibold">Track ID:</span>{" "}
                    {detail.dgii_track_id ?? "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Comentario
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {detail.comment?.trim() || "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">Items</p>
                  {detail.items && detail.items.length > 0 ? (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-xs sm:text-sm">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="text-left py-1">#</th>
                            <th className="text-left py-1">Descripción</th>
                            <th className="text-right py-1">Cant.</th>
                            <th className="text-right py-1">P. unitario</th>
                            <th className="text-right py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.items.map((item) => (
                            <tr key={item.item_number} className="border-t border-slate-100">
                              <td className="py-1">{item.item_number}</td>
                              <td className="py-1">{item.description}</td>
                              <td className="py-1 text-right">{item.quantity}</td>
                              <td className="py-1 text-right">
                                {formatCurrency(item.unit_price)}
                              </td>
                              <td className="py-1 text-right">
                                {formatCurrency(item.total_value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">Sin items registrados.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">Subtotal:</span>{" "}
                    {formatCurrency(detail.subtotal ?? 0)}
                  </p>
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">ITBIS:</span>{" "}
                    {formatCurrency(detail.itbis ?? 0)}
                  </p>
                  <p className="rounded bg-slate-50 p-2">
                    <span className="font-semibold">Total:</span>{" "}
                    {formatCurrency(detail.total)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {ecfNeedCertForId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Certificado DGII requerido</h3>
            <p className="mt-2 text-sm text-slate-600">
              Para firmar y enviar el comprobante necesitamos tu certificado .p12 o .pfx. Se guardará cifrado en el servidor.
              Definí una clave de cifrado (mín. 8 caracteres): la volverás a usar en cada envío a DGII; no se guarda en el servidor.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Certificado en tu computadora
                </p>
                <input
                  id="modal-dgii-cert-file"
                  type="file"
                  accept=".p12,.pfx,application/x-pkcs12"
                  className="sr-only"
                  onChange={(e) => setModalCertFile(e.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="modal-dgii-cert-file"
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition focus-within:ring-2 focus-within:ring-[#2563eb] focus-within:ring-offset-2 ${
                    modalCertFile
                      ? "border-emerald-400 bg-emerald-50/60"
                      : "border-slate-300 bg-slate-50/80 hover:border-[#2563eb] hover:bg-blue-50/50"
                  }`}
                >
                  <CertBrowseIllustration className="h-14 w-14 shrink-0" />
                  <span className="text-sm font-semibold text-slate-900">
                    Buscar certificado en mi equipo
                  </span>
                  <span className="max-w-[280px] text-xs leading-snug text-slate-600">
                    Tocá o hacé clic aquí para abrir el explorador y elegir el archivo{" "}
                    <span className="font-medium text-slate-800">.p12</span> o{" "}
                    <span className="font-medium text-slate-800">.pfx</span> que te dio la DGII.
                  </span>
                  {modalCertFile ? (
                    <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm ring-1 ring-emerald-200">
                      <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="truncate" title={modalCertFile.name}>
                        {modalCertFile.name}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-[#2563eb]">Elegir archivo…</span>
                  )}
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="modal-p12-pw">
                  Contraseña del certificado
                </label>
                <input
                  id="modal-p12-pw"
                  type="password"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={modalCertPassword}
                  onChange={(e) => setModalCertPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700" htmlFor="modal-cert-enc">
                  Clave de cifrado (mín. 8 caracteres)
                </label>
                <input
                  id="modal-cert-enc"
                  type="password"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  placeholder="La misma clave en envíos siguientes"
                  value={modalEncryptionSecret}
                  onChange={(e) => setModalEncryptionSecret(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setEcfNeedCertForId(null);
                  setModalCertFile(null);
                  setModalCertPassword("");
                  setModalEncryptionSecret("");
                }}
                disabled={ecfCertModalLoading}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50"
                onClick={() => void handleSubmitCertAndResend()}
                disabled={ecfCertModalLoading}
              >
                {ecfCertModalLoading ? "Enviando…" : "Guardar y enviar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}