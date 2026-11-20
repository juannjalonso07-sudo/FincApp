import { useRef, useState } from 'react'
import { useData } from '../DataProvider'
import { useConfirm } from '../../ui/Dialog'
import { useCuras, useFincas, useProductos, type Nav } from '../hooks'
import { diasCarencia, libreDe, validarProducto } from '../../domain/carencia'
import { addDays, fmtDate, todayISO, isISO } from '../../domain/dates'
import { PRODUCTOS_EJEMPLO } from '../../domain/ejemplos'
import type { ItemCura, Producto } from '../../domain/types'
import { uuidv7 } from '../../lib/ids'
import { Empty, Field, Steps } from '../ui'

export function Curacion({ go, preset }: Nav) {
  const ask = useConfirm()
  const { store } = useData(), fincas = useFincas(), curas = useCuras(), { rows: prods, map } = useProductos()
  const [step, setStep] = useState(0), [cu, setCu] = useState<string[]>(preset?.fincaId ? [preset.fincaId] : []), [fecha, setFecha] = useState(todayISO())
  const saving = useRef(false)
  const [items, setItems] = useState<{ p: string; dosis: string }[]>([]), [nota, setNota] = useState(''), [err, setErr] = useState<string | null>(null), [ok, setOk] = useState<string | null>(null)
  const dest = (id: string) => fincas.find((f) => f.id === id)?.f.dest ?? 'mercado_interno'

  const resumen = cu.map((id) => {
    const sim = libreDe(id, dest(id), [...curas, { id: 'x', f: { fecha, cu: [id], items: items.map((i) => ({ p: i.p, dosis: Number(i.dosis) || 0 })), nota: '' } }], map)
    return { id, nombre: fincas.find((f) => f.id === id)?.f.n ?? '', libre: sim?.fecha ?? fecha }
  })
  function siguiente() {
    setErr(null)
    if (step === 0 && !cu.length) return setErr('Elegí al menos una finca.')
    if (step === 1) {
      if (!isISO(fecha)) return setErr('Elegí la fecha de la aplicación.')
      if (fecha > todayISO()) return setErr('La fecha no puede ser futura. Para algo a futuro usá “Tareas”.')
      if (!items.length) return setErr('Agregá al menos un producto.')
      if (items.some((i) => !(Number(i.dosis.replace(',', '.')) > 0))) return setErr('Revisá las dosis: deben ser números mayores que 0.')
    }
    setStep(step + 1)
  }
  async function guardar() {
    if (saving.current) return; saving.current = true
    try {
    const its: ItemCura[] = items.map((i) => { const p = map[i.p]; return { p: i.p, dosis: Number(i.dosis.replace(',', '.')), ...(p ? { car: { n: p.n, c: p.c, e: p.e } } : {}) } })
    await store.patch('curacion', uuidv7(), { fecha, cu, items: its, nota: nota.trim() })
    setOk(`Cura guardada en ${cu.length} ${cu.length === 1 ? 'finca' : 'fincas'}.`); setStep(0); setCu([]); setItems([]); setNota('')
    } finally { saving.current = false }
  }
  const hist = [...curas].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1)).slice(0, 15)

  return <div className="page"><h1>Registrar cura</h1><p className="muted">Anotá qué aplicaste y dónde. La app calcula sola cuándo podés volver a cosechar.</p>
    {!prods.length ? <ProductosVacio /> : <section className="card"><Steps labels={['¿Dónde?', '¿Qué aplicaste?', 'Confirmar']} step={step} />
      {step === 0 && <><p>¿En qué fincas aplicaste?</p><div className="chips">{fincas.map((f) => <button key={f.id} className={`chip ${cu.includes(f.id) ? 'on' : ''}`} aria-pressed={cu.includes(f.id)} onClick={() => setCu(cu.includes(f.id) ? cu.filter((x) => x !== f.id) : [...cu, f.id])}>{f.f.n}</button>)}</div>{!fincas.length && <Empty>Primero cargá una finca en “Fincas”.</Empty>}</>}
      {step === 1 && <><Field label="Fecha de la aplicación"><input type="date" value={fecha} max={todayISO()} onChange={(e) => setFecha(e.target.value)} /></Field>
        {items.map((it, i) => { const p = map[it.p]; return <div key={i} className="item"><strong>{p?.n}</strong><input aria-label={`Dosis de ${p?.n}`} inputMode="decimal" value={it.dosis} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, dosis: e.target.value } : x)))} /><span className="muted">{p?.u}</span>
          <span className="muted small">Carencia: {p && diasCarencia(p, cu.some((c) => dest(c) === 'exportacion') ? 'exportacion' : 'mercado_interno')} días</span><button className="link bad" onClick={() => setItems(items.filter((_, j) => j !== i))}>Quitar</button></div> })}
        <Field label="Agregar producto"><select value="" onChange={(e) => { const p = map[e.target.value]; if (p) setItems([...items, { p: e.target.value, dosis: String(p.d) }]) }}><option value="">Elegir…</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.f.n} · {p.f.t}</option>)}</select></Field>
        <p className="muted small">La dosis viene cargada con la habitual del producto. Cambiala si usaste otra.</p></>}
      {step === 2 && <><h2>Revisá antes de guardar</h2><p>Aplicación del <strong>{fmtDate(fecha)}</strong>: {items.map((i) => map[i.p]?.n).join(', ')}.</p>
        <ul className="plain">{resumen.map((r) => <li key={r.id}><strong>{r.nombre}</strong>: libre para cosechar el <strong>{fmtDate(r.libre)}</strong> ({r.libre > todayISO() ? `faltan ${Math.round((Date.parse(r.libre) - Date.parse(todayISO())) / 864e5)} días` : 'ya libre'})</li>)}</ul>
        <Field label="Nota (opcional)"><input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} /></Field></>}
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="ok" role="status">{ok} <button className="link" onClick={() => go('inicio')}>Ver Inicio</button></p>}
      <div className="quick">{step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Anterior</button>}{step < 2 ? <button className="btn primary" onClick={siguiente}>Siguiente</button> : <button className="btn primary" onClick={() => void guardar()}>Guardar cura</button>}</div></section>}
    <section className="card"><h2>Últimas curas</h2>{hist.length ? <ul className="plain">{hist.map((c) => <li key={c.id} className="between"><span><strong>{fmtDate(c.f.fecha)}</strong> · {c.f.cu.map((id) => fincas.find((f) => f.id === id)?.f.n ?? '—').join(', ')} · {c.f.items.map((i) => map[i.p]?.n ?? '—').join(', ')}</span><button className="link bad" onClick={async () => { if (await ask({ title: '¿Anular esta cura?', body: 'Cambian los días de carencia de las fincas donde se aplicó.', ok: 'Anular', danger: true })) void store.remove('curacion', c.id) }}>Anular</button></li>)}</ul> : <Empty>Todavía no registraste curas.</Empty>}</section>
    <Productos /></div>
}

