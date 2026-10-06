import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { fetchAll, fmt, fmtDate, num, today } from '../lib/util';
import { alertHrs, alertTime, dayDiff } from '../lib/maint';
import { PrintDoc } from '../lib/printDoc';
import { Empty, ErrorBox, Field, Loading, PageHeader, useAction, useAsync, useToast } from '../components/ui';
import PrintPreview from '../components/PrintPreview';

const q1 = (v: any) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(v));
const pad = (n: number) => String(n).padStart(6, '0');
const p2 = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const toIso = (s: string) => (s ? new Date(s).toISOString() : null);
const fdt = (iso?: string | null) => (iso ? `${fmtDate(toLocal(iso).slice(0, 10))} ${toLocal(iso).slice(11)}` : '');
const STATUS = ['Activa', 'En Taller', 'Espera de repuestos', 'Finalizado'];
const MTYPES = ['Preventivo', 'Correctivo', 'Predictivo'];
const blank = () => ({ id: null, number: null, log_date: today(), asset_id: '', mechanic: '', mtype: 'Preventivo', start_at: '', end_at: '', hm_in: '', hm_out: '', next_change_hrs: '', parts: '', cost: '', status: 'Activa' });

export default function Maintenance() {
  const { assets } = useLookups();
  const { isAdmin } = useAuth();
  const run = useAction(); const toast = useToast();
  const [tab, setTab] = useState<'dash' | 'form'>('dash');
  const [f, setF] = useState<any>(blank());
  const [find, setFind] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [eq, setEq] = useState(''); const [st, setSt] = useState('');
  const [pv, setPv] = useState<PrintDoc | null>(null);

  const { data, loading, error, reload } = useAsync(() => fetchAll((a, b) => supabase.from('maintenance_logs').select('*').order('number').range(a, b)), []);
  const logs: any[] = data || [];
  const machs = assets.filter((a) => a.status !== 'baja');
  const asset = (id: string) => assets.find((a) => a.id === id);
  const code = (id: string) => asset(id)?.code || '';
  const aName = (id: string) => { const a = asset(id); return a ? `${a.code} · ${a.name || a.type || ''}` : ''; };
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const pickAsset = (id: string) => setF((x: any) => ({ ...x, asset_id: id, hm_in: id && !x.id ? String(num(asset(id)?.hourmeter)) : x.hm_in }));
  const load = (l: any) => setF({ ...l, start_at: toLocal(l.start_at), end_at: toLocal(l.end_at), hm_in: String(l.hm_in), hm_out: l.hm_out == null ? '' : String(l.hm_out), next_change_hrs: l.next_change_hrs == null ? '' : String(l.next_change_hrs), parts: l.parts || '', cost: String(l.cost) });
  const pos = f.id ? logs.findIndex((l) => l.id === f.id) : -1;
  const go = (i: number) => logs[i] && load(logs[i]);
  const search = () => { const i = logs.findIndex((l) => l.number === parseInt(find.replace(/\D/g, ''), 10)); i < 0 ? toast(`No se encontró el registro Nº ${find || '—'}.`, 'error') : (go(i), setTab('form')); };

  const dias = (l: any) => dayDiff(l.start_at, l.end_at);
  const hrsP = (l: any) => (l.hm_out == null || l.hm_out === '' ? 0 : num(l.hm_out) - num(l.hm_in));
  const curHm = (id: string) => num(asset(id)?.hourmeter);
  const alT = (l: any) => alertTime(dias(l));
  const alH = (l: any) => alertHrs(l.next_change_hrs, curHm(l.asset_id));

  const view = useMemo(() => logs.filter((l) => (!from || l.log_date >= from) && (!to || l.log_date <= to) && (!eq || l.asset_id === eq) && (!st || l.status === st)), [logs, from, to, eq, st]);
  const open = view.filter((l) => l.status !== 'Finalizado');
  const late = view.filter((l) => alT(l)[1] === 'bad');
  const urgent = view.filter((l) => alH(l)?.[1] === 'bad');
  const near = view.filter((l) => alH(l)?.[1] === 'warn');
  const cost = view.reduce((s, l) => s + num(l.cost), 0);
  const byEq = machs.filter((a) => view.some((l) => l.asset_id === a.id)).map((a) => {
    const ls = view.filter((l) => l.asset_id === a.id);
    return { a, n: ls.length, d: ls.reduce((s, l) => s + dias(l), 0), c: ls.reduce((s, l) => s + num(l.cost), 0) };
  });
  const maxC = Math.max(1, ...byEq.map((x) => x.c));

  const save = async () => {
    if (!f.asset_id) return toast('Elige el equipo.', 'error');
    if (!f.mechanic.trim()) return toast('Escribe el nombre del mecánico.', 'error');
    if (!f.start_at) return toast('Escribe la fecha y hora de inicio.', 'error');
    if (f.end_at && f.end_at < f.start_at) return toast('El fin no puede ser anterior al inicio.', 'error');
    if (f.hm_in === '') return toast('Escribe el horómetro de ingreso.', 'error');
    if (f.hm_out !== '' && num(f.hm_out) < num(f.hm_in)) return toast('El horómetro de salida no puede ser menor que el de ingreso.', 'error');
    if (num(f.cost) < 0) return toast('El costo no puede ser negativo.', 'error');
    const payload = { log_date: f.log_date, asset_id: f.asset_id, mechanic: f.mechanic.trim(), mtype: f.mtype, start_at: toIso(f.start_at), end_at: toIso(f.end_at), hm_in: num(f.hm_in),
      hm_out: f.hm_out === '' ? null : num(f.hm_out), next_change_hrs: f.next_change_hrs === '' ? null : num(f.next_change_hrs), parts: f.parts?.trim() || null, cost: num(f.cost), status: f.status };
    const row = await run(async () => {
      const r = f.id ? await supabase.from('maintenance_logs').update(payload).eq('id', f.id).select('*').single() : await supabase.from('maintenance_logs').insert(payload).select('*').single();
      if (r.error) throw r.error; return r.data;
    }, 'Registro guardado');
    if (row) { await reload(); load(row); }
  };
  const del = async (l: any) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    const ok = await run(async () => { const { error } = await supabase.from('maintenance_logs').delete().eq('id', l.id); if (error) throw error; return true; }, 'Registro eliminado');
    if (ok) { if (f.id === l.id) setF(blank()); reload(); }
  };

  const printLog = () => setPv({ title: 'Control de mantenimiento', subtitle: `Del ${from ? fmtDate(from) : 'inicio'} al ${to ? fmtDate(to) : 'hoy'}`, orient: 'landscape',
    meta: [`Registros: ${view.length}`, `Mantenimientos abiertos: ${open.length}`, `Paradas retrasadas (>2 días): ${late.length}`, `Costo total: ${fmt(cost)}`],
    cols: ['Nº', 'Fecha', 'Equipo', 'Mecánico', 'Tipo', 'Inicio', 'Fin', 'Días parada', 'Hrs pruebas', 'Próx. cambio', 'Repuestos', 'Costo', 'Estado', 'Alerta tiempo', 'Alerta horas'],
    rows: view.map((l) => [pad(l.number), fmtDate(l.log_date), code(l.asset_id), l.mechanic, l.mtype, fdt(l.start_at), fdt(l.end_at), q1(dias(l)), q1(hrsP(l)), l.next_change_hrs == null ? '' : q1(l.next_change_hrs), l.parts || '', fmt(l.cost), l.status, alT(l)[0].replace(/^\S+\s/, ''), (alH(l)?.[0] || '').replace(/^\S+\s/, '')]),
    foot: ['Total', '', '', '', '', '', '', '', '', '', '', fmt(cost), '', '', ''] });

  const filters = (
    <div className="toolbar">
      <label className="check">Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="check">Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <select value={eq} onChange={(e) => setEq(e.target.value)}><option value="">Todos los equipos</option>{machs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
      <select value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos los estados</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
    </div>);

  const alT_f = f.start_at ? alertTime(dayDiff(f.start_at ? new Date(f.start_at).toISOString() : null, f.end_at ? new Date(f.end_at).toISOString() : null)) : null;
  const alH_f = f.asset_id ? alertHrs(f.next_change_hrs, curHm(f.asset_id)) : null;
  const diasF = f.start_at ? dayDiff(new Date(f.start_at).toISOString(), f.end_at ? new Date(f.end_at).toISOString() : null) : 0;

  return (
    <div>
      {pv && <PrintPreview doc={pv} onClose={() => setPv(null)} />}
      <PageHeader title="Control de mantenimiento" subtitle="Paradas, mantenimientos y alertas por equipo."
        actions={<><button className="btn" onClick={printLog}>Imprimir</button><button className="btn btn-primary" onClick={() => { setF(blank()); setTab('form'); }}>+ Nuevo registro</button></>} />
      <div className="tabs"><button className={tab === 'dash' ? 'on' : ''} onClick={() => setTab('dash')}>Cuadro de mando</button><button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>Formulario de registro</button></div>
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : tab === 'dash' ? (<>
        {filters}
        <div className="kpis">
          <div className="kpi"><small>Registros</small><b>{view.length}</b></div>
          <div className="kpi info"><small>Mantenimientos abiertos</small><b>{open.length}</b></div>
          <div className="kpi danger"><small>Paradas retrasadas (&gt;2 días)</small><b>{late.length}</b></div>
          <div className="kpi danger"><small>Mant. urgente (&lt;20 h)</small><b>{urgent.length}</b></div>
          <div className="kpi warn"><small>Revisión cercana (&lt;50 h)</small><b>{near.length}</b></div>
          <div className="kpi"><small>Costo total</small><b>{fmt(cost)}</b></div>
        </div>
        <div className="two-col">
          <div className="panel"><h3>Alertas activas</h3>
            {[...late.map((l) => ({ l, t: alT(l)[0] })), ...urgent.concat(near).map((l) => ({ l, t: alH(l)![0] }))].map((x, i) => <div key={i} style={{ padding: '4px 0' }}><b>{code(x.l.asset_id)}</b> · Nº {pad(x.l.number)} — {x.t}</div>)}
            {!late.length && !urgent.length && !near.length && <Empty text="Sin alertas. Todo en orden." />}
          </div>
          <div className="panel"><h3>Costo y días de parada por equipo</h3>
            {byEq.map((x) => <div key={x.a.id} style={{ marginBottom: 8 }}><div>{x.a.code} · {x.a.name} <small style={{ color: 'var(--muted)' }}>({x.n} reg., {q1(x.d)} días)</small></div>
              <div className="bar-row"><div style={{ flex: 1 }}><div className="bar" style={{ width: Math.max(2, (x.c / maxC) * 100) + '%', background: 'var(--amber)' }} /></div><span style={{ width: 90, textAlign: 'right' }}>{fmt(x.c)}</span></div></div>)}
            {!byEq.length && <Empty text="Sin registros." />}
          </div>
        </div>
      </>) : (<>
        <div className="note-nav">
          <button className="btn btn-primary" onClick={() => setF(blank())}>Nuevo</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
          {isAdmin && f.id && <button className="btn btn-danger" onClick={() => del(f)}>Eliminar</button>}
          <button className="btn" onClick={() => setF(blank())}>Limpiar</button><span className="sep" />
          <button className="btn" disabled={!logs.length || pos === 0} onClick={() => go(0)}>⏮ Primero</button>
          <button className="btn" disabled={!logs.length || pos === 0} onClick={() => go(pos < 0 ? logs.length - 1 : pos - 1)}>◀ Anterior</button>
          <span className="counter">{pos >= 0 ? `Registro ${pos + 1} de ${logs.length}` : `${logs.length} registro(s)`}</span>
          <button className="btn" disabled={pos < 0 || pos >= logs.length - 1} onClick={() => go(pos + 1)}>Siguiente ▶</button>
          <button className="btn" disabled={!logs.length || pos === logs.length - 1} onClick={() => go(logs.length - 1)}>Último ⏭</button><span className="sep" />
          <input style={{ width: 120 }} inputMode="numeric" placeholder="Nº de registro" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button className="btn" onClick={search}>Buscar</button>
        </div>
        <div className="panel">
          <h3>Registro de mantenimiento {f.number ? 'Nº ' + pad(f.number) : '(nuevo)'}</h3>
          <div className="form-grid">
            <Field label="Fecha *"><input type="date" value={f.log_date} onChange={(e) => set('log_date', e.target.value)} /></Field>
            <Field label="Código de Equipo *"><select value={f.asset_id} disabled={!!f.id} onChange={(e) => pickAsset(e.target.value)}><option value="">— Elegir —</option>{machs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
            <Field label="Mecánico *"><input value={f.mechanic} onChange={(e) => set('mechanic', e.target.value)} /></Field>
            <Field label="Tipo de mantenimiento *"><select value={f.mtype} onChange={(e) => set('mtype', e.target.value)}>{MTYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Inicio de parada *"><input type="datetime-local" value={f.start_at} onChange={(e) => set('start_at', e.target.value)} /></Field>
            <Field label="Fin de parada"><input type="datetime-local" value={f.end_at} onChange={(e) => set('end_at', e.target.value)} /></Field>
            <Field label="Días de parada (automático)"><input readOnly value={f.start_at ? q1(diasF) : ''} /></Field>
            <Field label="Horómetro de ingreso *"><input type="number" min="0" step="0.1" value={f.hm_in} onChange={(e) => set('hm_in', e.target.value)} /></Field>
            <Field label="Horómetro de salida"><input type="number" min="0" step="0.1" value={f.hm_out} onChange={(e) => set('hm_out', e.target.value)} /></Field>
            <Field label="Horas de pruebas (automático)"><input readOnly value={f.hm_out !== '' && f.hm_in !== '' ? q1(num(f.hm_out) - num(f.hm_in)) : ''} /></Field>
            <Field label="Próximo cambio (horas)"><input type="number" min="0" step="0.1" value={f.next_change_hrs} onChange={(e) => set('next_change_hrs', e.target.value)} /></Field>
            <Field label="Costo"><input type="number" min="0" step="0.01" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
            <Field label="Estado *"><select value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Alerta de tiempo (automática)"><input readOnly value={alT_f ? alT_f[0] : ''} /></Field>
            <Field label="Alerta de horas (automática)"><input readOnly value={alH_f ? alH_f[0] : ''} /></Field>
            <Field label="Repuestos / trabajo realizado" full><input value={f.parts} onChange={(e) => set('parts', e.target.value)} /></Field>
          </div>
        </div>
        {filters}
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Nº</th><th>Fecha</th><th>Equipo</th><th>Mecánico</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th className="r">Días</th><th className="r">Hrs pruebas</th><th className="r">Próx. cambio</th><th className="r">Costo</th><th>Estado</th><th>Alertas</th></tr></thead>
          <tbody>{view.map((l) => <tr key={l.id} className={'clickable' + (f.id === l.id ? ' sel' : '')} onClick={() => load(l)}><td>{pad(l.number)}</td><td>{fmtDate(l.log_date)}</td><td><b>{code(l.asset_id)}</b></td><td>{l.mechanic}</td><td>{l.mtype}</td><td>{fdt(l.start_at)}</td><td>{fdt(l.end_at)}</td><td className="r">{q1(dias(l))}</td><td className="r">{q1(hrsP(l))}</td><td className="r">{l.next_change_hrs == null ? '' : q1(l.next_change_hrs)}</td><td className="r">{fmt(l.cost)}</td><td>{l.status}</td><td>{alT(l)[0]}{alH(l) ? ' · ' + alH(l)![0] : ''}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={10}>Total</td><td className="r">{fmt(cost)}</td><td colSpan={2} /></tr></tfoot>
        </table>{!view.length && <Empty text="Sin registros para esos filtros." />}</div>
      </>)}
    </div>
  );
}
