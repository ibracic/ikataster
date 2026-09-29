import { EzkParseError, type PdfTextItem } from "./types";
import { parseExtract } from "./parse";

type PdfJs = typeof import("pdfjs-dist");
export interface PdfOptions {
  /** Loads pdf.js (lazy in the browser; tests pass the Node legacy build). */
  pdfjs?: () => Promise<PdfJs | typeof import("pdfjs-dist/legacy/build/pdf.mjs")>;
  maxBytes?: number;
  maxPages?: number;
}

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

async function browserPdfjs(): Promise<PdfJs> {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/** PDF bytes -> positioned text items. Size/page guards before and after opening. */
export async function readPdfText(bytes: Uint8Array, opts: PdfOptions = {}): Promise<PdfTextItem[]> {
  const { maxBytes = MAX_PDF_BYTES, maxPages = MAX_PDF_PAGES } = opts;
  if (bytes.byteLength > maxBytes) throw new EzkParseError("tooLarge", `PDF larger than ${maxBytes} bytes`);
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") throw new EzkParseError("notPdf", "Not a PDF file");
  const pdfjs = await (opts.pdfjs ?? browserPdfjs)();
  // pdf.js takes ownership of the buffer; hand it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 });
  const doc = await task.promise;
  try {
    if (doc.numPages > maxPages) throw new EzkParseError("tooManyPages", `More than ${maxPages} pages`);
    const out: PdfTextItem[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      for (const it of tc.items) {
        if (!("str" in it) || !it.str) continue;
        out.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width, str: it.str });
      }
    }
    return out;
  } finally {
    await task.destroy();
  }
}

export async function extractFromPdf(bytes: Uint8Array, opts?: PdfOptions) {
  return parseExtract(await readPdfText(bytes, opts));
}
