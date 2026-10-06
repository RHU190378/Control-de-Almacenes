import { useState } from 'react';
import { supabase, tempClient } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { ROLE_LABEL, errMsg } from '../lib/util';
import { Badge, Empty, Field, Modal, PageHeader, useAction, useToast } from '../components/ui';

const blank = { id: '', full_name: '', email: '', password: '', role: 'user', warehouse_id: '', active: true };

export default function Users() {
  const { profiles, warehouses, reload } = useLookups();
  const { profile: me } = useAuth();
  const run = useAction(); const toast = useToast();
  const [edit, setEdit] = useState<any | null>(null);
  const [newPass, setNewPass] = useState('');
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  const isNew = edit && !edit.id;
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || '—';

  const save = async () => {
    if (!edit.full_name.trim()) return toast('Escribe el nombre completo.', 'error');
    if (edit.role !== 'system_admin' && !edit.warehouse_id) return toast('Elige el almacén de este usuario.', 'error');
    const fields = { full_name: edit.full_name.trim(), role: edit.role, warehouse_id: edit.role === 'system_admin' ? null : edit.warehouse_id, active: edit.active };

    if (isNew) {
      if (!/^\S+@\S+\.\S+$/.test(edit.email.trim())) return toast('Escribe un correo válido.', 'error');
      if (edit.password.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
      const ok = await run(async () => {
        const tmp = tempClient();
        const { data, error } = await tmp.auth.signUp({ email: edit.email.trim(), password: edit.password, options: { data: { full_name: fields.full_name } } });
        if (error) throw error;
        const uid = data.user?.id;
        if (!uid) throw new Error('No se pudo crear la cuenta. Revisa que "Confirm email" esté desactivado en Supabase.');
        const { error: e2 } = await supabase.from('profiles').update({ ...fields, active: true }).eq('id', uid);
        if (e2) { reload(); throw new Error('La cuenta se creó pero no se pudo activar: ' + errMsg(e2) + ' Búscala en la lista, edítala y actívala.'); }
        return true;
      }, 'Usuario creado');
      if (ok) { setEdit(null); reload(); }
      return;
    }
    const ok = await run(async () => { const { error } = await supabase.from('profiles').update(fields).eq('id', edit.id); if (error) throw error; return true; }, 'Usuario actualizado');
    if (ok) { setEdit(null); reload(); }
  };

  const resetPass = async () => {
    if (newPass.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
    const ok = await run(async () => { const { error } = await supabase.rpc('admin_set_password', { p_user: edit.id, p_password: newPass }); if (error) throw error; return true; }, 'Contraseña cambiada');
    if (ok) setNewPass('');
  };
  const del = async () => {
    if (!window.confirm(`¿Eliminar definitivamente a ${edit.full_name}? Sus notas anteriores se conservan.`)) return;
    const ok = await run(async () => { const { error } = await supabase.rpc('admin_delete_user', { p_user: edit.id }); if (error) throw error; return true; }, 'Usuario eliminado');
    if (ok) { setEdit(null); reload(); }
  };

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Hasta 3 administradores de sistema y 2 administradores por almacén. Los usuarios de almacén son ilimitados."
        actions={<button className="btn btn-primary" onClick={() => setEdit({ ...blank })}>Nuevo usuario</button>} />
      <div className="table-wrap"><table className="grid">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Almacén</th><th>Estado</th><th /></tr></thead>
        <tbody>
          {profiles.map((p) => (
            <tr key={p.id}><td><b>{p.full_name}</b>{p.id === me?.id && <small> (tú)</small>}</td><td>{p.email}</td><td>{ROLE_LABEL[p.role]}</td>
              <td>{p.role === 'system_admin' ? 'Todos' : whName(p.warehouse_id)}</td>
              <td><Badge text={p.active ? 'Activo' : 'Inactivo'} tone={p.active ? 'ok' : 'muted'} /></td>
              <td><div className="row-actions"><button className="btn btn-sm" onClick={() => { setNewPass(''); setEdit({ ...blank, ...p, warehouse_id: p.warehouse_id || '' }); }}>Editar</button></div></td></tr>))}
        </tbody></table>{!profiles.length && <Empty text="No hay usuarios." />}</div>

      {edit && (
        <Modal title={isNew ? 'Nuevo usuario' : 'Editar usuario'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" onClick={save}>{isNew ? 'Crear usuario' : 'Guardar'}</button></>}>
          <div className="form-grid">
            <Field label="Nombre completo *" full><input value={edit.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
            <Field label="Correo *" full><input type="email" value={edit.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} /></Field>
            {isNew && <Field label="Contraseña inicial * (mínimo 6)" full><input type="text" value={edit.password} onChange={(e) => set('password', e.target.value)} autoComplete="off" /></Field>}
            <Field label="Rol *">
              <select value={edit.role} onChange={(e) => set('role', e.target.value)}>
                {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            {edit.role !== 'system_admin' && (
              <Field label="Almacén *">
                <select value={edit.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)}>
                  <option value="">— Elegir —</option>
                  {warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </Field>)}
            <label className="check"><input type="checkbox" checked={edit.active} onChange={(e) => set('active', e.target.checked)} /> Activo (puede ingresar)</label>
          </div>
          {!isNew && (
            <div className="panel" style={{ marginTop: 16, marginBottom: 0 }}>
              <h3>Cambiar contraseña de este usuario</h3>
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <input type="text" placeholder="Nueva contraseña" value={newPass} onChange={(e) => setNewPass(e.target.value)} autoComplete="off" />
                <button className="btn" onClick={resetPass}>Cambiar</button>
              </div>
              {edit.id !== me?.id && <div style={{ marginTop: 12 }}><button className="btn btn-danger" onClick={del}>Eliminar usuario</button></div>}
            </div>)}
        </Modal>)}
    </div>
  );
}
