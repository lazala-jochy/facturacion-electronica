/**
 * Utilidades compartidas entre plantillas e-CF (DGII).
 */

/** Namespace oficial e-CF (obligatorio en CerteCF / validación XSD). */
export const DGII_ECF_NS = "http://www.dgii.gov.do/ecf";

const DEFAULT_MUNICIPIO = process.env.DGII_EMISOR_MUNICIPIO_DEFAULT ?? "010101";
const DEFAULT_PROVINCIA = process.env.DGII_EMISOR_PROVINCIA_DEFAULT ?? "010000";
/** Orden XSD de Comprador (alineado a COMPRADOR_FIELDS en utils/xmlBuilder.js). */
export const DEFAULT_COMPRADOR_MUNICIPIO =
  process.env.DGII_COMPRADOR_MUNICIPIO_DEFAULT ?? DEFAULT_MUNICIPIO;
export const DEFAULT_COMPRADOR_PROVINCIA =
  process.env.DGII_COMPRADOR_PROVINCIA_DEFAULT ?? DEFAULT_PROVINCIA;

export const DEFAULT_FECHA_VENC_SEC = process.env.DGII_ENCF_FECHA_VENC_SECUENCIA ?? "31-12-2028";

export const money = (value: number) => value.toFixed(2);
export const qty = (value: number) => value.toFixed(2);
export const unitPrice4 = (value: number) => value.toFixed(4);

/** Fecha emisión (bloque Emisor): DD-MM-YYYY */
export const fechaEmisionDdMmYyyy = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${dd}-${mm}-${y}`;
};

/** Fecha límite de pago (IdDoc crédito): DD-MM-YYYY, días desde emisión. */
export const fechaLimitePagoDesdeEmision = (issueDate: Date, days = 35) => {
  const d = new Date(issueDate);
  d.setDate(d.getDate() + days);
  return fechaEmisionDdMmYyyy(d);
};

/** FechaHoraFirma (antes de Signature): DD-MM-YYYY HH:mm:ss (hora República Dominicana). */
export const fechaHoraFirmaDgii = () => {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((x) => x.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

/**
 * Código de unidad de medida DGII (numérico, Tabla IV del Formato e-CF v1.0).
 * Texto libre no es válido en recepción; nombres/abreviaturas desconocidos caen en "43" (Unidad).
 */
export function mapUnidadMedidaDgii(unitRaw: string): string {
  const u = unitRaw.trim();
  if (/^\d{1,3}$/.test(u)) return u;
  const upper = u
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const map: Record<string, string> = {
    BARRIL: "1",
    BARR: "1",
    BOLSA: "2",
    BOL: "2",
    BOTE: "3",
    BOTELLA: "5",
    BULTOS: "4",
    BULTO: "4",
    "CAJA/CAJON": "6",
    "CAJA / CAJON": "6",
    CAJA: "6",
    CAJON: "6",
    CAJ: "6",
    CAJETILLA: "7",
    CENTIMETRO: "8",
    CM: "8",
    CILINDRO: "9",
    CIL: "9",
    CONJUNTO: "10",
    CONJ: "10",
    CONTENEDOR: "11",
    CONT: "11",
    DIA: "12",
    DOCENA: "13",
    DOC: "13",
    FARDO: "14",
    FARD: "14",
    GALONES: "15",
    GALON: "15",
    GL: "15",
    GRADO: "16",
    GRAD: "16",
    GRAMO: "17",
    GR: "17",
    GRANEL: "18",
    GRAN: "18",
    HORA: "19",
    HOR: "19",
    HUACAL: "20",
    HUAC: "20",
    KILOGRAMO: "21",
    KG: "21",
    "KILOVATIO HORA": "22",
    KWH: "22",
    LIBRA: "23",
    LB: "23",
    LITRO: "24",
    LOTE: "25",
    LOT: "25",
    METRO: "26",
    M: "26",
    "METRO CUADRADO": "27",
    M2: "27",
    "METRO CUBICO": "28",
    M3: "28",
    "MILLONES DE UNIDADES TERMICAS": "29",
    MMBTU: "29",
    MINUTO: "30",
    MIN: "30",
    PAQUETE: "31",
    PAQ: "31",
    PAR: "32",
    PIE: "33",
    PIEZA: "34",
    PZA: "34",
    ROLLO: "35",
    ROL: "35",
    SOBRE: "36",
    SOBR: "36",
    SEGUNDO: "37",
    SEG: "37",
    TANQUE: "38",
    TONELADA: "39",
    TONE: "39",
    TUBO: "40",
    TUB: "40",
    YARDA: "41",
    YD: "41",
    "YARDA CUADRADA": "42",
    YD2: "42",
    UNIDAD: "43",
    UND: "43",
    UN: "43",
    SERVICIO: "43",
    "EQUIPO DE OFICINA": "43",
    ELEMENTO: "44",
    EA: "44",
    MILLAR: "45",
    SACO: "46",
    SAC: "46",
    LATA: "47",
    LAT: "47",
    DISPLAY: "48",
    DIS: "48",
    BIDON: "49",
    BID: "49",
    RACION: "50",
    RAC: "50",
    QUINTAL: "51",
    Q: "51",
    "GROSS REGISTER TONNAGE": "52",
    "TONELADAS DE REGISTRO BRUTO": "52",
    GRT: "52",
    "PIE CUADRADO": "53",
    P2: "53",
    PASAJERO: "54",
    PAX: "54",
    PULGADAS: "55",
    PULG: "55",
    "PARQUEO BARCOS EN MUELLE": "56",
    STAY: "56",
    BANDEJA: "57",
    BDJ: "57",
    HECTAREA: "58",
    HA: "58",
    MILILITRO: "59",
    ML: "59",
    MILIGRAMO: "60",
    MG: "60",
    ONZAS: "61",
    ONZA: "61",
    OZ: "61",
    "ONZAS TROY": "62",
    OZT: "62",
  };
  const compact = upper.replace(/\s/g, "");
  for (const [k, v] of Object.entries(map)) {
    if (k.replace(/\s/g, "") === compact) return v;
  }
  return "43";
}

export function splitPhones(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[|,/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function indicadorBienServicio(
  unit: string,
  description: string,
  explicit?: "1" | "2",
): "1" | "2" {
  if (explicit === "1" || explicit === "2") return explicit;
  const blob = `${unit} ${description}`.toLowerCase();
  if (blob.includes("servicio")) return "2";
  return "1";
}

export const EMISOR_DEFAULT_MUNICIPIO = DEFAULT_MUNICIPIO;
export const EMISOR_DEFAULT_PROVINCIA = DEFAULT_PROVINCIA;

const round2 = (value: number) => Number(value.toFixed(2));

/**
 * Código modificación DGII para nota de crédito (e-CF 34):
 * - `2` Corrige texto → MontoTotal debe ser 0.
 * - `3` Corrige montos del NCF modificado (p. ej. reducir total de un e-CF ya enviado).
 */
export function resolveCodigoModificacionNotaCredito(
  total: number,
  explicit?: string | null,
): string {
  const raw = String(explicit ?? "").trim();
  if (["1", "2", "3", "4"].includes(raw)) return raw;
  return round2(total) <= 0.001 ? "2" : "3";
}
