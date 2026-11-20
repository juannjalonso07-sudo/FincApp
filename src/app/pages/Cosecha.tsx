import { useEffect, useRef, useState } from 'react'
import { useData } from '../DataProvider'
import { useConfirm } from '../../ui/Dialog'
import { useCosechas, useCuadrillas, useCuras, useFincas, useProductos, type Nav } from '../hooks'
import { chequeoCosecha } from '../../domain/carencia'
import { fmtDate, isISO, todayISO } from '../../domain/dates'
import { DEST, type Dest } from '../../domain/types'
import { uuidv7 } from '../../lib/ids'
import { Empty, Field, Steps } from '../ui'

export function Cosecha({ preset }: Nav) {
  const ask = useConfirm(), cuads = useCuadrillas(), [cuadrilla, setCuadrilla] = useState('')
  const { store } = useData(), fincas = useFincas(), curas = useCuras(), cos = useCosechas(), { map } = useProductos()
  const [step, setStep] = useState(0), [cu, setCu] = useState(preset?.fincaId ?? ''), [fecha, setFecha] = useState(todayISO()), [dest, setDest] = useState<Dest | ''>('')
  const last = [...cos].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1))[0]
  const [n, setN] = useState('10'), [kg, setKg] = useState(last ? String(last.f.kgBin) : '400'), saving = useRef(false), kgTouched = useRef(false), [motivo, setMotivo] = useState(''), [err, setErr] = useState<string | null>(null), [ok, setOk] = useState<string | null>(null)
  useEffect(() => { if (last && !kgTouched.current) setKg(String(last.f.kgBin)) }, [last?.id])   // la lista llega después del primer render
  const finca = fincas.find((f) => f.id === cu), d: Dest = (dest || finca?.f.dest || 'mercado_interno') as Dest
  const chk = cu ? chequeoCosecha(cu, d, fecha, curas, map) : null
  function siguiente() {
    setErr(null)
    if (step === 0 && !cu) return setErr('Elegí la finca.')
    if (step === 1) {
      if (!isISO(fecha) || fecha > todayISO()) return setErr('La fecha de cosecha no puede ser futura.')
      if (!Number.isInteger(Number(n)) || Number(n) < 1 || Number(n) > 5000) return setErr('La cantidad de bines debe ser un número entero entre 1 y 5000.')
      if (!(Number(kg.replace(',', '.')) > 0) || Number(kg.replace(',', '.')) > 5000) return setErr('Los kilos por bin deben ser un número mayor que 0.')
    }
    setStep(step + 1)
  }
  async function guardar() {
    if (chk?.dentro && motivo.trim().length < 5) return setErr('Esta finca sigue en carencia. Para cosechar igual, explicá el motivo (queda registrado).')
    if (saving.current) return; saving.current = true
    try {
    await store.patch('cosecha', uuidv7(), { cu, fecha, dest: d, n: Number(n), kgBin: Number(kg.replace(',', '.')), carencia: chk?.dentro ? { motivo: motivo.trim(), libre: chk.L!.fecha } : null, cuadrilla: cuadrilla || null })
    setOk(`Cosecha guardada: ${Number(n)} bines, ${(Number(n) * Number(kg.replace(',', '.'))).toLocaleString('es-AR')} kg.`); setStep(0); setMotivo('')
    } finally { saving.current = false }
  }
  const hist = [...cos].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1)).slice(0, 15)
  return <div className="page"><h1>Cargar cosecha</h1><p className="muted">Anotá cuántos bines sacaste. Si la finca sigue en carencia, te avisamos antes de guardar.</p>
    <section className="card"><Steps labels={['¿De dónde?', 'Bines y kilos', 'Confirmar']} step={step} />
      {step === 0 && <><div className="chips">{fincas.map((f) => <button key={f.id} className={`chip ${cu === f.id ? 'on' : ''}`} aria-pressed={cu === f.id} onClick={() => setCu(f.id)}>{f.f.n}</button>)}</div>{!fincas.length && <Empty>Primero cargá una finca en “Fincas”.</Empty>}</>}
      {step === 1 && <>{cuads.length > 0 && <Field label="Cuadrilla (opcional)"><select value={cuadrilla} onChange={(e) => setCuadrilla(e.target.value)}><option value="">Sin cuadrilla</option>{cuads.filter((q) => q.f.activa).map((q) => <option key={q.id} value={q.id}>{q.f.n}</option>)}</select></Field>}<div className="two"><Field label="Fecha"><input type="date" max={todayISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field><Field label="Destino"><select value={dest || finca?.f.dest} onChange={(e) => setDest(e.target.value as Dest)}>{Object.entries(DEST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Bines cosechados"><input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} /></Field><Field label="Kilos por bin"><input inputMode="decimal" value={kg} onChange={(e) => { kgTouched.current = true; setKg(e.target.value) }} /></Field></div>
        <p className="muted small">Ya vienen cargados los valores de tu última cosecha.</p></>}
      {step === 2 && <><h2>Revisá antes de guardar</h2><p><strong>{finca?.f.n}</strong> · {fmtDate(fecha)} · {DEST[d]} · {n} bines × {kg} kg = <strong>{(Number(n) * Number(kg.replace(',', '.'))).toLocaleString('es-AR')} kg</strong></p>
        {chk?.dentro ? <div className="banner warn" role="alert"><strong>Atención: esta finca está en carencia hasta el {fmtDate(chk.L!.fecha)}</strong> ({chk.L!.producto}). Cosechar ahora puede hacer rechazar la fruta.<Field label="Si igual cosechás, ¿por qué?"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} /></Field></div> : <p className="ok">La finca está libre: no hay carencia vigente.</p>}</>}
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="ok" role="status">{ok}</p>}
      <div className="quick">{step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Anterior</button>}{step < 2 ? <button className="btn primary" onClick={siguiente}>Siguiente</button> : <button className="btn primary" onClick={() => void guardar()}>Guardar cosecha</button>}</div></section>
    <section className="card"><h2>Últimas cosechas</h2>{hist.length ? <ul className="plain">{hist.map((c) => <li key={c.id} className="between"><span><strong>{fmtDate(c.f.fecha)}</strong> · {fincas.find((f) => f.id === c.f.cu)?.f.n ?? '—'} · {c.f.n} bines · {(c.f.n * c.f.kgBin).toLocaleString('es-AR')} kg{c.f.carencia && <span className="tagw"> · en carencia</span>}</span><button className="link bad" onClick={async () => { if (await ask({ title: '¿Anular esta cosecha?', body: 'Deja de contar en los kilos y reportes. Esta acción queda registrada.', ok: 'Anular', danger: true })) void store.remove('cosecha', c.id) }}>Anular</button></li>)}</ul> : <Empty>Todavía no cargaste cosechas.</Empty>}</section></div>
}
