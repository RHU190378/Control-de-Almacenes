import { useState } from 'react';
import NoteForm from '../components/NoteForm';
import { PageHeader } from '../components/ui';
import { NOTE_CONFIGS, NoteType } from '../lib/noteConfigs';
import { useLookups } from '../lib/lookups';
import { fmtQty } from '../lib/util';
import { supabase } from '../supabase';
import { useAsync } from '../components/ui';

function NotePage({ type }: { type: NoteType }) {
  const cfg = NOTE_CONFIGS[type];
  return (
    <div>
      <PageHeader title={cfg.title} subtitle={cfg.intro} />
      <NoteForm key={type} cfg={cfg} />
    </div>
  );
}

export const Entradas = () => <NotePage type="entry" />;
export const Salidas = () => <NotePage type="exit" />;
export const Traspasos = () => <NotePage type="transfer" />;
export const Pedidos = () => <NotePage type="request" />;
export const Agroquimicos = () => <NotePage type="agro_out" />;
export const Repuestos = () => <NotePage type="parts_out" />;

// Combustible: dos pestañas (recepción y entrega) + nivel de existencias
export function Combustible() {
  const [tab, setTab] = useState<'fuel_out' | 'fuel_in'>('fuel_out');
  const { categories, warehouses } = useLookups();
  const catId = categories.find((c) => c.name.toLowerCase().startsWith('combustible'))?.id;
  const { data } = useAsync(async () => {
    if (!catId) return [];
    const { data } = await supabase.from('inventory').select('warehouse_id,quantity,products!inner(name,category_id)').eq('products.category_id', catId);
    return data || [];
  }, [catId, tab]);
  const levels = (data || []).filter((r: any) => Number(r.quantity) !== 0);

  return (
    <div>
      <PageHeader title="Combustible" subtitle="Recepción de combustible y entrega a maquinaria, vehículos y equipos." />
      {levels.length > 0 && (
        <div className="kpis">
          {levels.map((r: any, i: number) => (
            <div className="kpi info" key={i}><small>{r.products.name} · {warehouses.find((w) => w.id === r.warehouse_id)?.name}</small><b>{fmtQty(r.quantity)} L</b></div>
          ))}
        </div>
      )}
      <div className="tabs">
        <button className={tab === 'fuel_out' ? 'on' : ''} onClick={() => setTab('fuel_out')}>Entregas</button>
        <button className={tab === 'fuel_in' ? 'on' : ''} onClick={() => setTab('fuel_in')}>Recepciones</button>
      </div>
      <NoteForm key={tab} cfg={NOTE_CONFIGS[tab]} />
    </div>
  );
}
