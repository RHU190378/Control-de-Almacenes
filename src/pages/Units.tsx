import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { fmtQty, num } from '../lib/util';
import { Empty, Field, Modal, PageHeader, SearchBox, norm, useAction, useToast } from '../components/ui';

const blank = { name: '', abbreviation: '', base_unit: '', factor: '', description: '' };

export default function Units() {
  const { units, reload } = useLookups();
  const { isAdmin } = useAuth();
  const run = useAction(); const toast = useToast();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const list = useMemo(() => units.filter((u) => norm(`${u.name} ${u.abbreviation || ''}`).includes(norm(q))), [units, q]);
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const pos = edit?.id ? list.findIndex((u) => u.id === edit.id) : -1;
  const open = (u?: any) => setEdit(u ? { ...blank, ...Object.fromEntries(Object.entries(u).map(([k, v]) => [k, v ?? ''])) } : { ...blank });

  const save = async () => {
    const e = edit;
    if (!e.name.trim()) return toast('Escribe el nombre de la unidad.', 'error');
    if (!String(e.abbreviation).trim()) return toast('Escribe la abreviatura.', 'error');
    if (e.base_unit && num(e.factor) <= 0) return toast('Indica cuántas unidades base contiene.', 'error');
    const payload = { name: e.name.trim(), abbreviation: e.abbreviation.trim(), base_unit: e.base_unit || null, factor: e.base_unit ? num(e.factor) : null, description: e.description?.trim() || null };
    const ok = await run(async () => {
      const r = e.id ? await supabase.from('units').update(payload).eq('id', e.id) : await supabase.from('units').insert(payload);
      if (r.error) throw r.error; return true;
    }, 'Unidad guardada');
    if (ok) { setEdit(null); reload(); }
  };
  const del = async (u: any) => {
    if (!window.confirm(`¿Eliminar la unidad "${u.name}"? Solo se puede si ningún producto la usa.`)) return;
    const ok = await run(async () => { const { error } = await supabase.from('units').delete().eq('id', u.id); if (error) throw error; return true; }, 'Unidad eliminada');
    if (ok) { setEdit(null); reload(); }
  };

  return (
    <div>
      <PageHeader title="Unidades de manejo" subtitle="Litro, bidón, caja, bolsa… Una unidad puede contener otras (ej. Caja = 12 unidades)."
        actions={isAdmin ? <button className="btn btn-primary" onClick={() => open()}>Nueva unidad</button> : undefined} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Buscar unidad…" /></div>
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Nombre</th><th>Abreviatura</th><th>Equivalencia</th><th>Descripción</th>{isAdmin && <th />}</tr></thead>
        <tbody>{list.map((u) => (
          <tr key={u.id} className={isAdmin ? 'clickable' : ''} onClick={() => isAdmin && open(u)}>
            <td><b>{u.name}</b></td><td>{u.abbreviation}</td><td>{u.base_unit && u.factor ? `${fmtQty(u.factor)} ${u.base_unit}` : '—'}</td><td>{u.description}</td>
            {isAdmin && <td><div className="row-actions"><button className="btn btn-sm btn-danger" onClick={(ev) => { ev.stopPropagation(); del(u); }}>Eliminar</button></div></td>}
          </tr>))}</tbody>
      </table>{!list.length && <Empty text="No hay unidades." />}</div>
      {edit && (
        <Modal title={edit.id ? 'Editar unidad' : 'Nueva unidad de manejo'} onClose={() => setEdit(null)}
          footer={<>
            {edit.id && <><button className="btn" disabled={pos <= 0} onClick={() => open(list[pos - 1])}>◀ Anterior</button>
              <button className="btn" disabled={pos < 0 || pos >= list.length - 1} onClick={() => open(list[pos + 1])}>Siguiente ▶</button>
              <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => del(edit)}>Eliminar</button></>}
            <button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
          <div className="form-grid">
            <Field label="Nombre *"><input value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Abreviatura *"><input value={edit.abbreviation} onChange={(e) => set('abbreviation', e.target.value)} /></Field>
            <Field label="Unidad base (si contiene otras)"><select value={edit.base_unit} onChange={(e) => set('base_unit', e.target.value)}>
              <option value="">— ninguna —</option>{units.filter((u) => u.id !== edit.id).map((u) => <option key={u.id} value={u.abbreviation || u.name}>{u.name}</option>)}</select></Field>
            <Field label="Contiene (cantidad de la unidad base)"><input type="number" min="0" step="any" disabled={!edit.base_unit} value={edit.factor} onChange={(e) => set('factor', e.target.value)} /></Field>
            <Field label="Descripción" full><input value={edit.description} onChange={(e) => set('description', e.target.value)} /></Field>
          </div>
        </Modal>)}
    </div>
  );
}
