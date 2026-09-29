import { toLines, type Line } from "./lines";
import { EzkParseError, type Benefit, type EzkExtract, type Holder, type Owner, type PdfTextItem, type Property, type Right } from "./types";

/** "12.08.2022 12:08:35" / "28.9.2026 - 22:43:06" -> "2022-08-12T12:08:35" */
export function isoDateTime(s: string): string | undefined {
  const m = /(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return undefined;
  const p = (v: string) => v.padStart(2, "0");
  const d = `${m[3]}-${p(m[2])}-${p(m[1])}`;
  return m[4] ? `${d}T${p(m[4])}:${m[5]}:${m[6]}` : d;
}

/** EMŠO starts DDMMYYY (YYY: 9xx -> 19xx, 0xx -> 20xx); rest may be masked. */
export function birthDateFromEmso(emso: string): string | undefined {
  const m = /^(\d{2})(\d{2})(\d{3})/.exec(emso);
  if (!m) return undefined;
  const [dd, mm, yyy] = [+m[1], +m[2], +m[3]];
  const year = yyy >= 800 ? 1000 + yyy : 2000 + yyy;
  const dt = new Date(Date.UTC(year, mm - 1, dd));
  if (dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return undefined;
  return `${year}-${m[2]}-${m[1]}`;
}

/** "200.000,00 EUR" -> { amount: 200000, currency: "EUR" } */
export function parseAmount(s: string): { amount?: number; currency?: string } {
  const m = /^([\d.]+(?:,\d+)?)\s*([A-Z]{3})?/.exec(s.trim());
  if (!m) return {};
  const amount = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) ? { amount, ...(m[2] ? { currency: m[2] } : {}) } : {};
}

/** "katastrska občina 999 VZORČNA VAS parcela 100/3 (ID 10000008)" -> "999 VZORČNA VAS 100/3" */
export function propertyLabel(text: string): string {
  const p = parseProperty(text.replace(/\s+\)/, ")"));
  return p.type === "other" ? text : p.label;
}

const codeOf = (type: string) => { const m = /^(\d+)\s*-/.exec(type); return m ? +m[1] : undefined; };

function category(type: string): Right["category"] {
  if (/hipotek|zemljiški dolg/i.test(type)) return "mortgage";
  if (/služnost|stvarno breme|nujna pot/i.test(type)) return "easement";
  if (/zaznamb/i.test(type)) return "note";
  return "other";
}

function shareValue(share: string): number | undefined {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(share.trim());
  return m && +m[2] > 0 ? +m[1] / +m[2] : undefined;
}

