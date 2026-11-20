import { useEffect, useState } from 'react'
import { useAuth } from '../AuthProvider'
import { useData } from '../DataProvider'
import { usePrecios } from '../hooks'
import { agrupar, tendencia, validarPrecio, type Tendencia } from '../../domain/mercado'
import { ESP } from '../../domain/catalog'
import { DEST, type Dest } from '../../domain/types'
import { canUse } from '../../plans/plans'
import { fmtDate, temporada, todayISO } from '../../domain/dates'
import { supabase } from '../../supabase/client'
import { uuidv7 } from '../../lib/ids'
import { Empty, Field, Fruit } from '../ui'

const lbl = (t: Tendencia) => t.dir === 'sube' ? `▲ Sube ${t.pct!.toFixed(1).replace('.', ',')}%` : t.dir === 'baja' ? `▼ Baja ${Math.abs(t.pct!).toFixed(1).replace('.', ',')}%` : t.dir === 'estable' ? '● Estable' : 'Primer precio'
const money = (n: number, m: string) => `${m === 'USD' ? 'US$' : '$'} ${n.toLocaleString('es-AR')}`

export function Mercado() {
  const org = useAuth().org!, { store } = useData(), precios = usePrecios()
  const [f, setF] = useState({ esp: 'durazno', zona: '', dest: 'mercado_interno' as Dest, moneda: 'ARS' as 'ARS' | 'USD', p: '', fecha: todayISO() }), [err, setErr] = useState<string | null>(null)
  const series = agrupar(precios).map((s) => ({ s, t: tendencia(s) }))
  const sube = series.filter((x) => x.t.dir === 'sube').length, baja = series.filter((x) => x.t.dir === 'baja').length, eq = series.filter((x) => x.t.dir === 'estable').length
  async function add() {
    const m = validarPrecio(f); if (m) return setErr(m); setErr(null)
    await store.patch('precio', uuidv7(), { esp: f.esp, zona: f.zona.trim(), dest: f.dest, moneda: f.moneda, p: Number(f.p.replace(',', '.')), fecha: f.fecha, temp: temporada(f.fecha) }); setF({ ...f, p: '' })
  }
  return <div className="page"><h1>Mercado</h1><p className="muted">Cargá los precios que te pagan y mirá si cada fruta sube o baja.</p>
    <section className="card"><h2>Tus precios</h2>
      {series.length > 0 && <div className="trendbar"><span className="tb up">▲ <b>{sube}</b> suben</span><span className="tb dn">▼ <b>{baja}</b> bajan</span><span className="tb eq">● <b>{eq}</b> estables</span></div>}
      {series.length ? <div className="prcs">{series.map(({ s, t }) => <article key={s[0].id} className={`prc ${t.dir === 'sube' ? 'up' : t.dir === 'baja' ? 'dn' : ''}`}><div className="between"><strong><Fruit esp={s[0].f.esp} px={22} />{ESP[s[0].f.esp]?.n}</strong><span className={`tr ${t.dir}`}>{lbl(t)}</span></div>
        <div className="big">{money(s[0].f.p, s[0].f.moneda)}<small className="muted"> /kg</small></div><small className="muted">{s[0].f.zona} · {DEST[s[0].f.dest]} · {fmtDate(s[0].f.fecha)}</small></article>)}</div> : <Empty>Todavía no cargaste precios.</Empty>}</section>
    <section className="card"><h2>Cargar precio</h2><div className="chips">{Object.keys(ESP).filter((k) => k !== 'otro').map((k) => <button key={k} className={`chip ${f.esp === k ? 'on' : ''}`} aria-pressed={f.esp === k} onClick={() => setF({ ...f, esp: k })}><Fruit esp={k} px={16} />{ESP[k].n}</button>)}</div>
      <div className="two"><Field label="Zona o mercado"><input value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })} placeholder="Mercado Central" /></Field><Field label="Precio por kg"><input inputMode="decimal" value={f.p} onChange={(e) => setF({ ...f, p: e.target.value })} /></Field>
        <Field label="Destino"><select value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value as Dest })}>{Object.entries(DEST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Moneda"><select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as 'ARS' | 'USD' })}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></Field></div>
      <Field label="Fecha"><input type="date" max={todayISO()} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Field>
      {err && <p className="err" role="alert">{err}</p>}<button className="btn primary" onClick={() => void add()}>Guardar precio</button></section>
    {canUse(org.plan, 'regionalPrices') ? <Regional /> : <section className="card upsell"><h2>Pizarra de precios regionales</h2><p className="muted">Compará lo que te pagan con los precios de tu región. Disponible en el plan Pro.</p><button className="btn" disabled>Conocer el plan Pro</button></section>}</div>
}

interface RP { id: string; region: string; esp: string; dest: string; price: number; prev_price: number | null; currency: string; week: string; source: string | null; kind: string; url: string | null }
/** Pizarra Pro: precios MAYORISTAS de referencia (Mercado Central), con su variación y su fuente. Se guarda la última vista para usarla sin señal. */
function Regional() {
  const [rows, setRows] = useState<RP[] | null>(() => { try { return JSON.parse(localStorage.getItem('fincapp.rp') || 'null') } catch { return null } }), [err, setErr] = useState<string | null>(null)
  useEffect(() => { void (async () => {
    if (!supabase) { setErr('La pizarra regional necesita cuenta y conexión.'); return }
    const { data, error } = await supabase.from('regional_prices').select('*').order('week', { ascending: false }).limit(80)
    if (error) { setErr(rows ? 'Sin conexión: mostramos la última pizarra que viste.' : 'No se pudo cargar la pizarra. ¿Tenés conexión?'); return }
    setRows(data as RP[]); try { localStorage.setItem('fincapp.rp', JSON.stringify(data)) } catch { /* ok */ }
  })() }, [])
  const ult = rows?.length ? rows[0].week : null, mes = ult ? new Date(ult + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : ''
  const actuales = (rows ?? []).filter((r) => r.week === ult)
  return <section className="card"><h2>Pizarra regional{mes && <span className="muted small"> · {mes}</span>}</h2>
    <p className="muted small">Precio <strong>mayorista</strong> promedio en $/kg en el mercado concentrador. Sirve de referencia: no es lo que paga el empaque al productor.</p>
    {err && <p className="muted small">{err}</p>}
    {!rows ? <p className="muted">Cargando…</p> : actuales.length ? <div className="prcs">{actuales.map((r) => { const v = r.prev_price ? ((r.price - r.prev_price) / r.prev_price) * 100 : null, k = v == null || Math.abs(v) < 0.5 ? 'igual' : v > 0 ? 'sube' : 'baja'
      return <div key={r.id} className={`prc ${k === 'sube' ? 'up' : k === 'baja' ? 'dn' : ''}`}><span><Fruit esp={r.esp} px={16} /> <strong>{ESP[r.esp]?.n ?? r.esp}</strong></span><span className="big">{money(r.price, r.currency)}<span className="muted small"> /kg</span></span>
        {v != null && <span className={`tr ${k}`}>{k === 'sube' ? '▲' : k === 'baja' ? '▼' : '='} {Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })}% vs. mes anterior</span>}<small className="muted">{r.region}</small></div> })}</div>
      : <Empty>Todavía no hay precios regionales cargados.</Empty>}
    {actuales[0]?.source && <p className="muted small">Fuente: {actuales[0].url ? <a href={actuales[0].url} target="_blank" rel="noreferrer">{actuales[0].source}</a> : actuales[0].source}.</p>}</section>
}
