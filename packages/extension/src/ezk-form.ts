/** e-ZK public extract form (same fields for 03-001 current, 03-002 / 03-012 historical). */
export interface EzkRequest { kind: "parcel" | "building" | "part"; koId: number; number: string; part?: number | string }

export const EZK_FORM_URL = "https://esodisce.si/evlozisce/javni_izpisi/03-001.html";

const TIP = { parcel: "1", building: "2", part: "3" } as const;

export function isEzkRequest(p: unknown): p is EzkRequest {
  const r = p as EzkRequest;
  return !!r && (r.kind === "parcel" || r.kind === "building" || r.kind === "part")
    && Number.isInteger(r.koId) && r.koId > 0 && typeof r.number === "string" && /^[0-9]+(\/[0-9]+)?$/.test(r.number)
    && (r.kind !== "part" || /^[0-9]+$/.test(String(r.part ?? "")));
}

/** Form body for one property. For building parts `number` is the building number. */
export function ezkFormBody(r: EzkRequest): string {
  const tip = TIP[r.kind];
  const f = new URLSearchParams({
    nacinList: "IDZNAK", idNep: "", "tipNepList.nobind": tip, tipNep: tip,
    "idZnakNep.katastrskaObcina.idsrcsifrant": String(r.koId),
  });
  if (r.kind === "parcel") f.set("idZnakNep.parcelnaStevilkaNovo", r.number);
  else f.set("idZnakNep.stevilkaStavbe", r.number);
  if (r.kind === "part") f.set("idZnakNep.stPosameznegaDela", String(r.part));
  f.set("nacinIskanja", "IDZNAK");
  f.set("_evendId_pdf", "");
  return f.toString();
}

export function ezkFileName(r: EzkRequest, date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `${r.koId}_${r.number.replace("/", "-")}${r.kind === "part" ? `_${r.part}` : r.kind === "building" ? "_stavba" : ""}_${d}.pdf`;
}

/**
 * Runs INSIDE the e-ZK tab (chrome.scripting.executeScript): a same-origin POST, so the user's
 * SI-PASS session cookie goes along. Must be self-contained (no imports, no closures).
 */
export async function ezkPostInPage(url: string, body: string): Promise<{ status: number; contentType: string; base64: string }> {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const buf = new Uint8Array(await res.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", base64: btoa(s) };
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64); const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
