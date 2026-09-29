import { splitText } from "./parse";

export type XlsxReader = (file: Blob) => Promise<unknown[][]>;

/** Default XLSX reader, loaded lazily so the parser stays out of the main bundle. */
const browserXlsx: XlsxReader = async (file) => {
  const { default: read } = await import("read-excel-file/browser");
  const sheets = await read(file);
  return (sheets[0]?.data ?? []) as unknown[][];
};

export const isXlsx = (name: string) => /\.xlsx$/i.test(name);

/** CSV / TSV / TXT / XLSX file → rows of cells for parseRows. */
export async function readFileRows(file: File, xlsx: XlsxReader = browserXlsx): Promise<unknown[][]> {
  if (isXlsx(file.name)) return xlsx(file);
  return splitText(await file.text());
}
