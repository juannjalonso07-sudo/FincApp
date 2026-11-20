import { Component, Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { AuthProvider, markPendingConsent, useAuth } from './AuthProvider'
import { DataProvider, useData, useSync } from './DataProvider'
import { PLAN_INFO, ROLE_NAME, can } from '../plans/plans'
import { validEmail, validPassword } from '../ui/validate'
import { rejectMessage } from '../sync/messages'
import { setTheme, themePref } from '../ui/theme'
import { supabase } from '../supabase/client'
import { Inicio } from './pages/Inicio'
import { Fincas } from './pages/Fincas'
import { Curacion } from './pages/Curacion'
import { Cosecha } from './pages/Cosecha'
import { Riego } from './pages/Riego'
import { Tareas } from './pages/Tareas'
import { Mercado } from './pages/Mercado'
import { Mapa } from './pages/Mapa'
import { Entregas } from './pages/Entregas'
import { Cuadrillas } from './pages/Cuadrillas'
import { Reportes } from './pages/Reportes'
import { Copias, Cuenta, Miembros, PlanPage } from './pages/Cuenta'
import { Legal, LegalLinks } from './pages/Legal'
import { go, href, useRoute } from './router'
import type { Nav } from './hooks'
import { DialogProvider, useConfirm } from '../ui/Dialog'
import { Logo } from '../ui/Logo'
import { Icon } from '../ui/icons'

class Boundary extends Component<{ children: ReactNode }, { e: Error | null }> {
  state = { e: null as Error | null }
  static getDerivedStateFromError(e: Error) { return { e } }
  render() {
    return this.state.e ? <div className="center"><div className="card"><h2>Algo salió mal</h2><p>Tus datos están a salvo en este equipo. Recargá la pantalla; si sigue pasando, avisanos.</p><button className="btn primary" onClick={() => location.reload()}>Recargar</button></div></div> : this.props.children
  }
}

export function App() {
  return <Boundary><DialogProvider><AuthProvider><Gate /></AuthProvider></DialogProvider></Boundary>
}

function Gate() {
  const a = useAuth(), route = useRoute()
  if (route.page === 'legal') return <Legal doc={route.params.d ?? 'terminos'} standalone />
  if (a.loading) return <div className="splash" role="status" aria-label="Cargando"><Logo size={88} animated /><div className="bar" /></div>
  if (!a.user) return <AuthScreen />
  if (!a.org) return <OrgSetup />
  return <DataProvider><Shell /></DataProvider>
}

function AuthScreen() {
  const a = useAuth(); const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [name, setName] = useState(''), [acepto, setAcepto] = useState(false), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setMsg(null)
    if (mode === 'up' && name.trim().length < 3) return setErr('Escribí tu nombre y apellido.')
    if (mode === 'up' && !acepto) return setErr('Para crear la cuenta tenés que aceptar los términos y la política de privacidad.')
    if (!validEmail(email)) return setErr('Escribí un correo válido.')
    if (mode !== 'reset' && !validPassword(pw)) return setErr('La contraseña debe tener al menos 8 caracteres.')
    setBusy(true)
    if (mode === 'up') markPendingConsent()
    const r = mode === 'in' ? await a.signIn(email, pw) : mode === 'up' ? await a.signUp(email, pw, name) : await a.reset(email)
    setBusy(false); if (r) return setErr(r)
    if (mode === 'up') setMsg('Cuenta creada. Si te pedimos confirmar el correo, revisá tu bandeja de entrada.')
    if (mode === 'reset') setMsg('Te enviamos un correo para cambiar la contraseña.')
  }
  const sw = (m: typeof mode) => { setMode(m); setErr(null); setMsg(null) }
  return <div className="auth-wrap">
    <aside className="auth-art"><div className="brand"><Logo size={40} animated /><span>FincApp<small>Cuaderno de campo</small></span></div>
      <div><h2>Tu campo, al día aunque no haya señal.</h2><p>Curaciones, carencias, riegos y cosechas de todas tus fincas, sincronizados con tu equipo.</p>
        <ul><li>Funciona sin conexión y sincroniza solo</li><li>Avisos de carencia antes de cosechar</li><li>Dueño y Encargado con permisos distintos</li></ul></div></aside>
    <div className="auth-side"><form className="auth" onSubmit={submit} noValidate>
      <h1>{mode === 'in' ? 'Ingresá a tu cuenta' : mode === 'up' ? 'Creá tu cuenta' : 'Recuperar contraseña'}</h1>
      <p className="muted">{mode === 'reset' ? 'Te mandamos un enlace a tu correo.' : 'Gratis para tu primera finca.'}</p>
      {mode !== 'reset' && <div className={`seg ${mode === 'up' ? 'r' : ''}`} role="group" aria-label="Elegí"><i /><button type="button" aria-pressed={mode === 'in'} onClick={() => sw('in')}>Ingresar</button><button type="button" aria-pressed={mode === 'up'} onClick={() => sw('up')}>Crear cuenta</button></div>}
      {mode === 'up' && <label className="field reveal"><span>Nombre completo</span><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: María Gómez" /></label>}
      <label className="field"><span>Correo</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" /></label>
      {mode !== 'reset' && <label className="field"><span>Contraseña</span><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>}
      {mode === 'up' && <label className="check reveal"><input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /><span>Acepto los <a href={href('legal', { d: 'terminos' })}>términos</a> y la <a href={href('legal', { d: 'privacidad' })}>política de privacidad</a>, y que mis datos se guarden en servidores que pueden estar fuera de la Argentina.</span></label>}
      {err && <p className="err" role="alert">{err}</p>}{msg && <p className="note ok" role="status">{msg}</p>}
      <button className={`btn primary ${busy ? 'busy' : ''}`} disabled={busy}>{mode === 'in' ? 'Ingresar' : mode === 'up' ? 'Crear cuenta' : 'Enviar correo'}</button>
      <div className="links">{mode === 'in' && <button type="button" className="link" onClick={() => sw('reset')}>Olvidé mi contraseña</button>}{mode === 'reset' && <button type="button" className="link" onClick={() => sw('in')}>Volver a ingresar</button>}</div>
    <LegalLinks /></form></div></div>
}

function OrgSetup() {
  const a = useAuth(); const [name, setName] = useState(''), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const token = new URLSearchParams(location.search).get('invite')
  async function go(e: FormEvent) {
    e.preventDefault(); if (name.trim().length < 2) return setErr('Escribí el nombre de tu empresa o finca.')
    setBusy(true); const r = await a.createOrg(name); setBusy(false); if (r) setErr(r)
  }
  async function join() {
    setBusy(true); const { error } = await supabase!.rpc('accept_invite', { p_token: token }); setBusy(false)
    if (error) setErr('La invitación no es válida o ya venció. Pedile una nueva al Dueño.'); else { history.replaceState(null, '', location.pathname); await a.refresh() }
  }
  return <div className="center"><div className="card auth">
    <h1>Bienvenido a FincApp</h1>
    {token ? <><p>Te invitaron a una empresa. Aceptá la invitación para entrar.</p>{err && <p className="err" role="alert">{err}</p>}<button className="btn primary" onClick={join} disabled={busy}>Aceptar invitación</button></>
      : <form onSubmit={go}><p className="muted">Primero, ¿cómo se llama tu empresa o finca?</p><label className="field"><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>{err && <p className="err" role="alert">{err}</p>}<button className="btn primary" disabled={busy}>Crear empresa</button></form>}
    <button className="link" onClick={() => a.signOut()}>Salir</button></div></div>
}

const PAGES: { k: string; t: string; main?: boolean; sec?: 'op' | 'cuenta' }[] = [
  { k: 'inicio', t: 'Inicio', main: true }, { k: 'mapa', t: 'Mapa', main: true }, { k: 'fincas', t: 'Fincas' }, { k: 'curacion', t: 'Curación', main: true }, { k: 'cosecha', t: 'Cosecha', main: true },
  { k: 'entregas', t: 'Entregas' }, { k: 'riego', t: 'Riego' }, { k: 'cuadrillas', t: 'Cuadrillas' }, { k: 'tareas', t: 'Tareas' }, { k: 'mercado', t: 'Mercado' }, { k: 'reportes', t: 'Reportes' },
  { k: 'miembros', t: 'Equipo', sec: 'cuenta' }, { k: 'plan', t: 'Plan', sec: 'cuenta' }, { k: 'copias', t: 'Copias', sec: 'cuenta' }, { k: 'cuenta', t: 'Cuenta', sec: 'cuenta' },
]
function Shell() {
  const a = useAuth(); const { engine } = useData(), sync = useSync(), route = useRoute(), org = a.org!, ask = useConfirm()
  const nav: Nav = { go: (p, pr) => go(p, { f: pr?.fincaId }), preset: route.params.f ? { fincaId: route.params.f } : undefined }
  const who = a.mode === 'local' ? 'Este equipo' : a.user?.name?.trim() || a.user?.email || 'Productor'
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark'), [more, setMore] = useState(false); const manual = !!themePref()
  const items = PAGES.filter((p) => p.k !== 'miembros' || (can.manageMembers(org.role) && a.mode === 'cloud'))
  const page = items.some((p) => p.k === route.page) ? route.page : 'inicio'
  useEffect(() => { document.title = `${items.find((p) => p.k === page)?.t ?? 'FincApp'} · FincApp`; setMore(false) }, [page])
  const label = { idle: sync.pending ? `${sync.pending} sin enviar` : 'Todo guardado', syncing: 'Sincronizando…', offline: 'Sin conexión: tus datos se guardan en este equipo', auth: 'Volvé a iniciar sesión', error: sync.error && /acceso/.test(sync.error) ? sync.error : 'No se pudo sincronizar. Reintentamos solos.' }[sync.status]
  const link = (p: (typeof PAGES)[number]) => <a key={p.k} href={href(p.k)} className={`nav ${p.main ? 'main' : ''}`} aria-current={page === p.k ? 'page' : undefined}><Icon n={p.k} />{p.t}</a>
  async function salir() { if (sync.pending && !(await ask({ title: 'Hay cambios sin enviar', body: `${sync.pending} cambios todavía no llegaron a la nube. Si cerrás sesión quedan guardados en este equipo y se envían cuando vuelvas a entrar.`, ok: 'Cerrar sesión igual' }))) return; void a.signOut() }
  return <div className="shell">
    <nav className={`side ${more ? 'open' : ''}`} aria-label="Principal">
      <div className="brand"><Logo size={30} /><span>FincApp{a.orgs.length > 1 ? <select className="org-pick" value={org.id} aria-label="Empresa" onChange={(e) => a.selectOrg(e.target.value)}>{a.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select> : <small>{org.name}</small>}</span></div>
      {items.filter((p) => !p.sec).map(link)}<div className="nav-sep" />{items.filter((p) => p.sec).map(link)}
      <button className="nav more" aria-expanded={more} onClick={() => setMore(!more)}><Icon n="mas" />Más</button>
      <div className="grow" /><div className="who"><span className="avatar" aria-hidden="true">{initials(who)}</span><strong title={who}>{who}</strong><span>{ROLE_NAME[org.role]} · <span className={`plan-badge ${org.plan === 'pro' ? 'pro' : ''}`}>Plan {PLAN_INFO[org.plan].name}</span></span>
        {a.mode === 'cloud' && <button className="btn small ghost out" onClick={() => void salir()}><Icon n="salir" size={16} />Cerrar sesión</button>}</div></nav>
    {more && <div className="more-scrim" onClick={() => setMore(false)} />}
    <main>
      <header className="top"><span className={`pill ${sync.status === 'idle' && !sync.pending ? 'ok' : sync.status === 'offline' ? 'neutral' : 'warn'}`} role="status">{a.mode === 'local' ? 'Modo local · sin nube' : label}</span>
        {sync.status === 'auth' && <button className="btn small" onClick={() => a.signOut()}>Iniciar sesión</button>}
        {engine && sync.status !== 'syncing' && <button className="btn small" onClick={() => void engine.syncNow()}><Icon n="sync" size={16} />Sincronizar</button>}
        {manual && <button className="btn small" onClick={() => { setTheme('auto'); setDark(document.documentElement.dataset.theme === 'dark') }}>Auto</button>}
        <button className="btn small icon" aria-label={dark ? 'Tema claro' : 'Tema oscuro'} onClick={() => { setTheme(dark ? 'light' : 'dark'); setDark(!dark) }}><Icon n={dark ? 'sol' : 'luna'} /></button></header>
      <InviteBanner /><FailedNotice />
      <div key={page + (route.params.f ?? '')}>
        {page === 'inicio' && <Inicio {...nav} />}{page === 'mapa' && <Mapa {...nav} />}{page === 'fincas' && <Fincas {...nav} />}{page === 'curacion' && <Curacion {...nav} />}{page === 'cosecha' && <Cosecha {...nav} />}
        {page === 'entregas' && <Entregas {...nav} />}{page === 'riego' && <Riego {...nav} />}{page === 'cuadrillas' && <Cuadrillas />}{page === 'tareas' && <Tareas />}{page === 'mercado' && <Mercado />}{page === 'reportes' && <Reportes {...nav} />}
        {page === 'miembros' && <Miembros />}{page === 'plan' && <PlanPage />}{page === 'copias' && <Copias />}{page === 'cuenta' && <Cuenta />}
      </div>
      <footer className="foot"><LegalLinks /></footer>
    </main></div>
}

/** Invitación a otra empresa cuando ya tenés una: se acepta sin perder la actual. */
function InviteBanner() {
  const a = useAuth(); const token = new URLSearchParams(location.search).get('invite'), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  if (!token || a.mode !== 'cloud') return null
  const clean = () => history.replaceState(null, '', location.pathname + location.hash)
  async function join() { setBusy(true); const { data, error } = await supabase!.rpc('accept_invite', { p_token: token }); setBusy(false); if (error) return setErr('La invitación no es válida, ya venció o es para otro correo.'); clean(); await a.refresh(); if (data) a.selectOrg(data as string) }
  return <div className="banner" role="status"><strong>Te invitaron a otra empresa.</strong> <span className="small">La vas a poder elegir arriba, junto al logo.</span>
    <div className="quick"><button className={`btn small primary ${busy ? 'busy' : ''}`} onClick={() => void join()}>Aceptar invitación</button><button className="btn small ghost" onClick={() => { clean(); setErr(null); location.reload() }}>Ahora no</button></div>{err && <p className="err">{err}</p>}</div>
}

function FailedNotice() {
  const { store, engine } = useData(), sync = useSync(); const [rows, setRows] = useState<{ op: string; entity: string; failed?: string }[]>([]), [ask, setAsk] = useState<string | null>(null)
  useEffect(() => { void store.failed().then(setRows) }, [store, sync.failed, sync.pending])
  if (!rows.length) return null
  const groups = [...new Set(rows.map((r) => r.failed ?? ''))]
  return <div className="banner warn" role="alert"><strong>{rows.length === 1 ? 'Un cambio no se pudo guardar en la nube' : `${rows.length} cambios no se pudieron guardar en la nube`}</strong>
    <p className="small">Siguen en este equipo. {groups.map((g) => rejectMessage(g)).join(' ')}</p>
    <div className="quick"><button className="btn small" onClick={async () => { await store.retryFailed(); void engine?.syncNow() }}>Reintentar</button>
      {ask ? <><span className="small">¿Descartarlos? Se pierden en este equipo.</span><button className="btn small" onClick={async () => { for (const r of rows) await store.discardFailed(r.op); setAsk(null); setRows(await store.failed()); void engine?.syncNow() }}>Sí, descartar</button><button className="btn small ghost" onClick={() => setAsk(null)}>No</button></>
        : <button className="btn small ghost" onClick={() => setAsk('all')}>Descartar</button>}</div></div>
}

const initials = (s: string) => s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'F'
