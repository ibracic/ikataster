/** Entirely invented extract-shaped PDF. No source PDF, real person or property data is used.
 * Tiny self-contained PDF writer with ToUnicode mapping so pdf.js exercises Unicode extraction.
 * Test tooling only: never imported by the app or copied into dist.
 */
export function syntheticPdf() {
  const lines = [
    'Informacijski sistem eZK',
    'Redni izpis iz zemljiške knjige',
    'čas izdelave izpisa: 01.01.2026 12:00:00',
    'SINTETIČNI TEST – NI URADNI IZPIS',
    'Nepremičnina',
    'katastrska občina 999 VZORČNA VAS parcela 100/1 (ID 10000001)',
    'Plombe',
    'Z nepremičnino ni povezana nobena zemljiškoknjižna zadeva',
    'Osnovni pravni položaj nepremičnine:',
  ];
  const chars = [...new Set(lines.join(''))];
  const code = c => (chars.indexOf(c) + 33).toString(16).padStart(2, '0');
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /TestUnicode def /CMapType 2 def
1 begincodespacerange <00> <ff> endcodespacerange
${chars.length} beginbfchar
${chars.map(c => `<${code(c)}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
  const text = lines.map((l, i) => `BT /F1 10 Tf 1 0 0 1 45 ${780 - i * 24} Tm <${[...l].map(code).join('')}> Tj ET`).join('\n');
  const stream = s => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>',
    stream(text), stream(cmap),
  ];
  let out = '%PDF-1.4\n'; const offsets = [0];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(out);
}
