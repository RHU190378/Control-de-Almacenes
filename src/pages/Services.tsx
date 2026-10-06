import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { SERVICE_STATUS, exportXlsx, fetchAll, fmt, fmtDateTime, fmtQty, num, uploadPhoto } from '../lib/util';
import { Badge, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchBox, norm, useAction, useAsync, useToast } from '../components/ui';
import ProductPicker, { ProductLite } from '../components/ProductPicker';

const PRIORITY: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const PTONE: Record<string, string> = { baja: 'muted', media: 'info', alta: 'warn', urgente: 'bad' };
const STONE: Record<string, string> = { solicitado: 'warn', en_atencion: 'info', en_reparacion: 'warn', terminado: 'ok', cancelado: 'bad' };

const toInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromInput = (v?: string) => (v ? new Date(v).toISOString() : null);

export default function Services() {
  const { warehouses, assets, categories } = useLookups();
  const { isAdmin, isSys, profile } = useAuth();
  const run = useAction(); const toast = useToast();
  const [q, setQ] = useState(''); const [st, setSt] = useState(''); const [wh, setWh] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [origParts, setOrigParts] = useState<any[]>([]);
  const [add, setAdd] = useState({ product_id: '', qty: '', unit_cost: '' });
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [nro, setNro] = useState('');

  const { data, loading, error, reload } = useAsync(async () =>
    fetchAll((a, b) => supabase.from('services').select('*').order('requested_at', { ascending: false }).range(a, b)), []);

  useEffect(() => {
    fetchAll<ProductLite>((a, b) => supabase.from('products').select('id,code,manufacturer_code,name,category_id,unit_id,cost,active,brand,model').order('code').range(a, b))
      .then(setProducts).catch(() => {});
  }, []);

  // Existencias del almacén del servicio (para avisar si falta stock)
  useEffect(() => {
    if (!edit?.warehouse_id) { setStock({}); return; }
    supabase.from('inventory').select('product_id,quantity').eq('warehouse_id', edit.warehouse_id).then(({ data }) => {
      const s: Record<string, number> = {}; (data || []).forEach((r: any) => { s[r.product_id] = Number(r.quantity); }); setStock(s);
    });
  }, [edit?.warehouse_id]);

  const assetName = (id: string) => { const a = assets.find((x) => x.id === id); return a ? `${a.code} · ${a.name || a.type || ''}` : ''; };
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '';
  const prod = (id: string) => products.find((p) => p.id === id);
  const repCat = categories.find((c) => norm(c.name) === 'repuestos')?.id;

  const list = useMemo(() => {
    const t = norm(q).trim().split(/\s+/).filter(Boolean);
    return (data || []).filter((s: any) => {
      if (st && s.status !== st) return false;
      if (wh && s.warehouse_id !== wh) return false;
      if (!t.length) return true;
      return t.every((w) => norm(`${s.number} ${assetName(s.asset_id)} ${s.requester || ''} ${s.technician || ''} ${s.reason || ''}`).includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, st, wh, assets]);

  const blank = () => ({
    id: null, warehouse_id: profile?.warehouse_id || (warehouses.filter((w) => w.active).length === 1 ? warehouses.find((w) => w.active)?.id : '') || '',
    asset_id: '', requester: profile?.full_name || '', reason: '', description: '', photo_url: '', priority: 'media', status: 'solicitado',
    technician: '', work_done: '', labor_cost: '', other_cost: '', requested_at: toInput(new Date().toISOString()), finished_at: '', received_by: '', observations: '',
  });

  const open = async (s?: any) => {
    setAdd({ product_id: '', qty: '', unit_cost: '' });
    if (!s) { setEdit(blank()); setParts([]); setOrigParts([]); return; }
    const { data: pr } = await supabase.from('service_parts').select('*').eq('service_id', s.id);
    setParts(pr || []); setOrigParts(pr || []);
    setEdit({ ...blank(), ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])), requested_at: toInput(s.requested_at), finished_at: toInput(s.finished_at) });
  };
  const set = (k: string, v: any) => setEdit((e: any) => ({ ...e, [k]: v }));
  const setStatus = (v: string) => setEdit((e: any) => ({ ...e, status: v, finished_at: v === 'terminado' && !e.finished_at ? toInput(new Date().toISOString()) : e.finished_at }));

  const photo = async (f?: File) => {
    if (!f) return;
    setBusy(true); const url = await run(() => uploadPhoto(f, 'servicios')); setBusy(false);
    if (url) set('photo_url', url);
  };

  const pickProduct = (id: string) => setAdd({ ...add, product_id: id, unit_cost: String(prod(id)?.cost ?? '') });
  const addPart = () => {
    if (!add.product_id) return toast('Elige el repuesto.', 'error');
    const qty = num(add.qty);
    if (qty <= 0) return toast('La cantidad debe ser mayor a 0.', 'error');
    if (num(add.unit_cost) < 0) return toast('El costo no puede ser negativo.', 'error');
    // disponible = existencia actual + repuestos quitados de este servicio (vuelven al inventario) - lo agregado sin guardar
    const keptIds = new Set(parts.filter((p) => p.id).map((p) => p.id));
    const back = origParts.filter((p) => p.product_id === add.product_id && !keptIds.has(p.id)).reduce((s, p) => s + num(p.qty), 0);
    const pending = parts.filter((p) => !p.id && p.product_id === add.product_id).reduce((s, p) => s + num(p.qty), 0);
    const available = (stock[add.product_id] || 0) + back - pending;
    if (edit.warehouse_id && qty > available && !window.confirm(`En este almacén hay ${fmtQty(available)} disponibles de ese repuesto y el sistema no permitirá guardar si falta stock. ¿Agregar de todos modos?`)) return;
    setParts([...parts, { product_id: add.product_id, qty, unit_cost: num(add.unit_cost) }]);
    setAdd({ product_id: '', qty: '', unit_cost: '' });
  };

  const partsCost = parts.reduce((s, p) => s + num(p.qty) * num(p.unit_cost), 0);
  const total = partsCost + num(edit?.labor_cost) + num(edit?.other_cost);

  const save = async () => {
    const e = edit;
    if (!e.warehouse_id) return toast('Elige el almacén.', 'error');
    if (!e.asset_id) return toast('Elige la máquina, vehículo o equipo.', 'error');
    if (!e.reason.trim()) return toast('Escribe el motivo o falla.', 'error');
    if (num(e.labor_cost) < 0 || num(e.other_cost) < 0) return toast('Los costos no pueden ser negativos.', 'error');
    if (e.status === 'terminado' && !e.finished_at) return toast('Indica la fecha y hora de finalización.', 'error');
    const payload: any = {
      warehouse_id: e.warehouse_id, asset_id: e.asset_id, requester: e.requester?.trim() || null, reason: e.reason.trim(), description: e.description?.trim() || null,
      photo_url: e.photo_url || null, priority: e.priority, status: e.status, technician: e.technician?.trim() || null, work_done: e.work_done?.trim() || null,
      labor_cost: num(e.labor_cost), other_cost: num(e.other_cost), requested_at: fromInput(e.requested_at) || new Date().toISOString(),
      finished_at: fromInput(e.finished_at), received_by: e.received_by?.trim() || null, observations: e.observations?.trim() || null,
    };
    setBusy(true);
    const ok = await run(async () => {
      let id = e.id;
      if (id) {
        const r = await supabase.from('services').update(payload).eq('id', id); if (r.error) throw r.error;
        // repuestos quitados (devuelven stock)
        const keep = new Set(parts.filter((p) => p.id).map((p) => p.id));
        const gone = origParts.filter((p) => !keep.has(p.id)).map((p) => p.id);
        if (gone.length) { const d = await supabase.from('service_parts').delete().in('id', gone); if (d.error) throw d.error; }
      } else {
        const r = await supabase.from('services').insert({ ...payload, created_by: profile?.id }).select('id').single();
        if (r.error) throw r.error; id = r.data.id;
      }
      const fresh = parts.filter((p) => !p.id).map((p) => ({ service_id: id, product_id: p.product_id, qty: p.qty, unit_cost: p.unit_cost }));
      if (fresh.length) { const i = await supabase.from('service_parts').insert(fresh); if (i.error) throw new Error('Se guardó el servicio pero los repuestos no: ' + i.error.message); }
      return true;
    }, 'Servicio guardado');
    setBusy(false);
    reload();
    if (ok) setEdit(null);
  };

  const del = async (s: any) => {
    if (!window.confirm(`¿Eliminar el servicio Nº ${s.number}? Los repuestos usados volverán al inventario.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('services').delete().eq('id', s.id); if (error) throw error; return true; }, 'Servicio eliminado');
    if (ok) { setEdit(null); reload(); }
  };

  const exportIt = () => exportXlsx(list.map((s: any) => ({
    numero: s.number, solicitud: fmtDateTime(s.requested_at), almacen: whName(s.warehouse_id), equipo: assetName(s.asset_id), solicitante: s.requester, motivo: s.reason,
    prioridad: PRIORITY[s.priority], estado: SERVICE_STATUS[s.status], tecnico: s.technician, costo_repuestos: s.parts_cost, mano_de_obra: s.labor_cost, otros: s.other_cost,
    total: s.total_cost, finalizacion: fmtDateTime(s.finished_at), recibe: s.received_by,
  })), 'servicios');

  const locked = !isAdmin && edit?.id && ['terminado', 'cancelado'].includes(edit.status);

  return (
    <div>
      <PageHeader title="Servicios de mantenimiento" subtitle="Solicitud > Atención > Reparación > Cierre y entrega."
        actions={<><button className="btn" onClick={exportIt}>Exportar Excel</button><button className="btn btn-primary" onClick={() => open()}>Nueva solicitud</button></>} />
      <div className="toolbar">
        <input style={{ width: 130 }} inputMode="numeric" placeholder="Nº de servicio" value={nro} onChange={(e) => setNro(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (document.getElementById('svc-find') as HTMLButtonElement)?.click(); }} />
        <button id="svc-find" className="btn btn-primary" onClick={() => { const n = parseInt(nro.replace(/\D/g, ''), 10); const hit = (data || []).find((x: any) => x.number === n); hit ? open(hit) : toast(`No se encontró el servicio Nº ${nro || '—'}.`, 'error'); }}>Buscar</button>
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por equipo, solicitante, técnico…" />
        <select value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos los estados</option>{Object.entries(SERVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {isSys && <select value={wh} onChange={(e) => setWh(e.target.value)}><option value="">Todos los almacenes</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
      </div>
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Nº</th><th>Solicitud</th><th>Equipo</th>{isSys && <th>Almacén</th>}<th>Motivo</th><th>Prioridad</th><th>Estado</th><th>Técnico</th><th className="r">Total</th><th>Finalizó</th></tr></thead>
          <tbody>{list.map((s: any) => (
            <tr key={s.id} className="clickable" onClick={() => open(s)}>
              <td><b>{s.number}</b></td><td>{fmtDateTime(s.requested_at)}</td><td>{assetName(s.asset_id)}</td>{isSys && <td>{whName(s.warehouse_id)}</td>}
              <td>{s.reason}</td><td><Badge text={PRIORITY[s.priority]} tone={PTONE[s.priority]} /></td><td><Badge text={SERVICE_STATUS[s.status]} tone={STONE[s.status]} /></td>
              <td>{s.technician}</td><td className="r">{fmt(s.total_cost)}</td><td>{fmtDateTime(s.finished_at)}</td>
            </tr>))}</tbody>
        </table>{!list.length && <Empty text="No hay servicios con esos filtros." />}</div>)}

      {edit && (
        <Modal wide title={edit.id ? `Servicio Nº ${edit.number}` : 'Nueva solicitud de servicio'} onClose={() => setEdit(null)}
          footer={<>
            {edit.id && isAdmin && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => del(edit)}>Eliminar</button>}
            <button className="btn" onClick={() => setEdit(null)}>Cancelar</button>
            {!locked && <button className="btn btn-primary" disabled={busy} onClick={save}>Guardar</button>}
          </>}>
          {locked && <div className="note-box">Este servicio ya está cerrado. Solo un administrador puede modificarlo.</div>}
          <fieldset disabled={!!locked} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Almacén *"><select value={edit.warehouse_id} disabled={!isSys || !!edit.id} onChange={(e) => set('warehouse_id', e.target.value)}><option value="">— elegir —</option>{warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
              <Field label="Máquina / vehículo / equipo *"><select value={edit.asset_id} onChange={(e) => set('asset_id', e.target.value)}><option value="">— elegir —</option>{assets.filter((a) => !edit.warehouse_id || a.warehouse_id === edit.warehouse_id || a.id === edit.asset_id).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name || a.type}</option>)}</select></Field>
              <Field label="Fecha y hora de solicitud"><input type="datetime-local" value={edit.requested_at} onChange={(e) => set('requested_at', e.target.value)} /></Field>
              <Field label="Solicitante"><input value={edit.requester} onChange={(e) => set('requester', e.target.value)} /></Field>
              <Field label="Motivo / falla *" full><input value={edit.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
              <Field label="Descripción de la falla" full><textarea rows={2} value={edit.description} onChange={(e) => set('description', e.target.value)} /></Field>
              <Field label="Prioridad"><select value={edit.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Estado"><select value={edit.status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(SERVICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Técnico / responsable"><input value={edit.technician} onChange={(e) => set('technician', e.target.value)} /></Field>
              <Field label="Fotografía">
                <div>{edit.photo_url && <img className="thumb" style={{ width: 64, height: 64, marginBottom: 4 }} src={edit.photo_url} alt="" />}<input type="file" accept="image/*" onChange={(e) => photo(e.target.files?.[0])} /></div>
              </Field>
              <Field label="Trabajo realizado" full><textarea rows={2} value={edit.work_done} onChange={(e) => set('work_done', e.target.value)} /></Field>
            </div>

            <div className="panel" style={{ marginTop: 12 }}>
              <h3>Repuestos utilizados <small style={{ fontWeight: 400, color: 'var(--muted)' }}>(se descuentan del inventario del almacén)</small></h3>
              <div className="table-wrap"><table className="grid">
                <thead><tr><th>Código</th><th>Cód. fabricante</th><th>Repuesto</th><th className="r">Cantidad</th><th className="r">Costo unit.</th><th className="r">Total</th><th /></tr></thead>
                <tbody>
                  {parts.map((p, i) => { const pr = prod(p.product_id); return (
                    <tr key={p.id || i}><td>{pr?.code}</td><td>{pr?.manufacturer_code}</td><td>{pr?.name}</td><td className="r">{fmtQty(p.qty)}</td><td className="r">{fmt(p.unit_cost)}</td><td className="r">{fmt(num(p.qty) * num(p.unit_cost))}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => setParts(parts.filter((_, j) => j !== i))}>Quitar</button></td></tr>); })}
                  {!parts.length && <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>Sin repuestos.</td></tr>}
                </tbody>
                <tfoot><tr><td colSpan={5}>Costo de repuestos</td><td className="r">{fmt(partsCost)}</td><td /></tr></tfoot>
              </table></div>
              <div className="item-entry">
                <ProductPicker products={repCat ? products.filter((p) => p.category_id === repCat) : products} value={add.product_id} onChange={pickProduct} stock={stock} placeholder="Buscar repuesto por código, fabricante o nombre…" />
                <input type="number" min="0" step="0.001" placeholder="Cantidad" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder="Costo unit." value={add.unit_cost} onChange={(e) => setAdd({ ...add, unit_cost: e.target.value })} />
                <button className="btn" onClick={addPart}>Agregar</button>
              </div>
            </div>

            <div className="form-grid">
              <Field label="Costo de mano de obra"><input type="number" min="0" step="0.01" value={edit.labor_cost} onChange={(e) => set('labor_cost', e.target.value)} /></Field>
              <Field label="Otros costos"><input type="number" min="0" step="0.01" value={edit.other_cost} onChange={(e) => set('other_cost', e.target.value)} /></Field>
              <Field label="Costo total (calculado)"><input readOnly value={fmt(total)} /></Field>
              <Field label="Fecha y hora de finalización"><input type="datetime-local" value={edit.finished_at} onChange={(e) => set('finished_at', e.target.value)} /></Field>
              <Field label="Persona que recibe el equipo"><input value={edit.received_by} onChange={(e) => set('received_by', e.target.value)} /></Field>
              <Field label="Observaciones" full><textarea rows={2} value={edit.observations} onChange={(e) => set('observations', e.target.value)} /></Field>
            </div>
          </fieldset>
        </Modal>)}
    </div>
  );
}
