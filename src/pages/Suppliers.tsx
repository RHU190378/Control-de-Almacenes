import { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { Badge, Empty, Field, Modal, PageHeader, SearchBox, norm, useAction, useToast } from '../components/ui';

const blank = { name: '', kind: '', contact: '', phone: '', email: '', address: '', active: true };

export default function Suppliers() {
  const { suppliers, reload } = useLookups();
  const { isAdmin } = useAuth();
  const run = useAction(); const toast = useToast();
  const [q, setQ] = useState(''); const [edit, setEdit] = useState<any | null>(null);

  const rows = suppliers.filter((s) => norm(`${s.name} ${s.contact} ${s.phone} ${s.email} ${s.kind}`).includes(norm(q)));

  const save = async () => {
    if (!edit.name.trim()) return toast('Escribe el nombre o razón social.', 'error');
    const { id, created_at, ...payload } = edit;
    const ok = await run(async () => {
      const r = id ? await supabase.from('suppliers').update(payload).eq('id', id) : await supabase.from('suppliers').insert(payload);
      if (r.error) throw r.error; return true;
    }, 'Proveedor guardado');
    if (ok) { setEdit(null); reload(); }
  };
  const del = async (s: any) => {
    if (!window.confirm(`¿Eliminar a "${s.name}"? Si ya tiene movimientos, mejor márcalo como inactivo.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('suppliers').delete().eq('id', s.id); if (error) throw error; return true; }, 'Proveedor eliminado');
    if (ok) reload();
  };
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });

  return (
    <div>
      <PageHeader title="Proveedores" actions={isAdmin && <button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>Nuevo proveedor</button>} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar proveedor…" /></div>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Nombre / razón social</th><th>Tipo</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Estado</th>{isAdmin && <th />}</tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}><td><b>{s.name}</b><div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{s.address}</div></td><td>{s.kind}</td><td>{s.contact}</td><td>{s.phone}</td><td>{s.email}</td>
              <td><Badge text={s.active ? 'Activo' : 'Inactivo'} tone={s.active ? 'ok' : 'muted'} /></td>
              {isAdmin && <td><div className="row-actions"><button className="btn btn-sm" onClick={() => setEdit({ ...blank, ...s })}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => del(s)}>Eliminar</button></div></td>}
            </tr>))}
        </tbody>
      </table>{!rows.length && <Empty text="No hay proveedores." />}</div>
      {edit && (
        <Modal title={edit.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Nombre / razón social *" full><input value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Tipo (combustible, repuestos…)"><input value={edit.kind || ''} onChange={(e) => set('kind', e.target.value)} /></Field>
            <Field label="Contacto"><input value={edit.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
            <Field label="Teléfono"><input value={edit.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Email"><input type="email" value={edit.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Dirección" full><input value={edit.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} /> Activo</label>
          </div>
        </Modal>)}
    </div>
  );
}
