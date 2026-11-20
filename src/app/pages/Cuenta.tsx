import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../AuthProvider'
import { useData, useRecords } from '../DataProvider'
import { PLAN_INFO, ROLE_NAME, can } from '../../plans/plans'
import { supabase } from '../../supabase/client'
import { validEmail } from '../../ui/validate'
import { useConfirm } from '../../ui/Dialog'
import { download } from '../download'
import { href } from '../router'
import { CONTACTO } from './Legal'

const PRICE = Number(import.meta.env.VITE_PRO_PRICE_ARS ?? 0)
const ars = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
/** Llama a una Edge Function con la sesión del usuario. */
async function fn<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(name, { body })
  if (error) { let m = 'No se pudo completar. ¿Tenés conexión?'; try { m = (await (error as any).context?.json())?.error ?? m } catch { /* ok */ } throw new Error(m) }
  return data as T
}

export function Miembros() {
  const org = useAuth().org!; const [email, setEmail] = useState(''), [role, setRole] = useState<'manager' | 'owner'>('manager'), [link, setLink] = useState<string | null>(null), [err, setErr] = useState<string | null>(null), [copied, setCopied] = useState(false)
  async function invite(e: FormEvent) {
    e.preventDefault(); setErr(null); setLink(null); if (!validEmail(email)) return setErr('Escribí un correo válido.')
    const { data, error } = await supabase!.rpc('create_invite', { p_org: org.id, p_email: email, p_role: role })
    if (error) return setErr('No se pudo crear la invitación. ¿Tenés conexión?'); setLink(`${location.origin}${location.pathname}?invite=${data}`)
  }
  return <div className="page"><h1>Equipo</h1><p className="muted">El Encargado carga curaciones, riegos, cosechas y entregas, y puede cambiar variedad y estado de los cuadros. No puede crear ni quitar fincas ni administrar el plan.</p>
    <form className="card" onSubmit={invite} noValidate><h2>Invitar a una persona</h2>
      <div className="two"><label className="field"><span>Correo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Rol</span><select value={role} onChange={(e) => setRole(e.target.value as any)}><option value="manager">Encargado</option><option value="owner">Dueño</option></select></label></div>
      {err && <p className="err" role="alert">{err}</p>}<button className="btn primary">Crear invitación</button>
      {link && <div className="note ok" role="status"><p>Mandale este enlace (vence en 7 días y solo sirve para ese correo):</p><code>{link}</code>
        <p><button type="button" className="btn small" onClick={() => { navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {}) }}>{copied ? 'Copiado' : 'Copiar enlace'}</button></p></div>}</form></div>
}

