import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Warehouse } from '../lib/types'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

const EMPTY = { code: '', name: '', address: '', phone: '', responsible: '', status: 'activo' as const }

export default function Warehouses() {
  const [rows, setRows] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [deleting, setDeleting] = useState<Warehouse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('warehouses').select('*').order('name')
    setRows((data as Warehouse[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
    setShowForm(true)
  }

  function openEdit(w: Warehouse) {
    setEditing(w)
    setForm({
      code: w.code,
      name: w.name,
      address: w.address ?? '',
      phone: w.phone ?? '',
      responsible: w.responsible ?? '',
      status: w.status as 'activo',
    })
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = { ...form }
    const result = editing
      ? await supabase.from('warehouses').update(payload).eq('id', editing.id)
      : await supabase.from('warehouses').insert(payload)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setShowForm(false)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('warehouses').delete().eq('id', deleting.id)
    if (error) {
      setError(error.message)
    }
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Almacenes</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={18} /> Nuevo almacén
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.map((w) => (
              <tr key={w.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{w.code}</td>
                <td className="px-4 py-3">{w.name}</td>
                <td className="px-4 py-3">{w.responsible || '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      w.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {w.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-500 hover:text-brand-600" onClick={() => openEdit(w)}>
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-500 hover:text-red-600" onClick={() => setDeleting(w)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Todavía no hay almacenes registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar almacén' : 'Nuevo almacén'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Código</label>
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Nombre</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input
                className="input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Responsable</label>
              <input
                className="input"
                value={form.responsible}
                onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Estado</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'activo' })}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`¿Eliminar el almacén "${deleting.name}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
