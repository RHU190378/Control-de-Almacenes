import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { exportXlsx, fetchAll, fmt, fmtDate, fmtQty, num, today, addDays, uploadPhoto } from '../lib/util';
import { PrintDoc } from '../lib/printDoc';
import PrintPreview from '../components/PrintPreview';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, norm, useAction, useAsync, useToast } from '../components/ui';

const blank = { code: '', manufacturer_code: '', name: '', category_id: '', brand: '', model: '', unit_id: '', supplier_id: '', cost: 0, min_stock: 0, expiry_date: '', active: true, photo_url: '' };
const LIMIT = 300;

export default function Products() {
  const { categories, units, suppliers } = useLookups();
  const { isAdmin } = useAuth();
  const run = useAction(); const toast = useToast();
  const [q, setQ] = useState(''); const [cat, setCat] = useState(''); const [flt, setFlt] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [pv, setPv] = useState<PrintDoc | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [products, inv] = await Promise.all([
      fetchAll((a, b) => supabase.from('products').select('*').order('code').range(a, b)),
      fetchAll((a, b) => supabase.from('inventory').select('product_id,quantity').range(a, b)),
    ]);
    const stock: Record<string, number> = {};
    inv.forEach((r: any) => { stock[r.product_id] = (stock[r.product_id] || 0) + Number(r.quantity); });
    return { products, stock };
  }, []);

  const catName = (id: string) => categories.find((c) => c.id === id)?.name || '';
  const unitName = (id: string) => { const u = units.find((x) => x.id === id); return u?.abbreviation || u?.name || ''; };
  const soon = addDays(today(), 30);

  const filtered = useMemo(() => {
    if (!data) return [];
    const t = norm(q).trim().split(/\s+/).filter(Boolean);
    return data.products.filter((p: any) => {
      if (cat && p.category_id !== cat) return false;
      const st = data.stock[p.id] || 0;
      if (flt === 'low' && !(p.min_stock > 0 && st <= p.min_stock && st > 0)) return false;
      if (flt === 'out' && !(st <= 0 && p.active)) return false;
      if (flt === 'exp' && !(p.expiry_date && p.expiry_date <= soon)) return false;
      if (flt === 'inactive' && p.active) return false;
      if (!t.length) return true;
      const hay = norm(`${p.code} ${p.manufacturer_code || ''} ${p.name} ${p.brand || ''} ${p.model || ''}`);
      return t.every((w) => hay.includes(w));
    });
  }, [data, q, cat, flt, soon]);

  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });

  const save = async () => {
    const e = edit;
    if (!e.name.trim()) return toast('Escribe el nombre o detalle del producto.', 'error');
    if (!e.category_id) return toast('Elige la categoría.', 'error');
    if (!e.unit_id) return toast('Elige la unidad de manejo.', 'error');
    if (num(e.min_stock) < 0) return toast('El stock mínimo no puede ser negativo.', 'error');
    if (e.id && !e.code.trim()) return toast('El código interno no puede quedar vacío.', 'error');
    const payload: any = {
      code: e.code.trim(), manufacturer_code: e.manufacturer_code?.trim() || null, name: e.name.trim(), category_id: e.category_id, brand: e.brand?.trim() || null,
      model: e.model?.trim() || null, unit_id: e.unit_id, supplier_id: e.supplier_id || null, min_stock: num(e.min_stock),
      expiry_date: e.expiry_date || null, active: e.active, photo_url: e.photo_url || null,
    };
    // El costo NO se edita aquí: se calcula solo (promedio ponderado) con el precio de cada nota de ingreso.
    const ok = await run(async () => {
      const r = e.id ? await supabase.from('products').update(payload).eq('id', e.id) : await supabase.from('products').insert(payload);
      if (r.error) throw r.error; return true;
    }, 'Producto guardado');
    if (ok) { setEdit(null); reload(); }
  };

  const del = async (p: any) => {
    if (!window.confirm(`¿Eliminar "${p.name}"? Si ya tiene movimientos no se podrá; en ese caso márcalo como inactivo.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('products').delete().eq('id', p.id); if (error) throw error; return true; }, 'Producto eliminado');
    if (ok) reload();
  };
  const photo = async (f?: File) => {
    if (!f) return; setBusyPhoto(true);
    const url = await run(() => uploadPhoto(f, 'productos')); setBusyPhoto(false);
    if (url) set('photo_url', url);
  };
  const toEdit = (p: any) => setEdit({ ...blank, ...p, expiry_date: p.expiry_date || '', manufacturer_code: p.manufacturer_code || '', brand: p.brand || '', model: p.model || '', supplier_id: p.supplier_id || '', photo_url: p.photo_url || '' });
  const pos = edit?.id ? filtered.findIndex((p: any) => p.id === edit.id) : -1;
  const stepEdit = (d: number) => { const p = filtered[pos + d]; if (p) toEdit(p); };
  const printList = () => data && setPv({ title: 'Listado de productos', orient: 'landscape', subtitle: [cat && `Categoría: ${catName(cat)}`, q && `Búsqueda: ${q}`].filter(Boolean).join(' · ') || undefined,
    cols: ['Código', 'Cód. fabricante', 'Producto', 'Categoría', 'Unidad', 'Costo', 'Mínimo', 'Existencia', 'Vence'],
    rows: filtered.map((p: any) => [p.code, p.manufacturer_code || '', p.name, catName(p.category_id), unitName(p.unit_id), fmt(p.cost), fmtQty(p.min_stock), fmtQty(data.stock[p.id] || 0), fmtDate(p.expiry_date)]) });
  const exportAll = () => data && exportXlsx(filtered.map((p: any) => ({
    codigo: p.code, codigo_fabricante: p.manufacturer_code, nombre: p.name, categoria: catName(p.category_id), marca: p.brand, modelo: p.model,
    unidad: unitName(p.unit_id), costo: p.cost, stock_minimo: p.min_stock, existencia: data.stock[p.id] || 0, fecha_caducidad: p.expiry_date, activo: p.active ? 'Sí' : 'No',
  })), 'productos');

  return (
    <div>
      <PageHeader title="Productos" subtitle="Catálogo general: código interno y código de fabricante/proveedor."
        actions={<>
          <button className="btn" onClick={printList}>Imprimir</button>
          <button className="btn" onClick={exportAll}>Exportar Excel</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>Nuevo producto</button>}
        </>} />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por código, fabricante, nombre, marca…" />
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={flt} onChange={(e) => setFlt(e.target.value)}>
          <option value="">Todos</option><option value="low">Stock bajo</option><option value="out">Agotados</option><option value="exp">Vencidos / por vencer (30 días)</option><option value="inactive">Inactivos</option>
        </select>
      </div>
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th /><th>Código</th><th>Cód. fabricante</th><th>Producto</th><th>Categoría</th><th>Marca / modelo</th><th>Unidad</th><th className="r">Costo</th><th className="r">Mínimo</th><th className="r">Existencia</th><th>Vence</th><th>Estado</th>{isAdmin && <th />}</tr></thead>
          <tbody>
            {filtered.slice(0, LIMIT).map((p: any) => {
              const st = data!.stock[p.id] || 0;
              return (
                <tr key={p.id}>
                  <td>{p.photo_url ? <img className="thumb" src={p.photo_url} alt="" loading="lazy" /> : <div className="thumb" />}</td>
                  <td><b>{p.code}</b></td><td>{p.manufacturer_code}</td><td>{p.name}</td><td>{catName(p.category_id)}</td>
                  <td>{[p.brand, p.model].filter(Boolean).join(' ')}</td><td>{unitName(p.unit_id)}</td>
                  <td className="r">{fmt(p.cost)}</td><td className="r">{fmtQty(p.min_stock)}</td>
                  <td className="r"><b>{fmtQty(st)}</b></td><td>{fmtDate(p.expiry_date)}</td>
                  <td>{!p.active ? <Badge text="Inactivo" tone="muted" /> : st <= 0 ? <Badge text="Agotado" tone="bad" /> : p.min_stock > 0 && st <= p.min_stock ? <Badge text="Stock bajo" tone="warn" /> : <Badge text="Normal" tone="ok" />}</td>
                  {isAdmin && <td><div className="row-actions"><button className="btn btn-sm" onClick={() => toEdit(p)}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => del(p)}>Eliminar</button></div></td>}
                </tr>);
            })}
          </tbody></table>
          {!filtered.length && <Empty text="No hay productos con esos filtros." />}
          {filtered.length > LIMIT && <div className="empty">Mostrando {LIMIT} de {filtered.length}. Usa el buscador para acotar.</div>}
        </div>)}

      {pv && <PrintPreview doc={pv} onClose={() => setPv(null)} />}
      {edit && (
        <Modal title={edit.id ? 'Editar producto' : 'Nuevo producto'} wide onClose={() => setEdit(null)}
          footer={<>{edit.id && <><button className="btn" disabled={pos <= 0} onClick={() => stepEdit(-1)}>◀ Anterior</button><button className="btn" disabled={pos < 0 || pos >= filtered.length - 1} onClick={() => stepEdit(1)}>Siguiente ▶</button></>}<button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save} disabled={busyPhoto}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Código interno" hint={edit.id ? '' : 'Déjalo vacío para generarlo automáticamente'}><input value={edit.code} onChange={(e) => set('code', e.target.value)} /></Field>
            <Field label="Código fabricante / proveedor"><input value={edit.manufacturer_code} onChange={(e) => set('manufacturer_code', e.target.value)} /></Field>
            <Field label="Nombre o detalle *" full><input value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Categoría *"><select value={edit.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">— Elegir —</option>{categories.filter((c) => c.active || c.id === edit.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Unidad de manejo *"><select value={edit.unit_id} onChange={(e) => set('unit_id', e.target.value)}><option value="">— Elegir —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.abbreviation ? ` (${u.abbreviation})` : ''}</option>)}</select></Field>
            <Field label="Marca"><input value={edit.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Modelo"><input value={edit.model} onChange={(e) => set('model', e.target.value)} /></Field>
            <Field label="Proveedor"><select value={edit.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}><option value="">— Ninguno —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Costo vigente (automático)" hint="Se calcula con el precio unitario de las notas de ingreso (promedio ponderado)."><input readOnly value={fmt(edit.cost)} /></Field>
            <Field label="Stock mínimo"><input type="number" min="0" step="any" value={edit.min_stock} onChange={(e) => set('min_stock', e.target.value)} /></Field>
            <Field label="Fecha de caducidad (si corresponde)"><input type="date" value={edit.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} /> Activo</label>
            <Field label="Fotografía" full>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {edit.photo_url && <img className="thumb" style={{ width: 64, height: 64 }} src={edit.photo_url} alt="" />}
                <input type="file" accept="image/*" onChange={(e) => photo(e.target.files?.[0])} />
                {busyPhoto && <span>Subiendo…</span>}
              </div>
            </Field>
          </div>
        </Modal>)}
    </div>
  );
}