interface Sub { status: string; next_payment: string | null; amount: number | null }
export function PlanPage() {
  const a = useAuth(), org = a.org!, fincas = useRecords('finca'), ask = useConfirm()
  const [sub, setSub] = useState<Sub | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [codigo, setCodigo] = useState<string | null>(null)
  const owner = can.manageBilling(org.role), cloud = a.mode === 'cloud' && !!supabase, volvio = location.hash.includes('pago=volviste')
  const cargar = async () => { if (!cloud || !owner) return; const { data } = await supabase!.from('subscriptions').select('status,next_payment,amount').eq('org_id', org.id).order('created_at', { ascending: false }).limit(1).maybeSingle(); setSub(data as Sub | null) }
  useEffect(() => { void cargar(); if (volvio) { const t = setTimeout(() => { void cargar(); void a.refresh() }, 4000); return () => clearTimeout(t) } }, [org.id])
  async function contratar() {
    setBusy(true); setErr(null)
    if ('__TAURI_INTERNALS__' in window) { setBusy(false); return setErr('Desde la app de escritorio no se puede pagar todavía. Abrí FincApp en el navegador (o en el celular) e ingresá con la misma cuenta para pasar a Pro.') }
    try { const r = await fn<{ init_point: string }>('mp-checkout', { org_id: org.id }); location.href = r.init_point } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function baja() {
    if (!(await ask({ title: '¿Dar de baja el plan Pro?', body: 'No se te va a volver a cobrar. Seguís con Pro hasta el final del período pagado y después pasás a Gratis. No se borra ningún dato.', ok: 'Dar de baja', danger: true }))) return
    setBusy(true); setErr(null)
    try { const r = await fn<{ codigo: string }>('mp-baja', { org_id: org.id }); setCodigo(r.codigo); await cargar(); await a.refresh() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const activa = sub && ['authorized', 'pending', 'paused'].includes(sub.status)
  return <div className="page"><h1>Plan</h1><p className="muted">Estás en el plan <strong>{PLAN_INFO[org.plan].name}</strong>. Usás {fincas.length} de {PLAN_INFO[org.plan].maxFincas === Infinity ? 'fincas ilimitadas' : `${PLAN_INFO[org.plan].maxFincas} finca`}.</p>
    {volvio && !codigo && <p className="note ok" role="status">Volviste de Mercado Pago. Cuando se apruebe el pago, tu plan pasa a Pro solo (puede tardar unos minutos).</p>}
    <div className="plans">{(['free', 'pro'] as const).map((p) => <div key={p} className={`card ${org.plan === p ? 'current' : ''}`}><h2>{PLAN_INFO[p].name}{p === 'pro' && PRICE > 0 && <span className="muted small"> · {ars(PRICE)} por mes</span>}</h2><ul>
      <li>{PLAN_INFO[p].maxFincas === Infinity ? 'Fincas y empresas ilimitadas' : '1 finca'}</li><li>Cuaderno de campo, cosecha, riego y entregas</li><li>Funciona sin conexión</li>
      <li className={PLAN_INFO[p].regionalPrices ? '' : 'off'}>Pizarra de precios regionales</li><li className={PLAN_INFO[p].exportReports ? '' : 'off'}>Reportes en PDF y Excel</li></ul>
      {org.plan === p ? <span className="pill ok">Tu plan actual</span>
        : p === 'pro' ? (!owner ? <span className="muted">Lo contrata el Dueño</span> : !cloud ? <span className="muted">Necesitás una cuenta en la nube</span>
          : <button className={`btn primary ${busy ? 'busy' : ''}`} disabled={busy} onClick={() => void contratar()}>Pasar a Pro con Mercado Pago</button>) : null}</div>)}</div>
    {owner && cloud && (activa || org.plan === 'pro') && <section className="card"><h2>Tu suscripción</h2>
      {sub && <p>Estado: <strong>{({ authorized: 'Activa', pending: 'Esperando el pago', paused: 'Pausada', cancelled: 'Dada de baja' } as Record<string, string>)[sub.status] ?? sub.status}</strong>{sub.next_payment && sub.status === 'authorized' ? ` · próximo cobro ${new Date(sub.next_payment).toLocaleDateString('es-AR')}` : ''}</p>}
      {activa && <button className="btn danger" disabled={busy} onClick={() => void baja()}>Dar de baja</button>}
      {codigo && <p className="note ok" role="status">Listo, la suscripción quedó dada de baja. Código de baja: <strong>{codigo}</strong>. Guardalo como comprobante.</p>}
      <p className="muted small">Si contrataste hace 10 días o menos, podés pedir la devolución: <a href={href('legal', { d: 'arrepentimiento' })}>botón de arrepentimiento</a>.</p></section>}
    {err && <p className="err" role="alert">{err}</p>}</div>
}

export function Copias() {
  const { store } = useData(); const org = useAuth().org!; const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const last = Number(localStorage.getItem('fincapp.lastBackup') || 0), days = last ? Math.floor((Date.now() - last) / 864e5) : null
  async function down() {
    download(`fincapp-copia-${new Date().toISOString().slice(0, 10)}.json`, await store.exportBackup(org.id), 'application/json')
    try { localStorage.setItem('fincapp.lastBackup', String(Date.now())) } catch { /* ok */ }
    setMsg({ ok: true, t: 'Copia descargada. Guardala en un lugar seguro (pendrive o correo).' })
  }
  async function up(file?: File) {
    if (!file) return; try { const r = await store.importBackup(await file.text(), org.id); setMsg({ ok: true, t: `Copia restaurada: ${r.records} registros.` }) } catch (e: any) { setMsg({ ok: false, t: e.message }) }
  }
  return <div className="page"><h1>Copias de seguridad</h1><p className="muted">Con cuenta, tus datos también están en la nube. Esta copia es un resguardo extra que podés guardar vos.</p>
    {(days === null || days >= 7) && <div className="banner warn">{days === null ? 'Todavía no hiciste ninguna copia.' : `Tu última copia fue hace ${days} días.`}</div>}
    <div className="card"><button className="btn primary" onClick={() => void down()}>Descargar copia ahora</button></div>
    <div className="card"><h2>Restaurar una copia</h2><input type="file" accept="application/json" onChange={(e) => void up(e.target.files?.[0])} /></div>
    {msg && <p className={msg.ok ? 'note ok' : 'err'} role="status">{msg.t}</p>}</div>
}

/** Perfil, empresas (cambiar o crear otra), tus datos y borrar la cuenta. */
export function Cuenta() {
  const a = useAuth(), { store } = useData(), ask = useConfirm(), org = a.org!, cloud = a.mode === 'cloud' && !!supabase
  const [name, setName] = useState(a.user?.name ?? ''), [nueva, setNueva] = useState(''), [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null), [busy, setBusy] = useState(false), [conf, setConf] = useState('')
  async function guardarNombre() {
    if (name.trim().length < 3) return setMsg({ ok: false, t: 'Escribí tu nombre y apellido.' })
    const { error } = await supabase!.auth.updateUser({ data: { full_name: name.trim().replace(/\s+/g, ' ') } }); setMsg(error ? { ok: false, t: 'No se pudo guardar. ¿Tenés conexión?' } : { ok: true, t: 'Nombre actualizado.' })
  }
  async function crear() { if (nueva.trim().length < 2) return setMsg({ ok: false, t: 'Escribí el nombre de la empresa.' }); setBusy(true); const r = await a.createOrg(nueva); setBusy(false); setMsg(r ? { ok: false, t: r } : { ok: true, t: 'Empresa creada.' }); if (!r) setNueva('') }
  async function borrar() {
    if (conf !== 'BORRAR') return setMsg({ ok: false, t: 'Escribí BORRAR en mayúsculas para confirmar.' })
    if (!(await ask({ title: '¿Borrar tu cuenta para siempre?', body: 'Se borran tu usuario y las empresas donde sos la única persona. No se puede deshacer. Te recomendamos descargar una copia antes.', ok: 'Borrar mi cuenta', danger: true }))) return
    setBusy(true); try { await fn('cuenta-borrar', { confirm: 'BORRAR' }); try { indexedDB.deleteDatabase(store.name) } catch { /* ok */ } await a.signOut() } catch (e: any) { setMsg({ ok: false, t: e.message }) } finally { setBusy(false) }
  }
  return <div className="page"><h1>Cuenta</h1>
    {cloud && <section className="card"><h2>Tus datos</h2><p className="muted small">{a.user?.email}</p><div className="inline"><input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre completo" placeholder="Nombre completo" /><button className="btn" onClick={() => void guardarNombre()}>Guardar</button></div></section>}
    <section className="card"><h2>Empresas</h2><div className="list">{a.orgs.map((o) => <div key={o.id} className={`row ${o.id === org.id ? 'on' : ''}`}><strong>{o.name}</strong><span className="muted small">{ROLE_NAME[o.role]} · {PLAN_INFO[o.plan].name}</span>
      {o.id === org.id ? <span className="pill2 ok">Abierta</span> : <button className="btn small" onClick={() => a.selectOrg(o.id)}>Abrir</button>}</div>)}</div>
      {cloud && <div className="inline"><input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nombre de otra empresa" aria-label="Nombre de la nueva empresa" /><button className="btn" disabled={busy} onClick={() => void crear()}>Crear empresa</button></div>}</section>
    <section className="card"><h2>Privacidad</h2><p className="muted">Podés descargar todos tus datos en “Copias”. Por consultas sobre tus datos personales escribí a {CONTACTO}.</p>
      <p><a href={href('legal', { d: 'privacidad' })}>Política de privacidad</a> · <a href={href('legal', { d: 'terminos' })}>Términos</a></p></section>
    {cloud && <section className="card danger-zone"><h2>Borrar mi cuenta</h2><p className="muted">Borra tu usuario y tus empresas donde no hay otras personas. Si sos el único Dueño de una empresa con equipo, primero pasá la titularidad.</p>
      <div className="inline"><input value={conf} onChange={(e) => setConf(e.target.value)} placeholder="Escribí BORRAR" aria-label="Confirmación" /><button className="btn danger" disabled={busy} onClick={() => void borrar()}>Borrar mi cuenta</button></div></section>}
    {msg && <p className={msg.ok ? 'note ok' : 'err'} role="status">{msg.t}</p>}</div>
}
