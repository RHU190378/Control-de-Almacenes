// =====================================================================
//  ÚNICO ARCHIVO QUE DEBES EDITAR PARA CONECTAR SUPABASE (2 líneas)
//  Los dos datos están en Supabase > Project Settings > API
// =====================================================================
const SUPABASE_URL = 'https://rrgppwnupeoofywvfwfz.supabase.co';          // ej: https://abcdefgh.supabase.co
const SUPABASE_KEY = 'sb_publishable_Ja34UIEQftS4frY52fJ9uA_VuVOas2n';        // "Publishable key" o "anon public"

// (Opcional) también se pueden definir como variables en Netlify:
// VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Si existen, se usan primero.
export const config = {
  url: ((import.meta as any).env?.VITE_SUPABASE_URL as string) || SUPABASE_URL,
  key: ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || SUPABASE_KEY,
};

export const isConfigured =
  /^https?:\/\/.+/.test(config.url) && !config.url.startsWith('PEGA') && config.key.length > 20 && !config.key.startsWith('PEGA');
