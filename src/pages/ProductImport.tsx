import { useState } from 'react';
import { supabase } from '../supabase';
import { useLookups } from '../lib/lookups';
import { exportXlsx, fetchAll } from '../lib/util';
import { Badge, PageHeader, norm, useAction, useToast } from '../components/ui';

// Nombres de columna aceptados (sin tildes ni símbolos) -> campo interno
const ALIAS: Record<string, string> = {
  codigo: 'code', codigointerno: 'code',
  codigofabricante: 'mfr', codigofabricanteproveedor: 'mfr', codigodelrepuestofabricanteproveedor: 'mfr',
  nombre: 'name', detalle: 'name', nombredetalle: 'name', nombreodetalle: 'name',
  categoria: 'category', marca: 'brand', modelo: 'model', unidad: 'unit', unidaddemanejo: 'unit',
  proveedor: 'supplier', costo: 'cost', preciocosto: 'cost', costounitario: 'cost', preciocostounitario: 'cost',
  stockminimo: 'min', fechacaducidad: 'expiry', caducidad: 'expiry', fechadecaducidad: 'expiry',
};

function parseDate(v: any): string | null | 'invalid' {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return isNaN(+d) ? 'invalid' : d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return 'invalid';
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return 'invalid';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const toNum = (v: any): number | null => {
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null;
};

interface Row { n: number; d: any; errors: string[]; notes: string[] }

export default function ProductImport() {
  const { categories, units, suppliers, reload } = useLookups();
  const run = useAction(); const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const template = () => exportXlsx([{
    codigo: 'REP-0001', codigo_fabricante: 'P550-FAB', nombre: 'Filtro de aceite', categoria: 'Repuestos', marca: 'Donaldson', modelo: 'P550',
    unidad: 'Unidad', proveedor: 'Proveedor Ejemplo', costo: 85.5, stock_minimo: 4, fecha_caducidad: '',
  }], 'plantilla_productos', 'Productos');

  const onFile = async (f?: File) => {
    if (!f) return;
    setResult(''); setFileName(f.name);
    const XLSX: any = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
    const existing = new Set((await run(() => fetchAll((a, b) => supabase.from('products').select('code').range(a, b))) || []).map((p: any) => norm(p.code)));
    const seen = new Set<string>();
    const out: Row[] = raw.map((r, i) => {
      const d: any = {};
      Object.keys(r).forEach((k) => { const key = ALIAS[norm(k).replace(/[^a-z0-9]/g, '')]; if (key) d[key] = r[k]; });
      const errors: string[] = []; const notes: string[] = [];
      const str = (k: string) => String(d[k] ?? '').trim();
      d.code = str('code'); d.name = str('name'); d.mfr = str('mfr'); d.brand = str('brand'); d.model = str('model');
      if (!d.name) errors.push('Falta el nombre');
      if (d.code) {
        const c = norm(d.code);
        if (existing.has(c)) errors.push('El código ya existe en el sistema');
        else if (seen.has(c)) errors.push('Código repetido en el archivo');
        seen.add(c);
      } else notes.push('Código automático');
      const cat = categories.find((c) => norm(c.name) === norm(str('category')));
      if (!str('category')) errors.push('Falta la categoría'); else if (!cat) errors.push(`Categoría no existe: ${str('category')}`);
      d.category_id = cat?.id;
      const un = units.find((u) => norm(u.name) === norm(str('unit')) || norm(u.abbreviation) === norm(str('unit')));
      if (!str('unit')) errors.push('Falta la unidad'); else if (!un) errors.push(`Unidad no existe: ${str('unit')}`);
      d.unit_id = un?.id;
      const cost = toNum(d.cost); if (cost === null || cost < 0) errors.push('Costo inválido'); d.costN = cost ?? 0;
      const min = toNum(d.min); if (min === null || min < 0) errors.push('Stock mínimo inválido'); d.minN = min ?? 0;
      const ex = parseDate(d.expiry); if (ex === 'invalid') errors.push('Fecha de caducidad inválida (usa dd/mm/aaaa)'); d.expiryN = ex === 'invalid' ? null : ex;
      d.supplierName = str('supplier');
      if (d.supplierName && !suppliers.some((s) => norm(s.name) === norm(d.supplierName))) notes.push('Se creará el proveedor');
      return { n: i + 2, d, errors, notes };
    }).filter((r) => r.d.name || r.d.code || r.errors.length < 4);
    setRows(out);
    if (!out.length) toast('El archivo no tiene filas para importar.', 'error');
  };

  const good = rows.filter((r) => !r.errors.length);

  const doImport = async () => {
    if (!good.length) return;
    setBusy(true);
    const msg = await run(async () => {
      // 1) proveedores nuevos
      const sup = new Map(suppliers.map((s) => [norm(s.name), s.id]));
      const newNames = Array.from(new Set(good.map((r) => r.d.supplierName).filter((n) => n && !sup.has(norm(n)))));
      if (newNames.length) {
        const { data, error } = await supabase.from('suppliers').insert(newNames.map((name) => ({ name, kind: 'Proveedor' }))).select('id,name');
        if (error) throw error;
        (data || []).forEach((s: any) => sup.set(norm(s.name), s.id));
      }
      // 2) productos en tandas
      const payload = good.map((r) => ({
        code: r.d.code, manufacturer_code: r.d.mfr || null, name: r.d.name, category_id: r.d.category_id, brand: r.d.brand || null, model: r.d.model || null,
        unit_id: r.d.unit_id, supplier_id: r.d.supplierName ? sup.get(norm(r.d.supplierName)) || null : null,
        cost: r.d.costN, min_stock: r.d.minN, expiry_date: r.d.expiryN, active: true,
      }));
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from('products').insert(payload.slice(i, i + 200));
        if (error) throw new Error(`Error en las filas ${i + 1}-${Math.min(i + 200, payload.length)}: ${error.message}`);
      }
      return `Se importaron ${payload.length} productos correctamente.`;
    });
    setBusy(false);
    if (msg) { setResult(msg); setRows([]); setFileName(''); reload(); }
  };

  return (
    <div>
      <PageHeader title="Importar productos desde Excel" subtitle="Carga masiva del catálogo. No incluye fotografías (se agregan después, una por una)."
        actions={<button className="btn" onClick={template}>Descargar plantilla</button>} />
      <div className="panel">
        <p style={{ marginTop: 0 }}>Columnas: <b>codigo, codigo_fabricante, nombre, categoria, marca, modelo, unidad, proveedor, costo, stock_minimo, fecha_caducidad</b>. La categoría y la unidad deben existir. Si dejas el código vacío, se genera solo. Las filas con error no se importan.</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {result && <div className="note-box" style={{ marginTop: 12 }}>{result}</div>}
      </div>
      {rows.length > 0 && (
        <div className="panel">
          <div className="toolbar">
            <b>{fileName}</b><Badge text={`${good.length} correctas`} tone="ok" /><Badge text={`${rows.length - good.length} con error`} tone={rows.length - good.length ? 'bad' : 'muted'} />
            <button className="btn btn-primary" onClick={doImport} disabled={busy || !good.length}>{busy ? 'Importando…' : `Importar ${good.length} productos`}</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 480 }}><table className="grid">
            <thead><tr><th>Fila</th><th>Código</th><th>Nombre</th><th>Categoría</th><th>Unidad</th><th className="r">Costo</th><th>Resultado</th></tr></thead>
            <tbody>{rows.slice(0, 500).map((r) => (
              <tr key={r.n}><td>{r.n}</td><td>{r.d.code}</td><td>{r.d.name}</td><td>{String(r.d.category ?? '')}</td><td>{String(r.d.unit ?? '')}</td><td className="r">{r.d.costN}</td>
                <td>{r.errors.length ? <span style={{ color: 'var(--bad)' }}>{r.errors.join(' · ')}</span> : <span style={{ color: 'var(--ok)' }}>OK {r.notes.length ? '· ' + r.notes.join(' · ') : ''}</span>}</td></tr>))}
            </tbody></table></div>
          {rows.length > 500 && <p>Se muestran las primeras 500 filas; se importarán todas las correctas.</p>}
        </div>)}
    </div>
  );
}
