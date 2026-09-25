import { useEffect, useState } from 'react'
import { Warehouse, Package, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { profile, warehouses, isAdminSistema } = useAuth()
  const [counts, setCounts] = useState({ warehouses: 0, products: 0, users: 0 })

  useEffect(() => {
    async function load() {
      const [w, p, u] = await Promise.all([
        supabase.from('warehouses').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ])
      setCounts({
        warehouses: w.count ?? 0,
        products: p.count ?? 0,
        users: u.count ?? 0,
      })
    }
    load()
  }, [])

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Hola, {profile?.full_name}</h1>
      <p className="mb-6 text-slate-500">
        {isAdminSistema
          ? 'Tienes acceso a todos los almacenes.'
          : `Tus almacenes asignados: ${warehouses.map((w) => w.name).join(', ') || 'ninguno todavía'}`}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-4 p-5">
          <Warehouse className="text-brand-600" size={28} />
          <div>
            <div className="text-2xl font-semibold">{counts.warehouses}</div>
            <div className="text-sm text-slate-500">Almacenes</div>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <Package className="text-brand-600" size={28} />
          <div>
            <div className="text-2xl font-semibold">{counts.products}</div>
            <div className="text-sm text-slate-500">Productos</div>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-5">
          <Users className="text-brand-600" size={28} />
          <div>
            <div className="text-2xl font-semibold">{counts.users}</div>
            <div className="text-sm text-slate-500">Usuarios</div>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-5 text-sm text-slate-500">
        Las entradas, salidas, pedidos, traspasos, reportes y estadísticas se activarán en las
        próximas etapas del proyecto.
      </div>
    </div>
  )
}
