import { useState } from 'react';
import { supabase } from '../supabase';
import { useLookups } from '../lib/lookups';
import { Badge, Empty, Field, Modal, PageHeader, useAction, useToast } from '../components/ui';

const blank = { code: '', name: '', address: '', phone: '', is_central: false, active: true };

export default function Warehouses() {
  const { warehouses, reload } = useLookups();
  const run = useAction(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });

  const save = async () => {
    if (!edit.name.trim()) return toast('Escribe el nombre del almacén.', 'error');
    const { id, created_at, ...payload } = edit;
    payload.code = payload.code?.trim() || null;
    const ok = await run(async () => {
      const r = id ? await supabase.from('warehouses').update(payload).eq('id', id) : await supabase.from('warehouses').insert(payload);
      if (r.error) throw new Error(/one_central/.test(r.error.message) ? 'Ya existe un almacén central. Quita esa marca del otro almacén primero.' : r.error.message);
      return true;
    }, 'Almacén guardado');
    if (ok) { setEdit(null); reload(); }
  };
  const del = async (w: any) => {
    if (!window.confirm(`¿Eliminar "${w.name}"? Solo es posible si no tiene movimientos. Si no, márcalo como inactivo.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('warehouses').delete().eq('id', w.id); if (error) throw error; return true; }, 'Almacén eliminado');
    if (ok) reload();
  };

  return (
    <div>
      <PageHeader title="Almacenes" subtitle="Un almacén central y los almacenes operativos que necesites."
        actions={<button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>Nuevo almacén</button>} />
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Dirección</th><th>Teléfono</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {warehouses.map((w) => (
            <tr key={w.id}><td>{w.code}</td><td><b>{w.name}</b></td><td>{w.is_central ? <Badge text="Central" tone="info" /> : 'Operativo'}</td><td>{w.address}</td><td>{w.phone}</td>
              <td><Badge text={w.active ? 'Activo' : 'Inactivo'} tone={w.active ? 'ok' : 'muted'} /></td>
              <td><div className="row-actions"><button className="btn btn-sm" onClick={() => setEdit({ ...blank, ...w })}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => del(w)}>Eliminar</button></div></td></tr>))}
        </tbody></table>{!warehouses.length && <Empty text="No hay almacenes." />}</div>
      {edit && (
        <Modal title={edit.id ? 'Editar almacén' : 'Nuevo almacén'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Nombre *" full><input value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Código (opcional)"><input value={edit.code || ''} onChange={(e) => set('code', e.target.value)} /></Field>
            <Field label="Teléfono"><input value={edit.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Dirección" full><input value={edit.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={edit.is_central} onChange={(e) => set('is_central', e.target.checked)} /> Es el almacén central</label>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} /> Activo</label>
          </div>
        </Modal>)}
    </div>
  );
}
