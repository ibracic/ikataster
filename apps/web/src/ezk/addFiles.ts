import { EzkParseError, type EzkExtract, type EzkFailure } from "./types";
import type { ResultsStore } from "./results";

export interface AddFilesResult { added: number; failed: { name: string; reason: EzkFailure | "unknown" }[] }

/** Parses PDF files one by one and stores every successfully parsed extract. */
export async function addPdfFiles(
  files: File[], store: ResultsStore,
  parse: (bytes: Uint8Array) => Promise<EzkExtract> = async (b) => (await import("./pdf")).extractFromPdf(b),
): Promise<AddFilesResult> {
  const out: AddFilesResult = { added: 0, failed: [] };
  for (const f of files) {
    try {
      // copy into a buffer of this realm (File.arrayBuffer can come from another realm; IndexedDB clones it badly)
      const bytes = Uint8Array.from(new Uint8Array(await f.arrayBuffer()));
      const x = await parse(bytes.slice());
      await store.put(x, f.name, bytes);
      out.added++;
    } catch (e) {
      if (!(e instanceof EzkParseError)) console.warn("eZK parse failed", f.name, e);
      out.failed.push({ name: f.name, reason: e instanceof EzkParseError ? e.reason : "unknown" });
    }
  }
  return out;
}
