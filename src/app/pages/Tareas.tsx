import { useState } from 'react'
import { useData } from '../DataProvider'
import { useFincas, useTareas } from '../hooks'
import { fmtDate, isISO, todayISO } from '../../domain/dates'
import { uuidv7 } from '../../lib/ids'
import { Empty, Field } from '../ui'

export function Tareas() {
  const { store } = useData(), fincas = useFincas(), tareas = useTareas(), hoy = todayISO()
  const [t, setT] = useState(''), [cu, setCu] = useState(''), [fecha, setFecha] = useState(hoy), [err, setErr] = useState<string | null>(null)
  async function add() {
    if (t.trim().length < 3) return setErr('Escribí qué hay que hacer (al menos 3 letras).'); if (!isISO(fecha)) return setErr('Elegí una fecha válida.')
    await store.patch('tarea', uuidv7(), { t: t.trim(), cu: cu || null, fecha, hecha: false }); setT(''); setErr(null)
  }
  const sorted = [...tareas].sort((a, b) => Number(a.f.hecha) - Number(b.f.hecha) || (a.f.fecha < b.f.fecha ? -1 : 1))
  return <div className="page"><h1>Tareas</h1><p className="muted">Tus pendientes con fecha y finca.</p>
    <section className="card"><div className="two"><Field label="¿Qué hay que hacer?"><input value={t} onChange={(e) => setT(e.target.value)} maxLength={120} placeholder="Podar el lote 2" /></Field><Field label="Para cuándo"><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field></div>
      <Field label="Finca (opcional)"><select value={cu} onChange={(e) => setCu(e.target.value)}><option value="">Sin finca</option>{fincas.map((f) => <option key={f.id} value={f.id}>{f.f.n}</option>)}</select></Field>
      {err && <p className="err" role="alert">{err}</p>}<button className="btn primary" onClick={() => void add()}>+ Agregar tarea</button></section>
    <div className="list">{sorted.length === 0 && <Empty>No hay tareas. ¡Todo al día!</Empty>}
      {sorted.map((r) => <div key={r.id} className={`row ${r.f.hecha ? 'done' : ''}`}><input type="checkbox" aria-label={`Hecha: ${r.f.t}`} checked={r.f.hecha} onChange={() => void store.patch('tarea', r.id, { hecha: !r.f.hecha })} />
        <span className="grow"><strong>{r.f.t}</strong><br /><small className={!r.f.hecha && r.f.fecha < hoy ? 'err' : 'muted'}>{fmtDate(r.f.fecha)}{r.f.cu ? ` · ${fincas.find((f) => f.id === r.f.cu)?.f.n ?? ''}` : ''}{!r.f.hecha && r.f.fecha < hoy ? ' · atrasada' : ''}</small></span>
        <button className="link bad" onClick={() => void store.remove('tarea', r.id)}>Quitar</button></div>)}</div></div>
}
