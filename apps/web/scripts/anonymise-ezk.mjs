// Rebuilds a real eZK extract PDF as an anonymised fixture with the same layout:
// every pdf.js text item is redrawn at its original position/size, after
// replacing personal data. Real extracts must NEVER be committed.
//
//   node scripts/anonymise-ezk.mjs in.pdf out.pdf map.json
//
// map.json: [["real text", "fake text"], ...] (applied to every item, longest first)
// plus built-in rules: EMŠO "dddddd*******" -> "0101990******".
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "node:fs";

const [inp, out, mapFile] = process.argv.slice(2);
const pairs = JSON.parse(readFileSync(mapFile, "utf8")).sort((a, b) => b[0].length - a[0].length);

const src = await getDocument({ data: new Uint8Array(readFileSync(inp)), verbosity: 0 }).promise;
const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), { subset: true });
pdf.setProducer("iKataster anonymised eZK fixture");
pdf.setTitle(`anonymised ${inp.split("/").pop().replace(/^\d+_/, "")}`);

const leftovers = new Set();
for (let p = 1; p <= src.numPages; p++) {
  const page = await src.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const dst = pdf.addPage([vp.width, vp.height]);
  const tc = await page.getTextContent();
  for (const it of tc.items) {
    if (!it.str) continue;
    let s = it.str;
    for (const [a, b] of pairs) s = s.split(a).join(b);
    s = s.replace(/\b(\d{7})\*{6}/g, "0101990******");
    const size = Math.abs(it.transform[0]) || 9;
    dst.drawText(s, { x: it.transform[4], y: it.transform[5], size: size * 0.9, font, color: rgb(0, 0, 0) });
    if (/\*{6}/.test(it.str) || /osebno ime/.test(it.str)) leftovers.add(`${it.str} -> ${s}`);
  }
}
writeFileSync(out, await pdf.save());
console.log(`wrote ${out}\n` + [...leftovers].join("\n"));
