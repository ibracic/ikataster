import { zipSync, strToU8 } from "fflate";
import type { ResultRecord } from "../ezk/results";
import type { Geometry } from "geojson";
import type { Holder, Right } from "../ezk/types";

export type Cell = string | number;
export interface Table { headers: string[]; rows: Cell[][] }

const safe = (s: string) => s.replace(/[\/\\]/g, "-").replace(/[^\p{L}\p{N}._-]+/gu, "_");

/** "388_100-1_2026-09-28.pdf" — KO, parcel/building number (+ part), extract date. */
export function pdfFileName(r: ResultRecord): string {
  const p = r.extract.property;
  const num = p.part != null ? `${p.number}-${p.part}` : p.number ?? String(p.ezkId ?? "nepremicnina");
  const date = r.extract.createdAt?.slice(0, 10) ?? "";
  return safe([p.koId ?? "x", num, date].filter(Boolean).join("_")) + ".pdf";
}

export type Pdfs = Map<string, Uint8Array>;

/** Unique relative paths "pdf/<name>" for records whose PDF is available. */
export function pdfPaths(records: ResultRecord[], pdfs: Pdfs = new Map()): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const r of records) {
    if (!pdfs.has(r.key)) continue;
    let name = pdfFileName(r);
    for (let i = 2; used.has(name); i++) name = pdfFileName(r).replace(/\.pdf$/, `_${i}.pdf`);
    used.add(name);
    out.set(r.key, `pdf/${name}`);
  }
  return out;
}

const HOLDER_KIND = { person: "oseba", company: "podjetje", ownerOf: "vsakokratni lastnik" } as const;
const CATEGORY = { mortgage: "hipoteka", easement: "služnost", note: "zaznamba", other: "pravica" } as const;
const noCode = (s?: string) => (s ?? "").replace(/^\d+ - /, "");
const holderText = (h: Holder) =>
  h.kind === "company" && h.companyId ? `${h.name} (${h.companyId})` : h.kind === "ownerOf" ? `vsakokratni lastnik: ${h.name}` : h.name;

function propCells(r: ResultRecord): Cell[] {
  const p = r.extract.property;
  return [p.label, p.koId ?? "", p.number ?? "", p.part ?? "", noCode(p.typeLabel), p.address ?? ""];
}

export function ownerTable(records: ResultRecord[], pdfs?: Pdfs): Table {
  const paths = pdfPaths(records, pdfs);
  const headers = ["Nepremičnina", "k.o.", "Številka", "Del stavbe", "Vrsta", "Naslov nepremičnine", "Imetnik", "Tip imetnika", "Delež",
    "Rojen", "Matična št.", "Naslov imetnika", "Omejitve", "Nerešena zadeva", "Datum izpisa", "PDF"];
  const rows: Cell[][] = [];
  for (const r of records) {
    for (const o of r.extract.owners) {
      const h = o.holder;
      rows.push([
        ...propCells(r), h.name, HOLDER_KIND[h.kind], o.share,
        h.kind === "person" ? h.birthDate ?? "" : "", h.kind === "company" ? h.companyId ?? "" : "",
        "address" in h ? h.address ?? "" : "", o.restrictions.length, r.extract.pending ? "da" : "ne",
        r.extract.createdAt?.slice(0, 10) ?? "", paths.get(r.key) ?? "",
      ]);
    }
  }
  return { headers, rows };
}

export function rightsTable(records: ResultRecord[], pdfs?: Pdfs): Table {
  const paths = pdfPaths(records, pdfs);
  const headers = ["Nepremičnina", "ID pravice", "Nadrejena pravica", "Vrsta", "Opis vrste", "Začetek učinkovanja", "Imetniki",
    "Znesek", "Valuta", "Obresti", "Zapadlost", "Tip zapadlosti", "Glavna nepremičnina", "Dodatni opis", "PDF"];
  const rows: Cell[][] = [];
  const add = (r: ResultRecord, x: Right, parent?: Right) => {
    rows.push([
      r.extract.property.label, x.id, parent ? String(parent.id) : "", CATEGORY[x.category], x.type, x.since?.replace("T", " ") ?? "",
      x.holders.map(holderText).join("; "), x.charge?.amount ?? "", x.charge?.currency ?? "", x.charge?.interest ?? "",
      x.charge?.maturityDate ?? "", noCode(x.charge?.maturityType), x.mainProperty ?? "", x.description ?? "", paths.get(r.key) ?? "",
    ]);
    for (const s of x.secondary) add(r, s, x);
  };
  for (const r of records) for (const x of r.extract.rights ?? []) add(r, x);
  return { headers, rows };
}

