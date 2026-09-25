import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Warehouse, Users, Package, Tags, Ruler,
  Truck, Contact, Building2, Menu, X, LogOut, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/types'

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, roles: ['admin_sistema', 'admin_almacen', 'usuario'] },
  { to: '/almacenes', label: 'Almacenes', icon: Warehouse, roles: ['admin_sistema'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['admin_sistema', 'admin_almacen'] },
  { to: '/productos', label: 'Productos', icon: Package, roles: ['admin_sistema', 'admin_almacen', 'usuario'] },
  { to: '/entradas', label: 'Entradas', icon: ArrowDownToLine, roles: ['admin_sistema', 'admin_almacen', 'usuario'] },
  { to: '/salidas', label: 'Salidas', icon: ArrowUpFromLine, roles: ['admin_sistema', 'admin_almacen', 'usuario'] },
  { to: '/categorias', label: 'Categorías', icon: Tags, roles: ['admin_sistema'] },
  { to: '/unidades', label: 'Unidades', icon: Ruler, roles: ['admin_sistema'] },
  { to: '/proveedores', label: 'Proveedores', icon: Truck, roles: ['admin_sistema'] },
  { to: '/clientes', label: 'Clientes', icon: Contact, roles: ['admin_sistema'] },
  { to: '/empresa', label: 'Datos de empresa', icon: Building2, roles: ['admin_sistema'] },
] as const

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const role = profile?.role ?? 'usuario'
  const items = NAV.filter((item) => (item.roles as readonly string[]).includes(role))

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed z-40 inset-y-0 left-0 w-64 bg-slate-900 text-slate-100 transform transition-transform md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
          <span className="font-semibold">Inventario</span>
          <button className="md:hidden" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="p-2 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Contenido */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="md:hidden text-slate-600" onClick={() => setOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{profile?.full_name}</div>
              <div className="text-xs text-slate-500">{profile ? ROLE_LABELS[profile.role] : ''}</div>
            </div>
            <button
              onClick={signOut}
              className="btn-secondary !px-2 !py-2"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
