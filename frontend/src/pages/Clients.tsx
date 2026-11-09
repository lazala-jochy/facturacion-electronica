import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteClient, listClients, type ClientListItem } from "../services/clients";
import { ApiError, readAuthSessionFromStorage, refreshAuthSessionFromServer } from "../services/api";
import {
  deleteCotizacion,
  downloadConsumoMenor250Integra,
  downloadCotizacionPDF,
  generateEcfXml,
  getCotizacion,
  signEcfXmlLocal,
  submitConsumoMenor250Rfce,
  submitEcf,
  retryQueuedDgiiSubmit,
  type CotizacionDetail,
} from "../services/cotizaciones";
import { ecfTipoDisplayLabel, isConsumoMenor250Rfce } from "../config/ecfTipos";
import { formatEcfNumberDisplay } from "../utils/ecfNumber";
import { MONTHS } from "../utils/months";
import DgiiResponseModal, { type DgiiResponseModalPayload } from "../components/DgiiResponseModal";
import DgiiRejectionHint from "../components/DgiiRejectionHint";

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

const dgiiStatusLabel = (status?: string | null) => {
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

const dgiiStatusClass = (status?: string | null) => {
  if (status === "accepted") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  if (status === "prepared") return "bg-amber-100 text-amber-900";
  if (status === "pending") return "bg-sky-100 text-sky-900";
  if (status === "submit_queued" || status === "submitting") return "bg-violet-100 text-violet-900";
  if (status === "submit_failed") return "bg-orange-100 text-orange-900";
  return "bg-slate-100 text-slate-700";
};

type CotDgiiSendRow = {
  dgii_status?: string | null;
  dgii_resubmit_new_seq?: boolean;
};

/** Reenvío a DGII sin editar: solo si DGII indicó «secuencia ya utilizada». */
const canResubmitToDgiiWithoutEdit = (cot: CotDgiiSendRow | undefined | null): boolean => {
  const status = cot?.dgii_status?.trim() ?? "";
  if (status === "accepted" || status === "pending") return false;
  if (status === "submit_queued" || status === "submitting") return false;
  if (status === "submit_failed") return true;
  if (status === "rejected") return cot?.dgii_resubmit_new_seq === true;
  return true;
};

const isDgiiSubmitQueued = (status?: string | null) => {
  const s = status?.trim() ?? "";
  return s === "submit_queued" || s === "submitting";
};

const dgiiResubmitBlockedMessage =
  "DGII rechazó este comprobante por un error distinto a «secuencia ya utilizada». Editá y guardá la cotización; después podrás usar «Enviar DGII». «Reenviar» solo aplica cuando DGII indica secuencia ya utilizada.";

type ClientCotizacion = ClientListItem["cotizaciones"][number];

type ClientCotRow = {
  client: ClientListItem;
  cot: ClientCotizacion | null;
  rowKey: string;
};

const rowCotNumber = (row: ClientCotRow): number | null => {
  if (row.cot == null) return null;
  const n = Number(row.cot.number);
  return Number.isFinite(n) ? n : null;
};

const compareClientCotRows = (
  a: ClientCotRow,
  b: ClientCotRow,
  sortBy: "recent" | "name" | "rnc" | "number" | "total" | "status",
): number => {
  let compare = 0;
  if (sortBy === "recent") {
    const aTs =
      Date.parse(a.cot?.created_at ?? "") ||
      Date.parse(a.client.created_at ?? "") ||
      a.client.id;
    const bTs =
      Date.parse(b.cot?.created_at ?? "") ||
      Date.parse(b.client.created_at ?? "") ||
      b.client.id;
    compare = aTs - bTs;
  } else if (sortBy === "name") {
    compare = a.client.name.localeCompare(b.client.name, "es");
  } else if (sortBy === "rnc") {
    compare = a.client.rnc_cedula.localeCompare(b.client.rnc_cedula, "es");
  } else if (sortBy === "number") {
    const aNum = rowCotNumber(a);
    const bNum = rowCotNumber(b);
    if (aNum == null && bNum == null) compare = 0;
    else if (aNum == null) compare = 1;
    else if (bNum == null) compare = -1;
    else compare = aNum - bNum;
  } else if (sortBy === "total") {
    const aTotal = a.cot?.total ?? -1;
    const bTotal = b.cot?.total ?? -1;
    compare = aTotal - bTotal;
  } else if (sortBy === "status") {
    compare = (a.cot?.dgii_status ?? "").localeCompare(b.cot?.dgii_status ?? "", "es");
  }
  return compare;
};

const clientMatchesQuery = (client: ClientListItem, normalizedQuery: string) => {
  if (!normalizedQuery) return true;
  const cots = client.cotizaciones ?? [];
  const raw = [
    client.name,
    client.rnc_cedula,
    client.phone ?? "",
    client.email ?? "",
    ...cots.flatMap((c) => [
      String(c.number),
      String(c.total),
      c.dgii_status ?? "",
      c.dgii_track_id ?? "",
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return raw.includes(normalizedQuery);
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
  const isDgiiCertification = useMemo(
    () => !company?.dgiiEnvironment || company.dgiiEnvironment === "CERTIFICACION",
    [company?.dgiiEnvironment],
  );
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoadError, setListLoadError] = useState("");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [sendingEcfId, setSendingEcfId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string>("");
  const [ecfError, setEcfError] = useState<string>("");
  const [ecfSuccess, setEcfSuccess] = useState<string>("");
  const [ecfWarning, setEcfWarning] = useState<string>("");
  const [ecfNeedCertForId, setEcfNeedCertForId] = useState<number | null>(null);
  const [modalCertFile, setModalCertFile] = useState<File | null>(null);
  const [modalCertPassword, setModalCertPassword] = useState("");
  /** Clave definida al guardar el .p12; obligatoria en cada envío si ya hay certificado. */
  const [ecfEncryptionSecret, setEcfEncryptionSecret] = useState("");
  /** Certificación: URLs Paso 2 (estándar) vs Paso 4 (simulación e-CF). */
  const [dgiiCertProfile, setDgiiCertProfile] = useState<"paso2" | "paso4">("paso2");
  const [modalEncryptionSecret, setModalEncryptionSecret] = useState("");
  const [ecfCertModalLoading, setEcfCertModalLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "rnc" | "number" | "total" | "status">(
    "recent",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<CotizacionDetail | null>(null);
  const [dgiiResponseModal, setDgiiResponseModal] = useState<DgiiResponseModalPayload | null>(null);
  const [crudMessage, setCrudMessage] = useState("");
  const [crudError, setCrudError] = useState("");
  const [downloadingIntegraId, setDownloadingIntegraId] = useState<number | null>(null);
  const [consumoIntegraDownloading, setConsumoIntegraDownloading] = useState(false);
  const [consumoPackError, setConsumoPackError] = useState("");
  const [ecfXmlViewer, setEcfXmlViewer] = useState<{
    open: boolean;
    loading: boolean;
    error: string;
    ecfNumber: string;
    ecfTipo: string;
    total: number;
    generatedXml: string;
    signedXml: string | null;
    /** Firma en esta sesión (mismo XML que envío DGII). */
    previewSignedXml: string | null;
    cotizacionId: number | null;
    /** Si existe, la pestaña «Copia del envío» muestra lo recibido por DGII. */
    dgiiTrackId: string | null;
    tab: "generated" | "preview" | "signed";
  }>({
    open: false,
    loading: false,
    error: "",
    ecfNumber: "",
    ecfTipo: "",
    total: 0,
    generatedXml: "",
    signedXml: null,
    previewSignedXml: null,
    cotizacionId: null,
    dgiiTrackId: null,
    tab: "generated",
  });
  const [ecfSignLocalLoading, setEcfSignLocalLoading] = useState(false);
  const [ecfSignLocalError, setEcfSignLocalError] = useState("");
  const [deletingDetailId, setDeletingDetailId] = useState<number | null>(null);

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
      setListLoadError("");
      try {
        const { clients: loaded } = await listClients();
        setClients(loaded);
      } catch (error) {
        const msg =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "No se pudo cargar la lista de clientes.";
        setListLoadError(msg);
        setClients([]);
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

  const closeEcfXmlViewer = () => {
    setEcfSignLocalError("");
    setConsumoPackError("");
    setConsumoIntegraDownloading(false);
    setEcfXmlViewer({
      open: false,
      loading: false,
      error: "",
      ecfNumber: "",
      ecfTipo: "",
      total: 0,
      generatedXml: "",
      signedXml: null,
      previewSignedXml: null,
      cotizacionId: null,
      dgiiTrackId: null,
      tab: "generated",
    });
  };

  const downloadXmlBlob = (xml: string, filename: string) => {
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const openEcfXmlViewer = async (cotizacionId: number) => {
    setEcfSignLocalError("");
    setConsumoPackError("");
    setEcfXmlViewer({
      open: true,
      loading: true,
      error: "",
      ecfNumber: "",
      ecfTipo: "",
      total: 0,
      generatedXml: "",
      signedXml: null,
      previewSignedXml: null,
      cotizacionId,
      dgiiTrackId: null,
      tab: "generated",
    });
    try {
      const [gen, detailRes] = await Promise.all([
        generateEcfXml(cotizacionId),
        getCotizacion(cotizacionId),
      ]);
      const signed = detailRes.cotizacion.signed_xml?.trim() || null;
      const track = detailRes.cotizacion.dgii_track_id?.trim() || null;
      const genSigned = Boolean((gen as { signed?: boolean }).signed);

      const tab: "generated" | "preview" | "signed" =
        track && signed ? "signed" : signed ? "preview" : "generated";

      setEcfXmlViewer((prev) => ({
        ...prev,
        loading: false,
        ecfNumber: gen.ecf_number,
        ecfTipo: detailRes.cotizacion.ecf_tipo ?? "",
        total: detailRes.cotizacion.total ?? 0,
        generatedXml: genSigned || signed ? "" : gen.xml,
        signedXml: signed,
        previewSignedXml: null,
        dgiiTrackId: track,
        tab,
      }));
    } catch (e) {
      setEcfXmlViewer((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "No se pudo cargar el XML.",
      }));
    }
  };

  const handleSignEcfXmlLocal = async () => {
    const id = ecfXmlViewer.cotizacionId;
    if (id == null) return;
    const encForSign =
      ecfEncryptionSecret.trim() || company?.certificate_keyphrase?.trim() || "";
    if (company?.certificateConfigured && encForSign.length < 8) {
      setEcfSignLocalError(
        "Ingresá la clave de cifrado del certificado (o guardala en Perfil de empresa) para firmar.",
      );
      return;
    }
    setEcfSignLocalLoading(true);
    setEcfSignLocalError("");
    try {
      const out = await signEcfXmlLocal(id, {
        certificateEncryptionSecret:
          company?.certificateConfigured && encForSign.length >= 8 ? encForSign : undefined,
      });
      setEcfXmlViewer((s) => ({
        ...s,
        previewSignedXml: out.signed_xml,
        tab: "preview",
        ecfNumber: out.ecf_number?.trim() ? out.ecf_number : s.ecfNumber,
      }));
    } catch (e) {
      setEcfSignLocalError(e instanceof Error ? e.message : "No se pudo firmar el XML.");
    } finally {
      setEcfSignLocalLoading(false);
    }
  };

  const downloadCurrentEcfXmlFromViewer = () => {
    const { tab, generatedXml, signedXml, previewSignedXml, ecfNumber } = ecfXmlViewer;
    const body =
      tab === "signed" && signedXml
        ? signedXml
        : tab === "preview" && (previewSignedXml || signedXml)
          ? previewSignedXml || signedXml
          : generatedXml;
    if (!body?.trim()) return;
    const base =
      tab === "signed"
        ? `ecf-firmado-${ecfNumber.replace(/\s/g, "") || "enviado"}`
        : tab === "preview"
          ? `ecf-dgii-${ecfNumber.replace(/\s/g, "") || "firmado"}`
          : `ecf-${ecfNumber.replace(/\s/g, "") || "generado"}`;
    downloadXmlBlob(body, `${base}.xml`);
  };

  const downloadConsumoIntegraPortalXml = async (
    cotizacionId: number,
    ecfNumberHint?: string,
  ): Promise<boolean> => {
    setConsumoPackError("");
    try {
      const xml = await downloadConsumoMenor250Integra(cotizacionId);
      if (!xml.trim()) throw new Error("XML vacío.");
      const encfSafe = (ecfNumberHint || "consumo").replace(/[^\w.-]/g, "");
      downloadXmlBlob(xml, `ECF-${encfSafe}.xml`);
      return true;
    } catch (e) {
      setConsumoPackError(e instanceof Error ? e.message : "No se pudo descargar el e-CF íntegro.");
      return false;
    }
  };

  const handleDownloadConsumoIntegraFromViewer = async () => {
    const id = ecfXmlViewer.cotizacionId;
    if (id == null) return;
    setConsumoIntegraDownloading(true);
    try {
      await downloadConsumoIntegraPortalXml(id, ecfXmlViewer.ecfNumber);
    } finally {
      setConsumoIntegraDownloading(false);
    }
  };

  const handleRfcePrimaryAction = async (cotizacionId: number) => {
    const cotRow = clients
      .flatMap((c) => c.cotizaciones.map((co) => ({ ...co, clientId: c.id })))
      .find((co) => co.id === cotizacionId);
    const isRfce =
      cotRow != null && isConsumoMenor250Rfce(cotRow.ecf_tipo, cotRow.total);
    if (isRfce && cotRow.dgii_status === "accepted") {
      setDownloadingIntegraId(cotizacionId);
      setEcfError("");
      try {
        const encf =
          cotRow.ecf_ncf_seq != null
            ? formatEcfNumberDisplay("32", cotRow.ecf_ncf_seq)
            : "consumo";
        const ok = await downloadConsumoIntegraPortalXml(cotizacionId, encf);
        if (ok) {
          setEcfSuccess(
            "e-CF íntegro descargado (misma firma del RFCE). Subilo a CerteCF «Facturas de consumo <250Mil».",
          );
        }
      } finally {
        setDownloadingIntegraId(null);
      }
      return;
    }
    await handleSendEcf(cotizacionId);
  };

  const handleSendEcf = async (cotizacionId: number) => {
    if (!isOnline) {
      setEcfError("Debes conectarte a internet para enviar a DGII.");
      return;
    }
    const cotRow = clients
      .flatMap((c) => c.cotizaciones.map((co) => ({ ...co, clientId: c.id })))
      .find((co) => co.id === cotizacionId);
    if (!canResubmitToDgiiWithoutEdit(cotRow)) {
      setEcfError(
        cotRow?.dgii_status === "pending"
          ? "El envío está pendiente en DGII. Consultá el estado antes de volver a enviar."
          : cotRow?.dgii_status === "accepted"
            ? "Este comprobante ya fue aceptado por DGII."
            : isDgiiSubmitQueued(cotRow?.dgii_status)
              ? "El comprobante está en cola de envío automático. Usá «Reintentar envío» o esperá unos minutos."
              : dgiiResubmitBlockedMessage,
      );
      return;
    }
    setSendingEcfId(cotizacionId);
    setEcfError("");
    setEcfSuccess("");
    setEcfWarning("");
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
      const isRfceFlow =
        cotRow != null && isConsumoMenor250Rfce(cotRow.ecf_tipo, cotRow.total);

      if (isRfceFlow) {
        const out = await submitConsumoMenor250Rfce(cotizacionId, {
          certificateEncryptionSecret:
            company?.certificateConfigured && encForSend.length >= 8 ? encForSend : undefined,
        });
        if (out.dgii_status === "accepted") {
          setEcfWarning("");
          setEcfSuccess(out.message);
        } else if (out.dgii_status === "pending") {
          setEcfSuccess("");
          setEcfWarning(`RFCE ${out.ecf_number} recibido por DGII; estado pendiente.`);
        } else {
          setEcfSuccess("");
          setEcfWarning(
            `RFCE ${out.ecf_number} rechazado. Revisá el detalle, corregí si hace falta y volvé a enviar (uno por cotización).`,
          );
        }
      } else {
        const out = await submitEcf(cotizacionId, {
          certificateEncryptionSecret:
            company?.certificateConfigured && encForSend.length >= 8 ? encForSend : undefined,
          dgiiCertProfile: isDgiiCertification ? dgiiCertProfile : "paso2",
        });
        const detail =
          out.dgii_status_summary?.trim() || out.dgii_rejection_summary?.trim() || "";

        if (out.status === "accepted") {
          setEcfWarning("");
          setEcfSuccess(
            `e-CF aceptado por DGII (Track ID: ${out.track_id}).${detail ? ` ${detail}` : ""}`.trim(),
          );
        } else if (out.status === "pending") {
          setEcfSuccess("");
          setEcfWarning(
            `DGII recibió el comprobante (Track ID: ${out.track_id}). ${
              detail || "El estado final aún se está procesando."
            } Volvé a enviar o consultá el estado en unos segundos si sigue pendiente.`.trim(),
          );
        } else if (out.status === "submit_queued" || out.queued) {
          setEcfSuccess("");
          setEcfWarning(
            `DGII no está disponible. El comprobante quedó firmado y en cola (intento ${out.dgii_submit_retry_count ?? 1}). Se reenviará automáticamente sin perder la operación.`,
          );
        } else if (out.status === "rejected") {
          setEcfSuccess("");
          if (out.dgii_resubmit_new_seq === true) {
            const nextEncf =
              out.ecf_number?.trim() ||
              (out.ecf_ncf_seq != null ? `secuencia ${out.ecf_ncf_seq}` : "");
            setEcfWarning(
              `DGII rechazó por correlativo/secuencia. Track ID: ${out.track_id}. ${detail}${
                nextEncf
                  ? ` Próximo envío usará ${nextEncf} (guardado en la cotización).`
                  : ""
              }`.trim(),
            );
          } else {
            setEcfWarning(
              `DGII rechazó el comprobante. Track ID: ${out.track_id}. ${detail} No es rechazo por secuencia: el mismo e-NCF se conserva. Corregí la cotización y usá «Enviar DGII» (no «Reenviar», que solo aplica cuando DGII indica secuencia ya utilizada).`.trim(),
            );
          }
        } else {
          setEcfWarning("");
          setEcfSuccess(`e-CF enviado (Track ID: ${out.track_id}).`);
        }
      }
      await refreshClients();
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
      const errorMsg = error instanceof Error ? error.message : "Error al enviar a DGII";
      setEcfError(errorMsg);
      console.error("Error al enviar a DGII:", error);
    } finally {
      setSendingEcfId(null);
    }
  };

  const handleRetryQueuedDgiiSubmit = async (cotizacionId: number) => {
    if (!isOnline) {
      setEcfError("Debes conectarte a internet para reintentar el envío a DGII.");
      return;
    }
    const encForSend =
      ecfEncryptionSecret.trim() || company?.certificate_keyphrase?.trim() || "";
    if (company?.certificateConfigured && encForSend.length < 8) {
      setEcfError(
        "No hay clave de cifrado del certificado. Guardala en Perfil de empresa (mín. 8 caracteres) o ingresala abajo.",
      );
      return;
    }
    setSendingEcfId(cotizacionId);
    setEcfError("");
    setEcfSuccess("");
    setEcfWarning("");
    try {
      const out = await retryQueuedDgiiSubmit(cotizacionId, {
        certificateEncryptionSecret:
          company?.certificateConfigured && encForSend.length >= 8 ? encForSend : undefined,
        dgiiCertProfile: isDgiiCertification ? dgiiCertProfile : "paso2",
      });
      const detail =
        out.dgii_status_summary?.trim() || out.dgii_rejection_summary?.trim() || "";
      if (out.status === "accepted") {
        setEcfWarning("");
        setEcfSuccess(`e-CF aceptado por DGII (Track ID: ${out.track_id}).${detail ? ` ${detail}` : ""}`.trim());
      } else if (out.status === "pending") {
        setEcfSuccess("");
        setEcfWarning(`DGII recibió el comprobante (Track ID: ${out.track_id}). ${detail || "Estado pendiente."}`);
      } else if (out.status === "submit_queued" || out.queued) {
        setEcfWarning(
          `DGII sigue sin responder. Reintento ${out.dgii_submit_retry_count ?? "?"} programado automáticamente.`,
        );
      } else if (out.status === "rejected") {
        setEcfWarning(`DGII rechazó el comprobante. ${detail}`.trim());
      } else {
        setEcfSuccess(out.message);
      }
      await refreshClients();
    } catch (error) {
      setEcfError(error instanceof Error ? error.message : "No se pudo reintentar el envío.");
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
    const cotRow = clients
      .flatMap((c) => c.cotizaciones.map((co) => ({ ...co, clientId: c.id })))
      .find((co) => co.id === id);
    if (!canResubmitToDgiiWithoutEdit(cotRow)) {
      setEcfError(
        cotRow?.dgii_status === "pending"
          ? "El envío está pendiente en DGII. Consultá el estado antes de volver a enviar."
          : cotRow?.dgii_status === "accepted"
            ? "Este comprobante ya fue aceptado por DGII."
            : isDgiiSubmitQueued(cotRow?.dgii_status)
              ? "El comprobante está en cola de envío automático. Usá «Reintentar envío» o esperá unos minutos."
              : dgiiResubmitBlockedMessage,
      );
      return;
    }
    setEcfCertModalLoading(true);
    setEcfError("");
    setEcfSuccess("");
    setEcfWarning("");
    try {
      const isRfceFlow =
        cotRow != null && isConsumoMenor250Rfce(cotRow.ecf_tipo, cotRow.total);
      const enc = modalEncryptionSecret.trim();

      if (isRfceFlow) {
        const out = await submitConsumoMenor250Rfce(id, {
          certificate: modalCertFile,
          certificatePassword: modalCertPassword,
          certificateEncryptionSecret: enc,
        });
        setEcfNeedCertForId(null);
        setModalCertFile(null);
        setModalCertPassword("");
        setModalEncryptionSecret("");
        setEcfEncryptionSecret(enc);
        if (company?.id && enc.length >= 8) {
          sessionStorage.setItem(`fe_cert_enc_${company.id}`, enc);
        }
        if (out.dgii_status === "accepted") {
          setEcfWarning("");
          setEcfSuccess(out.message);
        } else if (out.dgii_status === "pending") {
          setEcfSuccess("");
          setEcfWarning(`RFCE ${out.ecf_number} recibido; estado pendiente.`);
        } else {
          setEcfSuccess("");
          setEcfWarning(`RFCE ${out.ecf_number} rechazado. Revisá y reenviá esta cotización.`);
        }
      } else {
        const out = await submitEcf(id, {
          certificate: modalCertFile,
          certificatePassword: modalCertPassword,
          certificateEncryptionSecret: enc,
          dgiiCertProfile: isDgiiCertification ? dgiiCertProfile : "paso2",
        });
        if (out.certificate_saved) {
          await refreshAuthSessionFromServer();
        }
        setEcfNeedCertForId(null);
        setModalCertFile(null);
        setModalCertPassword("");
        setModalEncryptionSecret("");
        setEcfEncryptionSecret(enc);
        if (company?.id && enc.length >= 8) {
          sessionStorage.setItem(`fe_cert_enc_${company.id}`, enc);
        }
        const detail =
          out.dgii_status_summary?.trim() || out.dgii_rejection_summary?.trim() || "";
        if (out.status === "accepted") {
          setEcfWarning("");
          setEcfSuccess(
            `e-CF aceptado por DGII (Track ID: ${out.track_id}).${detail ? ` ${detail}` : ""}`.trim(),
          );
        } else if (out.status === "pending") {
          setEcfSuccess("");
          setEcfWarning(
            `DGII recibió el comprobante (Track ID: ${out.track_id}). ${
              detail || "El estado final aún se está procesando."
            }`.trim(),
          );
        } else if (out.status === "rejected") {
          setEcfSuccess("");
          if (out.dgii_resubmit_new_seq === true) {
            setEcfWarning(
              `DGII rechazó por correlativo/secuencia. Track ID: ${out.track_id}. ${detail}`.trim(),
            );
          } else {
            setEcfWarning(
              `DGII rechazó el comprobante. Track ID: ${out.track_id}. ${detail} Corregí la cotización y usá «Enviar DGII» (el correlativo no cambia).`.trim(),
            );
          }
        } else {
          setEcfWarning("");
          setEcfSuccess(`e-CF enviado (Track ID: ${out.track_id}).`);
        }
      }
      await refreshClients();
    } catch (error) {
      setEcfError(error instanceof Error ? error.message : "Error al enviar a DGII");
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
    setListLoadError("");
    try {
      const { clients: out } = await listClients();
      setClients(out);
    } catch (error) {
      setListLoadError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "No se pudo actualizar la lista.",
      );
    }
  };


  const handleDeleteCotizacionRow = async (
    client: ClientListItem,
    cot: ClientCotizacion | null,
  ) => {
    setCrudError("");
    setCrudMessage("");

    if (!cot) {
      const confirmed = window.confirm(
        `¿Seguro que deseas eliminar el cliente "${client.name}"? No tiene cotizaciones asociadas.`,
      );
      if (!confirmed) return;
      try {
        await deleteClient(client.id);
        await refreshClients();
        setCrudMessage("Cliente eliminado correctamente.");
      } catch (error) {
        setCrudError(
          error instanceof Error ? error.message : "No se pudo eliminar el cliente.",
        );
      }
      return;
    }

    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar la cotización ${cot.number} de "${client.name}"?`,
    );
    if (!confirmed) return;
    try {
      await deleteCotizacion(cot.id);
      await refreshClients();
      setCrudMessage("Cotización eliminada correctamente.");
    } catch (error) {
      setCrudError(
        error instanceof Error ? error.message : "No se pudo eliminar la cotización.",
      );
    }
  };

  const handleDeleteDetailCotizacion = async () => {
    if (!detail?.id) return;
    const confirmed = window.confirm(
      `¿Eliminar la cotización ${detail.number} de ${detail.client.name}? No se puede deshacer.`,
    );
    if (!confirmed) return;
    setCrudError("");
    setCrudMessage("");
    setDeletingDetailId(detail.id);
    try {
      await deleteCotizacion(detail.id);
      await refreshClients();
      setDetailOpen(false);
      setDetail(null);
      setCrudMessage("Cotización eliminada correctamente.");
    } catch (error) {
      setCrudError(
        error instanceof Error ? error.message : "No se pudo eliminar la cotización.",
      );
    } finally {
      setDeletingDetailId(null);
    }
  };

  const years = useMemo(() => {
    const setYears = new Set<number>();
    for (const client of clients) {
      for (const cot of client.cotizaciones ?? []) {
        if (cot.created_at) setYears.add(new Date(cot.created_at).getFullYear());
      }
    }
    return Array.from(setYears).sort((a, b) => b - a);
  }, [clients]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const periodActive = yearFilter !== "all" || monthFilter !== "all";
    const cotMatchesPeriod = (cot: ClientCotizacion) => {
      if (!periodActive) return true;
      if (!cot.created_at) return false;
      const d = new Date(cot.created_at);
      const y = String(d.getFullYear());
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      if (yearFilter !== "all" && y !== yearFilter) return false;
      if (monthFilter !== "all" && mo !== monthFilter) return false;
      return true;
    };

    const flatRows = clients
      .filter((client) => clientMatchesQuery(client, normalizedQuery))
      .flatMap((client): ClientCotRow[] => {
        const cots = (client.cotizaciones ?? []).filter(cotMatchesPeriod);
        if (cots.length === 0) {
          return periodActive
            ? []
            : [{ client, cot: null, rowKey: `client-${client.id}-empty` }];
        }
        return cots.map((cot) => ({
          client,
          cot,
          rowKey: `client-${client.id}-cot-${cot.id}`,
        }));
      });

    return [...flatRows].sort((a, b) => {
      const compare = compareClientCotRows(a, b, sortBy);
      return sortDir === "asc" ? compare : -compare;
    });
  }, [clients, query, yearFilter, monthFilter, sortBy, sortDir]);

  const clientCount = useMemo(() => new Set(rows.map((r) => r.client.id)).size, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [query, yearFilter, monthFilter, sortBy, sortDir, pageSize]);

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
      {company?.certificateConfigured && !company?.certificate_keyphrase?.trim() ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/90 p-4 text-sm shadow-sm">
          <label htmlFor="ecf-enc-clients" className="block font-semibold text-slate-800">
            Clave de cifrado del certificado (DGII)
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Guardala en <strong className="font-medium text-slate-800">Perfil de empresa</strong> para que se reutilice
            automáticamente en toda la app sin tener que volver a escribirla acá. Mientras tanto, podés usarla solo
            para esta sesión; también se puede recordar en este navegador al salir del campo.
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
      {company && isDgiiCertification ? (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 text-sm">
          <label htmlFor="dgii-cert-paso-clients" className="block font-semibold text-slate-800">
            Destino del envío a DGII (certificación)
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Usá las URLs del <strong className="font-medium text-slate-800">Paso 2</strong> (recepción estándar / lote Excel)
            o las del <strong className="font-medium text-slate-800">Paso 4</strong> (simulación e-CF), según las tengas en{" "}
            <strong className="font-medium text-slate-800">Perfil de empresa</strong> o en{" "}
            <Link to="/dgii-pruebas/ecf-simulacion" className="font-medium text-[#0b57d0] hover:underline">
              DGII · Pruebas · Paso 4
            </Link>
            .
          </p>
          <select
            id="dgii-cert-paso-clients"
            value={dgiiCertProfile}
            onChange={(e) => setDgiiCertProfile(e.target.value as "paso2" | "paso4")}
            className="mt-2 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="paso2">Paso 2 — Recepción e-CF (dgii_seed / recepción estándar)</option>
            <option value="paso4">Paso 4 — Simulación e-CF (URLs dgii_paso4_*)</option>
          </select>
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
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">Todos los meses</option>
              {MONTHS.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as "recent" | "name" | "rnc" | "number" | "total" | "status",
                )
              }
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="recent">Más recientes</option>
              <option value="name">Ordenar por Nombre</option>
              <option value="rnc">Ordenar por RNC/Cedula</option>
              <option value="number">Ordenar por N° cotización</option>
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
        ) : listLoadError ? (
          <div className="p-6 sm:p-8 text-center">
            <p className="text-red-700 font-medium">{listLoadError}</p>
            <p className="mt-2 text-sm text-gray-500">
              Verificá que el backend esté en ejecución y que la sesión siga activa.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
              onClick={() => {
                setLoading(true);
                void listClients()
                  .then(({ clients: loaded }) => {
                    setClients(loaded);
                    setListLoadError("");
                  })
                  .catch((error) => {
                    setListLoadError(
                      error instanceof Error ? error.message : "Error al cargar clientes.",
                    );
                  })
                  .finally(() => setLoading(false));
              }}
            >
              Reintentar carga
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 sm:p-8 text-gray-500 text-center">
            {query.trim()
              ? "No hay resultados para ese filtro."
              : clients.length === 0
                ? "No hay clientes registrados. Creá una cotización para agregar el primero."
                : "No hay resultados para ese filtro."}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-3 sm:px-4 py-3 text-left">Nombre</th>
                    <th className="px-3 sm:px-4 py-3 text-left">RNC / Cédula</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Teléfono</th>
                    <th className="hidden lg:table-cell px-3 sm:px-4 py-3 text-left">Correo</th>
                    <th className="px-3 sm:px-4 py-3 text-right">N° Cot.</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Tipo e-CF</th>
                    <th className="px-3 sm:px-4 py-3 text-left">e-NCF</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Total</th>
                    <th className="px-3 sm:px-4 py-3 text-left">Estado DGII</th>
                    <th className="px-3 sm:px-4 py-3 text-center">Detalle</th>
                    <th className="px-4 sm:px-6 py-4 text-center">e-CF</th>
                    <th className="px-4 sm:px-6 py-4 text-center">PDF</th>
                    <th className="px-4 sm:px-6 py-4 text-center">XML</th>
                    <th className="px-4 sm:px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {pageRows.map(({ client, cot, rowKey }, rowIndex) => {
                    const sameClientAsPrev =
                      rowIndex > 0 && pageRows[rowIndex - 1].client.id === client.id;
                    const dgiiStatus = cot?.dgii_status;
                    const seqResubmit = cot?.dgii_resubmit_new_seq === true;
                    const queueRetry =
                      cot != null &&
                      (isDgiiSubmitQueued(dgiiStatus) || dgiiStatus === "submit_failed");
                    const dgiiSendLocked = !canResubmitToDgiiWithoutEdit(cot) && !queueRetry;
                    const isRfceRow =
                      cot != null && isConsumoMenor250Rfce(cot.ecf_tipo, cot.total);

                    const rfceIntegraReady =
                      isRfceRow && dgiiStatus === "accepted";
                    const sendLabel = !cot
                      ? "-"
                      : downloadingIntegraId === cot.id
                        ? "Descargando…"
                        : sendingEcfId === cot.id
                          ? isRfceRow
                            ? "Enviando RFCE…"
                            : "Enviando..."
                          : rfceIntegraReady
                            ? "Descargar íntegro"
                            : queueRetry
                              ? sendingEcfId === cot.id
                                ? "Reintentando…"
                                : "Reintentar envío"
                              : dgiiSendLocked
                              ? dgiiStatus === "accepted"
                                ? "Enviado"
                                : dgiiStatus === "pending"
                                  ? "Pendiente"
                                  : "Rechazado"
                              : isRfceRow
                                ? dgiiStatus === "rejected"
                                  ? "Reenviar RFCE"
                                  : "Enviar RFCE"
                                : dgiiStatus === "rejected" && seqResubmit
                                  ? "Reenviar DGII"
                                  : "Enviar DGII";
                    const sendTitle = !isOnline
                      ? "Sin internet: no se puede enviar a DGII"
                      : isRfceRow
                        ? rfceIntegraReady
                          ? "Descargá el e-CF íntegro firmado (mismo del RFCE) para subirlo a CerteCF «Facturas de consumo <250Mil»."
                          : dgiiSendLocked
                            ? dgiiStatus === "pending"
                              ? "RFCE pendiente en DGII"
                              : "Estado RFCE en DGII"
                            : "Genera el par RFCE+e-CF íntegro, envía el RFCE a DGII y guarda el XML para el portal <250Mil."
                        : queueRetry
                          ? "Reenviar el mismo XML firmado a DGII (cola automática activa si sigue caído)"
                          : dgiiSendLocked
                          ? dgiiStatus === "accepted"
                            ? "Comprobante aceptado por DGII"
                            : dgiiStatus === "pending"
                              ? "Envío pendiente/procesándose"
                              : "Rechazado por DGII (no es secuencia ya utilizada): editá y guardá la cotización antes de volver a enviar."
                          : dgiiStatus === "rejected" && seqResubmit
                            ? "DGII indicó secuencia ya utilizada: la app asignó el siguiente e-NCF. Pulsá para reenviar."
                            : "Enviar e-CF a DGII";

                    const dgiiSendBtnClass = rfceIntegraReady
                      ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
                      : queueRetry
                        ? "border-violet-400 text-violet-900 bg-violet-50 hover:bg-violet-100"
                      : dgiiSendLocked
                      ? dgiiStatus === "accepted"
                        ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                        : "border-sky-200 text-sky-800 bg-sky-50"
                      : isRfceRow
                        ? dgiiStatus === "rejected"
                          ? "border-amber-400 text-amber-950 bg-amber-50 hover:bg-amber-100"
                          : "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
                        : dgiiStatus === "rejected"
                          ? "border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                          : "border-indigo-200 text-indigo-700 hover:bg-indigo-50";

                    return (
                      <tr
                        key={rowKey}
                        className={`hover:bg-indigo-50/40 transition ${sameClientAsPrev ? "bg-slate-50/40" : ""}`}
                      >
                        <td className="px-3 sm:px-4 py-3 font-semibold text-gray-900 text-sm">
                          {client.name}
                        </td>

                        <td className="px-3 sm:px-4 py-3 text-gray-600 text-sm whitespace-nowrap">
                          {client.rnc_cedula}
                        </td>

                        <td className="px-3 sm:px-4 py-3 text-gray-600 text-sm whitespace-nowrap">
                          {client.phone || "-"}
                        </td>

                        <td className="hidden lg:table-cell px-3 sm:px-4 py-3 text-gray-600 text-sm max-w-[12rem] truncate">
                          {client.email || "-"}
                        </td>

                        <td className="px-3 sm:px-4 py-3 text-right text-indigo-600 font-medium text-sm tabular-nums">
                          {cot != null && Number.isFinite(Number(cot.number))
                            ? Number(cot.number)
                            : "—"}
                        </td>

                        <td className="px-3 sm:px-4 py-3 text-gray-700 text-xs">
                          {cot?.ecf_tipo ? ecfTipoDisplayLabel(cot.ecf_tipo, cot.total) : "—"}
                        </td>

                        <td className="px-3 sm:px-4 py-3 font-mono text-xs text-slate-800 whitespace-nowrap">
                          {cot
                            ? cot.ecf_number?.trim() ||
                              formatEcfNumberDisplay(cot.ecf_tipo, cot.ecf_ncf_seq)
                            : "—"}
                        </td>

                        <td className="px-3 sm:px-4 py-3 text-gray-700 font-medium text-sm tabular-nums">
                          {cot ? formatCurrency(cot.total) : "-"}
                        </td>

                        <td className="px-3 sm:px-4 py-3">
                          {cot ? (
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${dgiiStatusClass(dgiiStatus)}`}
                            >
                              {dgiiStatusLabel(dgiiStatus)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-3 text-center">
                          {cot ? (
                            <button
                              onClick={() => handleOpenDetail(cot.id)}
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

                        <td className="px-4 sm:px-6 py-4 text-center align-top">
                          {cot ? (
                            <div className="flex flex-col items-center gap-1">
                              <button
                                onClick={() =>
                                  void (queueRetry && !isRfceRow
                                    ? handleRetryQueuedDgiiSubmit(cot.id)
                                    : handleRfcePrimaryAction(cot.id))
                                }
                                disabled={
                                  sendingEcfId === cot.id ||
                                  downloadingIntegraId === cot.id ||
                                  (!rfceIntegraReady && dgiiSendLocked) ||
                                  !isOnline
                                }
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${dgiiSendBtnClass}`}
                                title={sendTitle}
                              >
                                {sendLabel}
                              </button>
                              {isRfceRow && !rfceIntegraReady && !dgiiSendLocked ? (
                                <p className="max-w-[13rem] text-center text-[10px] leading-snug text-amber-900">
                                  Paso 1: enviar RFCE. Paso 2: descargar íntegro y subir al portal &lt;250Mil.
                                </p>
                              ) : null}
                              {rfceIntegraReady ? (
                                <p className="max-w-[13rem] text-center text-[10px] leading-snug text-emerald-800">
                                  RFCE aceptado. Descargá el íntegro y subilo a CerteCF.
                                </p>
                              ) : null}
                              {dgiiStatus === "rejected" ? (
                                <DgiiRejectionHint
                                  status={dgiiStatus}
                                  summary={cot.dgii_rejection_summary}
                                  fullMessage={cot.dgii_rejection_full}
                                  trackId={cot.dgii_track_id}
                                  cotNumber={cot.number}
                                  onViewFull={setDgiiResponseModal}
                                  className="max-w-[13rem] text-left"
                                />
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>

                        <td className="px-4 sm:px-6 py-4 text-center">
                          {cot ? (
                            <button
                              onClick={() => handleDownload(cot.id, client.name)}
                              disabled={downloadingId === cot.id}
                              className="p-2 rounded-lg hover:bg-indigo-100 transition inline-block disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Descargar PDF"
                            >
                              {downloadingId === cot.id ? (
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
                          {cot ? (
                            <button
                              type="button"
                              onClick={() => void openEcfXmlViewer(cot.id)}
                              className="p-2 rounded-lg hover:bg-violet-50 transition inline-block"
                              title="Ver XML e-CF guardado (firmado al guardar cotización)"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 sm:w-5 sm:h-5 text-violet-700"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              to={cot ? `/cotizaciones/${cot.id}/editar` : "#"}
                              className="rounded border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Editar
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteCotizacionRow(client, cot)}
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
              {pageRows.map(({ client, cot, rowKey }, rowIndex) => {
                const sameClientAsPrev =
                  rowIndex > 0 && pageRows[rowIndex - 1].client.id === client.id;
                const dgiiStatus = cot?.dgii_status;
                const seqResubmit = cot?.dgii_resubmit_new_seq === true;
                const dgiiSendLocked = !canResubmitToDgiiWithoutEdit(cot);

                const sendLabel = !cot
                  ? "-"
                  : sendingEcfId === cot.id
                    ? "..."
                    : dgiiSendLocked
                      ? dgiiStatus === "accepted"
                        ? "Enviado"
                        : dgiiStatus === "pending"
                          ? "Pendiente"
                          : "Rechazado"
                      : dgiiStatus === "rejected" && seqResubmit
                        ? "Reenviar"
                        : "Enviar";
                const sendTitle = !isOnline
                  ? "Sin internet: no se puede enviar a DGII"
                  : dgiiSendLocked
                    ? dgiiStatus === "accepted"
                      ? "Comprobante aceptado por DGII"
                      : dgiiStatus === "pending"
                        ? "Envío pendiente/procesándose"
                        : "Editá y guardá la cotización para volver a enviar (solo «Reenviar» si DGII indica secuencia ya utilizada)."
                    : dgiiStatus === "rejected" && seqResubmit
                      ? "Secuencia ya utilizada: reenviar con el nuevo e-NCF."
                      : "Enviar e-CF a DGII";

                const dgiiSendBtnClass = dgiiSendLocked
                  ? dgiiStatus === "accepted"
                    ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                    : "border-sky-200 text-sky-800 bg-sky-50"
                  : dgiiStatus === "rejected"
                    ? "border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100"
                    : "border-indigo-200 text-indigo-700 hover:bg-indigo-50";

                return (
                  <div
                    key={rowKey}
                    className={`p-4 hover:bg-indigo-50/40 transition ${sameClientAsPrev ? "bg-slate-50/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate text-sm sm:text-base">
                          {client.name}
                        </h3>
                        <p className="text-sm text-gray-500">RNC: {client.rnc_cedula}</p>
                      </div>
                      {cot ? (
                        <>
                          <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenDetail(cot.id)}
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
                            onClick={() => handleSendEcf(cot.id)}
                            disabled={sendingEcfId === cot.id || dgiiSendLocked || !isOnline}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${dgiiSendBtnClass}`}
                            title={sendTitle}
                          >
                            {sendLabel}
                          </button>
                          <button
                            onClick={() => handleDownload(cot.id, client.name)}
                            disabled={downloadingId === cot.id}
                            className="p-2 rounded-lg hover:bg-indigo-100 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Descargar PDF"
                          >
                            {downloadingId === cot.id ? (
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
                          {cot ? (
                            <button
                              type="button"
                              onClick={() => void openEcfXmlViewer(cot.id)}
                              className="p-2 rounded-lg hover:bg-violet-50 flex-shrink-0"
                              title="Ver XML e-CF"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-4 h-4 text-violet-700"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                          {dgiiStatus === "rejected" ? (
                            <DgiiRejectionHint
                              status={dgiiStatus}
                              summary={cot.dgii_rejection_summary}
                              fullMessage={cot.dgii_rejection_full}
                              trackId={cot.dgii_track_id}
                              cotNumber={cot.number}
                              onViewFull={setDgiiResponseModal}
                              className="mt-1 max-w-[min(100%,300px)]"
                            />
                          ) : null}
                      </>
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
                        <p className="text-indigo-600 font-medium tabular-nums">
                          {cot ? cot.number : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Total</p>
                        <p className="text-gray-900 font-medium">{cot ? formatCurrency(cot.total) : "-"}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-gray-500 text-xs">Tipo e-CF</p>
                        <p className="text-gray-900 text-xs">{cot?.ecf_tipo ? ecfTipoDisplayLabel(cot.ecf_tipo, cot.total) : "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-500 text-xs">e-NCF</p>
                        <p className="font-mono text-xs text-slate-800 break-all">
                          {cot
                            ? cot.ecf_number?.trim() ||
                              formatEcfNumberDisplay(cot.ecf_tipo, cot.ecf_ncf_seq)
                            : "—"}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-gray-500 text-xs">Estado DGII</p>
                        {cot ? (
                          <span
                            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${dgiiStatusClass(dgiiStatus)}`}
                          >
                            {dgiiStatusLabel(dgiiStatus)}
                          </span>
                        ) : (
                          <p className="text-gray-400">—</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        to={cot ? `/cotizaciones/${cot.id}/editar` : "#"}
                        className="rounded border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteCotizacionRow(client, cot)}
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
                Mostrando {pageRows.length} de {rows.length} cotizaciones ({clientCount}{" "}
                {clientCount === 1 ? "cliente" : "clientes"})
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
      {ecfWarning && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 text-sm">
          <p className="font-semibold">Respuesta DGII</p>
          <p className="mt-1 whitespace-pre-wrap">{ecfWarning}</p>
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
                    <span className="font-semibold">Cotización:</span>{" "}
                    <span className="tabular-nums">{detail.number}</span>
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
                    <span className="font-semibold">Tipo comprobante (e-CF):</span>{" "}
                    {ecfTipoDisplayLabel(detail.ecf_tipo, detail.total) || detail.ecf_tipo || "—"}
                  </p>
                  <p>
                    <span className="font-semibold">e-NCF (próximo XML):</span>{" "}
                    {formatEcfNumberDisplay(detail.ecf_tipo, detail.ecf_ncf_seq ?? undefined)}
                  </p>
                  <p className="text-xs leading-snug text-slate-500 sm:col-span-2">
                    «Reenviar DGII» solo aparece si DGII indica que el número de secuencia ya fue utilizado.
                    En cualquier otro rechazo el e-NCF no cambia: corregí la cotización y usá «Enviar DGII».
                  </p>
                  <p>
                    <span className="font-semibold">Referencia NCF (ND/NC):</span>{" "}
                    {detail.ecf_reference_ncf?.trim() || "—"}
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
                {detail.dgii_status === "rejected" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm">
                    <p className="font-semibold text-amber-950">Último rechazo DGII</p>
                    {detail.dgii_rejection_summary?.trim() ? (
                      <p className="mt-1 line-clamp-4 text-amber-950">{detail.dgii_rejection_summary}</p>
                    ) : (
                      <p className="mt-1 text-amber-900 text-xs">Sin resumen interpretable.</p>
                    )}
                    {(detail.dgii_rejection_full?.trim() ||
                      detail.dgii_response?.trim() ||
                      detail.dgii_rejection_summary?.trim()) && (
                      <button
                        type="button"
                        onClick={() =>
                          setDgiiResponseModal({
                            title: `Respuesta DGII · cotización #${detail.number}`,
                            status: detail.dgii_status,
                            trackId: detail.dgii_track_id,
                            summary: detail.dgii_rejection_summary,
                            fullMessage:
                              detail.dgii_rejection_full?.trim() ||
                              detail.dgii_rejection_summary?.trim() ||
                              null,
                            rawResponse: detail.dgii_response,
                          })
                        }
                        className="mt-2 text-xs font-semibold text-[#0b57d0] hover:underline"
                      >
                        Ver mensaje completo
                      </button>
                    )}
                    {detail.dgii_resubmit_new_seq === true ? (
                      <p className="mt-2 text-xs text-amber-900">
                        Rechazo por secuencia ya utilizada: en el listado el botón es «Reenviar DGII» y el correlativo
                        puede haber avanzado.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-amber-900">
                        No es rechazo por secuencia: el mismo e-NCF se mantiene. Corregí la cotización y usá «Enviar DGII».
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openEcfXmlViewer(detail.id)}
                    className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100"
                  >
                    Ver XML e-CF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteDetailCotizacion()}
                    disabled={deletingDetailId === detail.id}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingDetailId === detail.id ? "Eliminando…" : "Eliminar cotización"}
                  </button>
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

      {ecfXmlViewer.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  XML e-CF
                  {ecfXmlViewer.tab === "preview" ||
                  (ecfXmlViewer.tab === "signed" && ecfXmlViewer.dgiiTrackId) ? (
                    <span className="ml-2 text-sm font-normal text-emerald-700">firmado</span>
                  ) : null}
                </h3>
                {ecfXmlViewer.ecfNumber ? (
                  <p className="text-xs text-slate-500">e-NCF: {ecfXmlViewer.ecfNumber}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeEcfXmlViewer}
                className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {ecfXmlViewer.loading ? (
                <p className="text-sm text-slate-500">Cargando e-CF…</p>
              ) : null}
              {ecfXmlViewer.error ? (
                <p className="text-sm text-red-600">{ecfXmlViewer.error}</p>
              ) : null}
              {!ecfXmlViewer.loading && !ecfXmlViewer.error ? (
                <>
                  {company?.certificateConfigured && !ecfXmlViewer.signedXml ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                      <p className="flex-1 text-xs text-amber-900">
                        No hay XML firmado guardado para esta cotización. Guardá otra vez desde Editar con la clave del
                        certificado, o firmá aquí sin guardar en servidor.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handleSignEcfXmlLocal()}
                        disabled={ecfSignLocalLoading || ecfXmlViewer.cotizacionId == null}
                        className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {ecfSignLocalLoading
                          ? "Firmando…"
                          : ecfXmlViewer.previewSignedXml
                            ? "Actualizar vista (firma local)"
                            : "Firmar solo en esta pantalla"}
                      </button>
                      {ecfSignLocalError ? (
                        <p className="w-full text-xs text-red-600">{ecfSignLocalError}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {!company?.certificateConfigured && !ecfXmlViewer.signedXml ? (
                    <p className="mb-3 text-xs text-slate-500">
                      Cargá el certificado en Perfil de empresa y guardá la cotización para generar el e-CF firmado listo
                      para DGII.
                    </p>
                  ) : null}
                  <div className="mb-3 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                    {ecfXmlViewer.previewSignedXml || ecfXmlViewer.signedXml ? (
                      <button
                        type="button"
                        onClick={() => setEcfXmlViewer((s) => ({ ...s, tab: "preview" }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          ecfXmlViewer.tab === "preview"
                            ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        Listo para DGII (firmado)
                      </button>
                    ) : null}
                    {ecfXmlViewer.generatedXml.trim() ? (
                    <button
                      type="button"
                      onClick={() => setEcfXmlViewer((s) => ({ ...s, tab: "generated" }))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        ecfXmlViewer.tab === "generated"
                          ? "bg-violet-100 text-violet-900"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Borrador (sin firma)
                    </button>
                    ) : null}
                    {ecfXmlViewer.dgiiTrackId && ecfXmlViewer.signedXml ? (
                      <button
                        type="button"
                        onClick={() => setEcfXmlViewer((s) => ({ ...s, tab: "signed" }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          ecfXmlViewer.tab === "signed"
                            ? "bg-violet-100 text-violet-900"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        Copia del envío a DGII
                      </button>
                    ) : null}
                  </div>
                  <pre className="max-h-[min(60vh,520px)] overflow-auto rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-800 ring-1 ring-slate-200 whitespace-pre">
                    {ecfXmlViewer.tab === "signed" &&
                    ecfXmlViewer.signedXml &&
                    ecfXmlViewer.dgiiTrackId
                      ? ecfXmlViewer.signedXml
                      : ecfXmlViewer.tab === "preview"
                        ? ecfXmlViewer.previewSignedXml || ecfXmlViewer.signedXml || ""
                        : ecfXmlViewer.generatedXml}
                  </pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isConsumoMenor250Rfce(ecfXmlViewer.ecfTipo, ecfXmlViewer.total) ? (
                      <button
                        type="button"
                        onClick={() => void handleDownloadConsumoIntegraFromViewer()}
                        disabled={
                          consumoIntegraDownloading || ecfXmlViewer.cotizacionId == null
                        }
                        className="rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {consumoIntegraDownloading
                          ? "Descargando…"
                          : "Descargar e-CF íntegro (portal <250Mil)"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={downloadCurrentEcfXmlFromViewer}
                      disabled={
                        !(
                          (ecfXmlViewer.tab === "signed" && ecfXmlViewer.signedXml) ||
                          (ecfXmlViewer.tab === "preview" &&
                            (ecfXmlViewer.previewSignedXml || ecfXmlViewer.signedXml)) ||
                          (ecfXmlViewer.tab === "generated" && ecfXmlViewer.generatedXml.trim())
                        )
                      }
                      className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                    >
                      {ecfXmlViewer.tab === "preview" &&
                      (ecfXmlViewer.previewSignedXml || ecfXmlViewer.signedXml)
                        ? "Descargar XML firmado (DGII)"
                        : "Descargar .xml"}
                    </button>
                  </div>
                  {consumoPackError ? (
                    <p className="mt-2 text-xs text-red-600">{consumoPackError}</p>
                  ) : null}
                  {isConsumoMenor250Rfce(ecfXmlViewer.ecfTipo, ecfXmlViewer.total) ? (
                    <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Consumo &lt; RD$250k: usá <strong>Enviar RFCE</strong> en la tabla (genera y envía el resumen).
                      Cuando DGII acepte el RFCE, descargá aquí el <strong>e-CF íntegro</strong> (mismo XML firmado; no se
                      vuelve a firmar). Subilo a CerteCF «Facturas de consumo &lt;250Mil». Si regenerás o descargás de
                      nuevo con otro certificado, el código de seguridad no coincidirá con el RFCE.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Al guardar la cotización se genera y firma el XML (misma firma que el envío a DGII). Ver XML solo
                      muestra lo ya guardado; no vuelve a firmar en este paso.
                    </p>
                  )}
                </>
              ) : null}
            </div>
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

      <DgiiResponseModal
        open={dgiiResponseModal != null}
        payload={dgiiResponseModal}
        onClose={() => setDgiiResponseModal(null)}
      />
    </div>
  );
}