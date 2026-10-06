import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { addDays, exportXlsx, fetchAll, fmt, fmtDate, fmtQty, today } from '../lib/util';
import { Badge, Empty, ErrorBox, Loading, PageHeader, SearchBox, norm, useAsync } from '../components/ui';

const LIMIT = 400;

export default function Inventory() {
  const { warehouses, categories, units } = useLookups();
  const { isSys } = useAuth();
  const [wh, setWh] = useState(''); const [cat, setCat] = useState(''); const [q, setQ] = useState('');
  const [flt, setFlt] = useState(''); const [detail, setDetail] = useState(false);

  const { data, loading, error } = useAsync(async () => {
    const [products, inv] = await Promise.all([
      fetchAll((a, b) => supabase.from('products').select('id,code,manufacturer_code,name,category_id,unit_id,cost,min_stock,expiry_date,active').order('code').range(a, b)),
      fetchAll((a, b) => supabase.from('inventory').select('warehouse_id,product_id,quantity').range(a, b)),
    ]);
    return { products, inv };
  }, []);

  const unitName = (id: string) => { const u = units.find((x) => x.id === id); return u?.abbreviation || u?.name || ''; };
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '';
  const soon = addDays(today(), 30);

  const rows = useMemo(() => {
    if (!data) return [];
    const pm = new Map(data.products.map((p: any) => [p.id, p]));
    let list: any[] = [];
    if (detail && isSys) {
      list = data.inv.filter((r: any) => !wh || r.warehouse_id === wh).map((r: any) => ({ ...pm.get(r.product_id), qty: Number(r.quantity), wh: r.warehouse_id }));
    } else {
      const tot: Record<string, number> = {};
      data.inv.filter((r: any) => !wh || r.warehouse_id === wh).forEach((r: any) => { tot[r.product_id] = (tot[r.product_id] || 0) + Number(r.quantity); });
      list = data.products.map((p: any) => ({ ...p, qty: tot[p.id] || 0 }));
    }
    const t = norm(q).trim().split(/\s+/).filter(Boolean);
    return list.filter((p) => {
      if (!p.id) return false;
      if (cat && p.category_id !== cat) return false;
      if (flt === 'low' && !(p.min_stock > 0 && p.qty <= p.min_stock && p.qty > 0)) return false;
      if (flt === 'out' && !(p.qty <= 0 && p.active)) return false;
      if (flt === 'exp' && !(p.expiry_date && p.expiry_date <= soon && p.qty > 0)) return false;
      if (flt === 'stock' && !(p.qty > 0)) return false;
      if (!t.length) return true;
      const hay = norm(`${p.code} ${p.manufacturer_code || ''} ${p.name}`);
      return t.every((w) => hay.includes(w));
    });
  }, [data, wh, cat, q, flt, detail, isSys, soon]);

  const totalValue = rows.reduce((s, p) => s + p.qty * Number(p.cost || 0), 0);
  const exportIt = () => exportXlsx(rows.map((p) => ({
    ...(detail && isSys ? { almacen: whName(p.wh) } : {}), codigo: p.code, codigo_fabricante: p.manufacturer_code, producto: p.name,
    categoria: categories.find((c) => c.id === p.category_id)?.name, unidad: unitName(p.unit_id), existencia: p.qty, stock_minimo: p.min_stock,
    costo_unitario: p.cost, valor: p.qty * Number(p.cost || 0), caducidad: p.expiry_date,
  })), 'inventario');

  return (
    <div>
      <PageHeader title="Inventario" subtitle="Existencias y valor por almacén."
        actions={<><button className="btn" onClick={exportIt}>Exportar Excel</button><button className="btn" onClick={() => window.print()}>Imprimir</button></>} />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por código, fabricante o nombre…" />
        {isSys && <select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Todos los almacenes (consolidado)</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={flt} onChange={(e) => setFlt(e.target.value)}><option value="">Todos</option><option value="stock">Con existencia</option><option value="low">Stock bajo</option><option value="out">Agotados</option><option value="exp">Por vencer / vencidos</option></select>
        {isSys && <label className="check"><input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} /> Detalle por almacén</label>}
      </div>
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>{detail && isSys && <th>Almacén</th>}<th>Código</th><th>Cód. fabricante</th><th>Producto</th><th>Categoría</th><th>Unidad</th><th className="r">Existencia</th><th className="r">Mínimo</th><th className="r">Costo</th><th className="r">Valor</th><th>Vence</th><th>Estado</th></tr></thead>
          <tbody>{rows.slice(0, LIMIT).map((p, i) => (
            <tr key={(p.wh || '') + p.id + i}>
              {detail && isSys && <td>{whName(p.wh)}</td>}
              <td><b>{p.code}</b></td><td>{p.manufacturer_code}</td><td>{p.name}</td><td>{categories.find((c) => c.id === p.category_id)?.name}</td><td>{unitName(p.unit_id)}</td>
              <td className="r"><b>{fmtQty(p.qty)}</b></td><td className="r">{fmtQty(p.min_stock)}</td><td className="r">{fmt(p.cost)}</td><td className="r">{fmt(p.qty * Number(p.cost || 0))}</td>
              <td>{fmtDate(p.expiry_date)}</td>
              <td>{p.expiry_date && p.expiry_date < today() && p.qty > 0 ? <Badge text="Vencido" tone="bad" /> : p.qty <= 0 ? <Badge text="Agotado" tone="bad" /> : p.min_stock > 0 && p.qty <= p.min_stock ? <Badge text="Stock bajo" tone="warn" /> : p.expiry_date && p.expiry_date <= soon ? <Badge text="Por vencer" tone="warn" /> : <Badge text="Normal" tone="ok" />}</td>
            </tr>))}</tbody>
          <tfoot><tr><td colSpan={detail && isSys ? 9 : 8}>Valor total ({rows.length} filas)</td><td className="r">{fmt(totalValue)}</td><td colSpan={2} /></tr></tfoot>
        </table>
          {!rows.length && <Empty text="No hay productos con esos filtros." />}
          {rows.length > LIMIT && <div className="empty">Mostrando {LIMIT} de {rows.length}. Usa filtros o exporta a Excel para ver todo.</div>}
        </div>)}
    </div>
  );
}
