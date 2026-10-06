import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export interface Profile {
  id: string; email: string; full_name: string;
  role: 'system_admin' | 'warehouse_admin' | 'user';
  warehouse_id: string | null; active: boolean;
}
interface AuthState {
  session: Session | null; profile: Profile | null; loading: boolean;
  isSys: boolean; isAdmin: boolean;
  signOut: () => Promise<void>; reload: () => Promise<void>;
}
const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (uid?: string) => {
    if (!uid) { setProfile(null); return; }
    setProfileLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile) || null);
    setProfileLoading(false);
  }, []);

  useEffect(() => { loadProfile(session?.user?.id); }, [session?.user?.id, loadProfile]);

  const value: AuthState = {
    session, profile,
    loading: !sessionReady || (!!session && profileLoading),
    isSys: profile?.role === 'system_admin',
    isAdmin: profile?.role === 'system_admin' || profile?.role === 'warehouse_admin',
    signOut: async () => { await supabase.auth.signOut(); setProfile(null); },
    reload: () => loadProfile(session?.user?.id),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
