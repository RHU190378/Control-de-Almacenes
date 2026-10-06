import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useLookups } from '../lib/lookups';
import { uploadPhoto } from '../lib/util';
import { Field, PageHeader, useAction, useToast } from '../components/ui';

export default function Settings() {
  const { company, reload } = useLookups();
  const run = useAction(); const toast = useToast();
  const [c, setC] = useState<any>({ name: '', tax_id: '', phone: '', email: '', address: '', logo_url: '', currency: 'Bs' });
  useEffect(() => { if (company) setC((x: any) => ({ ...x, ...company })); }, [company]);
  const set = (k: string, v: any) => setC({ ...c, [k]: v });

  const save = async () => {
    if (!String(c.name || '').trim()) return toast('Escribe el nombre de la empresa.', 'error');
    const { id, ...payload } = c;
    const ok = await run(async () => { const { error } = await supabase.from('company_settings').upsert({ id: 1, ...payload }); if (error) throw error; return true; }, 'Datos guardados');
    if (ok) reload();
  };
  const logo = async (f?: File) => { if (!f) return; const url = await run(() => uploadPhoto(f, 'empresa')); if (url) set('logo_url', url); };

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos de la empresa: aparecen en el menú y en los reportes e impresiones." />
      <div className="panel">
        <div className="form-grid">
          <Field label="Nombre de la empresa *" full><input value={c.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="NIT / identificación"><input value={c.tax_id || ''} onChange={(e) => set('tax_id', e.target.value)} /></Field>
          <Field label="Teléfono"><input value={c.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input value={c.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Moneda (símbolo)"><input value={c.currency || ''} onChange={(e) => set('currency', e.target.value)} /></Field>
          <Field label="Dirección" full><input value={c.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Logo" full>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {c.logo_url && <img src={c.logo_url} alt="logo" style={{ height: 56 }} />}
              <input type="file" accept="image/*" onChange={(e) => logo(e.target.files?.[0])} />
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 14 }}><button className="btn btn-primary" onClick={save}>Guardar cambios</button></div>
      </div>
    </div>
  );
}
