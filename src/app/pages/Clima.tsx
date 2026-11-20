import { useCallback, useEffect, useState } from 'react'
import { useSync } from '../DataProvider'

const URL = 'https://api.open-meteo.com/v1/forecast'   // Open-Meteo: la API gratuita es NO comercial; para vender hace falta su plan pago
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
interface Daily { time: string[]; weathercode: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; windgusts_10m_max: number[] }
interface Cache { t: number; lat: number; lng: number; daily: Daily }
const ls = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const day = (_i: number, iso: string) => { const k = Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(hoyISO() + 'T12:00:00')) / 864e5); return k === 0 ? 'hoy' : k === 1 ? 'mañana' : DIAS[new Date(iso + 'T12:00:00').getDay()] }
/** Solo los días de hoy en adelante: un pronóstico guardado hace días no muestra alertas viejas como si fueran de hoy. */
const futuro = (D: Daily): Daily => { const h = hoyISO(), s = Math.max(0, D.time.findIndex((t) => t >= h)); const k = D.time.some((t) => t >= h) ? s : D.time.length; const c = <T,>(a: T[]) => a.slice(k); return { time: c(D.time), weathercode: c(D.weathercode), temperature_2m_max: c(D.temperature_2m_max), temperature_2m_min: c(D.temperature_2m_min), precipitation_sum: c(D.precipitation_sum), windgusts_10m_max: c(D.windgusts_10m_max) } }

export interface Alerta { k: 'bad' | 'warn'; t: string; s: string }
export function alertas(D: Daily): Alerta[] {
  const out: Alerta[] = []
  for (let i = 0; i < Math.min(3, D.time.length); i++) {
    const w = day(i, D.time[i]), mn = D.temperature_2m_min[i], mx = D.temperature_2m_max[i], c = D.weathercode[i], g = D.windgusts_10m_max[i], r = D.precipitation_sum[i]
    if (mn <= 0) out.push({ k: 'bad', t: `Helada ${w}`, s: `Mínima de ${Math.round(mn)} °C. Si hay flor o fruto chico, protegelos.` })
    else if (mn <= 2) out.push({ k: 'warn', t: `Riesgo de helada ${w}`, s: `Mínima de ${Math.round(mn)} °C.` })
    if (c === 96 || c === 99) out.push({ k: 'bad', t: `Tormenta con riesgo de granizo ${w}`, s: 'Revisá las mallas antigranizo y no dejes bines a la intemperie.' })
    else if (c === 95) out.push({ k: 'warn', t: `Tormenta eléctrica ${w}`, s: 'Postergá curaciones y cosecha.' })
    if (g >= 60) out.push({ k: 'warn', t: `Viento fuerte ${w}`, s: `Ráfagas de hasta ${Math.round(g)} km/h. No conviene pulverizar.` })
    if (r >= 20 && c < 95) out.push({ k: 'warn', t: `Lluvia fuerte ${w}`, s: `${Math.round(r)} mm esperados: un riego sobra y una cura se lavaría.` })
    if (mx >= 38) out.push({ k: 'warn', t: `Calor extremo ${w}`, s: `Máxima de ${Math.round(mx)} °C. Cosechá temprano.` })
  }
  return out
}

export function Clima() {
  const sync = useSync()
  const [loc, setLoc] = useState(() => ls<{ lat: number; lng: number }>('fincapp.loc'))
  const [cache, setCache] = useState(() => ls<Cache>('fincapp.wx'))
  const [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false), [f, setF] = useState({ lat: '', lng: '' })

  const refresh = useCallback(async (force: boolean, l = loc) => {
    if (!l || busy) return
    if (!force && cache && Date.now() - cache.t < 36e5 && Math.abs(cache.lat - l.lat) < .01) return
    if (!navigator.onLine) { if (force) setMsg('Sin conexión: te muestro el último pronóstico guardado.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`${URL}?latitude=${l.lat}&longitude=${l.lng}&timezone=auto&forecast_days=5&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windgusts_10m_max`)
      const j = await r.json(); if (!j?.daily) throw new Error()
      const c: Cache = { t: Date.now(), lat: l.lat, lng: l.lng, daily: j.daily }; localStorage.setItem('fincapp.wx', JSON.stringify(c)); setCache(c)
    } catch { setMsg('No se pudo actualizar el pronóstico ahora.') } finally { setBusy(false) }
  }, [loc, cache, busy])
  useEffect(() => { void refresh(false) }, [loc, sync.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (la: number, ln: number) => { const l = { lat: +la.toFixed(4), lng: +ln.toFixed(4) }; localStorage.setItem('fincapp.loc', JSON.stringify(l)); setLoc(l); void refresh(true, l) }
  const manual = () => { const la = Number(f.lat.replace(',', '.')), ln = Number(f.lng.replace(',', '.')); if (!(Math.abs(la) <= 90 && Math.abs(ln) <= 180 && f.lat && f.lng)) return setMsg('Coordenadas inválidas. Ej.: latitud -33,65 y longitud -69,15.'); save(la, ln) }
  const gps = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => save(p.coords.latitude, p.coords.longitude), () => setMsg('No pude obtener la ubicación. Escribí las coordenadas.')) : setMsg('Este equipo no permite ubicación.')

  if (!loc) return <section className="card"><h2>Pronóstico para tu campo</h2><p className="muted">Indicá dónde está tu campo para recibir avisos de helada, tormenta y granizo.</p>
    <div className="quick"><button className="btn small primary" onClick={gps}>Usar mi ubicación</button></div>
    <div className="two"><label className="field"><span>Latitud</span><input inputMode="decimal" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} placeholder="-33,65" /></label><label className="field"><span>Longitud</span><input inputMode="decimal" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} placeholder="-69,15" /></label></div>
    <button className="btn small" onClick={manual}>Guardar ubicación</button>{msg && <p className="err">{msg}</p>}</section>
  if (!cache) return <section className="card"><h2>Pronóstico para tu campo</h2><p className="muted">{busy ? 'Buscando el pronóstico…' : 'Necesitás conexión para descargar el primer pronóstico.'}</p>{msg && <p className="err">{msg}</p>}</section>
  const D = futuro(cache.daily), al = alertas(D), age = Math.round((Date.now() - cache.t) / 6e4)
  return <section className="card wx"><div className="between"><div><h2>Pronóstico para tu campo</h2><p className="muted">Avisos de helada, tormenta, granizo y viento para los próximos 3 días.</p></div><button className="btn small" disabled={busy} onClick={() => void refresh(true)}>{busy ? 'Actualizando…' : 'Actualizar'}</button></div>
    {al.length ? <ul className="wxa">{al.map((a, i) => <li key={i} className={a.k}><strong>{a.t}</strong><span>{a.s}</span></li>)}</ul> : <p className="note ok">Sin alertas: no se esperan heladas ni tormentas fuertes en los próximos 3 días.</p>}
    <div className="wxd">{D.time.map((t, i) => <div key={t} className="wxday"><b>{day(i, t)}</b><span className="mx">{Math.round(D.temperature_2m_max[i])}°</span><span className="mn">{Math.round(D.temperature_2m_min[i])}°</span><span className="rn">{D.precipitation_sum[i] >= 1 ? `${Math.round(D.precipitation_sum[i])} mm` : '–'}</span></div>)}</div>
    <p className="muted small">Actualizado {age < 2 ? 'recién' : age < 90 ? `hace ${age} min` : `hace ${Math.round(age / 60)} h`}{age > 720 ? ' · puede estar desactualizado' : ''} · Datos: Open-Meteo. Es un pronóstico, no una garantía. {msg}</p></section>
}
