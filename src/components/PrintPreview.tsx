import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLookups } from '../lib/lookups';
import { today } from '../lib/util';
import { PrintDoc, buildPdf, buildXlsx, download, isNumTxt, numCols, slug } from '../lib/printDoc';
import { useToast } from './ui';

// Vista previa de impresión: permite exportar a PDF, a Excel o imprimir en la impresora.
export default function PrintPreview({ doc, onClose }: { doc: PrintDoc; onClose: () => void }) {
  const { company: co } = useLookups();
  const toast = useToast();
  const [orient, setOrient] = useState<'landscape' | 'portrait'>(doc.orient);
  const date = new Date().toLocaleString('es-BO');
  const d = { ...doc, orient };
  const name = slug(doc.title) + '_' + today();
  const isNum = numCols(doc.cols, doc.rows);
  void isNumTxt;

  useEffect(() => {
    document.body.classList.add('pv-open');
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => { document.body.classList.remove('pv-open'); window.removeEventListener('keydown', h); };
  }, [onClose]);

  const toPdf = () => { try { download(buildPdf(d, co || {}, date), name + '.pdf'); toast('Archivo PDF generado'); } catch (e: any) { toast('No se pudo generar el PDF: ' + e.message, 'error'); } };
  const toXlsx = async () => { try { download(await buildXlsx(d, co || {}), name + '.xlsx'); toast('Archivo Excel generado'); } catch (e: any) { toast('No se pudo generar el Excel: ' + e.message, 'error'); } };

  return createPortal(
    <div className="pv-portal">
      <style>{`@media print{@page{size:A4 ${orient};margin:12mm}}`}</style>
      <div className="pv-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="pv-box">
          <div className="pv-bar">
            <b>Vista previa de impresión</b>
            <select value={orient} onChange={(e) => setOrient(e.target.value as any)} style={{ width: 'auto' }}>
              <option value="landscape">Hoja horizontal</option><option value="portrait">Hoja vertical</option>
            </select>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={toPdf}>Exportar PDF</button>
            <button className="btn" onClick={toXlsx}>Exportar Excel</button>
            <button className="btn btn-primary" onClick={() => window.print()}>Imprimir</button>
            <button className="btn" onClick={onClose}>Cerrar</button>
          </div>
          <div className="pv-scroll">
            <div className="pv-doc" style={{ width: orient === 'landscape' ? 1000 : 720 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                {co?.logo_url && <img src={co.logo_url} alt="" style={{ height: 52, maxWidth: 120, objectFit: 'contain' }} />}
                <div><b style={{ fontSize: 16 }}>{co?.name}</b>{co?.tax_id && <div>NIT: {co.tax_id}</div>}{co?.address && <div>{co.address}</div>}
                  {(co?.phone || co?.email) && <div>{[co.phone && 'Tel.: ' + co.phone, co.email].filter(Boolean).join(' · ')}</div>}</div>
              </div>
              <h2 style={{ margin: '6px 0 2px', fontSize: 18 }}>{doc.title}</h2>
              {doc.subtitle && <div style={{ color: '#5d6a63', marginBottom: 6 }}>{doc.subtitle}</div>}
              {(doc.meta || []).map((m, i) => <div key={i}>{m}</div>)}
              <table>
                <thead><tr>{doc.cols.map((c, j) => <th key={j} style={{ textAlign: isNum[j] ? 'right' : 'left' }}>{c}</th>)}</tr></thead>
                <tbody>
                  {doc.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ textAlign: isNum[j] ? 'right' : 'left' }}>{c}</td>)}</tr>)}
                  {!doc.rows.length && <tr><td colSpan={doc.cols.length}>Sin datos.</td></tr>}
                </tbody>
                {doc.foot && doc.rows.length > 0 && <tfoot><tr>{doc.foot.map((c, j) => <td key={j} style={{ textAlign: isNum[j] ? 'right' : 'left', fontWeight: 700 }}>{c}</td>)}</tr></tfoot>}
              </table>
              <div style={{ marginTop: 10, fontSize: 11, color: '#5d6a63' }}>Emitido el {date}</div>
            </div>
          </div>
        </div>
      </div>
    </div>, document.body);
}
