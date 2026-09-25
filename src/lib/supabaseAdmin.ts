import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Este cliente NO guarda sesión. Se usa exclusivamente para registrar
// nuevos usuarios (auth.signUp) desde la pantalla de "Usuarios" sin que
// eso reemplace la sesión del administrador que está logueado.
export const supabaseAdmin = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