const PROPERTY_RE = /^katastrska občina (\d+) (.+?) (?:parcela (\S+)|stavba (\d+)(?: del stavbe (\d+))?) \(ID (\d+)/;

function parseProperty(line: string, typeLabel?: string, address?: string): Property {
  const m = PROPERTY_RE.exec(line);
  if (!m) return { type: "other", typeLabel, label: line, address };
  const [, ko, koName, parcel, building, part, id] = m;
  const type = parcel ? "parcel" : part ? "part" : "building";
  const number = parcel ?? building;
  const label = `${ko} ${koName} ${number}${part ? `/${part}` : ""}`;
  return {
    type, typeLabel, koId: +ko, koName, number, ...(part ? { part: +part } : {}), ezkId: +id, label,
    ...(address ? { address } : {}),
  };
}

/** Value of a "label:  value" line (label is the first cell). */
const val = (l: Line) => l.cells.slice(1).map((c) => c.text).join(" ");
const label = (l: Line) => l.cells[0].text.replace(/:$/, "").trim();

/**
 * Parses the text of an eZK "Redni izpis" (current extract, 03-001).
 * Pure: no DOM, no pdf.js — feed it positioned text items.
 */
export function parseExtract(items: PdfTextItem[]): EzkExtract {
  const lines = toLines(items);
  const title = lines.slice(0, 6).map((l) => l.text).join("\n");
  if (!/Informacijski sistem eZK/.test(title)) throw new EzkParseError("notEzk", "Not an eZK land-registry extract");
  if (/Zgodovinski izpis/.test(title)) throw new EzkParseError("unsupported", "Historical extracts are not supported; download the current extract (Redni izpis)");
  const createdAt = isoDateTime(lines.find((l) => l.text.startsWith("čas izdelave izpisa"))?.text ?? "");

  // ---- property
  let typeLabel: string | undefined, propLine = "", address: string | undefined;
  let i = lines.findIndex((l) => l.text === "Nepremičnina");
  for (i++; i < lines.length && !lines[i].text.startsWith("Plombe"); i++) {
    const l = lines[i];
    if (l.text.startsWith("katastrska občina")) {
      propLine = l.text;
      // a wrapped "(ID 123" + ")" line
      if (!/\)\s*$/.test(propLine) && lines[i + 1]?.text === ")") propLine += ")";
    } else if (label(l) === "tip nepremičnine") typeLabel = val(l);
    else if (label(l) === "naslov") address = val(l);
  }
  if (!propLine) throw new EzkParseError("notEzk", "No property (Nepremičnina) section");
  const property = parseProperty(propLine, typeLabel, address);

  const pending = !lines.some((l) => l.text.startsWith("Z nepremičnino ni povezana nobena zemljiškoknjižna zadeva"));

  // ---- owners: "Osnovni pravni položaj nepremičnine:" until the details section
  const start = lines.findIndex((l) => l.text.startsWith("Osnovni pravni položaj nepremičnine"));
  if (start < 0) throw new EzkParseError("notEzk", "No ownership (Osnovni pravni položaj) section");
  const endIdx = lines.findIndex((l, k) => k > start && /^Podrobni podatki o izvedenih pravicah/.test(l.text));
  const benefits = parseBenefits(lines.slice(0, start));
  const rights = endIdx < 0 ? [] : parseRights(lines.slice(endIdx + 1));
  const section = lines.slice(start + 1, endIdx < 0 ? undefined : endIdx);

  const owners: Owner[] = [];
  let pos: { positionId: number; right: string; share: string } | null = null;
  let posOwners: Owner[] = [];
  let holder: HolderAcc | null = null;
  let inRestrictions = false;
  let lastRestriction: { x: number; r: Owner["restrictions"][number] } | null = null;
  let restrictionList: Owner["restrictions"] = [];

  const flushHolder = () => {
    if (!pos || !holder) return;
    const h = toHolder(holder.data);
    if (h) posOwners.push({ ...pos, shareValue: shareValue(pos.share), holder: h, restrictions: restrictionList });
    holder = null;
  };
  const flushPosition = () => {
    flushHolder();
    owners.push(...posOwners);
    posOwners = [];
    pos = null;
    restrictionList = [];
    inRestrictions = false;
    lastRestriction = null;
  };

  for (const l of section) {
    const lab = label(l);
    if (lab === "ID osnovnega položaja") {
      flushPosition();
      pos = { positionId: +val(l), right: "", share: "" };
      continue;
    }
    if (!pos) continue;
    if (lab === "vrsta osnovnega položaja") { pos.right = val(l); continue; }
    if (lab === "delež" && !holder) { pos.share = val(l); continue; }
    if (lab === "imetnik") continue;
    if (lab === "omejitve") { flushHolder(); inRestrictions = true; continue; }
    if (inRestrictions) {
      const [first, second, ...rest] = l.cells;
      if (/^\d{5,}$/.test(first.text) && second && /\d{2}\.\d{2}\.\d{4}/.test(second.text)) {
        const r = { id: +first.text, since: isoDateTime(second.text), type: rest.map((c) => c.text).join(" ") };
        restrictionList.push(r);
        lastRestriction = { x: rest[0]?.x ?? second.x, r };
      } else if (lastRestriction && l.cells.length === 1 && Math.abs(first.x - lastRestriction.x) < 4) {
        lastRestriction.r.type = `${lastRestriction.r.type} ${first.text}`.trim();
      }
      continue;
    }
    const next = holderLine(holder, l, flushHolder);
    if (next !== undefined) holder = next;
  }
  flushPosition();

  // Restrictions are listed after the holders; attach them to every holder of the position.
  return { kind: "current", createdAt, property, pending, owners, rights, benefits };
}

