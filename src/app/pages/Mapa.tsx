import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useAuth } from '../AuthProvider'
import { useData } from '../DataProvider'
import { useCuadros, useCuras, useFincas, useProductos, topEsp, type Nav } from '../hooks'
import { estadoFinca, libreDe } from '../../domain/carencia'
import { todayISO } from '../../domain/dates'
import { ESP } from '../../domain/catalog'
import { areaHa, centro, copernicusUrl, SATS, type SatKey } from '../../domain/geo'
import { can } from '../../plans/plans'
import { fruitSvg } from '../../domain/fruit'
import { Empty, Field } from '../ui'

interface SatPref { src: SatKey; inst?: string; layer?: string }
const readPref = (): SatPref => { try { return JSON.parse(localStorage.getItem('fincapp.sat') || 'null') ?? { src: 'eox' } } catch { return { src: 'eox' } } }
const savePref = (p: SatPref) => { try { localStorage.setItem('fincapp.sat', JSON.stringify(p)) } catch { /* sin almacenamiento */ } }
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

export function Mapa({ go }: Nav) {
  const org = useAuth().org!, { store } = useData(), fincas = useFincas(), cuadros = useCuadros(), curas = useCuras(), { map: prods } = useProductos()
  const box = useRef<HTMLDivElement>(null), mapRef = useRef<L.Map | null>(null), base = useRef<L.TileLayer | null>(null), shapes = useRef<L.LayerGroup | null>(null), draft = useRef<L.LayerGroup | null>(null)
  const [pref, setPref] = useState<SatPref>(readPref), [sel, setSel] = useState<string | null>(null), [draw, setDraw] = useState<[number, number][] | null>(null)
  const [tileErr, setTileErr] = useState(false), [cfg, setCfg] = useState(false), [msg, setMsg] = useState<string | null>(null)
  const owner = can.manageFincas(org.role), hoy = todayISO()
  const estados = useMemo(() => Object.fromEntries(fincas.map((f) => [f.id, estadoFinca(libreDe(f.id, f.f.dest, curas, prods), hoy)])), [fincas, curas, prods, hoy])

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!box.current || mapRef.current) return
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([-33.0, -68.8], 9)   // Mendoza por defecto
    shapes.current = L.layerGroup().addTo(m); draft.current = L.layerGroup().addTo(m); mapRef.current = m
    return () => { m.remove(); mapRef.current = null }
  }, [])

  // Capa satelital según la fuente elegida.
  useEffect(() => {
    const m = mapRef.current; if (!m) return
    base.current?.remove(); setTileErr(false)
    const s = SATS[pref.src], url = pref.src === 'sentinel' ? (pref.inst ? copernicusUrl(pref.inst, pref.layer) : SATS.eox.url) : s.url
    let errs = 0
    base.current = L.tileLayer(url, { maxNativeZoom: pref.src === 'sentinel' && !pref.inst ? SATS.eox.max : s.max, maxZoom: 20, attribution: pref.src === 'sentinel' && !pref.inst ? SATS.eox.attr : s.attr, crossOrigin: true })
      .on('tileerror', () => { if (++errs === 4) setTileErr(true) }).on('tileload', () => { errs = 0 }).addTo(m)
  }, [pref])

  // Fincas dibujadas: color por estado de carencia, fruta en el centro.
  useEffect(() => {
    const g = shapes.current, m = mapRef.current; if (!g || !m) return
    g.clearLayers(); const all: L.LatLng[] = []
    for (const f of fincas) {
      const pts = f.f.geo; if (!pts || pts.length < 3) continue
      const e = estados[f.id], col = e?.libre ? css('--brote-500') : css('--tierra-600'), esp = topEsp(cuadros, f.id) ?? 'otro'
      const poly = L.polygon(pts, { color: col, weight: sel === f.id ? 4 : 2, fillOpacity: sel === f.id ? 0.28 : 0.16 }).addTo(g).on('click', () => setSel(f.id))
      poly.bindTooltip(`${f.f.n} · ${e?.libre ? 'lista para cosechar' : `en carencia, faltan ${e?.faltan} días`}`, { sticky: true })
      const c = centro(pts)!; L.marker(c, { icon: L.divIcon({ className: 'map-pin', html: `<span>${fruitSvg(esp, 22)}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }), keyboard: false }).addTo(g).on('click', () => setSel(f.id))
      all.push(...pts.map((p) => L.latLng(p)))
    }
    if (all.length && !draw && !sel) m.fitBounds(L.latLngBounds(all).pad(0.3), { maxZoom: 16 })
  }, [fincas, estados, cuadros, sel])

  // Modo dibujo: cada toque agrega un vértice.
  useEffect(() => {
    const m = mapRef.current, g = draft.current; if (!m || !g) return
    g.clearLayers(); m.getContainer().classList.toggle('drawing', !!draw)
    if (!draw) return
    if (draw.length) { L.polyline(draw.length > 2 ? [...draw, draw[0]] : draw, { color: css('--brote-400'), weight: 3, dashArray: '6 6' }).addTo(g); draw.forEach((p) => L.circleMarker(p, { radius: 6, color: '#fff', weight: 2, fillColor: css('--brote-500'), fillOpacity: 1 }).addTo(g)) }
    const add = (e: L.LeafletMouseEvent) => setDraw((d) => [...(d ?? []), [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]])
    m.on('click', add); return () => { m.off('click', add) }
  }, [draw])

  const finca = fincas.find((f) => f.id === sel) ?? null, ha = draw ? areaHa(draw) : 0
  async function guardarContorno() {
    if (!finca || !draw || draw.length < 3) return setMsg('Marcá al menos 3 puntos sobre el mapa.')
    if (ha > 20_000) return setMsg('El contorno mide más de 20.000 ha: acercá el mapa a tu finca y volvé a marcar las esquinas.')
    await store.patch('finca', finca.id, { geo: draw, ha }); setDraw(null); setMsg(`Contorno guardado: ${ha.toLocaleString('es-AR')} ha.`)
  }
  function ubicarme() {
    if (!navigator.geolocation) return setMsg('Este equipo no puede dar tu ubicación.')
    navigator.geolocation.getCurrentPosition((p) => { mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 16); L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: css('--helada-600'), fillOpacity: 1 }).addTo(draft.current!) },
      () => setMsg('No pudimos obtener tu ubicación. Revisá el permiso de ubicación.'), { enableHighAccuracy: true, timeout: 10_000 })
  }
  const elegir = (src: SatKey) => { const p = { ...pref, src }; setPref(p); savePref(p); if (src === 'sentinel' && !p.inst) setCfg(true) }

  return <div className="page wide map-page">
    <header className="pagehead"><div><h1>Mapa</h1><p className="muted">Dibujá el contorno de cada finca sobre la imagen satelital. El color muestra si está en carencia.</p></div>
      <button className="btn" onClick={ubicarme}>Mi ubicación</button></header>
    <div className="chips" role="group" aria-label="Imagen satelital">{(Object.keys(SATS) as SatKey[]).map((k) => <button key={k} className={`chip ${pref.src === k ? 'on' : ''}`} aria-pressed={pref.src === k} onClick={() => elegir(k)}>{SATS[k].n}</button>)}</div>
    <p className={`small ${pref.src === 'esri' ? 'tagw' : 'muted'}`}>{SATS[pref.src].nota}{pref.src === 'sentinel' && <> <button className="link" onClick={() => setCfg(!cfg)}>Configurar</button></>}</p>
    {cfg && pref.src === 'sentinel' && <section className="card"><h2>Imágenes recientes de Copernicus</h2>
      <ol className="small"><li>Creá una cuenta gratis en dataspace.copernicus.eu.</li><li>En “Sentinel Hub → Configuration Utility” creá una configuración con la capa TRUE-COLOR.</li><li>Copiá su “Instance ID” acá.</li></ol>
      <div className="two"><Field label="Instance ID"><input defaultValue={pref.inst} id="cop-inst" autoComplete="off" /></Field><Field label="Capa"><input defaultValue={pref.layer ?? 'TRUE-COLOR'} id="cop-layer" /></Field></div>
      <button className="btn primary" onClick={() => { const inst = (document.getElementById('cop-inst') as HTMLInputElement).value.trim(), layer = (document.getElementById('cop-layer') as HTMLInputElement).value.trim() || 'TRUE-COLOR'; const p = { src: 'sentinel' as const, inst, layer }; setPref(p); savePref(p); setCfg(false) }}>Guardar</button>
      {!pref.inst && <p className="muted small">Mientras tanto se muestra la imagen de 2016.</p>}</section>}
    {tileErr && <p className="banner warn" role="status">No se pudieron cargar las imágenes. {navigator.onLine ? 'Probá otra fuente.' : 'Sin conexión: se ven solo las zonas que ya miraste antes.'}</p>}
    <div className="map-wrap"><div ref={box} className="map" role="region" aria-label="Mapa satelital de tus fincas" />
      {draw && <div className="map-hud" role="status"><strong>{draw.length < 3 ? `Tocá el mapa para marcar las esquinas (${draw.length}/3)` : `${ha.toLocaleString('es-AR')} ha · ${draw.length} puntos`}</strong>
        <div className="quick"><button className="btn small" disabled={!draw.length} onClick={() => setDraw(draw.slice(0, -1))}>Deshacer</button><button className="btn small ghost" onClick={() => setDraw(null)}>Cancelar</button><button className="btn small primary" disabled={draw.length < 3} onClick={() => void guardarContorno()}>Guardar contorno</button></div></div>}
    </div>
    {msg && <p className="note ok" role="status">{msg}</p>}
    <section className="card"><h2>Tus fincas</h2>{!fincas.length ? <Empty>Primero cargá una finca en “Fincas”.</Empty> :
      <div className="flist">{fincas.map((f) => { const e = estados[f.id], esp = topEsp(cuadros, f.id); return <div key={f.id} className={`frow ${sel === f.id ? 'on' : ''}`} onClick={() => { setSel(f.id); const pts = f.f.geo; if (pts?.length) mapRef.current?.fitBounds(L.latLngBounds(pts.map((p) => L.latLng(p))).pad(0.4)) }} role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.currentTarget as HTMLElement).click() }}>
        <span className="f-n"><strong>{esp && <span className="fruit" dangerouslySetInnerHTML={{ __html: fruitSvg(esp, 18) }} />}{f.f.n}</strong><small className="muted">{f.f.geo?.length ? `${(f.f.ha ?? areaHa(f.f.geo)).toLocaleString('es-AR')} ha dibujadas` : 'Sin contorno'}{esp ? ` · ${ESP[esp]?.n}` : ''}</small></span>
        <span className="quick" style={{ margin: 0, justifyContent: 'flex-end' }}><span className={`pill2 ${e?.libre ? 'ok' : 'warn'}`}>{e?.libre ? 'Libre' : `Carencia: ${e?.faltan} d`}</span>
          {owner && <button className="btn small" onClick={(ev) => { ev.stopPropagation(); setSel(f.id); setMsg(null); setDraw([]) }}>{f.f.geo?.length ? 'Redibujar' : 'Dibujar contorno'}</button>}
          <button className="btn small ghost" onClick={(ev) => { ev.stopPropagation(); go('curacion', { fincaId: f.id }) }}>Registrar cura</button></span></div> })}</div>}
      {!owner && <p className="muted small">Solo el Dueño puede dibujar los contornos.</p>}</section>
  </div>
}
