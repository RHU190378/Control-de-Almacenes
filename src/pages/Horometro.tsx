import { useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../lib/auth';
import { useLookups } from '../lib/lookups';
import { fetchAll, fmt, fmtDate, num, today } from '../lib/util';
import { PrintDoc } from '../lib/printDoc';
import { Empty, ErrorBox, Field, Loading, PageHeader, useAction, useAsync, useToast } from '../components/ui';
import PrintPreview from '../components/PrintPreview';

const q1 = (v: any) => new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(num(v));
const pad = (n: number) => String(n).padStart(6, '0');
const blank = () => ({ id: null, number: null, log_date: today(), asset_id: '', operator: '', shift: 'Mañana', hm_start: '', hm_end: '', fuel_gal: '', observations: '' });

export default function Horometro() {
  const { assets, company } = useLookups();
  const { isAdmin } = useAuth();
  const run = useAction(); const toast = useToast();
  const [tab, setTab] = useState<'dash' | 'form'>('dash');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [eq, setEq] = useState('');
  const [f, setF] = useState<any>(blank());
  const [find, setFind] = useState('');
  const [pv, setPv] = useState<PrintDoc | null>(null);

  const { data, loading, error, reload } = useAsync(() => fetchAll((a, b) => supabase.from('hourmeter_logs').select('*').order('number').range(a, b)), []);
  const logs: any[] = data || [];
  const machs = assets.filter((a) => a.kind === 'machinery' && a.status !== 'baja');
  const aName = (id: string) => { const a = assets.find((x) => x.id === id); return a ? `${a.code} · ${a.name || a.type || ''}` : ''; };
  const last = (id: string) => { const ls = logs.filter((l) => l.asset_id === id); return ls.length ? Math.max(...ls.map((l) => num(l.hm_end))) : num(assets.find((a) => a.id === id)?.hourmeter); };
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const pickAsset = (id: string) => setF((x: any) => ({ ...x, asset_id: id, hm_start: id && !x.id ? String(last(id)) : x.hm_start }));
  const load = (l: any) => setF({ ...l, hm_start: String(l.hm_start), hm_end: String(l.hm_end), fuel_gal: String(l.fuel_gal), observations: l.observations || '' });
  const pos = f.id ? logs.findIndex((l) => l.id === f.id) : -1;
  const go = (i: number) => logs[i] && load(logs[i]);
  const search = () => { const i = logs.findIndex((l) => l.number === parseInt(find.replace(/\D/g, ''), 10)); i < 0 ? toast(`No se encontró el registro Nº ${find || '—'}.`, 'error') : (go(i), setTab('form')); };

  const view = useMemo(() => logs.filter((l) => (!from || l.log_date >= from) && (!to || l.log_date <= to) && (!eq || l.asset_id === eq)), [logs, from, to, eq]);
  const H = view.reduce((s, l) => s + num(l.hours), 0), G = view.reduce((s, l) => s + num(l.fuel_gal), 0), eff = H > 0 ? G / H : 0;
  const byEq = machs.filter((a) => !eq || a.id === eq).map((a) => {
    const ls = view.filter((l) => l.asset_id === a.id); const h = ls.reduce((s, l) => s + num(l.hours), 0), g = ls.reduce((s, l) => s + num(l.fuel_gal), 0);
    return { a, h, g, r: h > 0 ? g / h : 0 };
  });
  const days = [...new Set(view.map((l) => l.log_date))].sort().map((d) => ({ d, h: view.filter((l) => l.log_date === d).reduce((s, l) => s + num(l.hours), 0) }));
  const maxH = Math.max(1, ...byEq.map((x) => x.h)), maxG = Math.max(1, ...byEq.map((x) => x.g)), maxD = Math.max(1, ...days.map((x) => x.h));
  const state = (x: any) => (x.h <= 0 ? 'Sin registros' : eff > 0 && x.r > eff * 1.25 ? 'Consumo alto' : 'Normal');

  const save = async () => {
    if (!f.asset_id) return toast('Elige el equipo.', 'error');
    if (!f.operator.trim()) return toast('Escribe el nombre del operador.', 'error');
    if (f.hm_start === '' || f.hm_end === '') return toast('Escribe el horómetro inicial y el final.', 'error');
    if (num(f.hm_start) < 0 || num(f.hm_end) < 0 || num(f.fuel_gal) < 0) return toast('Los valores no pueden ser negativos.', 'error');
    if (num(f.hm_end) < num(f.hm_start)) return toast('El horómetro final no puede ser menor que el inicial.', 'error');
    if (!f.id && num(f.hm_start) !== last(f.asset_id) && !window.confirm(`El horómetro inicial (${f.hm_start}) no coincide con la última lectura (${last(f.asset_id)}). ¿Guardar de todos modos?`)) return;
    const payload = { log_date: f.log_date, asset_id: f.asset_id, operator: f.operator.trim(), shift: f.shift, hm_start: num(f.hm_start), hm_end: num(f.hm_end), fuel_gal: num(f.fuel_gal), observations: f.observations?.trim() || null };
    const row = await run(async () => {
      const r = f.id ? await supabase.from('hourmeter_logs').update(payload).eq('id', f.id).select('*').single() : await supabase.from('hourmeter_logs').insert(payload).select('*').single();
      if (r.error) throw r.error; return r.data;
    }, 'Registro guardado');
    if (row) { await reload(); load(row); }
  };
  const del = async (l: any) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    const ok = await run(async () => { const { error } = await supabase.from('hourmeter_logs').delete().eq('id', l.id); if (error) throw error; return true; }, 'Registro eliminado');
    if (ok) { if (f.id === l.id) setF(blank()); reload(); }
  };

  const printDash = () => setPv({ title: 'Control de maquinaria: horómetros y combustible', subtitle: `Del ${from ? fmtDate(from) : 'inicio'} al ${to ? fmtDate(to) : 'hoy'}`, orient: 'landscape',
    meta: [`Total horas trabajadas: ${q1(H)}`, `Total combustible (gal): ${fmt(G)}`, `Eficiencia global (gal/hora): ${fmt(eff)}`, `Registros: ${view.length}`],
    cols: ['Código', 'Equipo', 'Horómetro actual', 'Horas totales', 'Combustible (gal)', 'Gal / hora', 'Estado'],
    rows: byEq.map((x) => [x.a.code, x.a.name || x.a.type || '', q1(last(x.a.id)), q1(x.h), fmt(x.g), fmt(x.r), state(x)]), foot: ['Total', '', '', q1(H), fmt(G), fmt(eff), ''] });
  const printLog = () => setPv({ title: 'Registro de horómetros', subtitle: `Del ${from ? fmtDate(from) : 'inicio'} al ${to ? fmtDate(to) : 'hoy'}`, orient: 'landscape',
    cols: ['Nº', 'Fecha', 'Equipo', 'Operador', 'Turno', 'Hor. inicial', 'Hor. final', 'Total horas', 'Comb. (gal)', 'Observaciones'],
    rows: view.map((l) => [pad(l.number), fmtDate(l.log_date), aName(l.asset_id), l.operator, l.shift, q1(l.hm_start), q1(l.hm_end), q1(l.hours), fmt(l.fuel_gal), l.observations || '']), foot: ['Total', '', '', '', '', '', '', q1(H), fmt(G), ''] });

  const filters = (
    <div className="toolbar">
      <label className="check">Desde <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="check">Hasta <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <select value={eq} onChange={(e) => setEq(e.target.value)}><option value="">Todas las máquinas</option>{machs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
    </div>);

  return (
    <div>
      {pv && <PrintPreview doc={pv} onClose={() => setPv(null)} />}
      <PageHeader title="Control de maquinaria" subtitle="Horómetros, horas trabajadas y combustible por equipo."
        actions={<><button className="btn" onClick={tab === 'dash' ? printDash : printLog}>Imprimir</button><button className="btn btn-primary" onClick={() => { setF(blank()); setTab('form'); }}>+ Nuevo registro</button></>} />
      <div className="tabs"><button className={tab === 'dash' ? 'on' : ''} onClick={() => setTab('dash')}>Dashboard</button><button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>Formulario de registro</button></div>
      <ErrorBox text={error} />
      {loading && !data ? <Loading /> : tab === 'dash' ? (<>
        {filters}
        <div className="kpis">
          <div className="kpi"><small>Total horas trabajadas</small><b>{q1(H)}</b></div>
          <div className="kpi warn"><small>Total combustible (gal)</small><b>{fmt(G)}</b></div>
          <div className="kpi info"><small>Eficiencia global (gal/hora)</small><b>{fmt(eff)}</b></div>
          <div className="kpi"><small>Registros</small><b>{view.length}</b></div>
        </div>
        <div className="panel"><h3>Resumen de consumo y horas por equipo</h3>
          <div className="table-wrap"><table className="grid">
            <thead><tr><th>Código</th><th>Equipo</th><th className="r">Horómetro actual</th><th className="r">Horas totales</th><th className="r">Combustible (gal)</th><th className="r">Gal / hora</th><th>Estado</th></tr></thead>
            <tbody>{byEq.map((x) => <tr key={x.a.id}><td><b>{x.a.code}</b></td><td>{x.a.name}</td><td className="r">{q1(last(x.a.id))}</td><td className="r">{q1(x.h)}</td><td className="r">{fmt(x.g)}</td><td className="r">{fmt(x.r)}</td>
              <td><span className={'badge ' + (state(x) === 'Normal' ? 'ok' : state(x) === 'Consumo alto' ? 'warn' : '')}>{state(x)}</span></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={3}>Total</td><td className="r">{q1(H)}</td><td className="r">{fmt(G)}</td><td className="r">{fmt(eff)}</td><td /></tr></tfoot>
          </table></div>
          <small style={{ color: 'var(--muted)' }}>"Consumo alto" = más de 25 % sobre la eficiencia global.</small>
        </div>
        <div className="two-col">
          <div className="panel"><h3>Horas y combustible por equipo</h3>
            {byEq.map((x) => <div key={x.a.id} style={{ marginBottom: 10 }}><div>{x.a.code} · {x.a.name}</div>
              <div className="bar-row"><div style={{ flex: 1 }}><div className="bar" style={{ width: Math.max(2, (x.h / maxH) * 100) + '%', background: 'var(--brand)' }} /></div><span style={{ width: 70, textAlign: 'right' }}>{q1(x.h)} h</span></div>
              <div className="bar-row"><div style={{ flex: 1 }}><div className="bar" style={{ width: Math.max(2, (x.g / maxG) * 100) + '%', background: 'var(--amber)' }} /></div><span style={{ width: 70, textAlign: 'right' }}>{fmt(x.g)} gal</span></div></div>)}
            {!byEq.length && <Empty text="No hay maquinaria registrada." />}
          </div>
          <div className="panel"><h3>Horas trabajadas por día</h3>
            {days.map((x) => <div className="bar-row" key={x.d}><span style={{ width: 90 }}>{fmtDate(x.d)}</span><div style={{ flex: 1 }}><div className="bar" style={{ width: Math.max(2, (x.h / maxD) * 100) + '%', background: 'var(--ok)' }} /></div><span style={{ width: 60, textAlign: 'right' }}>{q1(x.h)} h</span></div>)}
            {!days.length && <Empty text="Sin registros en el período." />}
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
          <h3>Registro de horómetro {f.number ? 'Nº ' + pad(f.number) : '(nuevo)'}</h3>
          <div className="form-grid">
            <Field label="Fecha *"><input type="date" value={f.log_date} onChange={(e) => set('log_date', e.target.value)} /></Field>
            <Field label="Código de Equipo *"><select value={f.asset_id} disabled={!!f.id} onChange={(e) => pickAsset(e.target.value)}><option value="">— Elegir —</option>{machs.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
            <Field label="Tipo de Maquinaria (automático)"><input readOnly value={assets.find((a) => a.id === f.asset_id)?.type || ''} /></Field>
            <Field label="Operador *"><input value={f.operator} onChange={(e) => set('operator', e.target.value)} /></Field>
            <Field label="Turno *"><select value={f.shift} onChange={(e) => set('shift', e.target.value)}>{['Mañana', 'Tarde', 'Noche'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Horómetro Inicial *"><input type="number" min="0" step="0.1" value={f.hm_start} onChange={(e) => set('hm_start', e.target.value)} /></Field>
            <Field label="Horómetro Final *"><input type="number" min="0" step="0.1" value={f.hm_end} onChange={(e) => set('hm_end', e.target.value)} /></Field>
            <Field label="Total Horas (automático)"><input readOnly value={f.hm_start !== '' && f.hm_end !== '' ? q1(num(f.hm_end) - num(f.hm_start)) : ''} /></Field>
            <Field label="Combustible (Gal)"><input type="number" min="0" step="0.1" value={f.fuel_gal} onChange={(e) => set('fuel_gal', e.target.value)} /></Field>
            <Field label="Observaciones" full><input value={f.observations} onChange={(e) => set('observations', e.target.value)} /></Field>
          </div>
          {f.asset_id && !f.id && <small style={{ color: 'var(--muted)' }}>Última lectura de este equipo: {q1(last(f.asset_id))} h. El horómetro inicial se llena solo.</small>}
        </div>
        {filters}
        <div className="table-wrap"><table className="grid">
          <thead><tr><th>Nº</th><th>Fecha</th><th>Código</th><th>Operador</th><th>Turno</th><th className="r">Hor. inicial</th><th className="r">Hor. final</th><th className="r">Total horas</th><th className="r">Comb. (gal)</th><th>Observaciones</th></tr></thead>
          <tbody>{view.map((l) => <tr key={l.id} className={'clickable' + (f.id === l.id ? ' sel' : '')} onClick={() => load(l)}><td>{pad(l.number)}</td><td>{fmtDate(l.log_date)}</td><td><b>{assets.find((a) => a.id === l.asset_id)?.code}</b></td><td>{l.operator}</td><td>{l.shift}</td><td className="r">{q1(l.hm_start)}</td><td className="r">{q1(l.hm_end)}</td><td className="r"><b>{q1(l.hours)}</b></td><td className="r">{fmt(l.fuel_gal)}</td><td>{l.observations}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={7}>Total general</td><td className="r">{q1(H)}</td><td className="r">{fmt(G)}</td><td /></tr></tfoot>
        </table>{!view.length && <Empty text="Sin registros para esos filtros." />}</div>
      </>)}
    </div>
  );
}
