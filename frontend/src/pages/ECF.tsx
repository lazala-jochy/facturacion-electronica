import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { AuthCompany } from "../types/session";
import { ecfTipoLabel } from "../config/ecfTipos";
import { formatEcfNumberDisplay } from "../utils/ecfNumber";
import {
  deleteCotizacion,
  downloadRepresentacionImpresaEcf,
  getCotizacion,
  listCotizaciones,
  queryDgiiEcfForCotizacion,
  sendCotizacionEmail,
  setEcfNcfSeq,
  type CotizacionDetail,
  type CotizacionListItem,
} from "../services/cotizaciones";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import DgiiResponseModal, { type DgiiResponseModalPayload } from "../components/DgiiResponseModal";
import ConfirmModal from "../components/ConfirmModal";
import { MONTHS } from "../utils/months";

export default function ECF({ company }: { company: AuthCompany }) {
  const location = useLocation();
  const [rows, setRows] = useState<CotizacionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dgiiQueryError, setDgiiQueryError] = useState("");
  /** null = inactivo; { cur, total } durante sincronización masiva */
  const [syncDgiiAllProgress, setSyncDgiiAllProgress] = useState<{
    cur: number;
    total: number;
  } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailCotizacion, setDetailCotizacion] = useState<CotizacionDetail | null>(null);
  const [detailPreview, setDetailPreview] = useState<Record<string, unknown> | null>(null);
  const [downloadingRiId, setDownloadingRiId] = useState<number | null>(null);
  const [riError, setRiError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");
  /** Confirmación previa a eliminar (modal propio, no window.confirm). */
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    number: number;
    clientLabel: string;
  } | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  /** Confirmación previa a enviar por correo (modal propio, no window.confirm). */
  const [pendingEmailSend, setPendingEmailSend] = useState<{
    id: number;
    clientEmail: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "client" | "rnc" | "total" | "status">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [dgiiResponseModal, setDgiiResponseModal] = useState<DgiiResponseModalPayload | null>(null);
  /** Edición manual del número de secuencia e-NCF (fila activa + valor + estado). */
  const [editingSeqId, setEditingSeqId] = useState<number | null>(null);
  const [seqInput, setSeqInput] = useState("");
  const [seqSaving, setSeqSaving] = useState(false);
  const [seqError, setSeqError] = useState("");
  /** Columna "Detalle" es para certificación/pruebas; una vez en Producción deja de mostrarse. */
  const isDgiiCertification = !company?.dgiiEnvironment || company.dgiiEnvironment === "CERTIFICACION";
  const isDgiiProduccion = company?.dgiiEnvironment === "PRODUCCION";
  /**
   * En Producción cualquier envío a DGII (aceptado, rechazado o lo que sea) ya es un hecho real
   * ante DGII -- no se puede eliminar. En Certificación no hay restricción: son pruebas, no
   * facturas reales, así que se puede borrar aunque DGII la haya "aceptado".
   */
  const canDeleteCotizacion = (dgiiStatus: string | null | undefined): boolean => {
    if (!isDgiiProduccion) return true;
    // "prepared": el XML se generó/firmó localmente pero nunca se transmitió a DGII -- no
    // cuenta como envío real, se puede borrar igual que si no tuviera estado.
    const status = dgiiStatus?.trim() ?? "";
    return status === "" || status === "prepared";
  };

  const loadRows = useCallback(async () => {
      try {
        setLoading(true);
        setError("");
        setDgiiQueryError("");
        setDeleteError("");
        const out = await listCotizaciones();
      setRows(out.cotizaciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar e-CF.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows, location.key]);

  const years = useMemo(() => {
    const setYears = new Set<number>();
    for (const r of rows) setYears.add(new Date(r.created_at).getFullYear());
    return Array.from(setYears).sort((a, b) => b - a);
  }, [rows]);

  const ecfRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const d = new Date(r.created_at);
      const y = String(d.getFullYear());
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      if (yearFilter !== "all" && y !== yearFilter) return false;
      if (monthFilter !== "all" && mo !== monthFilter) return false;
      if (statusFilter !== "all" && (r.dgii_status ?? "") !== statusFilter) return false;
      if (!normalizedQuery) return true;
      const encf = formatEcfNumberDisplay(r.ecf_tipo, r.ecf_ncf_seq ?? undefined);
      return [
        r.client_name,
        r.client_rnc_cedula ?? "",
        r.dgii_status ?? "",
        r.dgii_track_id ?? "",
        String(r.number),
        String(r.total),
        r.ecf_tipo ?? "",
        ecfTipoLabel(r.ecf_tipo),
        encf,
        r.ecf_reference_ncf ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      let compare = 0;
      if (sortBy === "date") {
        compare =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "client") compare = a.client_name.localeCompare(b.client_name);
      if (sortBy === "rnc") compare = (a.client_rnc_cedula ?? "").localeCompare(b.client_rnc_cedula ?? "");
      if (sortBy === "total") compare = a.total - b.total;
      if (sortBy === "status") compare = (a.dgii_status ?? "").localeCompare(b.dgii_status ?? "");
      return sortDir === "asc" ? compare : -compare;
    });
  }, [rows, query, yearFilter, monthFilter, statusFilter, sortBy, sortDir]);

  const summary = useMemo(() => {
    const s = (rows ?? []).reduce(
      (acc, r) => {
        const st = (r.dgii_status ?? "").toLowerCase();
        if (st === "accepted") acc.accepted += 1;
        else if (st === "rejected") acc.rejected += 1;
        else if (st === "pending") acc.pending += 1;
        else if (st === "prepared") acc.prepared += 1;
        else acc.sinEnviar += 1;
        return acc;
      },
      { accepted: 0, rejected: 0, pending: 0, prepared: 0, sinEnviar: 0 },
    );
    return { ...s, total: rows.length };
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(ecfRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return ecfRows.slice(start, start + pageSize);
  }, [ecfRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, yearFilter, monthFilter, statusFilter, sortBy, sortDir, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const statusLabel = (status?: string | null) => {
    if (status == null || status === "") return "Sin enviar";
    if (status === "prepared") return "Preparado";
    if (status === "accepted") return "Aceptado";
    if (status === "rejected") return "Rechazado";
    if (status === "pending") return "Pendiente";
    if (status === "submit_queued") return "Cola DGII";
    if (status === "submitting") return "Enviando…";
    if (status === "submit_failed") return "Envío fallido";
    return status;
  };

  const statusClass = (status?: string | null) => {
    if (status === "accepted") return "bg-emerald-100 text-emerald-700";
    if (status === "rejected") return "bg-red-100 text-red-700";
    if (status === "prepared") return "bg-amber-100 text-amber-700";
    if (status === "pending") return "bg-sky-100 text-sky-800";
    if (status === "submit_queued" || status === "submitting") return "bg-violet-100 text-violet-800";
    if (status === "submit_failed") return "bg-orange-100 text-orange-800";
    return "bg-slate-100 text-slate-700";
  };

  const handleOpenDetail = async (id: number) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailCotizacion(null);
    setDetailPreview(null);
    setRiError("");
    try {
      const out = await getCotizacion(id);
      setDetailCotizacion(out.cotizacion);
      setDetailPreview(out.dgii_preview);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "No se pudo cargar el detalle.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteCotizacion = (
    id: number,
    meta: { number: number; clientLabel: string },
  ) => {
    if (syncDgiiAllProgress != null || deletingId != null) return;
    setDeleteError("");
    setPendingDelete({ id, ...meta });
  };

  const proceedDeleteCotizacion = async (id: number) => {
    setDeleteError("");
    setDeletingId(id);
    try {
      await deleteCotizacion(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (detailCotizacion?.id === id) {
        setDetailOpen(false);
        setDetailCotizacion(null);
        setDetailPreview(null);
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar la cotización.");
    } finally {
      setDeletingId(null);
    }
  };

  const confirmPendingDelete = () => {
    const pending = pendingDelete;
    if (!pending) return;
    setPendingDelete(null);
    void proceedDeleteCotizacion(pending.id);
  };

  const startEditSeq = (row: CotizacionListItem) => {
    setSeqError("");
    setEditingSeqId(row.id);
    setSeqInput(row.ecf_ncf_seq != null ? String(row.ecf_ncf_seq) : "");
  };

  const cancelEditSeq = () => {
    setEditingSeqId(null);
    setSeqInput("");
    setSeqError("");
  };

  const saveEditSeq = async (id: number) => {
    const n = Number(seqInput);
    if (!Number.isInteger(n) || n < 1) {
      setSeqError("Ingresá un número entero positivo.");
      return;
    }
    setSeqSaving(true);
    setSeqError("");
    try {
      const out = await setEcfNcfSeq(id, n);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ecf_ncf_seq: out.ecf_ncf_seq } : r)),
      );
      setEditingSeqId(null);
      setSeqInput("");
    } catch (err) {
      setSeqError(err instanceof Error ? err.message : "No se pudo actualizar el número.");
    } finally {
      setSeqSaving(false);
    }
  };

  const handleSendEmailClick = (id: number, clientEmail: string | null | undefined) => {
    setEmailError("");
    setEmailSuccess("");
    const email = clientEmail?.trim() ?? "";
    if (!email) {
      setEmailError("El cliente no tiene correo registrado. Agregalo en Clientes antes de enviar.");
      return;
    }
    setPendingEmailSend({ id, clientEmail: email });
  };

  const proceedSendEmail = async (id: number, clientEmail: string) => {
    setSendingEmailId(id);
    setEmailError("");
    setEmailSuccess("");
    try {
      const out = await sendCotizacionEmail(id);
      setEmailSuccess(out.message || `Enviado a ${clientEmail}.`);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "No se pudo enviar el correo.");
    } finally {
      setSendingEmailId(null);
    }
  };

  const confirmPendingEmailSend = () => {
    const pending = pendingEmailSend;
    if (!pending) return;
    setPendingEmailSend(null);
    void proceedSendEmail(pending.id, pending.clientEmail);
  };

  const handleDownloadRepresentacion = async (id: number, ecfNumber?: string) => {
    setRiError("");
    setDownloadingRiId(id);
    try {
      const fileName = ecfNumber?.trim() ? `${ecfNumber.trim()}.pdf` : undefined;
      await downloadRepresentacionImpresaEcf(id, fileName);
    } catch (err) {
      setRiError(err instanceof Error ? err.message : "No se pudo descargar la representación impresa.");
    } finally {
      setDownloadingRiId(null);
    }
  };

  const dgiiCertProfileForQuery = useCallback((): "paso2" | "paso4" | undefined => {
    const p2 = company.dgiiConsultUrl?.trim();
    const p4 = company.dgiiPaso4ConsultUrl?.trim();
    if (p4 && !p2) return "paso4";
    return undefined;
  }, [company.dgiiConsultUrl, company.dgiiPaso4ConsultUrl]);

  /**
   * Solo las que aún no tienen un veredicto firme de DGII: "accepted"/"rejected" ya son
   * definitivas (volver a consultarlas no cambia nada, solo gasta tiempo y llamadas a DGII).
   */
  const withTrackIds = useMemo(
    () =>
      rows.filter(
        (r) =>
          Boolean(r.dgii_track_id?.trim()) &&
          r.dgii_status !== "accepted" &&
          r.dgii_status !== "rejected",
      ),
    [rows],
  );

  /** Evita cierre obsoleto al refrescar detalle tras sync masiva (async). */
  const detailSyncRef = useRef<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  useEffect(() => {
    detailSyncRef.current = {
      open: detailOpen,
      id: detailCotizacion?.id ?? null,
    };
  }, [detailOpen, detailCotizacion?.id]);

  const handleQueryDgiiTodos = async () => {
    const targets = withTrackIds;
    if (targets.length === 0) return;
    setDgiiQueryError("");
    setSyncDgiiAllProgress({ cur: 0, total: targets.length });
    const profile = dgiiCertProfileForQuery();
    const statusById = new Map<number, string | null | undefined>();

    try {
      for (let i = 0; i < targets.length; i += 1) {
        const r = targets[i]!;
        setSyncDgiiAllProgress({ cur: i + 1, total: targets.length });
        try {
          const out = await queryDgiiEcfForCotizacion(r.id, {
            dgiiCertProfile: profile,
          });
          statusById.set(r.id, out.dgii_status);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error DGII";
          setDgiiQueryError(
            `Fila ${r.number} (id ${r.id}): ${msg}. Las filas anteriores se actualizaron.`,
          );
        }
      }
      setRows((prev) =>
        prev.map((row) => {
          if (!statusById.has(row.id)) return row;
          const ns = statusById.get(row.id);
          return { ...row, dgii_status: ns ?? row.dgii_status };
        }),
      );
    } finally {
      setSyncDgiiAllProgress(null);
      const { open, id } = detailSyncRef.current;
      if (open && id != null) {
        try {
          const refreshed = await getCotizacion(id);
          setDetailCotizacion(refreshed.cotizacion);
          setDetailPreview(refreshed.dgii_preview);
        } catch {
          /* detalle ya visible; el listado ya está actualizado */
        }
      }
    }
  };

  return (
    <PageShell>
      <PageHeaderCard
        title="e-NCF"
        description="Cotizaciones de esta empresa con flujo digital: estado DGII, e-NCF asignado y seguimiento."
        company={{ name: company.name, rnc: company.rnc }}
        stats={
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              <span className="font-semibold text-slate-800">{summary.total}</span> cotización
              {summary.total !== 1 ? "es" : ""}
            </span>
            <span className="text-emerald-700">{summary.accepted} aceptada(s)</span>
            <span className="text-red-700">{summary.rejected} rechazada(s)</span>
            <span className="text-sky-800">{summary.pending} pendiente(s)</span>
            <span className="text-amber-800">{summary.prepared} preparada(s)</span>
            <span>{summary.sinEnviar} sin enviar</span>
          </div>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void handleQueryDgiiTodos()}
              disabled={
                loading ||
                syncDgiiAllProgress != null ||
                withTrackIds.length === 0
              }
              className="rounded-lg border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {syncDgiiAllProgress ? (
                <>
                  Sincronizando estados DGII{" "}
                  {syncDgiiAllProgress.cur}/{syncDgiiAllProgress.total}…
                </>
              ) : (
                <>
                  Actualizar estados DGII
                  {withTrackIds.length > 0 ? ` (${withTrackIds.length})` : ""}
                </>
              )}
            </button>
            {withTrackIds.length === 0 && !loading ? (
              <span className="text-xs text-slate-500">
                No hay cotizaciones pendientes de verificar (las aceptadas/rechazadas ya tienen
                veredicto firme de DGII).
              </span>
            ) : null}
          </>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: cliente, RNC, # cotización, tipo, e-NCF, track ID…"
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los años</option>
              {years.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                </option>
              ))}
            </select>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los meses</option>
              {MONTHS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="">{statusLabel(null)}</option>
              <option value="prepared">{statusLabel("prepared")}</option>
              <option value="pending">{statusLabel("pending")}</option>
              <option value="accepted">{statusLabel("accepted")}</option>
              <option value="rejected">{statusLabel("rejected")}</option>
              <option value="submit_queued">{statusLabel("submit_queued")}</option>
              <option value="submitting">{statusLabel("submitting")}</option>
              <option value="submit_failed">{statusLabel("submit_failed")}</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "date" | "client" | "rnc" | "total" | "status")
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="date">Ordenar por Fecha</option>
              <option value="client">Ordenar por Cliente</option>
              <option value="rnc">Ordenar por RNC</option>
              <option value="total">Ordenar por Total</option>
              <option value="status">Ordenar por Estado</option>
            </select>
            <div className="flex gap-2">
              <select
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-1/2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-xs sm:text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 sm:p-3">Fecha</th>
                <th className="p-2 sm:p-3"># Cot.</th>
                <th className="p-2 sm:p-3">Cliente</th>
                <th className="p-2 sm:p-3">RNC</th>
                <th className="p-2 sm:p-3">Tipo</th>
                <th className="p-2 sm:p-3">e-NCF</th>
                <th className="p-2 sm:p-3">Total</th>
                <th className="p-2 sm:p-3">Estado</th>
                <th className="p-2 sm:p-3">Track ID</th>
                <th className="p-2 sm:p-3">Rep.</th>
                {isDgiiCertification && <th className="p-2 sm:p-3">Detalle</th>}
                <th className="p-2 sm:p-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading &&
                pageRows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2 sm:p-3 whitespace-nowrap text-slate-600 tabular-nums">
                      {new Date(row.created_at).toLocaleDateString("es-DO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="p-2 sm:p-3 font-medium tabular-nums">{row.number}</td>
                    <td className="p-2 sm:p-3 text-left">{row.client_name}</td>
                    <td className="p-2 sm:p-3">{row.client_rnc_cedula ?? "-"}</td>
                    <td className="p-2 sm:p-3 text-left text-[11px] sm:text-xs text-slate-700">
                      {ecfTipoLabel(row.ecf_tipo) || "—"}
                    </td>
                    <td className="p-2 sm:p-3 font-mono text-[11px] text-slate-800">
                      {editingSeqId === row.id ? (
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            className="w-20 rounded border border-slate-300 px-1.5 py-1 text-center text-xs focus:border-indigo-500 focus:outline-none"
                            value={seqInput}
                            onChange={(e) => setSeqInput(e.target.value)}
                            disabled={seqSaving}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-[10px] font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                              onClick={() => void saveEditSeq(row.id)}
                              disabled={seqSaving}
                            >
                              {seqSaving ? "Guardando…" : "Guardar"}
                            </button>
                            <button
                              type="button"
                              className="text-[10px] font-semibold text-slate-500 hover:underline"
                              onClick={cancelEditSeq}
                              disabled={seqSaving}
                            >
                              Cancelar
                            </button>
                          </div>
                          {seqError ? (
                            <p className="max-w-[9rem] whitespace-normal text-[10px] font-medium text-red-600">
                              {seqError}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <span>{formatEcfNumberDisplay(row.ecf_tipo, row.ecf_ncf_seq ?? undefined)}</span>
                          {row.dgii_status !== "accepted" ? (
                            <button
                              type="button"
                              title="Cambiar número de secuencia"
                              className="text-slate-400 hover:text-[#0b57d0]"
                              onClick={() => startEditSeq(row)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="p-2 sm:p-3">
                      {new Intl.NumberFormat("es-DO", {
                        style: "currency",
                        currency: "DOP",
                      }).format(row.total)}
                    </td>
                    <td className="p-2 sm:p-3">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.dgii_status)}`}
                        >
                          {statusLabel(row.dgii_status)}
                        </span>
                        {row.dgii_status === "rejected" &&
                        (row.dgii_rejection_full?.trim() || row.dgii_rejection_summary?.trim()) ? (
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-[#0b57d0] hover:underline"
                            onClick={() =>
                              setDgiiResponseModal({
                                title: `Respuesta DGII · cotización #${row.number}`,
                                status: row.dgii_status,
                                trackId: row.dgii_track_id,
                                summary: row.dgii_rejection_summary,
                                fullMessage:
                                  row.dgii_rejection_full?.trim() ||
                                  row.dgii_rejection_summary?.trim() ||
                                  null,
                              })
                            }
                          >
                            Ver mensaje completo
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-[11px] sm:text-xs text-slate-600">
                      {row.dgii_track_id ?? "-"}
                    </td>
                    <td className="p-2 sm:p-3">
                      {row.dgii_track_id?.trim() ? (
                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadRepresentacion(
                              row.id,
                              formatEcfNumberDisplay(row.ecf_tipo, row.ecf_ncf_seq ?? undefined),
                            )
                          }
                          disabled={downloadingRiId === row.id}
                          className="rounded-lg border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          title="Descargar representación impresa e-CF"
                        >
                          {downloadingRiId === row.id ? (
                            <span className="text-[10px] font-semibold">…</span>
                          ) : (
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
                                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                              />
                            </svg>
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {isDgiiCertification && (
                      <td className="p-2 sm:p-3">
                        <button
                          type="button"
                          onClick={() => void handleOpenDetail(row.id)}
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
                      </td>
                    )}
                    <td className="p-2 sm:p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSendEmailClick(row.id, row.client_email)}
                          disabled={sendingEmailId === row.id}
                          className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Enviar por correo"
                        >
                          {sendingEmailId === row.id ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 animate-spin"
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
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteCotizacion(row.id, {
                              number: row.number,
                              clientLabel: row.client_name,
                            })
                          }
                          disabled={
                            syncDgiiAllProgress != null ||
                            deletingId === row.id ||
                            !canDeleteCotizacion(row.dgii_status)
                          }
                          className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            !canDeleteCotizacion(row.dgii_status)
                              ? "En Producción no se puede eliminar un comprobante ya enviado a DGII."
                              : "Eliminar cotización"
                          }
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">
            Cargando cotizaciones y estado DGII…
          </div>
        )}
        {!loading && dgiiQueryError && (
          <div className="border-t border-red-100 bg-red-50/80 px-4 py-2 text-center text-xs text-red-800">
            {dgiiQueryError}
          </div>
        )}
        {!loading && error && (
          <div className="p-6 sm:p-8 text-center text-red-600 text-sm">{error}</div>
        )}
        {!loading && deleteError && (
          <div className="border-t border-red-100 bg-red-50/80 px-4 py-2 text-center text-xs text-red-800">
            {deleteError}
          </div>
        )}
        {!loading && emailError && (
          <div className="border-t border-red-100 bg-red-50/80 px-4 py-2 text-center text-xs text-red-800">
            {emailError}
          </div>
        )}
        {!loading && emailSuccess && (
          <div className="border-t border-emerald-100 bg-emerald-50/80 px-4 py-2 text-center text-xs text-emerald-800">
            {emailSuccess}
          </div>
        )}
        {!loading && !error && ecfRows.length === 0 && (
          <div className="p-6 sm:p-8 text-center text-gray-500 text-sm">
            No hay cotizaciones o no coinciden con la búsqueda.
          </div>
        )}
        {!loading && !error && ecfRows.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              Mostrando {pageRows.length} de {ecfRows.length} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
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
                className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="mx-auto w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Detalle enviado a DGII</h3>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            {detailLoading && <p className="text-sm text-slate-500">Cargando detalle...</p>}
            {detailError && <p className="text-sm text-red-600">{detailError}</p>}
            {!detailLoading && !detailError && detailCotizacion && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p><span className="font-semibold">Cliente:</span> {detailCotizacion.client.name}</p>
                  <p><span className="font-semibold">RNC:</span> {detailCotizacion.client.rnc_cedula}</p>
                  <p>
                    <span className="font-semibold">Cotización:</span>{" "}
                    <span className="tabular-nums">{detailCotizacion.number}</span>
                  </p>
                  <p><span className="font-semibold">Tipo e-CF:</span> {ecfTipoLabel(detailCotizacion.ecf_tipo) || "—"}</p>
                  <p>
                    <span className="font-semibold">e-NCF:</span>{" "}
                    {formatEcfNumberDisplay(
                      detailCotizacion.ecf_tipo,
                      detailCotizacion.ecf_ncf_seq ?? undefined,
                    )}
                  </p>
                  <p><span className="font-semibold">Estado:</span> {statusLabel(detailCotizacion.dgii_status)}</p>
                  <p><span className="font-semibold">Track ID:</span> {detailCotizacion.dgii_track_id ?? "-"}</p>
                </div>

                {detailCotizacion.dgii_track_id?.trim() ? (
                  detailCotizacion.dgii_status === "accepted" ||
                  detailCotizacion.dgii_status === "rejected" ? (
                    <p className="text-xs text-slate-600">
                      Esta cotización ya tiene un veredicto firme de DGII ({statusLabel(detailCotizacion.dgii_status)});
                      no hace falta volver a consultarla.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-600">
                      La consulta del estado en DGII se hace de forma única con el botón{" "}
                      <span className="font-semibold text-slate-800">Actualizar estados DGII</span>{" "}
                      arriba en la página; se actualizan las filas pendientes que tengan track ID
                      (las ya aceptadas o rechazadas se saltan).
                    </p>
                  )
                ) : null}

                {detailCotizacion.dgii_track_id?.trim() && dgiiQueryError ? (
                  <p className="text-xs text-red-600">{dgiiQueryError}</p>
                ) : null}

                {riError && (
                  <p className="text-sm text-red-600">{riError}</p>
                )}

                {detailCotizacion.dgii_track_id?.trim() ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                    <p className="font-semibold text-slate-900">Representación impresa e-CF</p>
                    <p className="mt-1 text-slate-600 text-xs">
                      PDF con datos del XML enviado, código de seguridad y QR de consulta timbre.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadRepresentacion(
                          detailCotizacion.id,
                          formatEcfNumberDisplay(
                            detailCotizacion.ecf_tipo,
                            detailCotizacion.ecf_ncf_seq ?? undefined,
                          ),
                        )
                      }
                      disabled={downloadingRiId === detailCotizacion.id}
                      className="mt-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {downloadingRiId === detailCotizacion.id ? "Generando…" : "Descargar PDF"}
                    </button>
                  </div>
                ) : null}

                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">Payload e-CF</h4>
                  <pre className="max-h-44 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(detailPreview ?? {}, null, 2)}
                  </pre>
                </div>

                {(detailCotizacion.dgii_rejection_full?.trim() ||
                  detailCotizacion.dgii_rejection_summary?.trim() ||
                  detailCotizacion.dgii_response?.trim()) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm">
                    <p className="font-semibold text-amber-950">Mensaje DGII</p>
                    {detailCotizacion.dgii_rejection_summary?.trim() ? (
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-amber-950">
                        {detailCotizacion.dgii_rejection_summary}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setDgiiResponseModal({
                          title: `Respuesta DGII · cotización #${detailCotizacion.number}`,
                          status: detailCotizacion.dgii_status,
                          trackId: detailCotizacion.dgii_track_id,
                          summary: detailCotizacion.dgii_rejection_summary,
                          fullMessage:
                            detailCotizacion.dgii_rejection_full?.trim() ||
                            detailCotizacion.dgii_rejection_summary?.trim() ||
                            null,
                          rawResponse: detailCotizacion.dgii_response,
                        })
                      }
                      className="mt-2 text-xs font-semibold text-[#0b57d0] hover:underline"
                    >
                      Ver mensaje completo
                    </button>
                  </div>
                )}

                <div>
                  <h4 className="mb-1 text-sm font-semibold text-slate-900">XML firmado enviado</h4>
                  <pre className="max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    {detailCotizacion.signed_xml ?? "Sin XML firmado almacenado."}
                  </pre>
                </div>

                <div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                  <p className="text-sm font-semibold text-red-900">Eliminar</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Quita esta cotización y sus datos asociados en la aplicación. No revoca un e-CF ya recibido por DGII.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteCotizacion(detailCotizacion.id, {
                        number: detailCotizacion.number,
                        clientLabel: detailCotizacion.client.name,
                      })
                    }
                    disabled={
                      syncDgiiAllProgress != null ||
                      deletingId === detailCotizacion.id ||
                      !canDeleteCotizacion(detailCotizacion.dgii_status)
                    }
                    className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === detailCotizacion.id
                      ? "Eliminando…"
                      : !canDeleteCotizacion(detailCotizacion.dgii_status)
                        ? "Ya fue enviada a DGII: no se puede eliminar"
                        : "Eliminar cotización"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <DgiiResponseModal
        open={dgiiResponseModal != null}
        payload={dgiiResponseModal}
        onClose={() => setDgiiResponseModal(null)}
      />

      <ConfirmModal
        open={pendingDelete != null}
        title="Eliminar cotización"
        message={
          pendingDelete
            ? `¿Eliminar la cotización ${pendingDelete.number} (${pendingDelete.clientLabel})? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={pendingEmailSend != null}
        title="Enviar por correo"
        message={`Se enviará la cotización o factura (según su estado) por correo a ${pendingEmailSend?.clientEmail ?? ""}.\n\n¿Deseas continuar?`}
        confirmLabel="Enviar"
        onConfirm={confirmPendingEmailSend}
        onCancel={() => setPendingEmailSend(null)}
      />
    </PageShell>
  );
}
