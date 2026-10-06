import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { NoteConfig, FieldDef } from '../lib/noteConfigs';
import { fetchAll, fmt, fmtDate, fmtQty, noteNumber, nowTime, num, today } from '../lib/util';
import { PrintDoc } from '../lib/printDoc';
import PrintPreview from './PrintPreview';
import ProductPicker, { ProductLite } from './ProductPicker';
import { Badge, Field, Loading, StatusBadge, norm, useAction, useToast } from './ui';

interface Item { product_id: string; qty: any; qty_sent: any; qty_received: any; unit_cost: any; observation: string }
const emptyItem = (): Item => ({ product_id: '', qty: '', qty_sent: '', qty_received: '', unit_cost: '', observation: '' });
const ORDER = ['pendiente', 'aprobado', 'preparando', 'despachado', 'recibido'];
const NO_FILTERS = { number: '', from: '', to: '', warehouse: '', supplier: '', user: '', product: '' };

export default function NoteForm({ cfg }: { cfg: NoteConfig }) {
  const { ready } = useLookups();
  if (!ready) return <Loading />;
  return <Inner cfg={cfg} />;
}

function Inner({ cfg }: { cfg: NoteConfig }) {
  const { profile, isSys, isAdmin } = useAuth();
  const { warehouses, suppliers, assets, profiles, categories, units, company } = useLookups();
  const toast = useToast(); const run = useAction();
  const transfer = cfg.effect === 'transfer';
  const isRequest = cfg.type === 'request';
  const flow = transfer && !isRequest;       // el pedido solo tiene cantidad solicitada
  const costIn = cfg.effect === 'in';        // el precio unitario se define en las notas de ingreso
  const navigate = useNavigate(); const [sp, setSp] = useSearchParams();
  const [quick, setQuick] = useState('');
  const [pv, setPv] = useState<PrintDoc | null>(null);
  const [link, setLink] = useState<{ kind: 'transfer' | 'request'; number: number } | null>(null);

  const blankNote = useCallback(() => {
    const myWh = profile?.warehouse_id || '';
    const central = warehouses.find((w) => w.is_central)?.id || '';
    const only = warehouses.filter((w) => w.active).length === 1 ? warehouses.find((w) => w.active)?.id : '';
    const me = profile?.full_name || '';
    const n: any = {
      id: null, type: cfg.type, number: null, note_date: today(), note_time: nowTime(),
      warehouse_id: myWh || only || '', from_warehouse_id: '', to_warehouse_id: '', supplier_id: '', asset_id: '',
      status: transfer ? 'pendiente' : 'registrada', reason: '', priority: '', person_delivers: '', person_receives: '', observations: '', extra: {},
    };
    if (cfg.effect === 'in') n.person_receives = me; else n.person_delivers = me;
    if (cfg.type === 'transfer') n.from_warehouse_id = myWh;
    if (cfg.type === 'request') { n.to_warehouse_id = myWh; n.from_warehouse_id = central; n.priority = 'media'; }
    return n;
  }, [cfg.type, cfg.effect, transfer, profile, warehouses]);

  const [products, setProducts] = useState<ProductLite[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [idx, setIdx] = useState(-1);
  const [note, setNote] = useState<any>(() => blankNote());
  const [saved, setSaved] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [entry, setEntry] = useState<Item>(emptyItem());
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [showSearch, setShowSearch] = useState(false);
  const [filters, setFilters] = useState({ ...NO_FILTERS });
  const [busy, setBusy] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);

  // ---------- Datos de apoyo ----------
  useEffect(() => {
    fetchAll<ProductLite>((a, b) => supabase.from('products')
      .select('id,code,manufacturer_code,name,category_id,unit_id,cost,active,brand,model').order('code').range(a, b))
      .then(setProducts).catch((e) => toast(e.message, 'error'));
  }, []); // eslint-disable-line

  const catIds = useMemo(() => (cfg.categories || [])
    .map((n) => categories.find((c) => norm(c.name) === norm(n))?.id).filter(Boolean) as string[], [cfg.categories, categories]);
  const pickable = useMemo(() => (catIds.length ? products.filter((p) => p.category_id && catIds.includes(p.category_id)) : products), [products, catIds, products.length]);
  const pmap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const unitOf = (p?: ProductLite) => { const u = units.find((x) => x.id === p?.unit_id); return u?.abbreviation || u?.name || ''; };
  const catOf = (p?: ProductLite) => categories.find((c) => c.id === p?.category_id)?.name || '';

  const stockWh = cfg.effect === 'out' ? note.warehouse_id : cfg.effect === 'transfer' ? note.from_warehouse_id : '';
  useEffect(() => {
    if (!stockWh) { setStock({}); return; }
    fetchAll((a, b) => supabase.from('inventory').select('product_id,quantity').eq('warehouse_id', stockWh).range(a, b))
      .then((rows) => setStock(Object.fromEntries(rows.map((r: any) => [r.product_id, Number(r.quantity)])))).catch(() => {});
  }, [stockWh]);

  // ---------- Lista de notas (para navegar y buscar) ----------
  const loadList = useCallback(async (f = NO_FILTERS) => {
    let ids: string[] | null = null;
    if (f.product.trim()) {
      const t = f.product.trim().replace(/[,()%*]/g, ' ');
      const ps = await fetchAll((a, b) => supabase.from('products').select('id').or(`code.ilike.%${t}%,manufacturer_code.ilike.%${t}%,name.ilike.%${t}%`).range(a, b));
      const pids = ps.map((p: any) => p.id);
      if (!pids.length) { setList([]); return [] as any[]; }
      const its = await fetchAll((a, b) => supabase.from('note_items').select('note_id').in('product_id', pids.slice(0, 300)).range(a, b));
      ids = Array.from(new Set(its.map((i: any) => i.note_id)));
      if (!ids.length) { setList([]); return [] as any[]; }
    }
    const rows = await fetchAll((a, b) => {
      let q = supabase.from('notes').select('id,number,note_date,note_time,status,warehouse_id,from_warehouse_id,to_warehouse_id,supplier_id,created_by')
        .eq('type', cfg.type).order('number', { ascending: true }).range(a, b);
      const n = parseInt(String(f.number).replace(/\D/g, ''), 10);
      if (f.number && Number.isFinite(n)) q = q.eq('number', n);
      if (f.from) q = q.gte('note_date', f.from);
      if (f.to) q = q.lte('note_date', f.to);
      if (f.warehouse) q = q.or(`warehouse_id.eq.${f.warehouse},from_warehouse_id.eq.${f.warehouse},to_warehouse_id.eq.${f.warehouse}`);
      if (f.supplier) q = q.eq('supplier_id', f.supplier);
      if (f.user) q = q.eq('created_by', f.user);
      if (ids) q = q.in('id', ids.slice(0, 300));
      return q;
    });
    setList(rows);
    return rows as any[];
  }, [cfg.type]);

  useEffect(() => { loadList().catch((e) => toast(e.message, 'error')); }, [loadList]); // eslint-disable-line

  // ---------- Abrir / nueva ----------
  const openNote = async (id: string, rows = list) => {
    setLoadingNote(true);
    const { data, error } = await supabase.from('notes').select('*, note_items(*)').eq('id', id).single();
    setLoadingNote(false);
    if (error || !data) return toast(error?.message || 'No se pudo abrir la nota', 'error');
    const n: any = { ...data, extra: data.extra || {} };
    ['supplier_id', 'asset_id', 'from_warehouse_id', 'to_warehouse_id', 'reason', 'priority', 'person_delivers', 'person_receives', 'observations']
      .forEach((k) => { if (n[k] == null) n[k] = ''; });
    n.note_time = String(n.note_time || '').slice(0, 5);
    setNote(n); setSaved({ status: n.status });
    setItems(((data.note_items as any[]) || []).sort((a, b) => a.pos - b.pos).map((i) => ({
      product_id: i.product_id, qty: i.qty, qty_sent: i.qty_sent ?? '', qty_received: i.qty_received ?? '', unit_cost: i.unit_cost, observation: i.observation || '',
    })));
    setEntry(emptyItem()); setEditIdx(null);
    setIdx(rows.findIndex((r) => r.id === id));
  };
  const newNote = () => { setNote(blankNote()); setSaved(null); setItems([]); setEntry(emptyItem()); setEditIdx(null); setIdx(-1); };
  const go = (i: number) => { if (list[i]) openNote(list[i].id); };
  const clear = () => { if (note.id) openNote(note.id); else newNote(); };

  // ---------- Permisos del flujo de traspasos/pedidos ----------
  const tp = useMemo(() => {
    if (!transfer || !note.id || !saved) return { canEdit: true, options: ['pendiente'] as string[] };
    const old = saved.status as string; const oi = ORDER.indexOf(old);
    const isFrom = !!profile?.warehouse_id && profile.warehouse_id === note.from_warehouse_id;
    const isTo = !!profile?.warehouse_id && profile.warehouse_id === note.to_warehouse_id;
    const opts = [old];
    if (isSys) { ORDER.forEach((s) => !opts.includes(s) && opts.push(s)); opts.push('cancelado'); }
    else if (!['recibido', 'cancelado'].includes(old)) {
      const nx = ORDER[oi + 1];
      if (nx === 'aprobado' && profile?.role === 'warehouse_admin' && isFrom) opts.push(nx);
      if ((nx === 'preparando' || nx === 'despachado') && isFrom) opts.push(nx);
      if (nx === 'recibido' && isTo) opts.push(nx);
      if ((profile?.role === 'warehouse_admin' && (isFrom || isTo)) || old === 'pendiente') opts.push('cancelado');
    }
    let canEdit = isSys || (isTo && old === 'pendiente') || (isFrom && ['pendiente', 'aprobado', 'preparando'].includes(old))
      || (isTo && old === 'despachado' && note.status === 'recibido');
    if (['recibido', 'cancelado'].includes(old) && !isSys) canEdit = false;
    if (isRequest && old !== 'pendiente') canEdit = false;
    return { canEdit, options: opts };
  }, [transfer, isRequest, note.id, note.status, note.from_warehouse_id, note.to_warehouse_id, saved, profile, isSys]);
  const editable = !transfer || tp.canEdit;

  // ---------- Ítems ----------
  const pickProduct = (id: string) => { const p = pmap.get(id); setEntry((e) => ({ ...e, product_id: id, unit_cost: costIn ? '' : p ? p.cost : '' })); };
  const addItem = () => {
    const e = entry;
    if (!e.product_id) return toast('Elige un producto.', 'error');
    const q = num(e.qty);
    if (q <= 0) return toast('La cantidad debe ser mayor a cero.', 'error');
    if (costIn && num(e.unit_cost) <= 0) return toast('Escribe el precio unitario de ingreso (mayor a cero).', 'error');
    if (editIdx === null && items.some((i) => i.product_id === e.product_id)) return toast('Ese producto ya está en la nota. Edítalo desde la lista.', 'error');
    if (cfg.effect !== 'in' && !note.id && stockWh && q > (stock[e.product_id] || 0)) {
      return toast(`Stock disponible: ${fmtQty(stock[e.product_id] || 0)}. No alcanza para ${fmtQty(q)}.`, 'error');
    }
    const it = { ...e, qty: q, unit_cost: costIn ? num(e.unit_cost) : num(pmap.get(e.product_id)?.cost) };
    setItems(editIdx === null ? [...items, it] : items.map((x, i) => (i === editIdx ? it : x)));
    setEntry(emptyItem()); setEditIdx(null);
  };
  const editItem = (i: number) => { setEntry({ ...items[i] }); setEditIdx(i); };
  const delItem = (i: number) => { setItems(items.filter((_, k) => k !== i)); if (editIdx === i) { setEntry(emptyItem()); setEditIdx(null); } };
  const setItemField = (i: number, k: keyof Item, v: any) => setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const total = items.reduce((s, i) => s + num(i.qty) * num(i.unit_cost), 0);

  // ---------- Guardar / eliminar ----------
  const getVal = (f: FieldDef) => (f.extra ? note.extra?.[f.key] ?? '' : note[f.key] ?? '');
  const setVal = (f: FieldDef, v: any) => setNote((n: any) => (f.extra ? { ...n, extra: { ...n.extra, [f.key]: v } } : { ...n, [f.key]: v }));

  const save = async () => {
    for (const f of cfg.fields) if (f.required && !String(getVal(f)).trim()) return toast(`Falta completar: ${f.label}`, 'error');
    if (!items.length) return toast('Agrega al menos un ítem a la nota.', 'error');
    let its = items.map((i) => ({ ...i, qty: num(i.qty), unit_cost: num(i.unit_cost) }));
    if (transfer) {
      if (['despachado', 'recibido'].includes(note.status)) its = its.map((i) => ({ ...i, qty_sent: i.qty_sent === '' ? i.qty : num(i.qty_sent) }));
      if (note.status === 'recibido') its = its.map((i) => ({ ...i, qty_received: i.qty_received === '' ? i.qty_sent : num(i.qty_received) }));
    }
    const payload = { ...note, extra: note.extra || {} };
    setBusy(true);
    const id = await run(async () => {
      const { data, error } = await supabase.rpc('save_note', { p_note: payload, p_items: its });
      if (error) throw error;
      return data as string;
    }, 'Nota guardada');
    setBusy(false);
    if (id) { setFilters({ ...NO_FILTERS }); const rows = await loadList(); await openNote(id, rows); }
  };

  const remove = async () => {
    if (!note.id) return;
    if (!window.confirm('¿Eliminar esta nota? Se revertirá su efecto en el inventario.')) return;
    const ok = await run(async () => { const { error } = await supabase.rpc('delete_note', { p_id: note.id }); if (error) throw error; return true; }, 'Nota eliminada');
    if (ok) { await loadList(); newNote(); }
  };

  const doSearch = async () => { const rows = await run(() => loadList(filters)); if (rows) { setIdx(-1); if (!rows.length) toast('No se encontraron notas.', 'error'); } };

  // ---------- Pedido: aprobar y generar nota de traspaso ----------
  const canApprove = isRequest && !!note.id && saved?.status === 'pendiente' &&
    (isSys || (profile?.role === 'warehouse_admin' && !!profile.warehouse_id && profile.warehouse_id === note.from_warehouse_id));
  const approve = async () => {
    if (!window.confirm('¿Aprobar este pedido? Se generará automáticamente una nota de traspaso.')) return;
    const tid = await run(async () => { const { data, error } = await supabase.rpc('approve_request', { p_id: note.id }); if (error) throw error; return data as string; }, 'Pedido aprobado: nota de traspaso generada');
    if (tid) { const rows = await loadList(); await openNote(note.id, rows); }
  };
  const reject = async () => {
    if (!window.confirm('¿Rechazar (cancelar) este pedido?')) return;
    const its = items.map((i) => ({ ...i, qty: num(i.qty), unit_cost: num(i.unit_cost) }));
    const ok = await run(async () => { const { error } = await supabase.rpc('save_note', { p_note: { ...note, status: 'cancelado', extra: note.extra || {} }, p_items: its }); if (error) throw error; return true; }, 'Pedido rechazado');
    if (ok) { const rows = await loadList(); await openNote(note.id, rows); }
  };
  useEffect(() => {
    setLink(null);
    if (!note.id) return;
    if (isRequest && note.status === 'aprobado') {
      supabase.from('notes').select('number').eq('type', 'transfer').eq('ref_note_id', note.id).limit(1).then(({ data }) => { if (data?.[0]) setLink({ kind: 'transfer', number: data[0].number }); });
    } else if (cfg.type === 'transfer' && note.ref_note_id) {
      supabase.from('notes').select('number').eq('id', note.ref_note_id).limit(1).then(({ data }) => { if (data?.[0]) setLink({ kind: 'request', number: data[0].number }); });
    }
  }, [note.id, note.status, note.ref_note_id]); // eslint-disable-line

  // ---------- Buscar por número ----------
  const quickSearch = async () => {
    const n = parseInt(quick.replace(/\D/g, ''), 10);
    if (!Number.isFinite(n)) return toast('Escribe el número de nota.', 'error');
    setFilters({ ...NO_FILTERS });
    const rows = await loadList();
    const hit = rows.find((r: any) => r.number === n);
    if (!hit) return toast(`No se encontró la nota Nº ${n}.`, 'error');
    await openNote(hit.id, rows); setShowSearch(false);
  };
  // Enlace directo desde otra pantalla: /traspasos?nota=12
  useEffect(() => {
    const n = parseInt(sp.get('nota') || '', 10);
    if (!Number.isFinite(n) || !list.length) return;
    const hit = list.find((r: any) => r.number === n);
    if (hit) { openNote(hit.id); const q = new URLSearchParams(sp); q.delete('nota'); setSp(q, { replace: true }); }
  }, [list, sp]); // eslint-disable-line

  // ---------- Impresión (vista previa) ----------
  const printNote = () => {
    const meta = [`Fecha: ${fmtDate(note.note_date)} ${note.note_time}`, `Estado: ${note.status}`,
      ...cfg.fields.map((f) => { let v: any = getVal(f); if (f.kind === 'warehouse') v = whName(v); else if (f.kind === 'supplier') v = suppliers.find((x) => x.id === v)?.name; else if (f.kind === 'asset') { const a = assets.find((x) => x.id === v); v = a ? assetLabel(a) : ''; }
        else if (f.kind === 'select') v = f.options?.find(([k]) => k === v)?.[1] || v; return v ? `${f.label}: ${v}` : ''; }).filter(Boolean)];
    const showCost = !transfer;
    setPv({ title: `${cfg.singular} ${numberLabel}`, orient: 'portrait', meta,
      cols: ['#', 'Código', 'Producto', 'Unidad', flow ? 'Solicitada' : isRequest ? 'Solicitada' : cfg.qtyLabel || 'Cantidad', ...(flow ? ['Enviada', 'Recibida'] : []), ...(showCost ? ['Costo unit.', 'Total'] : [])],
      rows: items.map((it, i) => { const p = pmap.get(it.product_id); return [i + 1, p?.code || '', p?.name || '', unitOf(p), fmtQty(it.qty), ...(flow ? [fmtQty(it.qty_sent), fmtQty(it.qty_received)] : []), ...(showCost ? [fmt(it.unit_cost), fmt(num(it.qty) * num(it.unit_cost))] : [])]; }),
      foot: showCost ? ['Total', '', '', '', '', '', fmt(total)] : undefined });
  };

  // ---------- Presentación ----------
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '';
  const assetLabel = (a: any) => `${a.code} · ${a.name || a.type || ''}${a.plate ? ' · ' + a.plate : ''}`;
  const lockWh = (f: FieldDef) => {
    if (note.id) return true;
    if (cfg.type === 'transfer') return f.key === 'from_warehouse_id' && !isSys;
    if (cfg.type === 'request') return !isSys;
    return f.key === 'warehouse_id' && !isSys;
  };

  const renderField = (f: FieldDef) => {
    const v = getVal(f);
    const on = (e: any) => setVal(f, e.target.value);
    switch (f.kind) {
      case 'textarea': return <textarea value={v} onChange={on} />;
      case 'number': return <input type="number" min="0" step="any" value={v} onChange={on} />;
      case 'select': return <select value={v} onChange={on}>{f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
      case 'warehouse': return (
        <select value={v} onChange={on} disabled={lockWh(f)}>
          <option value="">— Elegir —</option>
          {warehouses.filter((w) => w.active || w.id === v).map((w) => <option key={w.id} value={w.id}>{w.name}{w.is_central ? ' (central)' : ''}</option>)}
        </select>);
      case 'supplier': return (
        <select value={v} onChange={on}><option value="">— Elegir —</option>
          {suppliers.filter((s) => s.active || s.id === v).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>);
      case 'asset': return (
        <select value={v} onChange={on}><option value="">— Ninguno —</option>
          {assets.filter((a) => a.status !== 'baja' || a.id === v).map((a) => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}</select>);
      default: return <input value={v} onChange={on} />;
    }
  };

  const numberLabel = note.id ? noteNumber(cfg.type, note.number) : 'Nueva';
  const userName = (id: string) => profiles.find((p) => p.id === id)?.full_name || '';

  return (
    <div>
      {pv && <PrintPreview doc={pv} onClose={() => setPv(null)} />}

      <div className="note-nav no-print">
        <button className="btn btn-primary" onClick={newNote}>Nuevo</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || loadingNote || (isRequest && !!note.id && saved?.status !== 'pendiente')}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {isAdmin && note.id && <button className="btn btn-danger" onClick={remove}>Eliminar</button>}
        <button className="btn" onClick={clear}>Limpiar</button>
        <span className="sep" />
        <button className="btn" onClick={() => go(0)} disabled={!list.length} title="Primero">⏮ Primero</button>
        <button className="btn" onClick={() => go(idx < 0 ? list.length - 1 : idx - 1)} disabled={!list.length || idx === 0}>◀ Anterior</button>
        <span className="counter">{idx >= 0 ? `Nota ${idx + 1} de ${list.length}` : `${list.length} nota(s)`}</span>
        <button className="btn" onClick={() => go(idx + 1)} disabled={idx < 0 || idx >= list.length - 1}>Siguiente ▶</button>
        <button className="btn" onClick={() => go(list.length - 1)} disabled={!list.length}>Último ⏭</button>
        <span className="sep" />
        <input style={{ width: 110 }} inputMode="numeric" placeholder="Nº de nota" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && quickSearch()} />
        <button className="btn btn-primary" onClick={quickSearch}>Buscar</button>
        <button className="btn" onClick={() => setShowSearch((s) => !s)}>Búsqueda avanzada</button>
        <button className="btn" onClick={printNote} disabled={!items.length}>Imprimir</button>
      </div>
      {isRequest && note.id && (
        <div className="note-box no-print" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Estado del pedido: <StatusBadge status={note.status} /></span>
          {canApprove && <button className="btn btn-primary" onClick={approve}>Aprobar y generar nota de traspaso</button>}
          {canApprove && <button className="btn btn-danger" onClick={reject}>Rechazar pedido</button>}
          {link?.kind === 'transfer' && <button className="btn" onClick={() => navigate('/traspasos?nota=' + link.number)}>Ir al traspaso Nº {String(link.number).padStart(6, '0')}</button>}
          {saved?.status === 'pendiente' && !canApprove && <small>Este pedido espera la aprobación del administrador del almacén que despacha.</small>}
        </div>
      )}
      {cfg.type === 'transfer' && link?.kind === 'request' && (
        <div className="note-box no-print"><button className="btn" onClick={() => navigate('/pedidos?nota=' + link.number)}>Ver pedido Nº {String(link.number).padStart(6, '0')}</button> Este traspaso fue generado al aprobar ese pedido.</div>
      )}

      {showSearch && (
        <div className="search-panel no-print">
          <div className="form-grid">
            <Field label="Número"><input value={filters.number} onChange={(e) => setFilters({ ...filters, number: e.target.value })} placeholder="Ej: 15" /></Field>
            <Field label="Desde"><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
            <Field label="Hasta"><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
            {isSys && <Field label="Almacén"><select value={filters.warehouse} onChange={(e) => setFilters({ ...filters, warehouse: e.target.value })}><option value="">Todos</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
            {cfg.fields.some((f) => f.kind === 'supplier') && <Field label="Proveedor"><select value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })}><option value="">Todos</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
            <Field label="Usuario que registró"><select value={filters.user} onChange={(e) => setFilters({ ...filters, user: e.target.value })}><option value="">Todos</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
            <Field label="Código o nombre de producto"><input value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} /></Field>
          </div>
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 8 }}>
            <button className="btn btn-primary" onClick={doSearch}>Buscar</button>
            <button className="btn" onClick={async () => { setFilters({ ...NO_FILTERS }); await loadList(); }}>Quitar filtros</button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 260 }}>
            <table className="grid"><thead><tr><th>Número</th><th>Fecha</th><th>Almacén</th><th>Registró</th><th>Estado</th></tr></thead>
              <tbody>
                {[...list].reverse().slice(0, 200).map((r) => (
                  <tr key={r.id} className={'clickable' + (note.id === r.id ? ' sel' : '')} onClick={() => { openNote(r.id); setShowSearch(false); }}>
                    <td>{noteNumber(cfg.type, r.number)}</td><td>{fmtDate(r.note_date)} {String(r.note_time).slice(0, 5)}</td>
                    <td>{transfer ? `${whName(r.from_warehouse_id)} → ${whName(r.to_warehouse_id)}` : whName(r.warehouse_id)}</td>
                    <td>{userName(r.created_by)}</td><td><StatusBadge status={r.status} /></td>
                  </tr>))}
                {!list.length && <tr><td colSpan={5} className="empty">Sin resultados</td></tr>}
              </tbody></table>
          </div>
        </div>
      )}

      {loadingNote ? <Loading /> : (
        <div className="panel">
          <div className="note-title">
            <h2>{cfg.singular}</h2><Badge text={numberLabel} tone="info" />
            {!flow && !isRequest && <StatusBadge status={note.status} />}
          </div>
          <div className="form-grid">
            <Field label="Fecha"><input type="date" value={note.note_date} onChange={(e) => setNote({ ...note, note_date: e.target.value })} /></Field>
            <Field label="Hora"><input type="time" value={note.note_time} onChange={(e) => setNote({ ...note, note_time: e.target.value })} /></Field>
            {flow && (
              <Field label="Estado">
                <select value={note.status} onChange={(e) => setNote({ ...note, status: e.target.value })} disabled={!note.id}>
                  {(note.id ? tp.options : ['pendiente']).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </Field>
            )}
            {cfg.fields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? ' *' : '')} full={f.full}>{renderField(f)}</Field>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Detalle de productos</h3>
        {editable && (
          <div className="item-entry no-print">
            <Field label="Producto (código, fabricante o nombre)">
              <ProductPicker products={pickable} value={entry.product_id} onChange={pickProduct} stock={stockWh ? stock : null} />
            </Field>
            <Field label={transfer ? 'Cantidad solicitada' : cfg.qtyLabel || 'Cantidad'}>
              <input type="number" min="0" step="any" value={entry.qty} onChange={(e) => setEntry({ ...entry, qty: e.target.value })} />
            </Field>
            {costIn && (
              <Field label={(cfg.costLabel || 'Precio unitario') + ' *'} hint={entry.product_id ? `Costo vigente del producto: ${fmt(pmap.get(entry.product_id)?.cost)}` : undefined}>
                <input type="number" min="0" step="any" value={entry.unit_cost} onChange={(e) => setEntry({ ...entry, unit_cost: e.target.value })} />
              </Field>
            )}
            {transfer && <Field label="Observación"><input value={entry.observation} onChange={(e) => setEntry({ ...entry, observation: e.target.value })} /></Field>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-amber" onClick={addItem}>{editIdx === null ? 'Agregar ítem' : 'Actualizar ítem'}</button>
              {editIdx !== null && <button className="btn" onClick={() => { setEntry(emptyItem()); setEditIdx(null); }}>Cancelar</button>}
            </div>
          </div>
        )}
        {transfer && note.id && !tp.canEdit && <div className="note-box">En este estado y con tu usuario no puedes modificar los ítems; solo se puede cambiar el estado si te corresponde.</div>}

        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>#</th><th>Código</th><th>Cód. fabricante</th><th>Producto</th>
                {!transfer && <th>Categoría</th>}
                {flow ? <><th className="r">Solicitada</th><th className="r">Enviada</th><th className="r">Recibida</th></> : <th className="r">{isRequest ? 'Solicitada' : cfg.qtyLabel || 'Cantidad'}</th>}
                <th>Unidad</th>
                {!transfer && <><th className="r">{cfg.costLabel || 'Costo unit.'}</th><th className="r">Total</th></>}
                {transfer && <th>Observación</th>}
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const p = pmap.get(it.product_id);
                return (
                  <tr key={i} className={editIdx === i ? 'sel' : ''}>
                    <td>{i + 1}</td><td>{p?.code}</td><td>{p?.manufacturer_code}</td><td>{p?.name}</td>
                    {!transfer && <td>{catOf(p)}</td>}
                    {flow ? (
                      <>
                        <td className="r">{fmtQty(it.qty)}</td>
                        <td className="r" style={{ width: 110 }}>{tp.canEdit ? <input type="number" min="0" step="any" value={it.qty_sent} onChange={(e) => setItemField(i, 'qty_sent', e.target.value)} placeholder={fmtQty(it.qty)} /> : fmtQty(it.qty_sent)}</td>
                        <td className="r" style={{ width: 110 }}>{tp.canEdit ? <input type="number" min="0" step="any" value={it.qty_received} onChange={(e) => setItemField(i, 'qty_received', e.target.value)} /> : fmtQty(it.qty_received)}</td>
                      </>
                    ) : <td className="r">{fmtQty(it.qty)}</td>}
                    <td>{unitOf(p)}</td>
                    {!transfer && <><td className="r">{fmt(it.unit_cost)}</td><td className="r">{fmt(num(it.qty) * num(it.unit_cost))}</td></>}
                    {transfer && <td>{it.observation}</td>}
                    <td className="no-print">
                      {editable && <div className="row-actions">
                        <button className="btn btn-sm" onClick={() => editItem(i)}>Editar</button>
                        <button className="btn btn-sm btn-danger" onClick={() => delItem(i)}>Eliminar</button>
                      </div>}
                    </td>
                  </tr>);
              })}
              {!items.length && <tr><td colSpan={12} className="empty">Aún no hay ítems. Elige un producto y pulsa “Agregar ítem”.</td></tr>}
            </tbody>
            {!transfer && items.length > 0 && <tfoot><tr><td colSpan={7}>Total de la nota</td><td className="r" /><td className="r">{fmt(total)}</td><td className="no-print" /></tr></tfoot>}
          </table>
        </div>
      </div>
    </div>
  );
}
