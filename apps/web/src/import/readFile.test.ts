import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import read from "read-excel-file/node";
import { readFileRows } from "./readFile";
import { parseRows } from "./parse";

const fx = (n: string) => readFileSync(resolve(process.cwd(), "src/import/__fixtures__", n));
const kos = [{ id: 657, name: "MARIBOR GRAD" }];

describe("readFileRows", () => {
  it("reads CSV text files", async () => {
    const rows = await readFileRows(new File([fx("list.csv")], "list.csv"));
    expect(rows).toEqual([["KO", "Parcela"], ["657", "1587"], ["657", "999999"]]);
  });

  it("reads the first sheet of an XLSX file (numeric cells included)", async () => {
    const nodeReader = async (f: Blob) => (await read(Buffer.from(await f.arrayBuffer())))[0].data as unknown[][];
    const rows = await readFileRows(new File([fx("list.xlsx")], "Seznam.XLSX"), nodeReader);
    const parsed = parseRows(rows, kos);
    expect(parsed.map((r) => (r.ok ? `${r.koId}:${r.kind}:${r.number}` : r.reason))).toEqual([
      "657:parcel:1587", "657:parcel:1980", "657:building:130", "unknownKo",
    ]);
  });
});
