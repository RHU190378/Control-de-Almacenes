// Documento imprimible genérico: se muestra en la vista previa y se exporta a PDF o Excel.
export interface PrintDoc {
  title: string; subtitle?: string; meta?: string[];
  cols: string[]; rows: (string | number)[][]; foot?: (string | number)[];
  orient: 'landscape' | 'portrait';
}
export interface CompanyInfo { name?: string; tax_id?: string; address?: string; phone?: string; email?: string }

export const slug = (t: string) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'reporte';
export const isNumTxt = (v: any) => /^-?[\d.,\s%]+$/.test(String(v)) && !/^\d{4}-\d\d-\d\d$/.test(String(v)) && String(v).trim() !== '';
export const numCols = (cols: string[], rows: any[][]) =>
  cols.map((_, j) => rows.length > 0 && rows.every((r) => r[j] === '' || r[j] == null || isNumTxt(r[j])) && rows.some((r) => isNumTxt(r[j])));

// Texto compatible con la fuente estándar del PDF
const L1 = (t: any) => String(t ?? '').replace(/[\u{1F300}-\u{1FAFF}☀-➿️]/gu, '').replace(/→/g, '->').replace(/[—–]/g, '-')
  .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '?').replace(/\s+/g, ' ').trim();

export function buildPdf(doc: PrintDoc, co: CompanyInfo, date: string): Blob {
  const land = doc.orient === 'landscape', W = land ? 842 : 595, H = land ? 595 : 842, M = 30, avail = W - 2 * M, CH = 0.5;
  const { cols, rows, foot } = doc;
  const all = [cols, ...rows, ...(foot ? [foot] : [])];
  const wants = (fs: number) => cols.map((_, j) => Math.min(60, Math.max(...all.map((r) => L1(r[j]).length))) * CH * fs + 8);
  let fs = 8, need = wants(fs);
  const tot = need.reduce((a, b) => a + b, 0);
  if (tot > avail) { fs = Math.max(5, (8 * avail) / tot); need = wants(fs); }
  const k = avail / need.reduce((a, b) => a + b, 0), wcol = need.map((x) => x * k), rh = fs + 6, isNum = numCols(cols, rows);
  const esc = (t: any) => L1(t).replace(/([\\()])/g, '\\$1');
  const fit = (t: any, w: number) => { const s = L1(t), mx = Math.max(1, Math.floor((w - 6) / (CH * fs))); return s.length > mx ? s.slice(0, Math.max(1, mx - 1)) + '.' : s; };
  const pages: string[][] = []; let ops: string[] = [], y = 0;
  const newPage = () => { ops = []; pages.push(ops); y = H - M; };
  const T = (x: number, yy: number, text: any, size: number, bold: boolean, gray = 0) =>
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size.toFixed(2)} Tf ${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(text)}) Tj ET`);
  const hline = (yy: number) => ops.push(`0.7 G 0.4 w ${M} ${yy.toFixed(2)} m ${M + avail} ${yy.toFixed(2)} l S`);
  const rowDraw = (r: any[], yTop: number, bold: boolean, fill: boolean) => {
    if (fill) ops.push(`0.93 g ${M} ${(yTop - rh).toFixed(2)} ${avail} ${rh.toFixed(2)} re f`);
    let x = M;
    r.forEach((c, j) => { const t = fit(c, wcol[j]); const tw = t.length * CH * fs; T(isNum[j] ? x + wcol[j] - 3 - tw : x + 3, yTop - rh + 3, t, fs, bold); x += wcol[j]; });
    hline(yTop - rh);
  };
  newPage();
  T(M, y - 12, co.name || '', 13, true); y -= 16;
  [co.tax_id && 'NIT: ' + co.tax_id, co.address, [co.phone && 'Tel.: ' + co.phone, co.email].filter(Boolean).join(' · ')].filter(Boolean)
    .forEach((l) => { T(M, y - 8, l, 8, false, 0.35); y -= 11; });
  y -= 6; T(M, y - 14, doc.title, 14, true); y -= 20;
  if (doc.subtitle) { T(M, y - 8, doc.subtitle, 8, false, 0.35); y -= 12; }
  (doc.meta || []).forEach((m) => { T(M, y - 9, m, 9, false); y -= 12; });
  y -= 6;
  const head = () => { rowDraw(cols, y, true, true); y -= rh; };
  head();
  rows.forEach((r) => { if (y - rh < M + 18) { newPage(); head(); } rowDraw(r, y, false, false); y -= rh; });
  if (foot) { if (y - rh < M + 18) { newPage(); head(); } rowDraw(foot, y, true, true); y -= rh; }
  pages.forEach((pg, i) => { ops = pg; T(M, 16, 'Emitido el ' + date, 7, false, 0.4); T(W - M - 60, 16, `Pagina ${i + 1} de ${pages.length}`, 7, false, 0.4); });
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  pages.forEach((pg, i) => {
    const c = pg.join('\n');
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  });
  let out = '%PDF-1.4\n'; const off: number[] = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([Uint8Array.from(out, (c) => c.charCodeAt(0) & 255)], { type: 'application/pdf' });
}

// Convierte "1.234,50" (formato es-BO) en número; deja el resto como texto
const toCell = (v: any) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+(,\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s.replace(',', '.'));
  return s;
};
export async function buildXlsx(doc: PrintDoc, co: CompanyInfo): Promise<Blob> {
  const XLSX: any = await import('xlsx');
  const top = [co.name, co.tax_id && 'NIT: ' + co.tax_id, co.address, doc.title, doc.subtitle, ...(doc.meta || [])].filter(Boolean).map((t) => [t]);
  const aoa = [...top, [], doc.cols, ...doc.rows.map((r) => r.map(toCell)), ...(doc.foot ? [doc.foot.map(toCell)] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = doc.cols.map((c, j) => ({ wch: Math.min(40, Math.max(c.length, ...doc.rows.map((r) => String(r[j] ?? '').length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
