import { useMemo, useState } from 'react'
import { useData } from '../DataProvider'
import { useCosechas, useCuadrillas } from '../hooks'
import { resumenCuadrillas } from '../../domain/operaciones'
import { temporada, todayISO } from '../../domain/dates'
import { uuidv7 } from '../../lib/ids'
import { useConfirm } from '../../ui/Dialog'
import { Empty, Field } from '../ui'

const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/** Cuadrillas de cosecha: quién cosecha, cuántos bines llevan en la temporada y cuánto se les debe por bin. */
export function Cuadrillas() {
  const { store } = useData(), ask = useConfirm(), cuad = useCuadrillas(), cos = useCosechas(), temp = temporada(todayISO())
  const res = useMemo(() => resumenCuadrillas(cos, cuad, temp), [cos, cuad, temp])
  const [f, setF] = useState({ n: '', jefe: '', personas: '8', tarifa: '' }), [err, setErr] = useState<string | null>(null)
  async function add() {
    const personas = Number(f.personas), tarifa = f.tarifa.trim() ? Number(f.tarifa.replace(/\./g, '').replace(',', '.')) : null
    if (f.n.trim().length < 2) return setErr('Poné un nombre a la cuadrilla (por ej. “Cuadrilla de Juan”).')
    if (!Number.isInteger(personas) || personas < 1 || personas > 200) return setErr('La cantidad de personas debe ser un número entre 1 y 200.')
    if (tarifa != null && !(tarifa > 0)) return setErr('El pago por bin debe ser un número mayor que 0, o dejalo vacío.')
    await store.patch('cuadrilla', uuidv7(), { n: f.n.trim(), jefe: f.jefe.trim(), personas, tarifa, activa: true }); setF({ n: '', jefe: '', personas: '8', tarifa: '' }); setErr(null)
  }
  const total = res.reduce((s, r) => s + (r.pago ?? 0), 0)
  return <div className="page"><h1>Cuadrillas</h1><p className="muted">Quién cosecha y cuánto lleva. Al cargar una cosecha elegís la cuadrilla y acá se suma sola. Temporada {temp}.</p>
    <div className="tiles"><div className="tile"><b>{res.reduce((s, r) => s + r.bins, 0)}</b><span>bines cosechados</span><small>Por todas las cuadrillas</small></div><div className="tile"><b>{total ? ars(total) : '—'}</b><span>a pagar (estimado)</span><small>Bines × pago por bin</small></div></div>
    <div className="list">{!res.length && <Empty>Todavía no cargaste cuadrillas.</Empty>}
      {res.map((r) => <div key={r.id} className={`row ${r.f.activa ? '' : 'done'}`}><span className="grow"><strong>{r.f.n}</strong><br /><small className="muted">{r.f.jefe ? `Jefe: ${r.f.jefe} · ` : ''}{r.f.personas} personas{r.f.tarifa ? ` · ${ars(r.f.tarifa)} por bin` : ''}</small></span>
        <span className="num"><strong>{r.bins}</strong> bines · {r.dias} días{r.pago != null && <><br /><small className="muted">{ars(r.pago)}</small></>}</span>
        <button className="link" onClick={() => void store.patch('cuadrilla', r.id, { activa: !r.f.activa })}>{r.f.activa ? 'Pausar' : 'Activar'}</button>
        <button className="link bad" onClick={async () => { if (await ask({ title: `¿Quitar “${r.f.n}”?`, body: 'Las cosechas que ya cargó quedan en el historial.', ok: 'Quitar', danger: true })) void store.remove('cuadrilla', r.id) }}>Quitar</button></div>)}</div>
    <section className="card"><h2>Nueva cuadrilla</h2>
      <div className="two"><Field label="Nombre"><input value={f.n} maxLength={60} onChange={(e) => setF({ ...f, n: e.target.value })} placeholder="Cuadrilla de Juan" /></Field><Field label="Jefe de cuadrilla (opcional)"><input value={f.jefe} maxLength={60} onChange={(e) => setF({ ...f, jefe: e.target.value })} /></Field></div>
      <div className="two"><Field label="Personas"><input inputMode="numeric" value={f.personas} onChange={(e) => setF({ ...f, personas: e.target.value })} /></Field><Field label="Pago por bin en $ (opcional)"><input inputMode="decimal" value={f.tarifa} onChange={(e) => setF({ ...f, tarifa: e.target.value })} placeholder="Ej.: 1500" /></Field></div>
      <p className="muted small">Por privacidad no guardamos datos personales de cada trabajador: solo el nombre de la cuadrilla y su jefe.</p>
      {err && <p className="err" role="alert">{err}</p>}<button className="btn primary" onClick={() => void add()}>+ Agregar cuadrilla</button></section></div>
}
