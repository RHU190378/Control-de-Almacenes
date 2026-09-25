import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, ImageOff } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import type { Category, Product, Unit } from '../lib/types'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'

const EMPTY = {
  code: '',
  name: '',
  category_id: '',
  unit_id: '',
  price: '0',
  min_stock: '0',
  status: 'activo' as const,
}

export default function Products() {
  const [rows, setRows] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const [{ data: prods }, { data: cats }, { data: uns }] = await Promise.all([
      supabase.from('products').select('*, categories(name), units(name, abbreviation)').order('name'),
      supabase.from('categories').select('*').eq('status', 'activo').order('name'),
      supabase.from('units').select('*').order('name'),
    ])
    setRows((prods as Product[]) ?? [])
    setCategories((cats as Category[]) ?? [])
    setUnits((uns as Unit[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const filtered = rows.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setEditing(null)
    setForm(EMPTY)
    setImageFile(null)
    setError(null)
    setShowForm(true)
  }
  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      code: p.code,
      name: p.name,
      category_id: p.category_id ?? '',
      unit_id: p.unit_id ?? '',
      price: String(p.price),
      min_stock: String(p.min_stock),
      status: p.status as 'activo',
    })
    setImageFile(null)
    setError(null)
    setShowForm(true)
  }

  async function uploadImage(productCode: string): Promise<string | null> {
    if (!imageFile) return editing?.image_url ?? null
    const ext = imageFile.name.split('.').pop()
    const path = `${productCode}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(path, imageFile, { upsert: true })
    if (uploadError) {
      // Si el bucket todavía no existe, seguimos guardando el producto sin imagen
      // en vez de bloquear todo el formulario.
      console.warn('No se pudo subir la imagen:', uploadError.message)
      return editing?.image_url ?? null
    }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const image_url = await uploadImage(form.code)
      const payload = {
        code: form.code,
        name: form.name,
        category_id: form.category_id || null,
        unit_id: form.unit_id || null,
        price: Number(form.price) || 0,
        min_stock: Number(form.min_stock) || 0,
        status: form.status,
        image_url,
      }
      const result = editing
        ? await supabase.from('products').update(payload).eq('id', editing.id)
        : await supabase.from('products').insert(payload)
      if (result.error) throw result.error
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    const { error } = await supabase.from('products').delete().eq('id', deleting.id)
    if (error) setError(error.message)
    setDeleting(null)
    load()
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por código o nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn-primary shrink-0" onClick={openNew}>
            <Plus size={18} /> Nuevo
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  {p.image_url ? (
                    <img src={p.image_url} className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-slate-300">
                      <ImageOff size={16} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{p.code}</td>
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3">{p.categories?.name ?? '—'}</td>
                <td className="px-4 py-3">{p.units?.abbreviation ?? p.units?.name ?? '—'}</td>
                <td className="px-4 py-3">{p.price.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="mr-2 text-slate-500 hover:text-brand-600" onClick={() => openEdit(p)}>
                    <Pencil size={16} />
                  </button>
                  <button className="text-slate-500 hover:text-red-600" onClick={() => setDeleting(p)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">Sin productos todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title={editing ? 'Editar producto' : 'Nuevo producto'} onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Código</label>
                <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div>
                <label className="label">Nombre</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Categoría</label>
                <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Unidad de manejo</label>
                <select className="input" value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })}>
                  <option value="">Sin unidad</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Precio</label>
                <input type="number" step="0.01" min="0" className="input" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div>
                <label className="label">Stock mínimo</label>
                <input type="number" step="0.01" min="0" className="input" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Imagen</label>
              <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-xs text-slate-400">
                Requiere el bucket "product-images" creado en Supabase Storage.
              </p>
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'activo' })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
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

      {deleting && (
        <ConfirmDialog
          message={`¿Eliminar el producto "${deleting.name}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
