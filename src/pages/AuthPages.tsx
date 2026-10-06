import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { errMsg } from '../lib/util';
import { Field } from '../components/ui';

function Logo() { return <img className="auth-logo" src="/icons/icon-192.png" alt="" />; }

export function ConfigMissing() {
  return (
    <div className="auth-page"><div className="auth-card">
      <Logo /><h1>Falta conectar Supabase</h1>
      <p>Abre el archivo <b>src/config.ts</b> y reemplaza las dos líneas: la <b>Project URL</b> y la <b>clave pública</b> de tu proyecto de Supabase. Luego vuelve a publicar.</p>
      <p>Si ya lo hiciste en Netlify con variables de entorno, vuelve a desplegar el sitio para que las tome.</p>
    </div></div>
  );
}

export function Inactive() {
  const { signOut, session } = useAuth();
  return (
    <div className="auth-page"><div className="auth-card">
      <Logo /><h1>Tu cuenta aún no está activa</h1>
      <p>La cuenta <b>{session?.user?.email}</b> existe, pero un administrador debe activarla y asignarle un almacén desde la pantalla de Usuarios.</p>
      <p>Si eres el administrador inicial, revisa que el correo coincida exactamente con el que escribiste en el script SQL de Supabase.</p>
      <button className="btn" onClick={signOut}>Cerrar sesión</button>
    </div></div>
  );
}

export function Login() {
  const [email, setEmail] = useState(''); const [pass, setPass] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    supabase.rpc('system_needs_setup').then(({ data, error }) => { if (!error) setNeedsSetup(data === true); });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) setErr(/invalid login/i.test(error.message) ? 'Correo o contraseña incorrectos.' : errMsg(error));
  };

  return (
    <div className="auth-page"><form className="auth-card" onSubmit={submit}>
      <Logo /><h1>Sistema de Almacenes</h1><p>Ingresa con tu correo y contraseña.</p>
      {err && <div className="error-box">{err}</div>}
      <Field label="Correo"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></Field>
      <Field label="Contraseña"><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required /></Field>
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      {needsSetup && <p style={{ marginTop: 16 }}>¿Primera vez? <Link to="/setup">Crear el administrador inicial</Link></p>}
    </form></div>
  );
}

export function Setup() {
  const nav = useNavigate();
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [p1, setP1] = useState(''); const [p2, setP2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const [needs, setNeeds] = useState<boolean | null>(null);

  useEffect(() => { supabase.rpc('system_needs_setup').then(({ data }) => setNeeds(data === true)); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (p1.length < 6) return setErr('La contraseña debe tener al menos 6 caracteres.');
    if (p1 !== p2) return setErr('Las contraseñas no coinciden.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: p1, options: { data: { full_name: name.trim() || 'Administrador' } } });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    if (!data.session) setMsg('Cuenta creada, pero Supabase pide confirmar el correo. Entra a Supabase > Authentication > Providers > Email y desactiva "Confirm email"; luego inicia sesión.');
    else nav('/dashboard');
  };

  if (needs === false) return (
    <div className="auth-page"><div className="auth-card"><Logo /><h1>El administrador ya existe</h1><p>Inicia sesión con su correo y contraseña.</p><Link to="/">Ir a iniciar sesión</Link></div></div>
  );

  return (
    <div className="auth-page"><form className="auth-card" onSubmit={submit}>
      <Logo /><h1>Crear administrador inicial</h1>
      <p>Usa el mismo correo que escribiste en el script SQL de Supabase. Solo ese correo puede ser administrador.</p>
      {err && <div className="error-box">{err}</div>}
      {msg && <div className="note-box">{msg}</div>}
      <Field label="Nombre completo"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label="Correo"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
      <Field label="Contraseña (mínimo 6 caracteres)"><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} autoComplete="new-password" required /></Field>
      <Field label="Repetir contraseña"><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} autoComplete="new-password" required /></Field>
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creando…' : 'Crear administrador'}</button>
      <p style={{ marginTop: 12 }}><Link to="/">Volver</Link></p>
    </form></div>
  );
}
