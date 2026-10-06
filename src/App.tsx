import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './config';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import Layout from './components/Layout';
import { ConfigMissing, Inactive, Login, Setup } from './pages/AuthPages';
import Dashboard from './pages/Dashboard';
import Warehouses from './pages/Warehouses';
import Users from './pages/Users';
import Products from './pages/Products';
import ProductImport from './pages/ProductImport';
import Categories from './pages/Categories';
import Suppliers from './pages/Suppliers';
import Inventory from './pages/Inventory';
import { Entradas, Salidas, Traspasos, Pedidos, Agroquimicos, Repuestos, Combustible } from './pages/NotePages';
import Assets from './pages/Assets';
import Services from './pages/Services';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Horometro from './pages/Horometro';
import Maintenance from './pages/Maintenance';
import Units from './pages/Units';

function Guard({ need, children }: { need: 'admin' | 'sys'; children: ReactNode }) {
  const { isSys, isAdmin } = useAuth();
  return (need === 'sys' ? isSys : isAdmin) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { session, profile, loading } = useAuth();
  if (!isConfigured) return <ConfigMissing />;
  if (loading) return <Loading text="Iniciando…" />;
  if (!session) return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
  if (!profile || !profile.active) return <Inactive />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventario" element={<Inventory />} />
        <Route path="/entradas" element={<Entradas />} />
        <Route path="/salidas" element={<Salidas />} />
        <Route path="/traspasos" element={<Traspasos />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/combustible" element={<Combustible />} />
        <Route path="/agroquimicos" element={<Agroquimicos />} />
        <Route path="/repuestos" element={<Repuestos />} />
        <Route path="/servicios" element={<Services />} />
        <Route path="/control/maquinaria" element={<Horometro />} />
        <Route path="/control/mantenimiento" element={<Maintenance />} />
        <Route path="/unidades" element={<Units />} />
        <Route path="/maquinaria" element={<Assets kind="machinery" />} />
        <Route path="/vehiculos" element={<Assets kind="vehicle" />} />
        <Route path="/equipos" element={<Assets kind="equipment" />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/productos/importar" element={<Guard need="admin"><ProductImport /></Guard>} />
        <Route path="/categorias" element={<Guard need="admin"><Categories /></Guard>} />
        <Route path="/proveedores" element={<Suppliers />} />
        <Route path="/reportes" element={<Guard need="admin"><Reports /></Guard>} />
        <Route path="/almacenes" element={<Guard need="sys"><Warehouses /></Guard>} />
        <Route path="/usuarios" element={<Guard need="sys"><Users /></Guard>} />
        <Route path="/configuracion" element={<Guard need="sys"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
