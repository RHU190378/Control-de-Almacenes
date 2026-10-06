import { num } from './util';

export const dayDiff = (start?: string | null, end?: string | null) => {
  if (!start) return 0;
  const a = new Date(start).getTime();
  if (Number.isNaN(a)) return 0;
  const b = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, (b - a) / 86400000);
};
export type Alert = [string, 'ok' | 'warn' | 'bad'];
export const alertTime = (d: number): Alert => (d > 2 ? ['🔴 Retrasado >2 Días', 'bad'] : ['🟢 Dentro de Tiempo', 'ok']);
export const alertHrs = (next: any, cur: number): Alert | null => {
  if (next === '' || next == null) return null;
  const left = num(next) - cur;
  return left <= 20 ? ['🚨 Mant. Urgente (<20 Hrs)', 'bad'] : left <= 50 ? ['⚠️ Revisión Cercana (<50 Hrs)', 'warn'] : ['🟢 OK', 'ok'];
};

// Alertas activas: paradas abiertas de más de 2 días y próximos cambios cercanos
export function computeAlerts(logs: any[], assets: any[]) {
  const out: { key: string; asset_id: string; text: string; tone: 'warn' | 'bad' }[] = [];
  const cur = (id: string) => num(assets.find((a) => a.id === id)?.hourmeter);
  logs.forEach((l) => {
    if (!l.end_at) { const d = dayDiff(l.start_at); if (d > 2) out.push({ key: l.id + 't', asset_id: l.asset_id, text: `Parada abierta hace ${d.toFixed(1)} días`, tone: 'bad' }); }
  });
  const last = new Map<string, any>();
  logs.filter((l) => l.next_change_hrs != null && l.next_change_hrs !== '').forEach((l) => {
    const p = last.get(l.asset_id); if (!p || l.start_at > p.start_at) last.set(l.asset_id, l);
  });
  last.forEach((l) => {
    const left = num(l.next_change_hrs) - cur(l.asset_id);
    if (left <= 50) out.push({ key: l.id + 'h', asset_id: l.asset_id, text: left <= 20 ? `🚨 Mant. urgente: faltan ${left.toFixed(1)} h` : `⚠️ Revisión cercana: faltan ${left.toFixed(1)} h`, tone: left <= 20 ? 'bad' : 'warn' });
  });
  return out;
}
