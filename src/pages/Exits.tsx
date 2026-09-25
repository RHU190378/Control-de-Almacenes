import { useEffect, useState } from 'react'
import { Plus, Trash2, Eye } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Customer, Product, Warehouse } from '../lib/types'
import Modal from '../components/Modal'

interface ExitRow {
  id: string
  exit_number: string
  exit_date: string
  warehouse_id: string
  customer_id: string | null
  observation: string | null
  total: number
  warehouses?: { name: string }
  customers?: { name: string } | null
}

interface ItemLine {
  key: number
  product_id: string
  quantity: string
  unit_price: string
}

function emptyLine(key: number): ItemLine {
  return { key, product_id: '', quantity: '1', unit_price: '0' }
}

export default function Exits() {
  const { isAdminSistema, warehouses: myWarehouses } = useAuth()
  const [rows, setRows] = useState<ExitRow[]>([])
  const [warehouseOptions, setWarehouseOptions] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  const [showForm, setShowForm] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [observation, setObservation] = useState('')
  const [lines, setLines] = useState<ItemLine[]>([emptyLine(1)])
  const [nextKey, setNextKey] = useState(2)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [viewing, setViewing] = useState<ExitRow | null>(null)
  const [viewItems, setViewItems] = useState<any[]>([])

  async function load() {
    const { data } = await supabase
      .from('exits')
      .select('*, warehouses(name), customers(name)')
      .order('exit_date', { ascending: false })
      .limit(100)
    setRows((data as ExitRow[]) ?? [])
  }

  async function loadCatalogs() {
    const [{ data: prods }, { data: custs }] = await Promise.all([
      supabase.from('products').select('*').eq('status', 'activo').order('name'),
      supabase.from('customers').select('*').eq('status', 'activo').order('name'),
    ])
    setProducts((prods as Product[]) ?? [])
    setCustomers((custs as Customer[]) ?? [])
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
    setCustomerId('')
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

  function productPrice(id: string) {
    return products.find((p) => p.id === id)?.price ?? 0
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
        unit_price: Number(l.unit_price) || 0,
      }))
      if (items.some((i) => !i.product_id || !i.quantity || i.quantity <= 0)) {
        throw new Error('Revisa que todas las líneas tengan producto y cantidad mayor a 0')
      }
      const { error: rpcError } = await supabase.rpc('confirm_exit', {
        p_warehouse_id: warehouseId,
        p_customer_id: customerId || null,
        p_observation: observation || null,
        p_items: items,
      })
      if (rpcError) throw rpcError
      setShowForm(false)
      load()
    } catch (err: any) {
      // El mensaje de "stock insuficiente" viene directo de la base de datos
      setError(err.message ?? 'Error al registrar la salida')
    } finally {
      setSaving(false)
    }
  }

  async function openView(row: ExitRow) {
    setViewing(row)
    const { data } = await supabase
      .from('exit_items')
      .select('*, products(name, code)')
      .eq('exit_id', row.id)
    setViewItems(data ?? [])
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Salidas</h1>
        <button className="btn-primary" onClick={openNew} disabled={warehouseOptions.length === 0}>
          <Plus size={18} /> Nueva salida
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">N°</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Almacén</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{r.exit_number}</td>
                <td className="px-4 py-3">{new Date(r.exit_date).toLocaleString()}</td>
                <td className="px-4 py-3">{r.warehouses?.name}</td>
                <td className="px-4 py-3">{r.customers?.name ?? '—'}</td>
                <td className="px-4 py-3">{Number(r.total).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="text-slate-500 hover:text-brand-600" onClick={() => openView(r)}>
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin salidas todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Nueva salida" onClose={() => setShowForm(false)} wide>
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
                <label className="label">Cliente</label>
                <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">Sin cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
                      className="input col-span-6"
                      value={l.product_id}
                      onChange={(e) =>
                        updateLine(l.key, { product_id: e.target.value, unit_price: String(productPrice(e.target.value)) })
                      }
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
                    <input
                      className="input col-span-3" type="number" min="0" step="0.01" placeholder="Precio"
                      value={l.unit_price} onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                    />
                    <button type="button" className="col-span-1 text-slate-400 hover:text-red-600" onClick={() => removeLine(l.key)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Guardando…' : 'Confirmar salida'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title={`Salida ${viewing.exit_number}`} onClose={() => setViewing(null)} wide>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-1">Producto</th>
                <th className="py-1">Cantidad</th>
                <th className="py-1">Precio</th>
                <th className="py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {viewItems.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-2">{it.products?.code} — {it.products?.name}</td>
                  <td className="py-2">{it.quantity}</td>
                  <td className="py-2">{Number(it.unit_price).toFixed(2)}</td>
                  <td className="py-2">{Number(it.total).toFixed(2)}</td>
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
