import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Category } from '../lib/types'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Categories() {
  const [rows, setRows] = useState<Category[]>([])
  const [editing, setEditing] = useState<Category | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'activo' | 'inactivo'>('activo')
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('categories').select('*').order('name')
    setRows((data as Category[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setEditing(null)
    setName('')
    setStatus('activo')
    setError(null)
    setShowForm(true)
  }
  function openEdit(c: Category) {
    setEditing(c)
    setName(c.name)
    setStatus(c.status)
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const result = editing
      ? await supabase.from('categories').update({ name, status }).eq('id', editing.id)
      : await supabase.from('categories').insert({ name, status })
    if (result.error) return setError(result.error.message)
    setShowForm(false)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('categories').delete().eq('id', deleting.id)
    if (error) setError(error.message)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Categorías</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={18} /> Nueva categoría
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-500 hover:text-brand-600" onClick={() => openEdit(c)}>
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-500 hover:text-red-600" onClick={() => setDeleting(c)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin categorías todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'activo')}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`¿Eliminar la categoría "${deleting.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
