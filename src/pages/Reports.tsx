import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { NOTE_STATUS, NOTE_TYPE_LABEL, SERVICE_STATUS, addDays, exportXlsx, fetchAll, fmt, fmtDate, fmtDateTime, fmtQty, monthStart, noteNumber, num, today } from '../lib/util';
import { Empty, ErrorBox, Loading, PageHeader, useAsync } from '../components/ui';
import { PrintDoc } from '../lib/printDoc';
import PrintPreview from '../components/PrintPreview';

type Col = { key: string; label: string; kind?: 'money' | 'qty' | 'date' | 'text'; sum?: boolean };
interface Result { title: string; subtitle: string; cols: Col[]; rows: any[] }

const REPORT_GROUPS: [string, [string, string][]][] = [
  ['Inventario', [['stock', 'Inventario: existencias, entradas y salidas del período'], ['minstock', 'Productos bajo el stock mínimo'], ['expiry', 'Vencimientos'], ['moves', 'Movimientos (entradas, salidas, traspasos, pedidos)']]],
  ['Combustible', [['fuel_eq', 'Consumo de combustible por equipo'], ['fuel_tp', 'Consumo de combustible por tipo de combustible'], ['fuel_rc', 'Recepciones de combustible']]],
  ['Agroquímicos', [['agro_eq', 'Agroquímicos por equipo'], ['agro_tp', 'Agroquímicos por tipo de producto']]],
  ['Mantenimiento y maquinaria', [['parts', 'Gasto en repuestos por equipo'], ['services', 'Servicios de mantenimiento'], ['hm', 'Horómetro por maquinaria'], ['mt', 'Control de mantenimiento']]],
];
const REPORTS: [string, string][] = REPORT_GROUPS.flatMap((g) => g[1]);
const DEF_GROUP: Record<string, string> = { fuel_eq: 'asset', fuel_tp: 'prod', agro_eq: 'asset', agro_tp: 'prod', hm: 'asset' };

const NOTE_SEL = 'qty,qty_sent,qty_received,unit_cost,product_id,notes!inner(id,type,number,note_date,note_time,warehouse_id,from_warehouse_id,to_warehouse_id,supplier_id,asset_id,status,person_delivers,person_receives,extra)';

