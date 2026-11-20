import { useState } from 'react'
import { useAuth } from '../AuthProvider'
import { useCosechas, useCuadros, useCuras, useFincas, useProductos, useTareas, topEsp, type Nav } from '../hooks'
import { estadoFinca, libreDe } from '../../domain/carencia'
import { fmtDate, todayISO } from '../../domain/dates'
import { Empty, Fruit, Pill } from '../ui'
import { Clima } from './Clima'

export function Inicio({ go }: Nav) {
  const org = useAuth().org!
  const fincas = useFincas(), cuadros = useCuadros(), curas = useCuras(), cosechas = useCosechas(), tareas = useTareas(), { map } = useProductos()
  const [sel, setSel] = useState<string | null>(null), hoy = todayISO()
  const filas = fincas.map((f) => { const L = libreDe(f.id, f.f.dest, curas, map); return { f, e: estadoFinca(L, hoy), esp: topEsp(cuadros, f.id) } })
    .sort((a, b) => Number(a.e.libre) - Number(b.e.libre) || b.e.faltan - a.e.faltan)
  const enCarencia = filas.filter((x) => !x.e.libre).length
  const kg = cosechas.reduce((s, c) => s + (c.f.n || 0) * (c.f.kgBin || 0), 0)
  const pend = tareas.filter((t) => !t.f.hecha).length
  const cur = filas.find((x) => x.f.id === sel)
  if (!fincas.length) return <div className="page"><h1>Bienvenido, {org.name}</h1><div className="card"><h2>Empecemos por tu primera finca</h2><p className="muted">Ponele nombre, elegí qué tiene plantado y cuántos cuadros. Después le cargás curaciones, riegos y cosechas.</p><button className="btn primary" onClick={() => go('fincas')}>+ Cargar mi finca</button></div></div>
  return <div className="page wide">
    <header className="pagehead"><div><h1>Inicio</h1><p className="muted">{fincas.length} {fincas.length === 1 ? 'finca' : 'fincas'} · {enCarencia ? `${enCarencia} en carencia` : 'todas listas para cosechar'}</p></div>
      <div className="quick"><button className="btn primary" onClick={() => go('curacion')}>+ Nueva cura</button><button className="btn" onClick={() => go('riego')}>+ Registrar riego</button><button className="btn" onClick={() => go('cosecha')}>+ Cargar cosecha</button></div></header>
    <div className="tiles">
      <div className={`tile ${enCarencia ? 'warn' : ''}`}><b>{enCarencia}</b><span>{enCarencia === 1 ? 'finca en carencia' : 'fincas en carencia'}</span><small>Esperando para poder cosechar</small></div>
      <div className="tile"><b>{kg.toLocaleString('es-AR')}</b><span>kg cosechados</span><small>Suma de todas las cosechas cargadas</small></div>
      <div className="tile"><b>{pend}</b><span>{pend === 1 ? 'tarea pendiente' : 'tareas pendientes'}</span><small>En “Tareas”</small></div>
    </div>
    <section className="card"><h2>Días libres para cosechar</h2><p className="muted">La carencia es la espera obligatoria después de curar. La barra muestra cuánto ya pasó.</p>
      <div className="flist">{filas.map(({ f, e, esp }) => <button key={f.id} className={`frow ${sel === f.id ? 'on' : ''}`} aria-pressed={sel === f.id} onClick={() => setSel(sel === f.id ? null : f.id)}
        title={e.L ? `Última cura: ${fmtDate(e.L.aplicada)} (${e.L.producto})${e.libre ? '' : ` · libre el ${fmtDate(e.L.fecha)}`}` : 'Sin curaciones registradas'}>
        <span className="f-n"><strong>{esp && <Fruit esp={esp} px={18} />}{f.f.n}</strong></span>
        <span className="f-p"><span className={`prog ${e.libre ? 'ok' : 'warn'}`} role="progressbar" aria-valuenow={e.progreso} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${e.progreso}%` }} /></span>
          <span className={`f-s ${e.libre ? 'ok' : 'warn'}`}>{e.libre ? 'Listo para cosechar' : `En carencia: faltan ${e.faltan} ${e.faltan === 1 ? 'día' : 'días'}`}</span></span></button>)}</div>
      {cur && <div className="detail"><Pill k={cur.e.libre ? 'ok' : 'warn'}>{cur.e.libre ? 'Libre' : 'En carencia'}</Pill>
        <p>{cur.e.L ? <>Última cura: <strong>{fmtDate(cur.e.L.aplicada)}</strong> con {cur.e.L.producto}. {cur.e.libre ? 'La espera ya terminó.' : <>Libre el <strong>{fmtDate(cur.e.L.fecha)}</strong>.</>}</> : 'Todavía no registraste curaciones en esta finca.'}</p>
        <div className="quick"><button className="btn small" onClick={() => go('curacion', { fincaId: cur.f.id })}>Registrar cura</button><button className="btn small primary" onClick={() => go('cosecha', { fincaId: cur.f.id })}>Cargar cosecha</button></div></div>}
    </section>
    <Clima />
    {!cosechas.length && !curas.length && <Empty>Todavía no hay movimientos. Empezá con “+ Nueva cura” o “+ Cargar cosecha”.</Empty>}
  </div>
}
