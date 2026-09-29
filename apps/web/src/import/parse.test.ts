import { parseRows, splitText } from "./parse";
import type { Ko } from "../gurs";

const kos: Ko[] = [
  { id: 657, name: "MARIBOR GRAD" },
  { id: 659, name: "TABOR" },
  { id: 1721, name: "GRADIŠČE I" },
  { id: 2636, name: "ŽALEC" },
];

describe("splitText", () => {
  it("splits pasted text into rows on ; , tab and keeps blank lines out", () => {
    expect(splitText("657;1587\r\n\n659,31/8\n1721\t199/16\n")).toEqual([["657", "1587"], ["659", "31/8"], ["1721", "199/16"]]);
  });
  it("keeps whitespace-separated rows as one cell for the row parser", () => {
    expect(splitText("657 1587")).toEqual([["657 1587"]]);
  });
});

describe("parseRows", () => {
  const ok = (rows: string[][]) => parseRows(rows, kos);

  it("parses KO id + parcel in many shapes", () => {
    const r = ok([["657", "1"], ["657 2"], ["657/3"], ["k.o. 657", "parc. 4"], ["659", "31/8"], ["657", 5 as unknown as string]]);
    expect(r.every((x) => x.ok)).toBe(true);
    expect(r.map((x) => x.ok && [x.koId, x.kind, x.number])).toEqual([
      [657, "parcel", "1"], [657, "parcel", "2"], [657, "parcel", "3"], [657, "parcel", "4"], [659, "parcel", "31/8"], [657, "parcel", "5"],
    ]);
  });

  it("resolves KO names, accent-insensitive, and 'ID NAME' labels", () => {
    const r = ok([["MARIBOR GRAD", "1587"], ["zalec", "12"], ["1721 GRADIŠČE I", "199/16"], ["Gradisce I 5"]]);
    expect(r.map((x) => x.ok && [x.koId, x.number])).toEqual([[657, "1587"], [2636, "12"], [1721, "199/16"], [1721, "5"]]);
  });

  it("parses buildings and building parts via st:/stavba and del: prefixes", () => {
    const r = ok([["657", "st:130"], ["657", "stavba 131"], ["657 st. 130/2"], ["657", "del:130/5"]]);
    expect(r.map((x) => x.ok && [x.kind, x.number, x.ok && x.part])).toEqual([
      ["building", "130", undefined], ["building", "131", undefined], ["part", "130", 2], ["part", "130", 5],
    ]);
  });

  it("skips a header row and reports line numbers from the source", () => {
    const r = ok([["KO", "Parcela"], ["657", "1587"]]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ok: true, line: 2 });
  });

  it("reports malformed rows and unknown KOs with reasons", () => {
    const r = ok([["9999", "1"], ["NEOBSTOJEČA", "1"], ["657"], ["657", "abc"], ["hello world"]]);
    expect(r.map((x) => !x.ok && x.reason)).toEqual(["unknownKo", "unknownKo", "malformed", "malformed", "malformed"]);
    expect(r[0]).toMatchObject({ line: 1, raw: "9999 1" });
  });

  it("drops exact duplicates but keeps the first line number", () => {
    const r = ok([["657", "1587"], ["657 1587"], ["657", "1588"]]);
    expect(r.filter((x) => x.ok)).toHaveLength(2);
    expect(r.find((x) => !x.ok)).toMatchObject({ line: 2, reason: "duplicate" });
  });
});
