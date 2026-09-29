import { valuationUrl } from "./client";
it("links parts and parcels to the GURS mass-valuation viewer by internal id", () => {
  expect(valuationUrl("part", 28734216)).toBe("https://vrednotenje.gov.si/EV_JV/#/delStavbe_28734216");
  expect(valuationUrl("parcel", 21867784)).toBe("https://vrednotenje.gov.si/EV_JV/#/parcela_21867784");
});
