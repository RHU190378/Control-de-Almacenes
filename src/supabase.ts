import { createClient } from '@supabase/supabase-js';
import { config, isConfigured } from './config';

export const supabase = createClient(
  isConfigured ? config.url : 'https://sin-configurar.invalid',
  isConfigured ? config.key : 'sin-configurar-sin-configurar-sin-configurar',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);

// Segundo cliente SIN sesión: sirve para crear usuarios nuevos desde dentro del programa
// sin cerrar la sesión del administrador.
export function tempClient() {
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'tmp-crear-usuario' },
  });
}
