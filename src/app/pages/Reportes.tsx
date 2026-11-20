import { useMemo, useState } from 'react'
import { useAuth } from '../AuthProvider'
import { useCosechas, useCuras, useEntregas, useFincas, useProductos, useRiegos, type Nav } from '../hooks'
import { cuaderno, csv, type Tabla } from '../../domain/reportes'
import { temporada, todayISO } from '../../domain/dates'
import { canUse } from '../../plans/plans'
import { download } from '../download'

/** Reportes exportables (plan Pro): cuaderno de campo en PDF y planillas CSV para Excel. Se generan en el equipo, sin conexión. */
export function Reportes({ go }: Nav) {
  const org = useAuth().org!, fincas = useFincas(), curas = useCuras(), cosechas = useCosechas(), riegos = useRiegos(), entregas = useEntregas(), { map: prods } = useProductos()
  const temps = useMemo(() => [...new Set([temporada(todayISO()), ...[...curas, ...cosechas, ...riegos, ...entregas].map((r) => temporada(r.f.fecha))])].sort().reverse(), [curas, cosechas, riegos, entregas])
  const [temp, setTemp] = useState(temps[0]), [fincaId, setFincaId] = useState(''), [busy, setBusy] = useState(false)
  const tablas = useMemo(() => cuaderno({ temp, fincaId: fincaId || undefined, fincas, curas, cosechas, riegos, entregas, prods }), [temp, fincaId, fincas, curas, cosechas, riegos, entregas, prods])
  const pro = canUse(org.plan, 'exportReports'), base = `fincapp-${temp.replace('/', '-')}${fincaId ? '-' + (fincas.find((f) => f.id === fincaId)?.f.n ?? '').replace(/\W+/g, '-').toLowerCase() : ''}`

  async function pdf() {
    setBusy(true)
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])   // se cargan solo al usarlos
      const d = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), monte: [number, number, number] = [36, 84, 66]
      d.setFont('helvetica', 'bold'); d.setFontSize(16); d.setTextColor(...monte); d.text('Cuaderno de campo', 14, 16)
      d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(60)
      d.text(`${org.name} · Temporada ${temp}${fincaId ? ` · ${fincas.find((f) => f.id === fincaId)?.f.n}` : ' · Todas las fincas'} · Generado el ${new Date().toLocaleDateString('es-AR')} con FincApp`, 14, 22)
      let y = 30
      for (const t of tablas) {
        d.setFont('helvetica', 'bold'); d.setFontSize(12); d.setTextColor(...monte); d.text(`${t.titulo} (${t.filas.length})`, 14, y)
        autoTable(d, { startY: y + 3, head: [t.cols], body: t.filas.length ? t.filas.map((r) => r.map(String)) : [[{ content: 'Sin registros en esta temporada.', colSpan: t.cols.length }]] as any, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: monte }, alternateRowStyles: { fillColor: [244, 246, 242] }, margin: { left: 14, right: 14 } })
        y = (d as any).lastAutoTable.finalY + 10; if (y > 180) { d.addPage(); y = 16 }
      }
      const n = d.getNumberOfPages(); for (let i = 1; i <= n; i++) { d.setPage(i); d.setFontSize(8); d.setTextColor(120); d.text(`Página ${i} de ${n} · Las carencias salen de lo que cargó el productor: verificá siempre la etiqueta del producto.`, 14, 203) }
      download(`${base}-cuaderno.pdf`, d.output('arraybuffer'), 'application/pdf')
    } finally { setBusy(false) }
  }
  const unaCsv = (t: Tabla) => download(`${base}-${t.titulo.toLowerCase().replace(/\W+/g, '-')}.csv`, csv(t), 'text/csv;charset=utf-8')

  return <div className="page"><h1>Reportes</h1><p className="muted">El cuaderno de campo listo para el auditor, el empaque o el contador. Se arma en tu equipo, aunque no tengas señal.</p>
    <section className="card"><div className="two"><label className="field"><span>Temporada</span><select value={temp} onChange={(e) => setTemp(e.target.value)}>{temps.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Finca</span><select value={fincaId} onChange={(e) => setFincaId(e.target.value)}><option value="">Todas</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.f.n}</option>)}</select></label></div>
      <ul className="plain">{tablas.map((t) => <li key={t.titulo} className="between"><span><strong>{t.titulo}</strong> <span className="muted">· {t.filas.length} {t.filas.length === 1 ? 'registro' : 'registros'}</span></span>
        {pro && <button className="btn small" disabled={!t.filas.length} onClick={() => unaCsv(t)}>Planilla CSV</button>}</li>)}</ul>
      {pro ? <button className={`btn primary ${busy ? 'busy' : ''}`} disabled={busy} onClick={() => void pdf()}>Descargar cuaderno de campo (PDF)</button>
        : <div className="note upsell"><strong>Exportar es parte del plan Pro.</strong> <span className="muted">Podés ver el resumen; para descargar el PDF y las planillas, pasá a Pro.</span> <button className="btn small primary" onClick={() => go('plan')}>Ver plan Pro</button></div>}</section></div>
}
