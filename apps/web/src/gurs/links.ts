/**
 * GURS mass-valuation public viewer (posplošena vrednost). Its API is CORS-locked and captcha-signed,
 * so we link to it instead of fetching the value. Ids are the internal PARCELA_ID / DEL_STAVBE_ID.
 */
export function valuationUrl(kind: "parcel" | "part", id: number): string {
  return `https://vrednotenje.gov.si/EV_JV/#/${kind === "parcel" ? "parcela" : "delStavbe"}_${id}`;
}

export function gursPublicViewUrl(eid: string): string {
  return `https://ipi.eprostor.gov.si/jv/?eid=${encodeURIComponent(eid)}`;
}
