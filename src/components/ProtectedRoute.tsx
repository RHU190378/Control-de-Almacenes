import { Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../lib/types'

export default function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode
  allow?: Role[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Cargando…</div>
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  if (allow && profile && !allow.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
