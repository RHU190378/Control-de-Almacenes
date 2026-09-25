import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { session, loading } = useAuth()
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('system_needs_setup').then(({ data, error }) => {
      if (error) {
        // Si la función todavía no existe (falta aplicar el SQL de esta etapa),
        // asumimos que no es el primer arranque y mostramos el login normal.
        setNeedsSetup(false)
        return
      }
      setNeedsSetup(Boolean(data))
    })
  }, [])

  if (loading || needsSetup === null) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Cargando…</div>
  }
  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (needsSetup) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (signUpError) throw signUpError
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
    } catch (err: any) {
      setError(err.message ?? 'Ocurrió un error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-semibold">Sistema de Inventario</h1>
        <p className="mb-6 text-sm text-slate-500">
          {needsSetup
            ? 'Crea la cuenta del administrador de sistema. Solo se hace una vez.'
            : 'Inicia sesión para continuar'}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {needsSetup && (
            <div>
              <label className="label">Tu nombre</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Un momento…' : needsSetup ? 'Crear administrador' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
