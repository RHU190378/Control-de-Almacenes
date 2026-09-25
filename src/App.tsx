import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Warehouses from './pages/Warehouses'
import Users from './pages/Users'
import Products from './pages/Products'
import Entries from './pages/Entries'
import Exits from './pages/Exits'
import Categories from './pages/Categories'
import Units from './pages/Units'
import Suppliers from './pages/Suppliers'
import Customers from './pages/Customers'
import CompanySettings from './pages/CompanySettings'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/almacenes"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <Warehouses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <ProtectedRoute allow={['admin_sistema', 'admin_almacen']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route path="/productos" element={<Products />} />
            <Route path="/entradas" element={<Entries />} />
            <Route path="/salidas" element={<Exits />} />
            <Route
              path="/categorias"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/unidades"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <Units />
                </ProtectedRoute>
              }
            />
            <Route
              path="/proveedores"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <Suppliers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/empresa"
              element={
                <ProtectedRoute allow={['admin_sistema']}>
                  <CompanySettings />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
