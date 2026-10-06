export type NoteType = 'entry' | 'exit' | 'transfer' | 'request' | 'fuel_in' | 'fuel_out' | 'agro_out' | 'parts_out';

export interface FieldDef {
  key: string; label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'warehouse' | 'supplier' | 'asset';
  extra?: boolean;              // se guarda dentro de "extra" (datos propios de ese formulario)
  options?: [string, string][];
  required?: boolean; full?: boolean; hint?: string;
  assetKinds?: string[];
}

export interface NoteConfig {
  type: NoteType; title: string; singular: string; intro?: string;
  effect: 'in' | 'out' | 'transfer';
  fields: FieldDef[];
  categories?: string[];        // nombres de categorías que se pueden elegir en la grilla
  qtyLabel?: string; costLabel?: string;
}

const PRIORIDAD: [string, string][] = [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta'], ['urgente', 'Urgente']];

export const NOTE_CONFIGS: Record<NoteType, NoteConfig> = {
  entry: {
    type: 'entry', title: 'Entradas', singular: 'Nota de entrada', effect: 'in',
    intro: 'Registra productos que ingresan al almacén. Suma al inventario.',
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'supplier_id', label: 'Proveedor', kind: 'supplier', required: true },
      { key: 'person_receives', label: 'Responsable', kind: 'text', required: true },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  exit: {
    type: 'exit', title: 'Salidas', singular: 'Nota de salida', effect: 'out',
    intro: 'Registra productos que salen del almacén. Descuenta del inventario.',
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'reason', label: 'Motivo', kind: 'text', required: true },
      { key: 'person_delivers', label: 'Persona que entrega', kind: 'text', required: true },
      { key: 'person_receives', label: 'Persona que recibe', kind: 'text', required: true },
      { key: 'asset_id', label: 'Maquinaria / equipo / vehículo (opcional)', kind: 'asset' },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  transfer: {
    type: 'transfer', title: 'Traspasos', singular: 'Nota de traspaso', effect: 'transfer',
    intro: 'Mueve productos de un almacén a otro. Flujo: Pendiente > Aprobado > Preparando > Despachado > Recibido. El stock sale del origen al despachar y entra al destino al recibir.',
    fields: [
      { key: 'from_warehouse_id', label: 'Almacén origen', kind: 'warehouse', required: true },
      { key: 'to_warehouse_id', label: 'Almacén destino', kind: 'warehouse', required: true },
      { key: 'person_delivers', label: 'Responsable', kind: 'text', required: true },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  request: {
    type: 'request', title: 'Pedidos al almacén central', singular: 'Solicitud de productos', effect: 'transfer',
    intro: 'Cada almacén solicita productos al central. Flujo: Pendiente > Aprobado > Preparando > Despachado > Recibido.',
    fields: [
      { key: 'to_warehouse_id', label: 'Almacén solicitante', kind: 'warehouse', required: true },
      { key: 'from_warehouse_id', label: 'Se solicita a', kind: 'warehouse' },
      { key: 'priority', label: 'Prioridad', kind: 'select', options: PRIORIDAD },
      { key: 'person_delivers', label: 'Solicitado por', kind: 'text', required: true },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  fuel_in: {
    type: 'fuel_in', title: 'Recepción de combustible', singular: 'Recepción de combustible', effect: 'in',
    intro: 'Registra el combustible que llega al almacén. Suma litros al inventario.',
    categories: ['Combustible'], qtyLabel: 'Litros', costLabel: 'Costo por litro',
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'supplier_id', label: 'Proveedor', kind: 'supplier', required: true },
      { key: 'driver', label: 'Nombre del chofer', kind: 'text', extra: true, required: true },
      { key: 'transport', label: 'Vehículo transportador', kind: 'text', extra: true, required: true },
      { key: 'doc_ref', label: 'Nº de factura o remisión', kind: 'text', extra: true },
      { key: 'person_receives', label: 'Recibido por', kind: 'text', required: true },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  fuel_out: {
    type: 'fuel_out', title: 'Entrega de combustible', singular: 'Entrega de combustible', effect: 'out',
    intro: 'Registra el combustible entregado a un tractor, camioneta, maquinaria o equipo. Descuenta litros del inventario.',
    categories: ['Combustible'], qtyLabel: 'Litros', costLabel: 'Costo por litro',
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'asset_id', label: 'Máquina / equipo / vehículo', kind: 'asset', required: true },
      { key: 'person_receives', label: 'Operador / persona que recibe', kind: 'text', required: true },
      { key: 'person_delivers', label: 'Usuario que entrega', kind: 'text', required: true },
      { key: 'hourmeter', label: 'Horómetro', kind: 'number', extra: true },
      { key: 'mileage', label: 'Kilometraje', kind: 'number', extra: true },
      { key: 'reason', label: 'Labor o motivo', kind: 'text' },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  agro_out: {
    type: 'agro_out', title: 'Entrega de agroquímicos', singular: 'Entrega de agroquímicos', effect: 'out',
    intro: 'Registra la entrega de agroquímicos. Descuenta del inventario automáticamente.',
    categories: ['Agroquímicos'],
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'person_delivers', label: 'Usuario que entrega', kind: 'text', required: true },
      { key: 'person_receives', label: 'Persona que recibe', kind: 'text', required: true },
      { key: 'asset_id', label: 'Maquinaria / equipo / vehículo (si corresponde)', kind: 'asset' },
      { key: 'reason', label: 'Motivo', kind: 'text', required: true },
      { key: 'field', label: 'Lote / parcela', kind: 'text', extra: true },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
  parts_out: {
    type: 'parts_out', title: 'Entrega de repuestos', singular: 'Asignación de repuestos', effect: 'out',
    intro: 'Registra los repuestos asignados a una máquina, vehículo o equipo. Descuenta del inventario.',
    categories: ['Repuestos'],
    fields: [
      { key: 'warehouse_id', label: 'Almacén', kind: 'warehouse', required: true },
      { key: 'asset_id', label: 'Maquinaria / equipo / vehículo', kind: 'asset', required: true },
      { key: 'person_delivers', label: 'Usuario que entrega', kind: 'text', required: true },
      { key: 'person_receives', label: 'Persona que recibe', kind: 'text', required: true },
      { key: 'reason', label: 'Motivo', kind: 'text' },
      { key: 'observations', label: 'Observaciones', kind: 'textarea', full: true },
    ],
  },
};