export default function Reports() {
  const { warehouses, categories, units, suppliers, assets, company } = useLookups();
  const { isSys } = useAuth();
  const [rep, setRep] = useState('stock');
  const [from, setFrom] = useState(monthStart()); const [to, setTo] = useState(today());
  const [wh, setWh] = useState(''); const [cat, setCat] = useState(''); const [asset, setAsset] = useState('');
  const [group, setGroup] = useState('detail'); const [mtype, setMtype] = useState('');
  const [days, setDays] = useState('30'); const [sstatus, setSstatus] = useState('');
  const [pv, setPv] = useState<PrintDoc | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const { data: products } = useAsync(() => fetchAll((a, b) => supabase.from('products').select('id,code,manufacturer_code,name,category_id,unit_id,cost,min_stock,expiry_date,active').order('code').range(a, b)), []);

  const P = useMemo(() => new Map((products || []).map((p: any) => [p.id, p])), [products]);
  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || '';
  const catName = (id?: string | null) => categories.find((c) => c.id === id)?.name || '';
  const unitName = (id?: string | null) => { const u = units.find((x) => x.id === id); return u?.abbreviation || u?.name || ''; };
  const supName = (id?: string | null) => suppliers.find((s) => s.id === id)?.name || '';
  const assetName = (id?: string | null) => { const a = assets.find((x) => x.id === id); return a ? `${a.code} · ${a.name || a.type || ''}` : '(sin equipo)'; };

  const sel = (name: string) => REPORTS.find((r) => r[0] === name)![1];
  const isFuel = rep.startsWith('fuel'), isAgro = rep.startsWith('agro'), isNote = isFuel || isAgro;
  const mode = rep === 'fuel_rc' ? 'fuel_in' : isFuel ? 'fuel_out' : 'agro_out';
  const showDates = !['minstock', 'expiry'].includes(rep);
  const showCat = ['stock', 'minstock', 'expiry'].includes(rep);
  const showAsset = ['parts', 'services', 'fuel_eq', 'fuel_tp', 'agro_eq', 'agro_tp', 'hm', 'mt'].includes(rep);

  const loadItems = (types: string[]) => fetchAll((a, b) => supabase.from('note_items').select(NOTE_SEL)
    .in('notes.type', types).gte('notes.note_date', from).lte('notes.note_date', to).order('id').range(a, b));

  const loadStock = () => fetchAll((a, b) => {
    let q = supabase.from('inventory').select('warehouse_id,product_id,quantity').order('product_id').range(a, b);
    if (wh) q = q.eq('warehouse_id', wh);
    return q;
  });

  const generate = async () => {
    setBusy(true); setErr(''); setResult(null);
    try {
      const filt = [wh && `Almacén: ${whName(wh)}`, cat && `Categoría: ${catName(cat)}`, asset && `Equipo: ${assetName(asset)}`].filter(Boolean).join(' · ');
      const range = showDates ? `Del ${fmtDate(from)} al ${fmtDate(to)}` : `Al ${fmtDate(today())}`;
      const subtitle = [range, filt].filter(Boolean).join(' · ');
      let res: Result;

      if (rep === 'stock') {
        const inv = await loadStock();
        const mv = await loadItems(['entry', 'fuel_in', 'exit', 'fuel_out', 'agro_out', 'parts_out', 'transfer']);
        const per = new Map<string, { i: number; o: number }>();
        const add = (w: string, pid: string, k: 'i' | 'o', q: number) => { if (!w || (wh && w !== wh)) return; const key = w + '|' + pid; const g = per.get(key) || { i: 0, o: 0 }; g[k] += q; per.set(key, g); };
        mv.forEach((it: any) => { const n = it.notes;
          if (n.type === 'entry' || n.type === 'fuel_in') add(n.warehouse_id, it.product_id, 'i', num(it.qty));
          else if (n.type === 'transfer') { if (['despachado', 'recibido'].includes(n.status)) add(n.from_warehouse_id, it.product_id, 'o', num(it.qty_sent)); if (n.status === 'recibido') add(n.to_warehouse_id, it.product_id, 'i', num(it.qty_received)); }
          else add(n.warehouse_id, it.product_id, 'o', num(it.qty)); });
        const have = new Set(inv.map((r: any) => r.warehouse_id + '|' + r.product_id));
        const all = [...inv.map((r: any) => ({ warehouse_id: r.warehouse_id, product_id: r.product_id, quantity: r.quantity })),
          ...[...per.keys()].filter((k) => !have.has(k)).map((k) => { const [w, pid] = k.split('|'); return { warehouse_id: w, product_id: pid, quantity: 0 }; })];
        let rows = all.map((r: any) => {
          const p: any = P.get(r.product_id) || {}; const g = per.get(r.warehouse_id + '|' + r.product_id) || { i: 0, o: 0 };
          return { wh: whName(r.warehouse_id), code: p.code, mcode: p.manufacturer_code, name: p.name, cat: catName(p.category_id), catId: p.category_id, unit: unitName(p.unit_id), qty: num(r.quantity), ent: g.i, sal: g.o, ini: num(r.quantity) - g.i + g.o, cost: num(p.cost), value: num(r.quantity) * num(p.cost) };
        }).filter((r: any) => (r.qty !== 0 || r.ent !== 0 || r.sal !== 0) && (!cat || r.catId === cat));
        if (group === 'wh' || group === 'cat') {
          const k = group === 'wh' ? 'wh' : 'cat'; const m = new Map<string, any>();
          rows.forEach((r: any) => { const g = m.get(r[k]) || { g: r[k] || '(sin dato)', n: 0, value: 0 }; g.n++; g.value += r.value; m.set(r[k], g); });
          res = { title: 'Existencias y costos', subtitle, cols: [{ key: 'g', label: group === 'wh' ? 'Almacén' : 'Categoría' }, { key: 'n', label: 'Productos', kind: 'qty', sum: true }, { key: 'value', label: 'Valor', kind: 'money', sum: true }], rows: [...m.values()].sort((a, b) => b.value - a.value) };
        } else {
          rows.sort((a: any, b: any) => String(a.wh).localeCompare(b.wh) || String(a.code).localeCompare(b.code));
          res = { title: 'Inventario: existencias, entradas y salidas', subtitle, rows, cols: [
            ...(isSys ? [{ key: 'wh', label: 'Almacén' }] : []), { key: 'code', label: 'Código' }, { key: 'mcode', label: 'Cód. fabricante' }, { key: 'name', label: 'Producto' }, { key: 'cat', label: 'Categoría' }, { key: 'unit', label: 'Unidad' },
            { key: 'ini', label: 'Saldo inicial', kind: 'qty' }, { key: 'ent', label: 'Entradas', kind: 'qty' }, { key: 'sal', label: 'Salidas', kind: 'qty' }, { key: 'qty', label: 'Existencia actual', kind: 'qty' }, { key: 'cost', label: 'Costo prom.', kind: 'money' }, { key: 'value', label: 'Valor', kind: 'money', sum: true }] };
        }
      } else if (rep === 'minstock') {
        const inv = await loadStock(); const tot: Record<string, number> = {};
        inv.forEach((r: any) => { tot[r.product_id] = (tot[r.product_id] || 0) + num(r.quantity); });
        const rows = (products || []).filter((p: any) => p.active && num(p.min_stock) > 0 && (!cat || p.category_id === cat) && (tot[p.id] || 0) <= num(p.min_stock))
          .map((p: any) => ({ code: p.code, mcode: p.manufacturer_code, name: p.name, cat: catName(p.category_id), unit: unitName(p.unit_id), qty: tot[p.id] || 0, min: num(p.min_stock), miss: num(p.min_stock) - (tot[p.id] || 0), cost: num(p.cost) }));
        res = { title: 'Productos bajo el stock mínimo', subtitle, rows, cols: [{ key: 'code', label: 'Código' }, { key: 'mcode', label: 'Cód. fabricante' }, { key: 'name', label: 'Producto' }, { key: 'cat', label: 'Categoría' }, { key: 'unit', label: 'Unidad' }, { key: 'qty', label: 'Existencia', kind: 'qty' }, { key: 'min', label: 'Mínimo', kind: 'qty' }, { key: 'miss', label: 'Faltante', kind: 'qty' }, { key: 'cost', label: 'Costo unit.', kind: 'money' }] };
      } else if (rep === 'expiry') {
        const inv = await loadStock(); const tot: Record<string, number> = {};
        inv.forEach((r: any) => { tot[r.product_id] = (tot[r.product_id] || 0) + num(r.quantity); });
        const limit = addDays(today(), num(days));
        const rows = (products || []).filter((p: any) => p.expiry_date && p.expiry_date <= limit && (tot[p.id] || 0) > 0 && (!cat || p.category_id === cat))
          .map((p: any) => ({ code: p.code, mcode: p.manufacturer_code, name: p.name, cat: catName(p.category_id), qty: tot[p.id] || 0, exp: p.expiry_date, left: Math.round((new Date(p.expiry_date).getTime() - new Date(today()).getTime()) / 86400000), state: p.expiry_date < today() ? 'VENCIDO' : 'Por vencer', value: (tot[p.id] || 0) * num(p.cost) }))
          .sort((a: any, b: any) => a.left - b.left);
        res = { title: `Productos vencidos y por vencer (${days} días)`, subtitle, rows, cols: [{ key: 'code', label: 'Código' }, { key: 'mcode', label: 'Cód. fabricante' }, { key: 'name', label: 'Producto' }, { key: 'cat', label: 'Categoría' }, { key: 'qty', label: 'Existencia', kind: 'qty' }, { key: 'exp', label: 'Vence', kind: 'date' }, { key: 'left', label: 'Días', kind: 'qty' }, { key: 'state', label: 'Estado' }, { key: 'value', label: 'Valor', kind: 'money', sum: true }] };
      } else if (rep === 'moves') {
        const types = mtype ? [mtype] : ['entry', 'exit', 'transfer', 'request'];
        const items = await loadItems(types); const m = new Map<string, any>();
        items.forEach((it: any) => {
          const n = it.notes; if (wh && ![n.warehouse_id, n.from_warehouse_id, n.to_warehouse_id].includes(wh)) return;
          const g = m.get(n.id) || { type: NOTE_TYPE_LABEL[n.type], nro: noteNumber(n.type, n.number), date: n.note_date, wh: n.type === 'transfer' || n.type === 'request' ? `${whName(n.from_warehouse_id)} → ${whName(n.to_warehouse_id)}` : whName(n.warehouse_id), status: NOTE_STATUS[n.status] || n.status, n: 0, total: 0 };
          g.n++; g.total += num(it.qty) * num(it.unit_cost); m.set(n.id, g);
        });
        const rows = [...m.values()].sort((a, b) => String(a.date).localeCompare(b.date) || a.nro.localeCompare(b.nro));
        res = { title: mtype ? `${NOTE_TYPE_LABEL[mtype]}s` : 'Entradas, salidas, traspasos y pedidos', subtitle, rows, cols: [{ key: 'type', label: 'Tipo' }, { key: 'nro', label: 'Nº' }, { key: 'date', label: 'Fecha', kind: 'date' }, { key: 'wh', label: 'Almacén' }, { key: 'status', label: 'Estado' }, { key: 'n', label: 'Ítems', kind: 'qty', sum: true }, { key: 'total', label: 'Total', kind: 'money', sum: true }] };
      } else if (isNote) {
        const out = mode !== 'fuel_in';
        let items = await loadItems([mode]);
        items = items.filter((it: any) => (!wh || it.notes.warehouse_id === wh) && (!asset || !out || it.notes.asset_id === asset));
        const base = items.map((it: any) => { const n = it.notes; const p: any = P.get(it.product_id) || {};
          return { date: n.note_date, time: String(n.note_time || '').slice(0, 5), nro: noteNumber(n.type, n.number), wh: whName(n.warehouse_id), asset: assetName(n.asset_id), who: n.person_receives, giver: n.person_delivers, sup: supName(n.supplier_id), driver: n.extra?.driver, transport: n.extra?.transport, prod: p.name || '(sin producto)', unit: unitName(p.unit_id), liters: num(it.qty), price: num(it.unit_cost), total: num(it.qty) * num(it.unit_cost), hm: n.extra?.hourmeter, km: n.extra?.mileage }; })
          .sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
        const qlab = isFuel ? 'Litros' : 'Cantidad';
        const what = isFuel ? 'combustible' : 'agroquímicos';
        if (group === 'detail') {
          res = { title: isFuel ? (out ? 'Entregas de combustible' : 'Recepciones de combustible') : 'Entregas de agroquímicos', subtitle, rows: base, cols: out
            ? [{ key: 'date', label: 'Fecha', kind: 'date' }, { key: 'time', label: 'Hora' }, { key: 'nro', label: 'Nº' }, ...(isSys ? [{ key: 'wh', label: 'Almacén' }] : []), { key: 'asset', label: 'Equipo' }, { key: 'prod', label: 'Producto' }, { key: 'who', label: 'Recibe' }, { key: 'giver', label: 'Entrega' }, { key: 'liters', label: qlab, kind: 'qty' as const, sum: true }, { key: 'price', label: 'Costo unit.', kind: 'money' as const }, { key: 'total', label: 'Total', kind: 'money' as const, sum: true }, ...(isFuel ? [{ key: 'hm', label: 'Horómetro' }, { key: 'km', label: 'Km' }] : [])]
            : [{ key: 'date', label: 'Fecha', kind: 'date' }, { key: 'time', label: 'Hora' }, { key: 'nro', label: 'Nº' }, ...(isSys ? [{ key: 'wh', label: 'Almacén' }] : []), { key: 'sup', label: 'Proveedor' }, { key: 'driver', label: 'Chofer' }, { key: 'transport', label: 'Vehículo' }, { key: 'prod', label: 'Combustible' }, { key: 'liters', label: qlab, kind: 'qty' as const, sum: true }, { key: 'price', label: 'Costo unit.', kind: 'money' as const }, { key: 'total', label: 'Total', kind: 'money' as const, sum: true }] };
        } else {
          const keyOf = (r: any) => group === 'day' ? r.date : group === 'month' ? String(r.date).slice(0, 7) : group === 'year' ? String(r.date).slice(0, 4) : group === 'prod' ? r.prod : r.asset;
          const m = new Map<string, any>();
          base.forEach((r: any) => { const k = keyOf(r); const g = m.get(k) || { g: k, n: 0, liters: 0, total: 0 }; g.n++; g.liters += r.liters; g.total += r.total; m.set(k, g); });
          const lab = group === 'day' ? 'Día' : group === 'month' ? 'Mes' : group === 'year' ? 'Año' : group === 'prod' ? (isFuel ? 'Tipo de combustible' : 'Producto') : 'Equipo';
          res = { title: `${out ? 'Consumo' : 'Recepción'} de ${what} por ${lab.toLowerCase()}`, subtitle, rows: [...m.values()].sort((a, b) => (group === 'asset' || group === 'prod') ? b.liters - a.liters : String(a.g).localeCompare(b.g)),
            cols: [{ key: 'g', label: lab, kind: group === 'day' ? 'date' : 'text' }, { key: 'n', label: 'Registros', kind: 'qty', sum: true }, { key: 'liters', label: qlab, kind: 'qty', sum: true }, { key: 'total', label: 'Costo total', kind: 'money', sum: true }] };
        }
      } else if (rep === 'parts') {
        const repCat = categories.find((c) => c.name.toLowerCase() === 'repuestos')?.id;
        const items = await loadItems(['parts_out', 'exit']);
        const base: any[] = [];
        items.forEach((it: any) => { const n = it.notes; const p: any = P.get(it.product_id) || {};
          if (!n.asset_id) return; if (n.type === 'exit' && repCat && p.category_id !== repCat) return;
          if ((wh && n.warehouse_id !== wh) || (asset && n.asset_id !== asset)) return;
          base.push({ date: n.note_date, asset: assetName(n.asset_id), origin: `${NOTE_TYPE_LABEL[n.type]} ${noteNumber(n.type, n.number)}`, code: p.code, mcode: p.manufacturer_code, name: p.name, qty: num(it.qty), cost: num(it.unit_cost), total: num(it.qty) * num(it.unit_cost) }); });
        const sp = await fetchAll((a, b) => {
          let q = supabase.from('service_parts').select('qty,unit_cost,product_id,services!inner(number,asset_id,warehouse_id,requested_at)')
            .gte('services.requested_at', from + 'T00:00:00').lte('services.requested_at', to + 'T23:59:59').order('id').range(a, b);
          if (wh) q = q.eq('services.warehouse_id', wh);
          if (asset) q = q.eq('services.asset_id', asset);
          return q;
        });
        sp.forEach((r: any) => { const p: any = P.get(r.product_id) || {}; const s = r.services;
          base.push({ date: String(s.requested_at).slice(0, 10), asset: assetName(s.asset_id), origin: `Servicio Nº ${s.number}`, code: p.code, mcode: p.manufacturer_code, name: p.name, qty: num(r.qty), cost: num(r.unit_cost), total: num(r.qty) * num(r.unit_cost) }); });
        base.sort((a, b) => a.asset.localeCompare(b.asset) || String(a.date).localeCompare(b.date));
        if (group === 'detail') {
          res = { title: 'Repuestos entregados por equipo', subtitle, rows: base, cols: [{ key: 'asset', label: 'Equipo' }, { key: 'date', label: 'Fecha', kind: 'date' }, { key: 'origin', label: 'Origen' }, { key: 'code', label: 'Código' }, { key: 'mcode', label: 'Cód. fabricante' }, { key: 'name', label: 'Repuesto' }, { key: 'qty', label: 'Cantidad', kind: 'qty' }, { key: 'cost', label: 'Costo unit.', kind: 'money' }, { key: 'total', label: 'Total', kind: 'money', sum: true }] };
        } else {
          const m = new Map<string, any>();
          base.forEach((r) => { const g = m.get(r.asset) || { asset: r.asset, n: 0, total: 0 }; g.n++; g.total += r.total; m.set(r.asset, g); });
          res = { title: 'Costo de repuestos por equipo', subtitle, rows: [...m.values()].sort((a, b) => b.total - a.total), cols: [{ key: 'asset', label: 'Equipo' }, { key: 'n', label: 'Líneas', kind: 'qty', sum: true }, { key: 'total', label: 'Costo de repuestos', kind: 'money', sum: true }] };
        }
      } else if (rep === 'hm') {
        const lg = await fetchAll((a, b) => {
          let q = supabase.from('hourmeter_logs').select('*').gte('log_date', from).lte('log_date', to).order('log_date').range(a, b);
          if (wh) q = q.eq('warehouse_id', wh); if (asset) q = q.eq('asset_id', asset);
          return q;
        });
        if (group === 'detail') {
          res = { title: 'Horómetro por maquinaria: registros', subtitle, rows: lg.map((l: any) => ({ nro: l.number, date: l.log_date, asset: assetName(l.asset_id), op: l.operator, shift: l.shift, hs: num(l.hm_start), he: num(l.hm_end), h: num(l.hours), g: num(l.fuel_gal) })),
            cols: [{ key: 'nro', label: 'Nº' }, { key: 'date', label: 'Fecha', kind: 'date' }, { key: 'asset', label: 'Equipo' }, { key: 'op', label: 'Operador' }, { key: 'shift', label: 'Turno' }, { key: 'hs', label: 'Hor. inicial', kind: 'qty' }, { key: 'he', label: 'Hor. final', kind: 'qty' }, { key: 'h', label: 'Horas', kind: 'qty', sum: true }, { key: 'g', label: 'Combustible (gal)', kind: 'qty', sum: true }] };
        } else {
          const m = new Map<string, any>();
          lg.forEach((l: any) => { const k = assetName(l.asset_id); const g = m.get(k) || { asset: k, n: 0, h: 0, g: 0 }; g.n++; g.h += num(l.hours); g.g += num(l.fuel_gal); m.set(k, g); });
          const rows = [...m.values()].map((g) => ({ ...g, r: g.h > 0 ? g.g / g.h : 0 })).sort((a, b) => b.h - a.h);
          res = { title: 'Horómetro por maquinaria: resumen por equipo', subtitle, rows, cols: [{ key: 'asset', label: 'Equipo' }, { key: 'n', label: 'Registros', kind: 'qty', sum: true }, { key: 'h', label: 'Horas trabajadas', kind: 'qty', sum: true }, { key: 'g', label: 'Combustible (gal)', kind: 'qty', sum: true }, { key: 'r', label: 'Gal / hora', kind: 'qty' }] };
        }
      } else if (rep === 'mt') {
        const lg = await fetchAll((a, b) => {
          let q = supabase.from('maintenance_logs').select('*').gte('log_date', from).lte('log_date', to).order('log_date').range(a, b);
          if (wh) q = q.eq('warehouse_id', wh); if (asset) q = q.eq('asset_id', asset); if (mtype) q = q.eq('mtype', mtype);
          return q;
        });
        const rows = lg.map((l: any) => { const d = l.start_at ? Math.max(0, ((l.end_at ? new Date(l.end_at).getTime() : Date.now()) - new Date(l.start_at).getTime()) / 86400000) : 0;
          return { nro: l.number, date: l.log_date, asset: assetName(l.asset_id), mech: l.mechanic, type: l.mtype, days: Math.round(d * 10) / 10, hp: l.hm_out == null ? 0 : num(l.hm_out) - num(l.hm_in), parts: l.parts || '', cost: num(l.cost), status: l.status, alert: d > 2 ? 'Retrasado >2 días' : 'Dentro de tiempo' }; });
        res = { title: 'Control de mantenimiento', subtitle, rows, cols: [{ key: 'nro', label: 'Nº' }, { key: 'date', label: 'Fecha', kind: 'date' }, { key: 'asset', label: 'Equipo' }, { key: 'mech', label: 'Mecánico' }, { key: 'type', label: 'Tipo' }, { key: 'days', label: 'Días parada', kind: 'qty' }, { key: 'hp', label: 'Horas pruebas', kind: 'qty' }, { key: 'parts', label: 'Repuestos' }, { key: 'cost', label: 'Costo', kind: 'money', sum: true }, { key: 'status', label: 'Estado' }, { key: 'alert', label: 'Alerta' }] };
      } else {
        const sv = await fetchAll((a, b) => {
          let q = supabase.from('services').select('*').gte('requested_at', from + 'T00:00:00').lte('requested_at', to + 'T23:59:59').order('requested_at').range(a, b);
          if (wh) q = q.eq('warehouse_id', wh); if (asset) q = q.eq('asset_id', asset); if (sstatus) q = q.eq('status', sstatus);
          return q;
        });
        const rows = sv.map((s: any) => ({ nro: s.number, req: fmtDateTime(s.requested_at), asset: assetName(s.asset_id), wh: whName(s.warehouse_id), status: SERVICE_STATUS[s.status], prio: s.priority, tech: s.technician, parts: num(s.parts_cost), labor: num(s.labor_cost), other: num(s.other_cost), total: num(s.total_cost), fin: fmtDateTime(s.finished_at) }));
        res = { title: 'Servicios de mantenimiento', subtitle, rows, cols: [{ key: 'nro', label: 'Nº' }, { key: 'req', label: 'Solicitud' }, { key: 'asset', label: 'Equipo' }, ...(isSys ? [{ key: 'wh', label: 'Almacén' }] : []), { key: 'status', label: 'Estado' }, { key: 'prio', label: 'Prioridad' }, { key: 'tech', label: 'Técnico' }, { key: 'parts', label: 'Repuestos', kind: 'money', sum: true }, { key: 'labor', label: 'Mano de obra', kind: 'money', sum: true }, { key: 'other', label: 'Otros', kind: 'money', sum: true }, { key: 'total', label: 'Total', kind: 'money', sum: true }, { key: 'fin', label: 'Finalizó' }] };
      }
      setResult(res);
    } catch (e: any) { setErr(e?.message || String(e)); }
    setBusy(false);
  };

  const cell = (c: Col, v: any) => c.kind === 'money' ? fmt(v) : c.kind === 'qty' ? (v === '' || v == null ? '' : typeof v === 'number' ? fmtQty(v) : v) : c.kind === 'date' ? fmtDate(v) : (v ?? '');
  const pick = (k: string) => { setRep(k); setResult(null); setErr(''); setGroup(DEF_GROUP[k] || 'detail'); setMtype(''); };
  const printIt = () => {
    if (!result) return;
    const totals = result.cols.some((c) => c.sum) && result.rows.length > 0;
    setPv({ title: result.title, subtitle: result.subtitle, orient: result.cols.length > 6 ? 'landscape' : 'portrait',
      cols: result.cols.map((c) => c.label),
      rows: result.rows.map((r) => result.cols.map((c) => String(cell(c, r[c.key])))),
      foot: totals ? result.cols.map((c, i) => c.sum ? String(cell(c, result.rows.reduce((t, r) => t + num(r[c.key]), 0))) : i === 0 ? `Totales (${result.rows.length} filas)` : '') : undefined });
  };

  return (
    <div>
      {pv && <PrintPreview doc={pv} onClose={() => setPv(null)} />}
      <PageHeader title="Reportes" subtitle="Elige la consulta, el rango de fechas y pulsa Generar. Después puedes imprimirla (vista previa, PDF, Excel o impresora)."
        actions={result ? <button className="btn btn-primary" onClick={printIt}>Imprimir / Exportar</button> : undefined} />
      <div className="toolbar">
        <select style={{ minWidth: 300, fontWeight: 600 }} value={rep} onChange={(e) => pick(e.target.value)}>
          {REPORT_GROUPS.map(([g, list]) => <optgroup key={g} label={g}>{list.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
        </select>
        {showDates && <><label className="check">Fecha inicial <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="check">Fecha final <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>}
        {isSys && <select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Todos los almacenes</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        {showCat && <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas las categorías</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {rep === 'expiry' && <select value={days} onChange={(e) => setDays(e.target.value)}><option value="30">Vencen en 30 días</option><option value="60">Vencen en 60 días</option><option value="90">Vencen en 90 días</option><option value="180">Vencen en 180 días</option></select>}
        {showAsset && <select value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">Todos los equipos</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name || a.type}</option>)}</select>}
        {rep === 'moves' && <select value={mtype} onChange={(e) => setMtype(e.target.value)}><option value="">Todos los tipos</option><option value="entry">Entradas</option><option value="exit">Salidas</option><option value="transfer">Traspasos</option><option value="request">Pedidos</option></select>}
        {rep === 'mt' && <select value={mtype} onChange={(e) => setMtype(e.target.value)}><option value="">Todos los tipos</option><option>Preventivo</option><option>Correctivo</option><option>Predictivo</option></select>}
        {rep === 'services' && <select value={sstatus} onChange={(e) => setSstatus(e.target.value)}><option value="">Todos los estados</option>{Object.entries(SERVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        {rep === 'stock' && <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="detail">Detalle por producto</option><option value="wh">Resumen por almacén</option><option value="cat">Resumen por categoría</option></select>}
        {isNote && <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="detail">Detalle</option>{rep !== 'fuel_rc' && <option value="asset">Total por equipo</option>}<option value="prod">{isFuel ? 'Total por tipo de combustible' : 'Total por producto'}</option><option value="day">Total por día</option><option value="month">Total por mes</option><option value="year">Total por año</option></select>}
        {rep === 'parts' && <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="detail">Detalle</option><option value="asset">Costo total por equipo</option></select>}
        {rep === 'hm' && <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="asset">Resumen por equipo</option><option value="detail">Detalle de registros</option></select>}
        <button className="btn btn-primary" onClick={generate} disabled={busy || !products}>{busy ? 'Generando…' : 'Generar'}</button>
      </div>

      <ErrorBox text={err} />
      {busy && <Loading text="Generando reporte…" />}
      {result && !busy && (
        <div className="panel">
          <div className="print-head">
            {company?.logo_url && <img src={company.logo_url} alt="" />}
            <div><b>{company?.name || 'Mi Empresa'}</b>{company?.tax_id ? <div>NIT: {company.tax_id}</div> : null}{company?.phone ? <div>Tel.: {company.phone}</div> : null}{company?.address ? <div>{company.address}</div> : null}</div>
          </div>
          <h3 style={{ fontSize: 18 }}>{result.title}</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 10 }}>{result.subtitle} · Emitido el {fmtDateTime(new Date().toISOString())}</p>
          <div className="table-wrap"><table className="grid">
            <thead><tr>{result.cols.map((c) => <th key={c.key} className={c.kind === 'money' || c.kind === 'qty' ? 'r' : ''}>{c.label}</th>)}</tr></thead>
            <tbody>{result.rows.map((r, i) => <tr key={i}>{result.cols.map((c) => <td key={c.key} className={c.kind === 'money' || c.kind === 'qty' ? 'r' : ''}>{cell(c, r[c.key])}</td>)}</tr>)}</tbody>
            {result.rows.length > 0 && result.cols.some((c) => c.sum) && (
              <tfoot><tr>{result.cols.map((c, i) => <td key={c.key} className={c.kind === 'money' || c.kind === 'qty' ? 'r' : ''}>{c.sum ? cell(c, result.rows.reduce((s, r) => s + num(r[c.key]), 0)) : i === 0 ? `Totales (${result.rows.length} filas)` : ''}</td>)}</tr></tfoot>)}
          </table>{!result.rows.length && <Empty text="No hay datos para esos filtros." />}</div>
        </div>)}
      {!result && !busy && !err && <Empty text={`Reporte elegido: ${sel(rep)}. Pulsa “Generar”.`} />}
    </div>
  );
}