/** CSV for Excel in Slovenian locale: UTF-8 BOM, ";" separator, decimal comma, CRLF. */
export function toCsv(t: Table): string {
  const cell = (v: Cell) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [t.headers, ...t.rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export async function toXlsx(sheets: { name: string; table: Table }[]): Promise<Uint8Array> {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const blob = await writeXlsxFile(sheets.map(({ name, table }) => ({
    sheet: name,
    stickyRowsCount: 1,
    data: [
      table.headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...table.rows.map((r) => r.map((v) => (v === "" ? null : { value: v }))),
    ],
    columns: table.headers.map((h) => ({ width: /opis/i.test(h) ? 60 : /Imetnik|Nepremičnina|Naslov/.test(h) ? 32 : 14 })),
  })) as never).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** IndexedDB round-trips may hand back a view from another realm (or a plain indexed object in tests). */
function toBytes(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (x && typeof x === "object" && "byteLength" in (x as object) === false) {
    const o = x as Record<string, number> & { length?: number };
    return Uint8Array.from(typeof o.length === "number" ? Array.from(o as ArrayLike<number>) : Object.values(o));
  }
  return new Uint8Array(x as ArrayBuffer);
}

/** Properties with a known outline (from the cart, same key) as GeoJSON with owner summary. */
export function propertiesGeoJson(records: ResultRecord[], geometries: Map<string, Geometry | null>, pdfs?: Pdfs) {
  const paths = pdfPaths(records, pdfs);
  const features = records.flatMap((r) => {
    const g = geometries.get(r.key);
    if (!g) return [];
    const x = r.extract;
    const mortgages = (x.rights ?? []).filter((q) => q.category === "mortgage");
    return [{
      type: "Feature" as const, geometry: g,
      properties: {
        nepremicnina: x.property.label, ko: x.property.koId, stevilka: x.property.number, del: x.property.part ?? null,
        lastniki: x.owners.map((o) => `${o.holder.name} (${o.share})`).join("; "),
        hipoteke: mortgages.length, bremena: (x.rights ?? []).length, datum_izpisa: x.createdAt?.slice(0, 10) ?? null,
        pdf: paths.get(r.key) ?? null,
      },
    }];
  });
  return { type: "FeatureCollection" as const, features };
}

export interface ExportResult { zip: Uint8Array; missingPdf: string[]; fileName: string }

/** ZIP: podatki.xlsx, lastniki.csv, bremena.csv and the original PDFs under pdf/. */
export async function buildExportZip(
  records: ResultRecord[], opts: { date?: string; pdfs?: Pdfs; geometries?: Map<string, Geometry | null> } = {},
): Promise<ExportResult> {
  const pdfs = opts.pdfs ?? new Map();
  const owners = ownerTable(records, pdfs);
  const rights = rightsTable(records, pdfs);
  const paths = pdfPaths(records, pdfs);
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "podatki.xlsx": [await toXlsx([{ name: "Lastniki", table: owners }, { name: "Bremena", table: rights }]), { level: 0 }],
    "lastniki.csv": strToU8(toCsv(owners)),
    "bremena.csv": strToU8(toCsv(rights)),
  };
  if (opts.geometries) {
    const geo = propertiesGeoJson(records, opts.geometries, pdfs);
    if (geo.features.length) files["nepremicnine.geojson"] = strToU8(JSON.stringify(geo));
  }
  for (const r of records) {
    const path = paths.get(r.key);
    const bytes = pdfs.get(r.key);
    if (path && bytes) files[path] = [toBytes(bytes), { level: 0 }];
  }
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  return {
    zip: zipSync(files as never),
    missingPdf: records.filter((r) => !pdfs.has(r.key)).map((r) => r.extract.property.label),
    fileName: `ikataster-izvoz-${date}.zip`,
  };
}
