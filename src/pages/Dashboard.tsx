import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { addDays, fetchAll, fmt, fmtDate, fmtQty, monthStart, noteNumber, NOTE_TYPE_LABEL, today } from '../lib/util';
import { computeAlerts } from '../lib/maint';
import { Empty, ErrorBox, Loading, PageHeader, StatusBadge, useAsync } from '../components/ui';

const OPEN_FLOW = ['pendiente', 'aprobado', 'preparando', 'despachado'];

export default function Dashboard() {
  const { profile, isSys } = useAuth();
  const { warehouses, categories, assets, units } = useLookups();

  const { data, loading, error } = useAsync(async () => {
    const start = monthStart();
    const [products, inv, recent, openFlow, fuel, services, hm, mt] = await Promise.all([
      fetchAll((a, b) => supabase.from('products').select('id,code,name,unit_id,cost,min_stock,expiry_date,active,category_id').range(a, b)),
      fetchAll((a, b) => supabase.from('inventory').select('warehouse_id,product_id,quantity').range(a, b)),
      supabase.from('notes').select('id,type,number,note_date,note_time,status,warehouse_id').order('created_at', { ascending: false }).limit(8),
      supabase.from('notes').select('id', { count: 'exact', head: true }).in('type', ['request', 'transfer']).in('status', OPEN_FLOW),
      fetchAll((a, b) => supabase.from('note_items').select('qty,unit_cost,notes!inner(type,note_date)').eq('notes.type', 'fuel_out').gte('notes.note_date', start).range(a, b)),
      supabase.from('services').select('id,status').in('status', ['solicitado', 'en_atencion', 'en_reparacion']),
      fetchAll((a, b) => supabase.from('hourmeter_logs').select('hours,fuel_gal').gte('log_date', start).range(a, b)),
      fetchAll((a, b) => supabase.from('maintenance_logs').select('id,asset_id,start_at,end_at,next_change_hrs,status').range(a, b)),
    ]);
    return { products, inv, recent: recent.data || [], openFlow: openFlow.count || 0, fuel, services: services.data || [], hm, mt };
  }, []);

  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '';
  const k = useMemo(() => {
    if (!data) return null;
    const stock: Record<string, number> = {};
    data.inv.forEach((r: any) => { stock[r.product_id] = (stock[r.product_id] || 0) + Number(r.quantity); });
    const soon = addDays(today(), 30);
    let existing = 0, low = 0, out = 0, soonN = 0, expired = 0, value = 0;
    data.products.forEach((p: any) => {
      const q = stock[p.id] || 0;
      if (q > 0) existing++;
      value += q * Number(p.cost || 0);
      if (!p.active) return;
      if (q <= 0) out++;
      else if (p.min_stock > 0 && q <= p.min_stock) low++;
      if (q > 0 && p.expiry_date) { if (p.expiry_date < today()) expired++; else if (p.expiry_date <= soon) soonN++; }
    });
    const liters = data.fuel.reduce((s: number, r: any) => s + Number(r.qty), 0);
    const fuelCost = data.fuel.reduce((s: number, r: any) => s + Number(r.qty) * Number(r.unit_cost || 0), 0);
    const hmHours = data.hm.reduce((s: number, r: any) => s + Number(r.hours || 0), 0);
    const alerts = computeAlerts(data.mt, assets);
    const fuelCat = categories.find((c) => c.name.toLowerCase().startsWith('combustible'))?.id;
    const prod = new Map<string, any>(data.products.map((p: any) => [p.id, p]));
    const byWh = new Map<string, any[]>();
    data.inv.forEach((r: any) => { const p = prod.get(r.product_id); if (!p || !fuelCat || p.category_id !== fuelCat) return;
      const q = Number(r.quantity); if (q === 0) return;
      const list = byWh.get(r.warehouse_id) || []; list.push({ id: p.id, code: p.code, name: p.name, unit: units.find((u) => u.id === p.unit_id)?.abbreviation || '', qty: q, value: q * Number(p.cost || 0) }); byWh.set(r.warehouse_id, list); });
    const fuelBal = [...byWh.entries()].map(([w, items]) => ({ w, items: items.sort((a, b) => String(a.name).localeCompare(b.name)), qty: items.reduce((s, i) => s + i.qty, 0), value: items.reduce((s, i) => s + i.value, 0) })).sort((a, b) => whName(a.w).localeCompare(whName(b.w)));
    return { existing, low, out, soonN, expired, value, liters, fuelCost, hmHours, alerts, fuelBal };
  }, [data, assets, categories, units, warehouses]);

  const inRepair = assets.filter((a) => a.status === 'en_reparacion').length;
  const route: Record<string, string> = { entry: '/entradas', exit: '/salidas', transfer: '/traspasos', request: '/pedidos', fuel_in: '/combustible', fuel_out: '/combustible', agro_out: '/agroquimicos', parts_out: '/repuestos' };
  const myWh = warehouses.find((w) => w.id === profile?.warehouse_id)?.name;

  return (
    <div>
      <PageHeader title="Panel" subtitle={isSys ? 'Resumen consolidado de todos los almacenes.' : `Resumen de tu almacén${myWh ? ': ' + myWh : ''}.`} />
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : k && data && (
        <>
          <div className="kpis">
            {isSys && <div className="kpi"><small>Almacenes activos</small><b>{warehouses.filter((w) => w.active).length}</b></div>}
            <div className="kpi"><small>Productos con existencia</small><b>{k.existing}</b></div>
            <div className="kpi"><small>Valor del inventario</small><b>{fmt(k.value)}</b></div>
            <Link to="/inventario" className="kpi warn" style={{ textDecoration: 'none', color: 'inherit' }}><small>Stock bajo</small><b>{k.low}</b></Link>
            <Link to="/inventario" className="kpi bad" style={{ textDecoration: 'none', color: 'inherit' }}><small>Agotados</small><b>{k.out}</b></Link>
            <div className="kpi warn"><small>Próximos a vencer (30 días)</small><b>{k.soonN}</b></div>
            <div className="kpi bad"><small>Vencidos con existencia</small><b>{k.expired}</b></div>
            <div className="kpi info"><small>Pedidos y traspasos abiertos</small><b>{data.openFlow}</b></div>
            <div className="kpi info"><small>Combustible del mes (litros)</small><b>{fmtQty(k.liters)}</b></div>
            <div className="kpi info"><small>Costo combustible del mes</small><b>{fmt(k.fuelCost)}</b></div>
            <Link to="/servicios" className="kpi warn" style={{ textDecoration: 'none', color: 'inherit' }}><small>Servicios pendientes</small><b>{data.services.length}</b></Link>
            <div className="kpi warn"><small>Equipos en reparación</small><b>{inRepair}</b></div>
            <Link to="/control/maquinaria" className="kpi info" style={{ textDecoration: 'none', color: 'inherit' }}><small>Horas de maquinaria del mes</small><b>{fmtQty(k.hmHours)}</b></Link>
            <Link to="/control/mantenimiento" className="kpi bad" style={{ textDecoration: 'none', color: 'inherit' }}><small>Alertas de mantenimiento</small><b>{k.alerts.length}</b></Link>
          </div>
          <div className="panel">
            <h3>Saldo de combustible por almacén (detalle por producto)</h3>
            {k.fuelBal.length === 0 ? <Empty text="No hay combustible con existencia (productos de la categoría “Combustible”)." /> : (
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Almacén / producto</th><th>Código</th><th className="r">Saldo</th><th>Unidad</th><th className="r">Valor</th></tr></thead>
                <tbody>{k.fuelBal.map((g) => (<Fragment key={g.w}>
                  <tr key={g.w} style={{ background: 'var(--soft, #f3f4f6)', fontWeight: 700 }}><td>{whName(g.w)}</td><td /><td className="r">{fmtQty(g.qty)}</td><td /><td className="r">{fmt(g.value)}</td></tr>
                  {g.items.map((i: any) => <tr key={g.w + i.id}><td style={{ paddingLeft: 24 }}>{i.name}</td><td>{i.code}</td><td className="r">{fmtQty(i.qty)}</td><td>{i.unit}</td><td className="r">{fmt(i.value)}</td></tr>)}
                </Fragment>))}</tbody>
                <tfoot><tr><td colSpan={2}>Total combustible</td><td className="r">{fmtQty(k.fuelBal.reduce((s, g) => s + g.qty, 0))}</td><td /><td className="r">{fmt(k.fuelBal.reduce((s, g) => s + g.value, 0))}</td></tr></tfoot>
              </table></div>)}
          </div>
          {k.alerts.length > 0 && <div className="panel"><h3>Alertas de mantenimiento</h3>{k.alerts.map((a) => <div key={a.key} style={{ padding: '3px 0' }}><b>{assets.find((x) => x.id === a.asset_id)?.code}</b> — {a.text}</div>)}</div>}
          <div className="panel">
            <h3>Últimos movimientos</h3>
            {data.recent.length === 0 ? <Empty text="Aún no hay movimientos registrados." /> : (
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Tipo</th><th>Nº</th><th>Fecha</th><th>Almacén</th><th>Estado</th></tr></thead>
                <tbody>{data.recent.map((n: any) => (
                  <tr key={n.id}>
                    <td><Link to={route[n.type] || '/dashboard'}>{NOTE_TYPE_LABEL[n.type]}</Link></td>
                    <td>{noteNumber(n.type, n.number)}</td>
                    <td>{fmtDate(n.note_date)} {String(n.note_time || '').slice(0, 5)}</td>
                    <td>{whName(n.warehouse_id)}</td>
                    <td><StatusBadge status={n.status} /></td>
                  </tr>))}</tbody>
              </table></div>)}
          </div>
          {categories.length > 0 && <small style={{ color: 'var(--muted)' }}>Los valores se calculan con los almacenes que tu usuario puede ver.</small>}
        </>
      )}
    </div>
  );
}
