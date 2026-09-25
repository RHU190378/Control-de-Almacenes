import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Unit } from '../lib/types'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Units() {
  const [rows, setRows] = useState<Unit[]>([])
  const [editing, setEditing] = useState<Unit | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [abbr, setAbbr] = useState('')
  const [deleting, setDeleting] = useState<Unit | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase.from('units').select('*').order('name')
    setRows((data as Unit[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  function openNew() {
    setEditing(null)
    setName('')
    setAbbr('')
    setError(null)
    setShowForm(true)
  }
  function openEdit(u: Unit) {
    setEditing(u)
    setName(u.name)
    setAbbr(u.abbreviation ?? '')
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const payload = { name, abbreviation: abbr || null }
    const result = editing
      ? await supabase.from('units').update(payload).eq('id', editing.id)
      : await supabase.from('units').insert(payload)
    if (result.error) return setError(result.error.message)
    setShowForm(false)
    load()
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('units').delete().eq('id', deleting.id)
    if (error) setError(error.message)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Unidades de manejo</h1>
        <button className="btn-primary" onClick={openNew}>
          <Plus size={18} /> Nueva unidad
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Abreviatura</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.abbreviation || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-500 hover:text-brand-600" onClick={() => openEdit(u)}>
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-500 hover:text-red-600" onClick={() => setDeleting(u)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin unidades todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar unidad' : 'Nueva unidad'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Caja, Kilogramo, Unidad..." />
            </div>
            <div>
              <label className="label">Abreviatura</label>
              <input className="input" value={abbr} onChange={(e) => setAbbr(e.target.value)} placeholder="cja, kg, und..." />
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
          message={`¿Eliminar la unidad "${deleting.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
