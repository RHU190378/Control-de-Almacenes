import { useState } from 'react';
import { supabase } from '../supabase';
import { useLookups } from '../lib/lookups';
import { Badge, Empty, Field, Modal, PageHeader, useAction, useToast } from '../components/ui';

function SimpleCrud({ title, table, rows, fields, reload, hasActive }: {
  title: string; table: string; rows: any[]; reload: () => void; hasActive?: boolean;
  fields: { key: string; label: string }[];
}) {
  const run = useAction(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const save = async () => {
    if (!String(edit[fields[0].key] || '').trim()) return toast(`Escribe: ${fields[0].label}`, 'error');
    const { id, ...payload } = edit;
    const ok = await run(async () => {
      const r = id ? await supabase.from(table).update(payload).eq('id', id) : await supabase.from(table).insert(payload);
      if (r.error) throw r.error; return true;
    }, 'Guardado');
    if (ok) { setEdit(null); reload(); }
  };
  const del = async (r: any) => {
    if (!window.confirm(`¿Eliminar "${r[fields[0].key]}"? Solo se puede si no está en uso.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from(table).delete().eq('id', r.id); if (error) throw error; return true; }, 'Eliminado');
    if (ok) reload();
  };
  const blank = Object.fromEntries([...fields.map((f) => [f.key, '']), ...(hasActive ? [['active', true]] : [])]);
  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>{title}</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({ ...blank })}>Agregar</button></div>
      <div className="table-wrap"><table className="grid">
        <thead><tr>{fields.map((f) => <th key={f.key}>{f.label}</th>)}{hasActive && <th>Estado</th>}<th /></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>{fields.map((f) => <td key={f.key}>{r[f.key]}</td>)}
            {hasActive && <td><Badge text={r.active ? 'Activa' : 'Inactiva'} tone={r.active ? 'ok' : 'muted'} /></td>}
            <td><div className="row-actions"><button className="btn btn-sm" onClick={() => setEdit({ ...r })}>Editar</button><button className="btn btn-sm btn-danger" onClick={() => del(r)}>Eliminar</button></div></td></tr>))}
        </tbody></table>{!rows.length && <Empty text="Sin registros." />}</div>
      {edit && (
        <Modal title={edit.id ? `Editar` : `Agregar`} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            {fields.map((f) => <Field key={f.key} label={f.label} full><input value={edit[f.key] || ''} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} /></Field>)}
            {hasActive && <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Activa</label>}
          </div>
        </Modal>)}
    </div>
  );
}

export default function Categories() {
  const { categories, reload } = useLookups();
  return (
    <div>
      <PageHeader title="Categorías" subtitle="Categorías de productos. Las unidades de manejo se registran en su propia pantalla (menú Catálogo)." />
      <SimpleCrud title="Categorías" table="categories" rows={categories} reload={reload} hasActive fields={[{ key: 'name', label: 'Nombre' }]} />
    </div>
  );
}
