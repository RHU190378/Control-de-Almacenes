import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './auth';

export interface Lookups {
  warehouses: any[]; categories: any[]; units: any[]; suppliers: any[]; assets: any[]; profiles: any[];
  company: any; ready: boolean; reload: () => Promise<void>;
}
const empty: Lookups = { warehouses: [], categories: [], units: [], suppliers: [], assets: [], profiles: [], company: {}, ready: false, reload: async () => {} };
const Ctx = createContext<Lookups>(empty);
export const useLookups = () => useContext(Ctx);

export function LookupProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [data, setData] = useState<Lookups>(empty);

  const reload = useCallback(async () => {
    const [w, c, u, s, a, p, co] = await Promise.all([
      supabase.from('warehouses').select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('units').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('assets').select('*').order('code'),
      supabase.from('profiles').select('id,full_name,email,role,warehouse_id,active').order('full_name'),
      supabase.from('company_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    setData((d) => ({
      ...d, warehouses: w.data || [], categories: c.data || [], units: u.data || [], suppliers: s.data || [],
      assets: a.data || [], profiles: p.data || [], company: co.data || {}, ready: true,
    }));
  }, []);

  useEffect(() => { if (profile?.active) reload(); }, [profile?.id, profile?.active, reload]);
  return <Ctx.Provider value={{ ...data, reload }}>{children}</Ctx.Provider>;
}
