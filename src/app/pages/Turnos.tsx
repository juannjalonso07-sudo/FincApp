import { useEffect, useMemo, useState } from 'react'
import { useData } from '../DataProvider'
import { useCuadros, useFincas, useRiegos, useRows, useTurnos } from '../hooks'
import { choques, fmtHora, turnosDelDia, validarTurno } from '../../domain/operaciones'
import { calcRiego } from '../../domain/riego'
import { todayISO } from '../../domain/dates'
import { derivedId, uuidv7 } from '../../lib/ids'
import { useConfirm } from '../../ui/Dialog'
import { Empty, Field } from '../ui'

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], ORDEN = [1, 2, 3, 4, 5, 6, 0]

/** Turnos semanales de riego: qué finca, qué días, a qué hora. "Hoy" muestra qué abrir y permite anotarlo como riego hecho. */
export function Turnos() {
  const { store } = useData(), ask = useConfirm(), fincas = useFincas(), turnos = useTurnos(), riegos = useRiegos(), cuadros = useCuadros(), cfgs = useRows<{ caudal: number }>('riegocfg')
  const hoy = todayISO(), deHoy = useMemo(() => turnosDelDia(turnos, hoy), [turnos, hoy])
  const [f, setF] = useState({ cu: fincas[0]?.id ?? '', dias: [] as number[], hora: '06:00', horas: '4', resp: '' }), [edit, setEdit] = useState<string | null>(null), [err, setErr] = useState<string | null>(null), [warn, setWarn] = useState<string | null>(null)
  useEffect(() => { if (!f.cu && fincas[0]) setF((x) => ({ ...x, cu: fincas[0].id })) }, [fincas])
  const nombre = (id: string) => fincas.find((x) => x.id === id)?.f.n ?? '—'
  const hecho = (cu: string) => riegos.some((r) => r.f.cu === cu && r.f.fecha === hoy)

  async function guardar() {
    const t = { cu: f.cu, dias: f.dias, hora: f.hora, horas: Number(f.horas.replace(',', '.')), resp: f.resp.trim(), activo: true }
    const e = validarTurno(t); if (e) return setErr(e); setErr(null)
    const ch = choques(turnos, t, edit ?? undefined)
    if (ch.length && !(await ask({ title: 'Este turno se pisa con otro', body: `La finca ${nombre(t.cu)} ya riega ${ch.map((c) => `${c.f.dias.map((d) => DIAS[d]).join('/')} a las ${c.f.hora}`).join(', ')}. ¿Guardarlo igual?`, ok: 'Guardar igual' }))) return
    await store.patch('turno', edit ?? uuidv7(), t); setEdit(null); setWarn(null); setF({ ...f, dias: [], resp: '' })
  }
  async function anotar(cu: string, horas: number) {
    const caudal = cfgs.find((c) => c.id === derivedId(cu, 'riegocfg'))?.f.caudal ?? 10, ha = cuadros.filter((c) => c.f.finca_id === cu).reduce((s, c) => s + (Number(c.f.ha) || 0), 0)
    await store.patch('riego', uuidv7(), { cu, fecha: hoy, horas, ...calcRiego(horas, caudal, ha) })
  }

  return <>
    <section className="card"><h2>Hoy · {DIAS[new Date(hoy + 'T12:00:00').getDay()]}</h2>
      {!deHoy.length ? <Empty>No hay turnos de riego para hoy.</Empty> : <ul className="plain">{deHoy.map((t) => <li key={t.id} className="between">
        <span><strong>{fmtHora(t.ini)}–{fmtHora(t.fin)}</strong> · {nombre(t.f.cu)}{t.f.resp && <span className="muted"> · {t.f.resp}</span>}</span>
        {hecho(t.f.cu) ? <span className="pill2 ok">Anotado</span> : <button className="btn small" onClick={() => void anotar(t.f.cu, t.f.horas)}>Anotar riego hecho</button>}</li>)}</ul>}</section>
    <section className="card"><h2>Semana</h2>
      <div className="week" role="table" aria-label="Turnos de la semana">{ORDEN.map((d) => <div key={d} className="wcol" role="row"><b role="columnheader">{DIAS[d]}</b>
        {turnos.filter((t) => t.f.activo && t.f.dias.includes(d)).sort((a, b) => (a.f.hora < b.f.hora ? -1 : 1)).map((t) => <button key={t.id} role="cell" className={`wslot ${edit === t.id ? 'on' : ''}`} onClick={() => { setEdit(t.id); setF({ cu: t.f.cu, dias: t.f.dias, hora: t.f.hora, horas: String(t.f.horas), resp: t.f.resp }) }}><span>{t.f.hora}</span>{nombre(t.f.cu)}</button>)}</div>)}</div></section>
    <section className="card"><h2>{edit ? 'Editar turno' : 'Nuevo turno'}</h2>{!fincas.length ? <Empty>Primero cargá una finca.</Empty> : <>
      <Field label="Finca"><select value={f.cu} onChange={(e) => setF({ ...f, cu: e.target.value })}>{fincas.map((x) => <option key={x.id} value={x.id}>{x.f.n}</option>)}</select></Field>
      <Field label="Días"><div className="chips">{ORDEN.map((d) => <button type="button" key={d} className={`chip ${f.dias.includes(d) ? 'on' : ''}`} aria-pressed={f.dias.includes(d)} onClick={() => setF({ ...f, dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d] })}>{DIAS[d]}</button>)}</div></Field>
      <div className="two"><Field label="Hora de inicio"><input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></Field><Field label="Horas de riego"><input inputMode="decimal" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></Field></div>
      <Field label="Responsable (opcional)"><input value={f.resp} maxLength={60} onChange={(e) => setF({ ...f, resp: e.target.value })} placeholder="Ej.: Don Carlos" /></Field>
      {err && <p className="err" role="alert">{err}</p>}{warn && <p className="note warn">{warn}</p>}
      <div className="quick"><button className="btn primary" onClick={() => void guardar()}>{edit ? 'Guardar cambios' : '+ Agregar turno'}</button>
        {edit && <><button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn ghost" onClick={async () => { if (await ask({ title: '¿Quitar este turno?', ok: 'Quitar', danger: true })) { await store.remove('turno', edit); setEdit(null) } }}>Quitar turno</button></>}</div></>}</section>
  </>
}
