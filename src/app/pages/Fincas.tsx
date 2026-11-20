import { useState, type FormEvent } from 'react'
import { useAuth } from '../AuthProvider'
import { useData } from '../DataProvider'
import { useConfirm } from '../../ui/Dialog'
import { useCuadros, useFincas, useRows, type Nav } from '../hooks'
import { ESP, VARS } from '../../domain/catalog'
import { DEST, type Dest, type Cuadro } from '../../domain/types'
import { PLAN_INFO, can, fincasLeft } from '../../plans/plans'
import { uuidv7 } from '../../lib/ids'
import { Empty, Field, Fruit } from '../ui'

const YEAR = new Date().getFullYear()
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function Fincas(_: Nav) {
  const ask = useConfirm()
  const org = useAuth().org!, { store } = useData(), fincas = useFincas(), cuadros = useCuadros(), vars = useRows<{ esp: string; n: string }>('variedad')
  const [sel, setSel] = useState<string | null>(null), [brush, setBrush] = useState<string | null>(null), [q, setQ] = useState<string | null>(null)
  const [nf, setNf] = useState({ n: '', cult: 'durazno', dest: 'exportacion' as Dest, cols: '3', rows: '3' }), [err, setErr] = useState<Record<string, string>>({}), [note, setNote] = useState<string | null>(null)
  const owner = can.manageFincas(org.role), left = fincasLeft(org.plan, fincas.length)
  const finca = fincas.find((f) => f.id === sel) ?? null
  const mine = finca ? cuadros.filter((c) => c.f.finca_id === finca.id) : []
  const cell = mine.find((c) => c.id === q) ?? null

  async function crear(e: FormEvent) {
    e.preventDefault(); setNote(null); const er: Record<string, string> = {}
    const cols = Number(nf.cols), rows = Number(nf.rows)
    if (nf.n.trim().length < 2) er.n = 'Escribí el nombre de la finca (al menos 2 letras).'
    if (!Number.isInteger(cols) || cols < 1 || cols > 12) er.cols = 'Entre 1 y 12 cuadros de ancho.'
    if (!Number.isInteger(rows) || rows < 1 || rows > 12) er.rows = 'Entre 1 y 12 cuadros de largo.'
    setErr(er); if (Object.keys(er).length) return
    if (left === 0) return setNote(`Tu plan ${PLAN_INFO[org.plan].name} permite ${PLAN_INFO[org.plan].maxFincas} finca. Pasá al plan Pro para cargar más.`)
    const id = uuidv7()
    const items = [{ entity: 'finca', id, fields: { n: nf.n.trim().replace(/\s+/g, ' '), dest: nf.dest, cols, rows } as Record<string, unknown> }]
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) items.push({ entity: 'cuadro', id: uuidv7(), fields: { finca_id: id, i, j, ha: 1, esp: nf.cult, var: '', anio: YEAR, dens: null, estado: 'joven', nota: '' } })
    await store.patchMany(items)
    setNf({ ...nf, n: '' }); setSel(id)
  }
  const paint = async (c: { id: string; f: Cuadro }) => {
    if (brush) await store.patch('cuadro', c.id, { esp: brush, estado: c.f.estado === 'vacio' ? 'joven' : c.f.estado, var: c.f.esp === brush ? c.f.var : '' })
    else setQ(c.id === q ? null : c.id)
  }
  const ha = mine.reduce((s, c) => s + (Number(c.f.ha) || 0), 0)

  return <div className="page wide"><h1>Fincas y cuadros</h1><p className="muted">Armá tu finca como una grilla: cada cuadro tiene su cultivo, variedad y año de plantación.</p>
    <div className="list">{fincas.length === 0 && <Empty>Todavía no cargaste ninguna finca.</Empty>}
      {fincas.map((f) => <div key={f.id} className={`row clickable ${sel === f.id ? 'on' : ''}`} onClick={() => { setSel(f.id); setQ(null) }}><strong>{f.f.n}</strong><span className="muted">{DEST[f.f.dest]}</span>
        {owner && <button className="link bad" onClick={async (e) => { e.stopPropagation(); if (await ask({ title: `¿Quitar la finca “${f.f.n}”?`, body: 'Se quitan también sus cuadros. Las curas, riegos y cosechas cargadas quedan en el historial.', ok: 'Quitar finca', danger: true })) { void store.remove('finca', f.id); cuadros.filter((c) => c.f.finca_id === f.id).forEach((c) => void store.remove('cuadro', c.id)); setSel(null) } }}>Quitar</button>}</div>)}</div>

    {finca && <section className="card"><div className="between"><div><h2>{finca.f.n}</h2><p className="muted">{mine.length} cuadros · {ha.toLocaleString('es-AR')} ha</p></div></div>
      <p className="muted small">Elegí un cultivo para “pintar” cuadros con un toque, o tocá un cuadro para editar su variedad.</p>
      <div className="chips" role="group" aria-label="Pincel de cultivo"><button className={`chip ${brush === null ? 'on' : ''}`} onClick={() => setBrush(null)}>Editar cuadro</button>
        {Object.keys(ESP).map((k) => <button key={k} className={`chip ${brush === k ? 'on' : ''}`} aria-pressed={brush === k} onClick={() => setBrush(k)}><Fruit esp={k} px={16} />{ESP[k].n}</button>)}</div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${finca.f.cols}, minmax(56px, 1fr))` }}>
        {mine.sort((a, b) => a.f.j - b.f.j || a.f.i - b.f.i).map((c) => <button key={c.id} data-cell={c.id} className={`cell ${q === c.id ? 'on' : ''}`} style={{ background: `color-mix(in srgb, ${(ESP[c.f.esp] ?? ESP.otro).c} 28%, var(--surface))` }} onClick={() => void paint(c)} aria-label={`${ESP[c.f.esp]?.n ?? 'Sin cultivo'} ${c.f.var}`}>
          <Fruit esp={c.f.esp} px={22} /><small>{c.f.var || ESP[c.f.esp]?.n}</small></button>)}</div>
      {cell && <CuadroEditor key={cell.id} c={cell} lib={vars.map((v) => v.f).filter((v) => v.esp === cell.f.esp).map((v) => v.n)} onClose={() => setQ(null)} />}
    </section>}

    {owner ? <form className="card" onSubmit={crear} noValidate><h2>Nueva finca</h2>
      <Field label="Nombre" error={err.n}><input value={nf.n} onChange={(e) => setNf({ ...nf, n: e.target.value })} aria-invalid={!!err.n} /></Field>
      <Field label="¿Qué tiene plantado? (podés cambiar cada cuadro después)"><div className="chips">{Object.keys(ESP).map((k) => <button type="button" key={k} className={`chip ${nf.cult === k ? 'on' : ''}`} aria-pressed={nf.cult === k} onClick={() => setNf({ ...nf, cult: k })}><Fruit esp={k} px={16} />{ESP[k].n}</button>)}</div></Field>
      <div className="two"><Field label="Cuadros de ancho" error={err.cols}><input inputMode="numeric" value={nf.cols} onChange={(e) => setNf({ ...nf, cols: e.target.value })} /></Field><Field label="Cuadros de largo" error={err.rows}><input inputMode="numeric" value={nf.rows} onChange={(e) => setNf({ ...nf, rows: e.target.value })} /></Field></div>
      <Field label="Destino habitual"><select value={nf.dest} onChange={(e) => setNf({ ...nf, dest: e.target.value as Dest })}>{Object.entries(DEST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      {note && <p className="err" role="alert">{note}</p>}<button className="btn primary">Guardar finca</button></form>
      : <p className="muted">Solo el Dueño puede crear o quitar fincas. Vos podés cargar curaciones, riegos y cosechas.</p>}</div>
}

function CuadroEditor({ c, lib, onClose }: { c: { id: string; f: Cuadro }; lib: string[]; onClose(): void }) {
  const { store } = useData(), [s, setS] = useState(''), [web, setWeb] = useState<string[] | null>(null), [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false), [open, setOpen] = useState(false)
  const set = (p: Partial<Cuadro>) => store.patch('cuadro', c.id, p as Record<string, unknown>)
  const all = [...new Set([...(VARS[c.f.esp] ?? []), ...lib])], hit = all.filter((n) => !s || norm(n).includes(norm(s))), exact = all.some((n) => norm(n) === norm(s))
  const pick = async (n: string, save: boolean) => { if (save && !all.includes(n)) await store.patch('variedad', uuidv7(), { esp: c.f.esp, n }); await set({ var: n }); setOpen(false); setWeb(null) }
  async function buscar() {
    if (!navigator.onLine) { setMsg('Necesitás conexión a internet para cargar una variedad nueva.'); setWeb(null); return }
    setBusy(true); setMsg(null)
    try { const r = await fetch(`https://es.wikipedia.org/w/api.php?action=opensearch&limit=8&format=json&origin=*&search=${encodeURIComponent(`${ESP[c.f.esp]?.n} ${s.trim() || 'variedad'}`)}`); const j = await r.json(); const t = [...new Set<string>((j[1] ?? []).map((x: string) => x.replace(/\s*\(.*\)$/, '')))]; setWeb(t); if (!t.length) setMsg('No encontré resultados. Podés agregarla escribiendo el nombre.') }
    catch { setMsg('No se pudo buscar ahora. Revisá la conexión o agregala escribiendo el nombre.') } finally { setBusy(false) }
  }
  return <div className="editor"><div className="between"><h3>Editar cuadro</h3><button className="link" onClick={onClose}>Cerrar</button></div>
    <div className="two"><Field label="Cultivo"><select value={c.f.esp} onChange={(e) => void set({ esp: e.target.value, var: '' })}>{Object.keys(ESP).map((k) => <option key={k} value={k}>{ESP[k].n}</option>)}</select></Field>
      <Field label="Estado"><select value={c.f.estado} onChange={(e) => void set({ estado: e.target.value as Cuadro['estado'] })}><option value="vacio">Vacío</option><option value="joven">Joven</option><option value="produccion">En producción</option></select></Field></div>
    <Field label="Variedad"><div className="inline"><input key={`v${c.f.var}`} defaultValue={c.f.var} onBlur={(e) => { const v = e.target.value.trim(); if (v !== c.f.var) void set({ var: v }) }} placeholder="Ej.: Elegant Lady" /><button type="button" className="btn small" onClick={() => setOpen(!open)}>{open ? 'Cerrar biblioteca' : 'Elegir de la biblioteca'}</button></div></Field>
    {open && <div className="vpick"><label className="field"><span>Buscar variedad de {ESP[c.f.esp]?.n.toLowerCase()}</span><input value={s} onChange={(e) => { setS(e.target.value); setMsg(null); setWeb(null) }} autoComplete="off" placeholder="Escribí parte del nombre" /></label>
      <div className="chips">{hit.map((n) => <button key={n} className="chip" onClick={() => void pick(n, false)}>{n}</button>)}</div>{!hit.length && <p className="muted small">No hay “{s}” en la biblioteca.</p>}
      <div className="quick">{s.trim() && !exact && <button className="btn small primary" onClick={() => void pick(s.trim(), true)}>+ Agregar “{s.trim()}” a mi biblioteca</button>}<button className="btn small" disabled={busy} onClick={() => void buscar()}>{busy ? 'Buscando…' : 'Buscar en internet'}</button></div>
      {msg && <p className="err" role="alert">{msg}</p>}{web && <><div className="chips">{web.map((n) => <button key={n} className="chip" onClick={() => void pick(n, true)}>+ {n}</button>)}</div><p className="muted small">Resultados de Wikipedia. Al tocar uno se guarda en tu biblioteca y queda disponible sin conexión.</p></>}</div>}
    <div className="two"><Field label="Año de plantación"><input inputMode="numeric" key={`a${c.f.anio}`} defaultValue={c.f.anio} onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n > 1950 && n <= YEAR + 1) void set({ anio: n }); else e.target.value = String(c.f.anio) }} /></Field>
      <Field label="Hectáreas del cuadro"><input inputMode="decimal" defaultValue={c.f.ha} onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0 && n < 10000) void set({ ha: n }) }} /></Field></div></div>
}
