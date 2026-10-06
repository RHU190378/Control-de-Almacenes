import { useEffect, useMemo, useRef, useState } from 'react';
import { norm } from './ui';
import { fmtQty } from '../lib/util';

export interface ProductLite {
  id: string; code: string; manufacturer_code: string | null; name: string; category_id: string | null;
  unit_id: string | null; cost: number; active: boolean; brand?: string | null; model?: string | null;
}

// Buscador de productos por código, código de fabricante o nombre.
export default function ProductPicker({ products, value, onChange, stock, placeholder = 'Buscar producto por código o nombre…', disabled }: {
  products: ProductLite[]; value: string; onChange: (id: string) => void;
  stock?: Record<string, number> | null; placeholder?: string; disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const selected = products.find((p) => p.id === value);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const matches = useMemo(() => {
    const t = norm(q).trim();
    const list = products.filter((p) => p.active);
    if (!t) return list.slice(0, 30);
    const words = t.split(/\s+/);
    return list.filter((p) => {
      const hay = norm(`${p.code} ${p.manufacturer_code || ''} ${p.name} ${p.brand || ''} ${p.model || ''}`);
      return words.every((w) => hay.includes(w));
    }).slice(0, 30);
  }, [q, products]);

  return (
    <div className="picker" ref={box}>
      <input
        disabled={disabled}
        value={open ? q : selected ? `${selected.code} · ${selected.name}` : ''}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="picker-list">
          {matches.length === 0 && <div className="picker-empty">Sin resultados</div>}
          {matches.map((p) => (
            <button type="button" key={p.id} className="picker-item" onClick={() => { onChange(p.id); setOpen(false); setQ(''); }}>
              <b>{p.code}</b>
              <span>{p.name}{p.manufacturer_code ? ` · fab. ${p.manufacturer_code}` : ''}</span>
              {stock && <em>{fmtQty(stock[p.id] || 0)} disp.</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
