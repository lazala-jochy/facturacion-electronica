import { useState } from "react";
import PageHeaderCard from "../components/PageHeaderCard";
import PageShell from "../components/PageShell";
import { ApiError } from "../services/api";
import { signUploadedXml } from "../services/xmlFirma";
import { saveFile, XML_FILE_TYPES } from "../utils/saveFile";

const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-[#0b57d0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0948ad] disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const signedFileName = (original: string): string => {
  const base = original.replace(/\.xml$/i, "");
  return `${base}-firmado.xml`;
};

export default function FirmarXml() {
  const [file, setFile] = useState<File | null>(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fileName: string; signedXml: string } | null>(null);

  const handleSign = async () => {
    if (!file) return;
    setSigning(true);
    setError(null);
    try {
      const out = await signUploadedXml(file);
      setResult({ fileName: signedFileName(file.name), signedXml: out.signed_xml });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo firmar el XML.");
      setResult(null);
    } finally {
      setSigning(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;
    const blob = new Blob([result.signedXml], { type: "application/xml;charset=utf-8" });
    await saveFile(blob, result.fileName, XML_FILE_TYPES);
  };

  return (
    <PageShell>
      <PageHeaderCard
        title="Firmar XML"
        description="Subí cualquier XML (ej. Postulación de inscripción DGII) y firmalo con el certificado y clave ya configurados en Perfil de empresa."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          {file ? (
            <p className="text-sm text-slate-600">
              Archivo seleccionado: <span className="font-medium text-slate-900">{file.name}</span>
            </p>
          ) : null}
          <label className={`${btnSecondary} mt-2 w-fit cursor-pointer`}>
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setError(null);
              }}
            />
            {file ? "Cambiar archivo" : "Seleccionar XML"}
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button type="button" className={btnPrimary} disabled={!file || signing} onClick={() => void handleSign()}>
          {signing ? "Firmando..." : "Firmar XML"}
        </button>

        {result ? (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">XML firmado</h3>
              <button type="button" className={btnSecondary} onClick={() => void handleDownload()}>
                Descargar .xml
              </button>
            </div>
            <pre className="max-h-[min(60vh,520px)] overflow-auto rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-800 ring-1 ring-slate-200 whitespace-pre">
              {result.signedXml}
            </pre>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
