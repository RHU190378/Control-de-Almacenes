import { supabase } from '../supabase';

export const ROLE_LABEL: Record<string, string> = {
  system_admin: 'Administrador de sistema',
  warehouse_admin: 'Administrador de almacén',
  user: 'Usuario de almacén',
};

export const NOTE_STATUS: Record<string, string> = {
  registrada: 'Registrada', pendiente: 'Pendiente', aprobado: 'Aprobado', preparando: 'Preparando',
  despachado: 'Despachado', recibido: 'Recibido', cancelado: 'Cancelado',
};

export const SERVICE_STATUS: Record<string, string> = {
  solicitado: 'Solicitado', en_atencion: 'En atención', en_reparacion: 'En reparación',
  terminado: 'Terminado', cancelado: 'Cancelado',
};

export const NOTE_TYPE_LABEL: Record<string, string> = {
  entry: 'Entrada', exit: 'Salida', transfer: 'Traspaso', request: 'Pedido',
  fuel_in: 'Recepción de combustible', fuel_out: 'Entrega de combustible',
  agro_out: 'Entrega de agroquímicos', parts_out: 'Entrega de repuestos',
};

export const NOTE_PREFIX: Record<string, string> = {
  entry: 'ENT', exit: 'SAL', transfer: 'TRA', request: 'PED',
  fuel_in: 'REC', fuel_out: 'COM', agro_out: 'AGR', parts_out: 'REP',
};

export const ASSET_KIND: Record<string, string> = { machinery: 'Maquinaria', vehicle: 'Vehículo', equipment: 'Equipo' };

const pad = (n: number) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const addDays = (iso: string, days: number) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const monthStart = () => today().slice(0, 8) + '01';

export const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const fmt = (n: any, d = 2) =>
  new Intl.NumberFormat('es-BO', { minimumFractionDigits: d, maximumFractionDigits: d }).format(num(n));
export const fmtQty = (n: any) =>
  new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(num(n));
export const fmtDate = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString('es-BO', { hour12: false }) : '');
export const noteNumber = (type: string, n: number) => `${NOTE_PREFIX[type] || 'NOT'}-${String(n).padStart(6, '0')}`;

export function errMsg(e: any): string {
  const m = e?.message || e?.error_description || e?.details || String(e);
  if (/duplicate key|already exists|unique/i.test(m)) return 'Ya existe un registro con ese mismo código o nombre.';
  if (/violates foreign key/i.test(m)) return 'No se puede completar: el registro está siendo usado en otras partes del sistema.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para realizar esta acción.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet y la configuración de Supabase.';
  return m;
}

// Supabase entrega máximo 1000 filas por consulta: esta función trae todas.
export async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let i = 0; ; i += size) {
    const { data, error } = await build(i, i + size - 1);
    if (error) throw error;
    out.push(...((data as T[]) || []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function exportXlsx(rows: any[], filename: string, sheet = 'Datos') {
  const XLSX: any = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx');
}

export function downloadText(text: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Reduce la foto (máx. 1200 px) antes de subirla para ahorrar espacio y datos móviles.
async function shrink(file: File, max = 1200): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82));
}

export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const blob = await shrink(file);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('No se pudo subir la foto. ¿Existe el bucket "fotos" en Supabase? (' + error.message + ')');
  return supabase.storage.from('fotos').getPublicUrl(path).data.publicUrl;
}
