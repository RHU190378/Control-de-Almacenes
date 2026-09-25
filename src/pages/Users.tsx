import { useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { useAuth } from '../context/AuthContext'
import type { Profile, Role, Warehouse } from '../lib/types'
import { ROLE_LABELS } from '../lib/types'
import Modal from '../components/Modal'

interface Row extends Profile {
  user_warehouses?: { warehouse_id: string }[]
}

export default function Users() {
  const { isAdminSistema, profile: me } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // formulario
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('usuario')
  const [status, setStatus] = useState<'activo' | 'inactivo'>('activo')
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([])

  async function load() {
    const [{ data: profiles }, { data: allWh }] = await Promise.all([
      supabase.from('profiles').select('*, user_warehouses(warehouse_id)').order('created_at'),
      supabase.from('warehouses').select('*').order('name'),
    ])
    setRows((profiles as Row[]) ?? [])
    setWarehouses((allWh as Warehouse[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setEditing(null)
    setFullName('')
    setEmail('')
    setPassword('')
    setRole('usuario')
    setStatus('activo')
    setSelectedWarehouses([])
    setError(null)
    setShowForm(true)
  }

  function openEdit(u: Row) {
    setEditing(u)
    setFullName(u.full_name)
    setEmail('')
    setPassword('')
    setRole(u.role)
    setStatus(u.status)
    setSelectedWarehouses((u.user_warehouses ?? []).map((w) => w.warehouse_id))
    setError(null)
    setShowForm(true)
  }

  function toggleWarehouse(id: string) {
    setSelectedWarehouses((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]))
  }

  async function saveWarehouseAssignments(userId: string) {
    await supabase.from('user_warehouses').delete().eq('user_id', userId)
    if (selectedWarehouses.length > 0) {
      await supabase
        .from('user_warehouses')
        .insert(selectedWarehouses.map((warehouse_id) => ({ user_id: userId, warehouse_id })))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      if (editing) {
        const { error: updError } = await supabase
          .from('profiles')
          .update({ full_name: fullName, role, status })
          .eq('id', editing.id)
        if (updError) throw updError
        await saveWarehouseAssignments(editing.id)
      } else {
        // Se usa un cliente secundario (sin sesión persistente) para no
        // reemplazar la sesión del administrador que está creando el usuario.
        const { data, error: signUpError } = await supabaseAdmin.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (signUpError) throw signUpError
        const newUserId = data.user?.id
        if (!newUserId) throw new Error('No se pudo crear el usuario')

        // El nuevo usuario queda con rol "usuario" por defecto (vía trigger).
        // Si el administrador eligió otro rol, lo actualizamos aquí.
        if (role !== 'usuario') {
          const { error: roleError } = await supabase
            .from('profiles')
            .update({ role, status })
            .eq('id', newUserId)
          if (roleError) throw roleError
        } else if (status !== 'activo') {
          await supabase.from('profiles').update({ status }).eq('id', newUserId)
        }
        await saveWarehouseAssignments(newUserId)
      }
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const canEditRole = isAdminSistema
  const roleOptions: Role[] = isAdminSistema ? ['admin_sistema', 'admin_almacen', 'usuario'] : ['usuario']

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={18} /> Nuevo usuario
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Almacenes</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">
                  {u.full_name} {u.id === me?.id && <span className="text-xs text-slate-400">(tú)</span>}
                </td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3">
                  {(u.user_warehouses ?? [])
                    .map((uw) => warehouses.find((w) => w.id === uw.warehouse_id)?.name)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-slate-500 hover:text-brand-600" onClick={() => openEdit(u)}>
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin usuarios visibles.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Nombre completo</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Contraseña</label>
                  <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Rol</label>
                <select
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  disabled={!canEditRole && !!editing}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'activo')}
                  disabled={!canEditRole && !!editing}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Almacenes asignados</label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {warehouses.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedWarehouses.includes(w.id)}
                      onChange={() => toggleWarehouse(w.id)}
                    />
                    {w.name}
                  </label>
                ))}
                {warehouses.length === 0 && (
                  <p className="text-xs text-slate-400">Primero crea al menos un almacén.</p>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
