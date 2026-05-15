import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import XLSX from "xlsx";
import { findAcecfSheetName, loadAcecfRowsFromExcel } from "./commercialApproval.service";

const OFFICIAL_DGII_ACECF_XLSX = path.join(
  __dirname,
  "../../assets/04900920846-15052026124136-acecf.xlsx",
);

describe("findAcecfSheetName", () => {
  it("acepta hoja ACEECF_Generadas del portal DGII", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([
      {
        Version: "1.0",
        RNCEmisor: "123456789",
        eNCF: "E320000000001",
        RNCComprador: "987654321",
        Estado: "1",
      },
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "ACEECF_Generadas");
    assert.equal(findAcecfSheetName(wb.SheetNames, wb), "ACEECF_Generadas");
  });

  it("prefiere hoja con columnas ACECF si hay varias candidatas", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Notas"]]), "Resumen");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ eNCF: "E320000000001", RNCComprador: "1", Estado: "1" }]),
      "ACEECF_Generadas",
    );
    assert.equal(findAcecfSheetName(wb.SheetNames, wb), "ACEECF_Generadas");
  });

  it("lee el Excel oficial DGII de prueba (11 filas, hoja ACEECF_Generadas)", () => {
    assert.ok(
      fs.existsSync(OFFICIAL_DGII_ACECF_XLSX),
      `Falta fixture ${OFFICIAL_DGII_ACECF_XLSX}`,
    );
    const wb = XLSX.readFile(OFFICIAL_DGII_ACECF_XLSX);
    assert.equal(findAcecfSheetName(wb.SheetNames, wb), "ACEECF_Generadas");
    const rows = loadAcecfRowsFromExcel(OFFICIAL_DGII_ACECF_XLSX);
    assert.equal(rows.length, 11);
    assert.equal(rows[0]?.eNCF, "E310000000001");
    assert.equal(rows[0]?.RNCComprador, "04900920846");
    assert.equal(rows[0]?.Estado, "1");
  });
});
