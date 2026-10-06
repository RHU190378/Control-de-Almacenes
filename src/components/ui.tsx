import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { NOTE_STATUS, SERVICE_STATUS, errMsg } from '../lib/util';

// ---------- Avisos ----------
type Kind = 'ok' | 'error';
const ToastCtx = createContext<(msg: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([]);
  const push = useCallback((msg: string, kind: Kind = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// Ejecuta una acción y muestra el error si falla
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(errMsg(e), 'error'); return undefined; }
  }, [toast]);
}

// ---------- Estructura ----------
export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return (
    <label className={'field' + (full ? ' full' : '')}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}

export function Badge({ text, tone }: { text: string; tone?: string }) {
  return <span className={'badge ' + (tone || '')}>{text}</span>;
}
const TONES: Record<string, string> = {
  pendiente: 'warn', solicitado: 'warn', aprobado: 'info', preparando: 'info', despachado: 'info', en_atencion: 'info',
  en_reparacion: 'warn', recibido: 'ok', terminado: 'ok', registrada: 'ok', cancelado: 'bad', activo: 'ok', inactivo: 'muted', baja: 'bad',
};
export function StatusBadge({ status, service }: { status: string; service?: boolean }) {
  const label = (service ? SERVICE_STATUS : NOTE_STATUS)[status] || status;
  return <Badge text={label} tone={TONES[status]} />;
}

export function Loading({ text = 'Cargando…' }: { text?: string }) { return <div className="loading">{text}</div>; }
export function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

export function Btn({ kind, small, ...p }: any) {
  const { className = '', ...rest } = p;
  return <button type="button" {...rest} className={`btn ${kind ? 'btn-' + kind : ''} ${small ? 'btn-sm' : ''} ${className}`} />;
}

// ---------- Carga de datos ----------
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const seq = useRef(0);
  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError('');
    try { const d = await fn(); if (my === seq.current) setData(d); }
    catch (e) { if (my === seq.current) setError(errMsg(e)); }
    finally { if (my === seq.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, loading, error, reload: run, setData };
}

export function ErrorBox({ text }: { text: string }) { return text ? <div className="error-box">{text}</div> : null; }

export function SearchBox({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
