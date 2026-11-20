import { useEffect, useState } from 'react'
import { useData } from '../DataProvider'
import { useFincas, useCuadros, useRiegos, useRows, type Nav } from '../hooks'
import { calcRiego } from '../../domain/riego'
import { fmtDate, isISO, todayISO } from '../../domain/dates'
import { derivedId, uuidv7 } from '../../lib/ids'
import { Turnos } from './Turnos'
import { useConfirm } from '../../ui/Dialog'
import { Empty, Field } from '../ui'

export function Riego({ preset }: Nav) {
  const [tab, setTab] = useState<'registrar' | 'turnos'>(() => (location.hash.includes('tab=turnos') ? 'turnos' : 'registrar')), ask = useConfirm()
  const { store } = useData(), fincas = useFincas(), cuadros = useCuadros(), riegos = useRiegos(), cfgs = useRows<{ caudal: number }>('riegocfg')
  const [cu, setCu] = useState(preset?.fincaId ?? fincas[0]?.id ?? ''), [fecha, setFecha] = useState(todayISO()), [horas, setHoras] = useState('4'), [err, setErr] = useState<string | null>(null), [ok, setOk] = useState<string | null>(null)
  useEffect(() => { if (!cu && fincas[0]) setCu(fincas[0].id) }, [fincas])
  const cfgId = cu ? derivedId(cu, 'riegocfg') : '', cfg = cfgs.find((c) => c.id === cfgId), caudal = cfg?.f.caudal ?? 10   // L/s
  const ha = cuadros.filter((c) => c.f.finca_id === cu).reduce((s, c) => s + (Number(c.f.ha) || 0), 0)
  const h = Number(horas.replace(',', '.')), pv = h > 0 ? calcRiego(h, caudal, ha) : null
  async function guardar() {
    if (!cu) return setErr('Elegí la finca.'); if (!isISO(fecha) || fecha > todayISO()) return setErr('La fecha no puede ser futura.')
    if (!(h > 0 && h <= 72)) return setErr('Las horas de riego deben ser un número entre 0 y 72.')
    const r = calcRiego(h, caudal, ha); await store.patch('riego', uuidv7(), { cu, fecha, horas: h, ...r }); setErr(null); setOk(`Riego guardado: ${r.m3} m³ (${r.mm} mm).`)
  }
  const hist = [...riegos].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1)).slice(0, 15), total = riegos.reduce((s, r) => s + r.f.m3, 0)
  return <div className="page"><h1>Riego</h1><p className="muted">Anotá lo que regaste (la app calcula m³ y mm por hectárea) y organizá los turnos de la semana.</p>
    <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'registrar'} onClick={() => setTab('registrar')}>Registrar</button><button role="tab" aria-selected={tab === 'turnos'} onClick={() => setTab('turnos')}>Turnos</button></div>
    {tab === 'turnos' ? <Turnos /> : <>
    <section className="card">{!fincas.length ? <Empty>Primero cargá una finca en “Fincas”.</Empty> : <>
      <div className="chips">{fincas.map((f) => <button key={f.id} className={`chip ${cu === f.id ? 'on' : ''}`} aria-pressed={cu === f.id} onClick={() => setCu(f.id)}>{f.f.n}</button>)}</div>
      <div className="two"><Field label="Fecha"><input type="date" max={todayISO()} value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field><Field label="Horas de riego"><input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></Field></div>
      <Field label="Caudal de esta finca (litros por segundo)"><input inputMode="decimal" defaultValue={caudal} key={cu} onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0 && n < 5000) void store.patch('riegocfg', cfgId, { finca_id: cu, caudal: n }) }} /></Field>
      <p className="muted small">Superficie: {ha.toLocaleString('es-AR')} ha. {pv ? <>Con estas horas aplicás <strong>{pv.m3} m³</strong> ({pv.mm} mm).</> : ''}</p>
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="ok" role="status">{ok}</p>}<button className="btn primary" onClick={() => void guardar()}>Guardar riego</button></>}</section>
    <section className="card"><h2>Últimos riegos</h2><p className="muted small">Total acumulado: {Math.round(total).toLocaleString('es-AR')} m³</p>{hist.length ? <ul className="plain">{hist.map((r) => <li key={r.id} className="between"><span><strong>{fmtDate(r.f.fecha)}</strong> · {fincas.find((f) => f.id === r.f.cu)?.f.n ?? '—'} · {r.f.horas} h · {r.f.m3} m³ · {r.f.mm} mm</span><button className="link bad" onClick={async () => { if (await ask({ title: '¿Quitar este riego?', ok: 'Quitar', danger: true })) void store.remove('riego', r.id) }}>Quitar</button></li>)}</ul> : <Empty>Todavía no registraste riegos.</Empty>}</section></>}</div>
}
