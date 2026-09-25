export type Role = 'admin_sistema' | 'admin_almacen' | 'usuario'
export type EstadoBase = 'activo' | 'inactivo'

export interface Profile {
  id: string
  full_name: string
  role: Role
  status: EstadoBase
  created_at: string
}

export interface Warehouse {
  id: string
  code: string
  name: string
  address: string | null
  phone: string | null
  responsible: string | null
  status: EstadoBase
  created_at: string
}

export interface Category {
  id: string
  name: string
  status: EstadoBase
}

export interface Unit {
  id: string
  name: string
  abbreviation: string | null
}

export interface Product {
  id: string
  code: string
  name: string
  category_id: string | null
  unit_id: string | null
  image_url: string | null
  price: number
  min_stock: number
  status: EstadoBase
  created_at: string
  categories?: { name: string } | null
  units?: { name: string; abbreviation: string | null } | null
}

export interface Supplier {
  id: string
  code: string
  company_name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: EstadoBase
}

export interface Customer {
  id: string
  code: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: EstadoBase
}

export interface CompanySettings {
  id: number
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
}

export interface EntryItem {
  id: string
  entry_id: string
  product_id: string
  quantity: number
  unit_id: string | null
  unit_price: number
  final_price: number
  expiry_date: string | null
  products?: { code: string; name: string } | null
}

export interface Entry {
  id: string
  entry_number: string
  warehouse_id: string
  supplier_id: string | null
  entry_date: string
  user_id: string | null
  observation: string | null
  status: 'confirmada' | 'anulada'
  warehouses?: { name: string } | null
  suppliers?: { company_name: string } | null
  profiles?: { full_name: string } | null
}

export interface ExitItem {
  id: string
  exit_id: string
  product_id: string
  quantity: number
  unit_price: number
  total: number
  products?: { code: string; name: string } | null
}

export interface Exit {
  id: string
  exit_number: string
  warehouse_id: string
  customer_id: string | null
  exit_date: string
  user_id: string | null
  observation: string | null
  total: number
  status: 'confirmada' | 'anulada'
  warehouses?: { name: string } | null
  customers?: { name: string } | null
  profiles?: { full_name: string } | null
}

export interface InventoryRow {
  product_id: string
  warehouse_id: string
  quantity: number
}

export const ROLE_LABELS: Record<Role, string> = {
  admin_sistema: 'Administrador de sistema',
  admin_almacen: 'Administrador de almacén',
  usuario: 'Usuario',
}
