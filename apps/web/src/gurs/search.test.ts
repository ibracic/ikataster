// @vitest-environment node
import { searchKos, toD96, fromD96, gursPublicViewUrl, valuationUrl } from ".";

describe("projection", () => {
  it("converts WGS84 to D96/TM and back within centimetres", () => {
    const [e, n] = toD96(15.6455, 46.5577);
    expect(e).toBeCloseTo(549492.81, 1);
    expect(n).toBeCloseTo(157764.67, 1);
    const [lon, lat] = fromD96(e, n);
    expect(lon).toBeCloseTo(15.6455, 6);
    expect(lat).toBeCloseTo(46.5577, 6);
  });
});

describe("searchKos", () => {
  const kos = [
    { id: 657, name: "MARIBOR GRAD" },
    { id: 658, name: "TABOR" },
    { id: 1722, name: "TRNOVO" },
    { id: 2636, name: "TRNOVO OB SOČI" },
    { id: 1, name: "HODOŠ" },
  ];
  it("matches by number prefix, exact number first", () => {
    expect(searchKos(kos, "657").map((k) => k.id)).toEqual([657]);
    expect(searchKos(kos, "65").map((k) => k.id)).toEqual([657, 658]);
  });
  it("matches names case- and diacritic-insensitively, prefix before substring", () => {
    expect(searchKos(kos, "hodos").map((k) => k.id)).toEqual([1]);
    expect(searchKos(kos, "trnovo").map((k) => k.id)).toEqual([1722, 2636]);
    expect(searchKos(kos, "grad").map((k) => k.id)).toEqual([657]);
  });
  it("returns nothing for an empty query and limits results", () => {
    expect(searchKos(kos, " ")).toEqual([]);
    expect(searchKos(kos, "o", 2)).toHaveLength(2);
  });
});

describe("gursPublicViewUrl", () => {
  it("deep-links to the GURS public viewer by EID", () => {
    expect(gursPublicViewUrl("100100000222153246")).toBe("https://ipi.eprostor.gov.si/jv/?eid=100100000222153246");
  });
});

it("links parts and parcels to the GURS mass-valuation viewer by internal id", () => {
  expect(valuationUrl("part", 28734216)).toBe("https://vrednotenje.gov.si/EV_JV/#/delStavbe_28734216");
  expect(valuationUrl("parcel", 21867784)).toBe("https://vrednotenje.gov.si/EV_JV/#/parcela_21867784");
});
