import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEcfXml } from "../services/xmlBuilder";
import type { EcfPayload } from "../services/validation";
import { buildConsultaTimbreQrUrl } from "./ecfConsultaTimbreQr";
import { codigoSeguridadParaConsultaTimbre, fechaEmisionUrl } from "./ecfXmlExtract";

const basePayload = (): EcfPayload => ({
  ecfNumber: "E310000000001",
  issueDate: new Date("2024-06-15T12:00:00.000Z"),
  issuer: {
    rnc: "131880738",
    name: "ACME SRL",
    address: "Av. Principal 1",
    phone: "809-555-0000",
    email: "a@acme.com",
  },
  buyer: {
    name: "Cliente Demo",
    rncCedula: "40212345678",
    address: "Calle 2",
    contact: "Pedro",
  },
  items: [
    {
      itemNumber: 1,
      description: "Servicio",
      quantity: 1,
      unit: "UNIDAD",
      unitPrice: 100,
      totalValue: 118,
    },
  ],
  subtotal: 100,
  itbis: 18,
  total: 118,
});

test("fechaEmisionUrl: conserva dd-mm-aaaa del XML", () => {
  assert.equal(fechaEmisionUrl("15-06-2024"), "15-06-2024");
});

test("fechaEmisionUrl: convierte yyyymmdd", () => {
  assert.equal(fechaEmisionUrl("20240615"), "15-06-2024");
});

test("buildConsultaTimbreQrUrl: fechaemision correcta en tipo 31", () => {
  const xml = buildEcfXml(basePayload());
  const signedLike = xml.replace(
    "</ECF>",
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>YWJjZGVmMTIzNDU2Nzg5MA==</SignatureValue></Signature></ECF>`,
  );
  const url = buildConsultaTimbreQrUrl({
    signedXml: signedLike,
    dgiiEnvironment: "CERTIFICACION",
    ecfTipo: "31",
    fechaFirma: new Date("2024-06-15T16:00:00.000Z"),
  });
  assert.match(url, /FechaEmision=15-06-2024/);
  assert.match(url, /ENCF=E310000000001/);
  assert.doesNotMatch(url, /FechaFirma=.*\+/);
  const codigo = codigoSeguridadParaConsultaTimbre(signedLike);
  assert.equal(codigo, "YWJjZG");
  assert.match(url, new RegExp(`CodigoSeguridad=${codigo}`));
});

test("buildConsultaTimbreQrUrl: consumo menor 250 usa fc.dgii.gov.do", () => {
  const p = { ...basePayload(), ecfNumber: "E320000000099", ecfTipo: "32", total: 100, subtotal: 100, itbis: 0 };
  const xml = buildEcfXml(p);
  const signedLike = xml.replace(
    "</ECF>",
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>YWJjZGVmMTIzNDU2Nzg5MA==</SignatureValue></Signature></ECF>`,
  );
  const url = buildConsultaTimbreQrUrl({
    signedXml: signedLike,
    dgiiEnvironment: "CERTIFICACION",
    ecfTipo: "32",
    fechaFirma: new Date("2024-06-15T16:00:00.000Z"),
  });
  assert.match(url, /^https:\/\/fc\.dgii\.gov\.do\/testecf\/consultatimbrefc\?/);
  assert.doesNotMatch(url, /RncComprador=/);
});

test("buildConsultaTimbreQrUrl: E310000000101 coincide con consulta DGII CerteCF", () => {
  const signedLike = `<?xml version="1.0"?><ECF>
  <Encabezado>
    <Emisor><RNCEmisor>04900920846</RNCEmisor><FechaEmision>18-05-2026</FechaEmision></Emisor>
    <Comprador><RNCComprador>02800449619</RNCComprador></Comprador>
    <IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000101</eNCF></IdDoc>
    <Totales><MontoTotal>11.80</MontoTotal></Totales>
  </Encabezado>
  <FechaHoraFirma>18-05-2026 21:10:06</FechaHoraFirma>
  <Signature><SignatureValue>BTDDYV8dtRHxSeO9ahfpsKJQfRTMTFUQBOTK8DsNerTg3pgXhhGXeYN/4hmKlrjriI8bjtO7W0pnx3wq+mwziAj9uRFkzdV79w6OCj0schddmJf2PUv6DIlqxo5ArZc9XwyK1EDZFnePFsc/dF3KKYPci3yZb+C0sb1T1+B3OeJAol33psOvztG2yRupYjP8DbU38GGw4+93LGkIR/5GkqxyILOuFv21tBTLsrOBEHgsawdvZWzgQy1c725uZP6O84/DN+KTQfOk+92QXC8OrWPw+0X70NHwiDIX6se7fS1W+aFh2o3hmvV3dnXRhMin2RMJgAkDkHNFMXjGzQLliA==</SignatureValue></Signature>
</ECF>`;
  const url = buildConsultaTimbreQrUrl({
    signedXml: signedLike,
    dgiiEnvironment: "CERTIFICACION",
    ecfTipo: "31",
    fechaFirma: new Date(),
  });
  assert.match(
    url,
    /^https:\/\/ecf\.dgii\.gov\.do\/certecf\/consultatimbre\?RncEmisor=04900920846&RncComprador=02800449619&ENCF=E310000000101&FechaEmision=18-05-2026&MontoTotal=11\.80&FechaFirma=18-05-2026%2021%3A10%3A06&CodigoSeguridad=BTDDYV$/,
  );
});
