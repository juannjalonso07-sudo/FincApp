import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../DataProvider'
import { useCosechas, useEntregas, useFincas } from '../hooks'
import { resumenEntregas, stockBines, validarEntrega } from '../../domain/operaciones'
import { DEST, ESTADO_ENTREGA, type Dest, type EstadoEntrega } from '../../domain/types'
import { fmtDate, isISO, temporada, todayISO } from '../../domain/dates'
import { uuidv7 } from '../../lib/ids'
import { useConfirm } from '../../ui/Dialog'
import { Empty, Field } from '../ui'

const money = (n: number, m: string) => n.toLocaleString('es-AR', { style: 'currency', currency: m, maximumFractionDigits: 0 })
const NEXT: Record<EstadoEntrega, EstadoEntrega | null> = { enviada: 'recibida', recibida: 'liquidada', liquidada: null }

/** Entregas de bines a empaque o comprador, con remito, kilos de balanza y precio. Muestra lo que falta liquidar. */
export function Entregas({ preset }: { preset?: { fincaId?: string } }) {
  const { store } = useData(), ask = useConfirm(), fincas = useFincas(), cos = useCosechas(), ent = useEntregas(), temp = temporada(todayISO())
  const stock = useMemo(() => stockBines(cos, ent), [cos, ent]), res = useMemo(() => resumenEntregas(ent, temp), [ent, temp])
  const [f, setF] = useState({ cu: preset?.fincaId ?? fincas[0]?.id ?? '', fecha: todayISO(), dest: '' as Dest | '', comprador: '', remito: '', bins: '', kg: '', precio: '', moneda: 'ARS' as 'ARS' | 'USD' })
  const [err, setErr] = useState<string | null>(null), [ok, setOk] = useState<string | null>(null), saving = useRef(false)
  useEffect(() => { if (!f.cu && fincas[0]) setF((x) => ({ ...x, cu: fincas[0].id })) }, [fincas])   // la lista llega después del primer render
  const kgBin = useMemo(() => { const c = cos.filter((x) => x.f.cu === f.cu).sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1))[0]; return c?.f.kgBin ?? 400 }, [cos, f.cu])
  const compradores = useMemo(() => [...new Set(ent.map((e) => e.f.comprador))].slice(0, 8), [ent])
  const nombre = (id: string) => fincas.find((x) => x.id === id)?.f.n ?? '—'

  async function guardar() {
    if (saving.current) return
    const bins = Number(f.bins), kg = f.kg.trim() ? Number(f.kg.replace(/\./g, '').replace(',', '.')) : bins * kgBin, precio = f.precio.trim() ? Number(f.precio.replace(',', '.')) : null
    const e = { cu: f.cu, fecha: f.fecha, dest: (f.dest || fincas.find((x) => x.id === f.cu)?.f.dest || 'mercado_interno') as Dest, comprador: f.comprador.trim(), remito: f.remito.trim(), bins, kg, precio, moneda: f.moneda, estado: 'enviada' as const }
    if (!isISO(f.fecha) || f.fecha > todayISO()) return setErr('La fecha no puede ser futura.')
    const v = validarEntrega(e); if (v) return setErr(v); setErr(null)
    if ((stock[f.cu] ?? 0) < bins && !(await ask({ title: 'Hay menos bines cosechados', body: `En ${nombre(f.cu)} figuran ${stock[f.cu] ?? 0} bines sin entregar y vas a entregar ${bins}. ¿Falta cargar alguna cosecha? Podés guardar igual.`, ok: 'Guardar igual' }))) return
    saving.current = true; try { await store.patch('entrega', uuidv7(), e); setOk(`Entrega guardada: ${bins} bines, ${kg.toLocaleString('es-AR')} kg a ${e.comprador}.`); setF({ ...f, remito: '', bins: '', kg: '', precio: '' }) } finally { saving.current = false }
  }
  const hist = [...ent].sort((a, b) => (a.f.fecha < b.f.fecha ? 1 : -1)).slice(0, 30)
  return <div className="page"><h1>Entregas</h1><p className="muted">Lo que sale de la finca hacia el empaque, el comprador o la industria. Temporada {temp}.</p>
    <div className="tiles"><div className="tile"><b>{res.kg.toLocaleString('es-AR')}</b><span>kg entregados</span><small>{res.bins} bines</small></div>
      <div className={`tile ${Object.keys(res.pendiente).length ? 'warn' : ''}`}><b>{Object.entries(res.pendiente).map(([m, v]) => money(v, m)).join(' + ') || '—'}</b><span>a cobrar</span><small>Entregas todavía no liquidadas{res.sinPrecio ? ` · ${res.sinPrecio} sin precio` : ''}</small></div>
      <div className="tile"><b>{Object.values(stock).reduce((s, v) => s + Math.max(0, v), 0)}</b><span>bines en finca</span><small>Cosechados y sin entregar</small></div></div>
    <section className="card"><h2>Nueva entrega</h2>{!fincas.length ? <Empty>Primero cargá una finca.</Empty> : <>
      <div className="two"><Field label="Finca"><select value={f.cu} onChange={(e) => setF({ ...f, cu: e.target.value })}>{fincas.map((x) => <option key={x.id} value={x.id}>{x.f.n} · {Math.max(0, stock[x.id] ?? 0)} bines en finca</option>)}</select></Field>
        <Field label="Fecha"><input type="date" max={todayISO()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Field></div>
      <div className="two"><Field label="Empaque o comprador"><input list="compradores" value={f.comprador} maxLength={80} onChange={(e) => setF({ ...f, comprador: e.target.value })} placeholder="Ej.: Empaque del Valle" /><datalist id="compradores">{compradores.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="N.º de remito (opcional)"><input value={f.remito} maxLength={30} onChange={(e) => setF({ ...f, remito: e.target.value })} /></Field></div>
      <div className="two"><Field label="Bines"><input inputMode="numeric" value={f.bins} onChange={(e) => setF({ ...f, bins: e.target.value })} /></Field>
        <Field label={`Kilos (vacío = bines × ${kgBin} kg)`}><input inputMode="decimal" value={f.kg} onChange={(e) => setF({ ...f, kg: e.target.value })} placeholder={f.bins ? String(Number(f.bins) * kgBin) : ''} /></Field></div>
      <div className="two"><Field label="Precio por kg (opcional)"><input inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} placeholder="Si ya lo sabés" /></Field>
        <Field label="Moneda / destino"><div className="inline"><select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as 'ARS' | 'USD' })}><option value="ARS">$ pesos</option><option value="USD">US$ dólares</option></select>
          <select value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value as Dest })}><option value="">Destino de la finca</option>{Object.entries(DEST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></Field></div>
      {err && <p className="err" role="alert">{err}</p>}{ok && <p className="note ok" role="status">{ok}</p>}
      <button className="btn primary" onClick={() => void guardar()}>Guardar entrega</button></>}</section>
    <div className="list">{!hist.length && <Empty>Todavía no hay entregas.</Empty>}
      {hist.map((e) => <div key={e.id} className="row"><span className="grow"><strong>{fmtDate(e.f.fecha)} · {e.f.comprador}</strong><br /><small className="muted">{nombre(e.f.cu)} · {e.f.bins} bines · {e.f.kg.toLocaleString('es-AR')} kg{e.f.remito ? ` · remito ${e.f.remito}` : ''}{e.f.precio ? ` · ${money(e.f.kg * e.f.precio, e.f.moneda)}` : ''}</small></span>
        <span className={`pill2 ${e.f.estado === 'liquidada' ? 'ok' : e.f.estado === 'recibida' ? '' : 'warn'}`}>{ESTADO_ENTREGA[e.f.estado]}</span>
        {NEXT[e.f.estado] && <button className="btn small" onClick={() => void store.patch('entrega', e.id, { estado: NEXT[e.f.estado]! })}>Marcar {ESTADO_ENTREGA[NEXT[e.f.estado]!].toLowerCase()}</button>}
        <button className="link bad" onClick={async () => { if (await ask({ title: '¿Anular esta entrega?', ok: 'Anular', danger: true })) void store.remove('entrega', e.id) }}>Anular</button></div>)}</div></div>
}
