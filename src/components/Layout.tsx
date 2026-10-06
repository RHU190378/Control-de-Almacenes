import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { ROLE_LABEL } from '../lib/util';
import { supabase } from '../supabase';
import { Modal, Field, useToast, useAction } from './ui';

type Item = { to: string; label: string; need?: 'admin' | 'sys' };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Inicio', items: [{ to: '/dashboard', label: 'Panel' }] },
  { group: 'Almacén', items: [
    { to: '/inventario', label: 'Inventario' }, { to: '/entradas', label: 'Entradas' }, { to: '/salidas', label: 'Salidas' },
    { to: '/traspasos', label: 'Traspasos' }, { to: '/pedidos', label: 'Pedidos' } ] },
  { group: 'Operaciones', items: [
    { to: '/combustible', label: 'Combustible' }, { to: '/agroquimicos', label: 'Agroquímicos' },
    { to: '/repuestos', label: 'Repuestos' }, { to: '/servicios', label: 'Servicios' } ] },
  { group: 'Control', items: [
    { to: '/control/maquinaria', label: 'Control de maquinaria' }, { to: '/control/mantenimiento', label: 'Control de mantenimiento' } ] },
  { group: 'Activos', items: [
    { to: '/maquinaria', label: 'Maquinaria' }, { to: '/vehiculos', label: 'Vehículos' }, { to: '/equipos', label: 'Equipos' } ] },
  { group: 'Catálogo', items: [
    { to: '/productos', label: 'Productos' }, { to: '/productos/importar', label: 'Importar Excel', need: 'admin' },
    { to: '/categorias', label: 'Categorías', need: 'admin' }, { to: '/unidades', label: 'Unidades de manejo' }, { to: '/proveedores', label: 'Proveedores' } ] },
  { group: 'Administración', items: [
    { to: '/reportes', label: 'Reportes', need: 'admin' }, { to: '/almacenes', label: 'Almacenes', need: 'sys' },
    { to: '/usuarios', label: 'Usuarios', need: 'sys' }, { to: '/configuracion', label: 'Datos de la empresa', need: 'sys' } ] },
];

export default function Layout() {
  const { profile, isSys, isAdmin, signOut } = useAuth();
  const { warehouses, company } = useLookups();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const wh = warehouses.find((w) => w.id === profile?.warehouse_id);
  const allowed = (i: Item) => !i.need || (i.need === 'sys' ? isSys : isAdmin);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
        <strong>{company?.name || 'Almacenes'}</strong>
      </header>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          {company?.logo_url ? <img src={company.logo_url} alt="" /> : <span className="brand-mark" />}
          <div><b>{company?.name || 'Mi Empresa'}</b><small>Sistema de almacenes</small></div>
        </div>
        <nav>
          {NAV.map((g) => {
            const items = g.items.filter(allowed);
            if (!items.length) return null;
            return (
              <div key={g.group} className="nav-group">
                <div className="nav-title">{g.group}</div>
                {items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/productos'} className={({ isActive }) => (isActive ? 'active' : '')}>{i.label}</NavLink>)}
              </div>
            );
          })}
        </nav>
        <div className="me">
          <b>{profile?.full_name}</b>
          <small>{ROLE_LABEL[profile?.role || 'user']}{wh ? ` · ${wh.name}` : isSys ? ' · Todos los almacenes' : ''}</small>
          <div className="me-actions">
            <button onClick={() => setAccount(true)}>Mi contraseña</button>
            <button onClick={signOut}>Salir</button>
          </div>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      {account && <PasswordModal onClose={() => setAccount(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [p1, setP1] = useState(''); const [p2, setP2] = useState('');
  const toast = useToast(); const run = useAction();
  const save = async () => {
    if (p1.length < 6) return toast('La contraseña debe tener al menos 6 caracteres.', 'error');
    if (p1 !== p2) return toast('Las contraseñas no coinciden.', 'error');
    const ok = await run(async () => { const { error } = await supabase.auth.updateUser({ password: p1 }); if (error) throw error; return true; }, 'Contraseña actualizada');
    if (ok) onClose();
  };
  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Nueva contraseña" full><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Repetir contraseña" full><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" /></Field>
      </div>
    </Modal>
  );
}