function parseBenefits(lines: Line[]): Benefit[] {
  const from = lines.findIndex((l) => l.text.startsWith("V korist vsakokratnega lastnika"));
  if (from < 0) return [];
  const out: Benefit[] = [];
  let cur: Partial<Benefit> | null = null;
  const flush = () => { if (cur?.id && cur.type) out.push({ id: cur.id, type: cur.type, code: codeOf(cur.type), ...(cur.share ? { share: cur.share } : {}), on: cur.on ?? "" }); cur = null; };
  for (const l of lines.slice(from + 1)) {
    let cells = l.cells;
    if (/^\d+\.$/.test(cells[0].text)) { flush(); cur = {}; cells = cells.slice(1); }
    if (!cur || !cells.length) continue;
    const k = cells[0].text.replace(/:$/, "").trim();
    const v = cells.slice(1).map((c) => c.text).join(" ");
    if (k === "vrsta pravice") cur.type = v;
    else if (k === "delež") cur.share = v;
    else if (k === "na nepremičnini") cur.on = propertyLabel(v);
    else if (k === "ID pravice") cur.id = +v;
    else if (l.text === ")" && cur.on) cur.on = propertyLabel(`${cur.on})`);
  }
  flush();
  return out;
}

const RIGHT_LABELS = new Set([
  "ID pravice / zaznambe", "čas začetka učinkovanja", "vrsta pravice / zaznambe", "glavna nepremičnina",
  "podatki o vsebini pravice / zaznambe", "dodatni opis", "terjatev", "obresti", "tip dospelosti", "datum dospelosti",
  "imetnik", "zveza - ID osnovnega položaja", "pravice / zaznambe pri izvedeni pravici / zaznambi",
  "Podrobni podatki o pravici / zaznambi pri izvedeni pravici / zaznambi",
]);
const NESTED_X = 100;

/** "Podrobni podatki o izvedenih pravicah in zaznambah" -> rights; nested (indented) rights become `secondary`. */
function parseRights(lines: Line[]): Right[] {
  const top: Right[] = [];
  let cur: Right | null = null;
  let parent: Right | null = null;
  let mode: "fields" | "desc" | "holders" | "positions" | "skip" = "fields";
  let descX = 0;
  let holder: HolderAcc | null = null;

  const flushHolder = () => {
    if (cur && holder) { const h = toHolder(holder.data); if (h) cur.holders.push(h); }
    holder = null;
  };
  const finish = () => {
    flushHolder();
    if (cur?.description) cur.description = cur.description.trim();
    if (cur && !cur.description) delete cur.description;
    if (cur && cur.charge && !Object.keys(cur.charge).length) delete cur.charge;
    cur = null;
  };

  for (const l of lines) {
    const lab = label(l);
    const known = RIGHT_LABELS.has(lab) || RIGHT_LABELS.has(l.text.replace(/:$/, ""));
    if (lab === "ID pravice / zaznambe") {
      finish();
      const nested = l.x > NESTED_X;
      const r: Right = { id: +val(l), order: 0, type: "", category: "other", holders: [], positionIds: [], secondary: [] };
      if (nested && parent) { r.order = parent.secondary.length + 1; parent.secondary.push(r); }
      else { r.order = top.length + 1; top.push(r); parent = r; }
      cur = r; mode = "fields";
      continue;
    }
    if (!cur) continue;
    const r: Right = cur;
    if (mode === "desc" && !known) {
      if (Math.abs(l.x - descX) < 8) { r.description = `${r.description ?? ""} ${l.text}`; continue; }
    }
    if (mode === "positions" && !known) {
      if (/^\d+$/.test(l.text)) { r.positionIds.push(+l.text); continue; }
    }
    if (mode === "holders" && !known) {
      const next = holderLine(holder, l, flushHolder);
      if (next !== undefined) { holder = next; continue; }
    }
    if (mode === "skip" && !known) continue;
    switch (lab) {
      case "čas začetka učinkovanja": r.since = isoDateTime(val(l)); break;
      case "vrsta pravice / zaznambe": r.type = val(l); r.code = codeOf(r.type); r.category = category(r.type); break;
      case "glavna nepremičnina": r.mainProperty = propertyLabel(val(l)); break;
      case "dodatni opis": mode = "desc"; descX = l.x; break;
      case "terjatev": r.charge = { ...r.charge, amountText: val(l), ...parseAmount(val(l)) }; break;
      case "obresti": if (val(l) && val(l) !== "/") r.charge = { ...r.charge, interest: val(l) }; break;
      case "tip dospelosti": r.charge = { ...r.charge, maturityType: val(l) }; break;
      case "datum dospelosti": r.charge = { ...r.charge, maturityDate: isoDateTime(val(l)) ?? val(l) }; break;
      case "imetnik": flushHolder(); mode = "holders"; break;
      case "zveza - ID osnovnega položaja": flushHolder(); mode = "positions"; break;
      case "pravice / zaznambe pri izvedeni pravici / zaznambi": flushHolder(); mode = "skip"; break;
      default: if (!known) break; mode = "fields";
    }
    if (lab === "podatki o vsebini pravice / zaznambe") mode = "fields";
  }
  finish();
  for (const t of top) for (const s of t.secondary) if (s.description) s.description = s.description.trim();
  return top;
}

