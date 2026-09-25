import { useEffect, useState } from 'react'
import { Plus, Trash2, Eye } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Product, Supplier, Unit, Warehouse } from '../lib/types'
import Modal from '../components/Modal'

interface EntryRow {
  id: string
  entry_number: string
  entry_date: string
  warehouse_id: string
  supplier_id: string | null
  observation: string | null
  warehouses?: { name: string }
  suppliers?: { company_name: string } | null
}

interface ItemLine {
  key: number
  product_id: string
  quantity: string
  unit_id: string
  unit_price: string
  final_price: string
  expiry_date: string
}

function emptyLine(key: number): ItemLine {
  return { key, product_id: '', quantity: '1', unit_id: '', unit_price: '0', final_price: '0', expiry_date: '' }
}

export default function Entries() {
  const { isAdminSistema, warehouses: myWarehouses } = useAuth()
  const [rows, setRows] = useState<EntryRow[]>([])
  const [warehouseOptions, setWarehouseOptions] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [showForm, setShowForm] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [observation, setObservation] = useState('')
  const [lines, setLines] = useState<ItemLine[]>([emptyLine(1)])
  const [nextKey, setNextKey] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [viewing, setViewing] = useState<EntryRow | null>(null)
  const [viewItems, setViewItems] = useState<any[]>([])

  async function load() {
    const { data } = await supabase
      .from('entries')
      .select('*, warehouses(name), suppliers(company_name)')
      .order('entry_date', { ascending: false })
      .limit(100)
    setRows((data as EntryRow[]) ?? [])
  }

  async function loadCatalogs() {
    const [{ data: prods }, { data: uns }, { data: sups }] = await Promise.all([
      supabase.from('products').select('*').eq('status', 'activo').order('name'),
      supabase.from('units').select('*').order('name'),
      supabase.from('suppliers').select('*').eq('status', 'activo').order('company_name'),
    ])
    setProducts((prods as Product[]) ?? [])
    setUnits((uns as Unit[]) ?? [])
    setSuppliers((sups as Supplier[]) ?? [])
    if (isAdminSistema) {
      const { data: allWh } = await supabase.from('warehouses').select('*').eq('status', 'activo').order('name')
      setWarehouseOptions((allWh as Warehouse[]) ?? [])
    } else {
      setWarehouseOptions(myWarehouses)
    }
  }

  useEffect(() => {
    load()
  }, [])
  useEffect(() => {
    loadCatalogs()
  }, [isAdminSistema, myWarehouses])

  function openNew() {
    setWarehouseId(warehouseOptions[0]?.id ?? '')
    setSupplierId('')
    setObservation('')
    setLines([emptyLine(1)])
    setNextKey(2)
    setError(null)
    setShowForm(true)
  }

  function updateLine(key: number, patch: Partial<ItemLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine(nextKey)])
    setNextKey((k) => k + 1)
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!warehouseId) return setError('Selecciona un almacén')
    setSaving(true)
    try {
      const items = lines.map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_id: l.unit_id || null,
        unit_price: Number(l.unit_price) || 0,
        final_price: Number(l.final_price) || Number(l.unit_price) * Number(l.quantity) || 0,
        expiry_date: l.expiry_date || null,
      }))
      if (items.some((i) => !i.product_id || !i.quantity || i.quantity <= 0)) {
        throw new Error('Revisa que todas las líneas tengan producto y cantidad mayor a 0')
      }
      const { error: rpcError } = await supabase.rpc('confirm_entry', {
        p_warehouse_id: warehouseId,
        p_supplier_id: supplierId || null,
        p_observation: observation || null,
        p_items: items,
      })
      if (rpcError) throw rpcError
      setShowForm(false)
      load()
    } catch (err: any) {
      setError(err.message ?? 'Error al registrar la entrada')
    } finally {
      setSaving(false)
    }
  }

  async function openView(row: EntryRow) {
    setViewing(row)
    const { data } = await supabase
      .from('entry_items')
      .select('*, products(name, code), units(abbreviation, name)')
      .eq('entry_id', row.id)
    setViewItems(data ?? [])
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Entradas</h1>
        <button className="btn-primary" onClick={openNew} disabled={warehouseOptions.length === 0}>
          <Plus size={18} /> Nueva entrada
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Almacén</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{r.entry_number}</td>
                <td className="px-4 py-3">{new Date(r.entry_date).toLocaleString()}</td>
                <td className="px-4 py-3">{r.warehouses?.name}</td>
                <td className="px-4 py-3">{r.suppliers?.company_name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-slate-500 hover:text-brand-600" onClick={() => openView(r)}>
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin entradas todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nueva entrada" onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Almacén</label>
                <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  <option value="">Selecciona…</option>
                  {warehouseOptions.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Proveedor</label>
                <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.company_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Observación</label>
              <input className="input" value={observation} onChange={(e) => setObservation(e.target.value)} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="label !mb-0">Productos</label>
                <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={addLine}>
                  <Plus size={14} /> Agregar línea
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 p-2">
                    <select
                      className="input col-span-4"
                      value={l.product_id}
                      onChange={(e) => updateLine(l.key, { product_id: e.target.value })}
                      required
                    >
                      <option value="">Producto…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                      ))}
                    </select>
                    <input
                      className="input col-span-2" type="number" min="0.01" step="0.01" placeholder="Cant."
                      value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} required
                    />
                    <select
                      className="input col-span-2"
                      value={l.unit_id} onChange={(e) => updateLine(l.key, { unit_id: e.target.value })}
                    >
                      <option value="">Unidad</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.abbreviation || u.name}</option>
                      ))}
                    </select>
                    <input
                      className="input col-span-2" type="number" min="0" step="0.01" placeholder="Precio"
                      value={l.unit_price} onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                    />
                    <input
                      className="input col-span-1" type="date" value={l.expiry_date}
                      onChange={(e) => updateLine(l.key, { expiry_date: e.target.value })}
                      title="Fecha de vencimiento (opcional)"
                    />
                    <button type="button" className="col-span-1 text-slate-400 hover:text-red-600" onClick={() => removeLine(l.key)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Guardando…' : 'Confirmar entrada'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title={`Entrada ${viewing.entry_number}`} onClose={() => setViewing(null)} wide>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Producto</th>
                <th className="py-1">Cantidad</th>
                <th className="py-1">Precio</th>
                <th className="py-1">Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {viewItems.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-2">{it.products?.code} — {it.products?.name}</td>
                  <td className="py-2">{it.quantity} {it.units?.abbreviation ?? ''}</td>
                  <td className="py-2">{Number(it.unit_price).toFixed(2)}</td>
                  <td className="py-2">{it.expiry_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {viewing.observation && <p className="mt-3 text-sm text-slate-500">Observación: {viewing.observation}</p>}
        </Modal>
      )}
    </div>
  )
}