function ProductosVacio() {
  const { store } = useData(), [busy, setBusy] = useState(false)
  return <section className="card"><h2>Primero cargá tus productos</h2><p className="muted">Para calcular la carencia necesitamos los productos que usás, con los días de espera que dice la <strong>etiqueta</strong>.</p>
    <div className="quick"><button className={`btn primary ${busy ? 'busy' : ''}`} disabled={busy} onClick={async () => { setBusy(true); for (const p of PRODUCTOS_EJEMPLO) await store.patch('producto', uuidv7(), { ...p }) }}>Cargar productos de ejemplo</button></div>
    <p className="note warn">Los días de ejemplo son orientativos. Verificá siempre la carencia en la etiqueta y en la normativa vigente (SENASA y país de destino) antes de cosechar.</p><Productos /></section>
}

function Productos() {
  const { store } = useData(), { rows } = useProductos(), [f, setF] = useState({ n: '', t: '', c: '', e: '', d: '', u: 'L/ha' }), [err, setErr] = useState<string | null>(null)
  async function add() {
    const p: Partial<Producto> = { n: f.n.trim(), t: f.t.trim(), c: f.c === '' ? undefined : Number(f.c), e: f.e === '' ? undefined : Number(f.e), d: Number(f.d.replace(',', '.')), u: f.u, pr: null }
    const m = validarProducto(p); if (m) return setErr(m); setErr(null); await store.patch('producto', uuidv7(), p as Record<string, unknown>); setF({ n: '', t: '', c: '', e: '', d: '', u: 'L/ha' })
  }
  return <details className="card"><summary><strong>Mis productos ({rows.length})</strong></summary>
    <ul className="plain">{rows.map((p) => <li key={p.id} className="between"><span>{p.f.n} <span className="muted small">· carencia {p.f.c} d (interno) / {p.f.e} d (exportación) · {p.f.d} {p.f.u}</span></span><button className="link bad" onClick={() => void store.remove('producto', p.id)}>Quitar</button></li>)}</ul>
    <h3>Agregar producto</h3><div className="two"><Field label="Nombre"><input value={f.n} onChange={(e) => setF({ ...f, n: e.target.value })} /></Field><Field label="Tipo"><input value={f.t} onChange={(e) => setF({ ...f, t: e.target.value })} placeholder="Fungicida…" /></Field>
      <Field label="Carencia mercado interno (días)"><input inputMode="numeric" value={f.c} onChange={(e) => setF({ ...f, c: e.target.value })} /></Field><Field label="Carencia exportación (días)"><input inputMode="numeric" value={f.e} onChange={(e) => setF({ ...f, e: e.target.value })} /></Field>
      <Field label="Dosis habitual por ha"><input inputMode="decimal" value={f.d} onChange={(e) => setF({ ...f, d: e.target.value })} /></Field><Field label="Unidad"><select value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })}><option>L/ha</option><option>kg/ha</option><option>cc/hl</option><option>g/hl</option></select></Field></div>
    {err && <p className="err" role="alert">{err}</p>}<button className="btn small" onClick={() => void add()}>Agregar</button></details>
}
export { addDays }
