import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { ASSET_KIND, exportXlsx, fmtQty, num, uploadPhoto } from '../lib/util';
import { Badge, Empty, Field, Modal, PageHeader, SearchBox, norm, useAction, useToast } from '../components/ui';

const PREFIX: Record<string, string> = { machinery: 'MAQ', vehicle: 'VEH', equipment: 'EQU' };
const STATUS: Record<string, string> = { activo: 'Activo', en_reparacion: 'En reparación', inactivo: 'Inactivo', baja: 'De baja' };
const TONE: Record<string, string> = { activo: 'ok', en_reparacion: 'warn', inactivo: 'muted', baja: 'bad' };

export default function Assets({ kind }: { kind: 'machinery' | 'vehicle' | 'equipment' }) {
  const { assets, warehouses, reload } = useLookups();
  const { isAdmin, isSys, profile } = useAuth();
  const run = useAction(); const toast = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const t = norm(q).trim().split(/\s+/).filter(Boolean);
    return assets.filter((a) => a.kind === kind).filter((a) => {
      if (!t.length) return true;
      const hay = norm(`${a.code} ${a.name || ''} ${a.type || ''} ${a.brand || ''} ${a.model || ''} ${a.plate || ''} ${a.serial || ''}`);
      return t.every((w) => hay.includes(w));
    });
  }, [assets, kind, q]);

  const nextCode = () => {
    const nums = assets.filter((a) => a.kind === kind).map((a) => Number(String(a.code).replace(/\D/g, '')) || 0);
    return `${PREFIX[kind]}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
  };
  const blank = () => ({ code: nextCode(), kind, type: '', name: '', brand: '', model: '', year: '', plate: '', serial: '', hourmeter: '', mileage: '', warehouse_id: profile?.warehouse_id || '', status: 'activo', photo_url: '', notes: '' });
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '';

  const photo = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    const url = await run(() => uploadPhoto(f, 'activos'));
    setBusy(false);
    if (url) set('photo_url', url);
  };

  const save = async () => {
    const e = edit;
    if (!e.code.trim()) return toast('Escribe el código.', 'error');
    if (!e.name.trim() && !e.type.trim()) return toast('Escribe el nombre o el tipo.', 'error');
    if (!e.warehouse_id) return toast('Elige el almacén o base.', 'error');
    if (num(e.hourmeter) < 0 || num(e.mileage) < 0) return toast('Horómetro y kilometraje no pueden ser negativos.', 'error');
    const payload: any = {
      code: e.code.trim(), kind, type: e.type?.trim() || null, name: e.name?.trim() || null, brand: e.brand?.trim() || null, model: e.model?.trim() || null,
      year: e.year ? Math.round(num(e.year)) : null, plate: e.plate?.trim() || null, serial: e.serial?.trim() || null,
      hourmeter: e.hourmeter === '' || e.hourmeter == null ? null : num(e.hourmeter), mileage: e.mileage === '' || e.mileage == null ? null : num(e.mileage),
      warehouse_id: e.warehouse_id, status: e.status, photo_url: e.photo_url || null, notes: e.notes?.trim() || null,
    };
    const ok = await run(async () => {
      const r = e.id ? await supabase.from('assets').update(payload).eq('id', e.id) : await supabase.from('assets').insert(payload);
      if (r.error) throw r.error;
      return true;
    }, 'Guardado');
    if (ok) { setEdit(null); reload(); }
  };

  const del = async (a: any) => {
    if (!window.confirm(`¿Eliminar "${a.code}"? Los registros anteriores quedarán sin equipo asociado. Si solo ya no se usa, mejor márcalo como "De baja".`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('assets').delete().eq('id', a.id); if (error) throw error; return true; }, 'Eliminado');
    if (ok) reload();
  };

  const title = ASSET_KIND[kind] === 'Maquinaria' ? 'Maquinaria' : ASSET_KIND[kind] === 'Vehículo' ? 'Vehículos' : 'Equipos';
  const canEdit = (a: any) => isSys || (isAdmin && a.warehouse_id === profile?.warehouse_id);

  return (
    <div>
      <PageHeader title={title} subtitle="Cada uno con su código único y fotografía."
        actions={<>
          <button className="btn" onClick={() => exportXlsx(list.map((a) => ({ codigo: a.code, tipo: a.type, nombre: a.name, marca: a.brand, modelo: a.model, anio: a.year, placa: a.plate, serie: a.serial, horometro: a.hourmeter, kilometraje: a.mileage, base: whName(a.warehouse_id), estado: STATUS[a.status] })), title.toLowerCase())}>Exportar Excel</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(blank())}>Nuevo</button>}
        </>} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar por código, nombre, placa, serie…" /></div>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th /><th>Código</th><th>Tipo / nombre</th><th>Marca y modelo</th><th>Año</th><th>Placa</th><th>Serie</th><th className="r">Horómetro</th><th className="r">Km</th><th>Base</th><th>Estado</th>{isAdmin && <th />}</tr></thead>
        <tbody>{list.map((a) => (
          <tr key={a.id}>
            <td>{a.photo_url ? <img className="thumb" src={a.photo_url} alt="" loading="lazy" /> : <div className="thumb" />}</td>
            <td><b>{a.code}</b></td><td>{[a.type, a.name].filter(Boolean).join(' · ')}</td><td>{[a.brand, a.model].filter(Boolean).join(' ')}</td>
            <td>{a.year}</td><td>{a.plate}</td><td>{a.serial}</td>
            <td className="r">{a.hourmeter != null ? fmtQty(a.hourmeter) : ''}</td><td className="r">{a.mileage != null ? fmtQty(a.mileage) : ''}</td>
            <td>{whName(a.warehouse_id)}</td><td><Badge text={STATUS[a.status] || a.status} tone={TONE[a.status]} /></td>
            {isAdmin && <td>{canEdit(a) && <div className="row-actions"><button className="btn btn-sm" onClick={() => setEdit({ ...blank(), ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v ?? ''])) })}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => del(a)}>Eliminar</button></div>}</td>}
          </tr>))}</tbody>
      </table>{!list.length && <Empty text="No hay registros. Usa el botón Nuevo para agregar el primero." />}</div>

      {edit && (
        <Modal wide title={edit.id ? `Editar ${edit.code}` : `Nuevo (${ASSET_KIND[kind].toLowerCase()})`} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Código único *"><input value={edit.code} onChange={(e) => set('code', e.target.value)} /></Field>
            <Field label="Tipo (tractor, camioneta, bomba…)"><input value={edit.type} onChange={(e) => set('type', e.target.value)} /></Field>
            <Field label="Nombre o descripción" full><input value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Marca"><input value={edit.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Modelo"><input value={edit.model} onChange={(e) => set('model', e.target.value)} /></Field>
            <Field label="Año"><input type="number" min="1900" max="2100" value={edit.year} onChange={(e) => set('year', e.target.value)} /></Field>
            <Field label="Placa"><input value={edit.plate} onChange={(e) => set('plate', e.target.value)} /></Field>
            <Field label="Número de serie"><input value={edit.serial} onChange={(e) => set('serial', e.target.value)} /></Field>
            <Field label="Horómetro"><input type="number" min="0" step="0.1" value={edit.hourmeter} onChange={(e) => set('hourmeter', e.target.value)} /></Field>
            <Field label="Kilometraje"><input type="number" min="0" step="0.1" value={edit.mileage} onChange={(e) => set('mileage', e.target.value)} /></Field>
            <Field label="Almacén / base *">
              <select value={edit.warehouse_id} disabled={!isSys} onChange={(e) => set('warehouse_id', e.target.value)}><option value="">— elegir —</option>{warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </Field>
            <Field label="Estado"><select value={edit.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Observaciones" full><textarea rows={2} value={edit.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
            <Field label="Fotografía" full>
              <div>{edit.photo_url && <img className="thumb" style={{ width: 80, height: 80, marginBottom: 6 }} src={edit.photo_url} alt="" />}
                <input type="file" accept="image/*" onChange={(e) => photo(e.target.files?.[0])} />{busy && <small>Subiendo foto…</small>}</div>
            </Field>
          </div>
        </Modal>)}
    </div>
  );
}