/**
 * Feeds one line into a holder block ("1." "EMŠO:" value / "osebno ime:" value / wrapped value lines).
 * Returns the (possibly new) holder dict, or undefined if the line is not part of a holder block.
 */
interface HolderAcc { data: Record<string, string>; valueX: number; last?: string }
function holderLine(acc: HolderAcc | null, l: Line, start: () => void): HolderAcc | null | undefined {
  if (/^\d+\.$/.test(l.cells[0].text)) {
    start();
    const [, k, ...v] = l.cells;
    const a: HolderAcc = { data: {}, valueX: v[0]?.x ?? 0 };
    if (k) { a.last = k.text.replace(/:$/, "").trim(); a.data[a.last] = v.map((c) => c.text).join(" "); }
    return a;
  }
  if (!acc) return undefined;
  if (l.cells.length >= 2) {
    acc.last = label(l);
    acc.data[acc.last] = val(l);
    acc.valueX = l.cells[1].x;
    return acc;
  }
  // single cell: ")" closing a wrapped "(ID 123" or a wrapped long value (company name, address)
  if (acc.last && (l.text === ")" || Math.abs(l.x - acc.valueX) < 6)) {
    acc.data[acc.last] += l.text === ")" ? ")" : ` ${l.text}`;
    return acc;
  }
  return undefined;
}

function toHolder(h: Record<string, string>): Holder | null {
  if (h["EMŠO"] !== undefined || h["osebno ime"] !== undefined) {
    const emso = h["EMŠO"];
    const birthDate = emso ? birthDateFromEmso(emso) : undefined;
    return {
      kind: "person", name: h["osebno ime"] ?? "", ...(h.naslov ? { address: h.naslov } : {}),
      ...(emso ? { emso } : {}), ...(birthDate ? { birthDate } : {}),
    };
  }
  if (h["matična številka"] !== undefined || h["firma / naziv"] !== undefined) {
    return {
      kind: "company", name: h["firma / naziv"] ?? "", ...(h["matična številka"] ? { companyId: h["matična številka"] } : {}),
      ...(h.naslov ? { address: h.naslov } : {}),
    };
  }
  const of = h["vsakokratni lastnik nepremičnine"];
  if (of !== undefined) return { kind: "ownerOf", name: propertyLabel(of.replace(/\(ID (\d+)\s*\)?$/, "(ID $1)")) };
  const name = Object.values(h).join(" ").trim();
  return name ? { kind: "person", name } : null;
}
