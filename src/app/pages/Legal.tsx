import type { ReactNode } from 'react'
import { LEGAL_VERSION } from '../AuthProvider'
import { href } from '../router'
import { Logo } from '../../ui/Logo'

// ⚠️ BORRADORES para revisar con un abogado antes de lanzar (Ley 25.326, Ley 24.240, Disp. AAIP 60/2016, Disp. SCI 954/2025).
const EMPRESA = import.meta.env.VITE_LEGAL_NAME as string | undefined ?? '[Razón social del titular de FincApp]'
const CUIT = import.meta.env.VITE_LEGAL_CUIT as string | undefined ?? '[CUIT]'
export const CONTACTO = import.meta.env.VITE_CONTACT_EMAIL as string | undefined ?? '[correo de contacto]'

const DOCS: Record<string, { t: string; body: ReactNode }> = {
  privacidad: { t: 'Política de privacidad', body: <>
    <p><strong>Responsable:</strong> {EMPRESA}, CUIT {CUIT}. Contacto para temas de datos personales: <strong>{CONTACTO}</strong>.</p>
    <h3>Qué datos guardamos y para qué</h3>
    <ul><li><strong>Tu cuenta:</strong> nombre, correo y contraseña (cifrada). Para identificarte y darte acceso.</li>
      <li><strong>Datos de tu explotación:</strong> fincas, cuadros, curaciones, riegos, cosechas, entregas, precios. Son tuyos: los usamos solo para que la app funcione y para sincronizarlos entre tus equipos y tu equipo de trabajo.</li>
      <li><strong>Cuadrillas:</strong> solo el nombre de la cuadrilla, de su jefe y la cantidad de personas. No pedimos datos personales de cada trabajador.</li>
      <li><strong>Pagos:</strong> los procesa Mercado Pago. Nosotros no vemos ni guardamos los datos de tu tarjeta.</li></ul>
    <p>No vendemos tus datos ni los usamos para publicidad. La pizarra de precios regionales muestra solo datos de fuentes públicas o promedios anónimos.</p>
    <h3>Dónde se guardan</h3>
    <p>En tu equipo (para que funcione sin señal) y en servidores de Supabase, que pueden estar fuera de la Argentina. Esa transferencia internacional se hace con las garantías que exige la normativa argentina y con tu consentimiento expreso al crear la cuenta.</p>
    <h3>Tus derechos</h3>
    <p>Podés pedir acceso a tus datos (respondemos dentro de los 10 días corridos), rectificarlos o pedir que los borremos (dentro de los 5 días hábiles). Desde la app podés descargar todos tus datos (“Copias”) y borrar tu cuenta (“Cuenta → Borrar mi cuenta”).</p>
    <p className="muted small">La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N.º 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p></> },
  terminos: { t: 'Términos y condiciones', body: <>
    <p>FincApp es un servicio de {EMPRESA} para registrar y organizar el trabajo de fincas frutícolas.</p>
    <h3>Planes</h3><ul><li><strong>Gratis:</strong> una finca y una empresa propia, sin vencimiento.</li><li><strong>Pro:</strong> suscripción mensual en pesos, cobrada por Mercado Pago. Se renueva sola hasta que la des de baja. Al darla de baja conservás Pro hasta el final del período pagado.</li></ul>
    <h3>Carencias y recomendaciones</h3><p>La app calcula días de carencia con los datos que vos cargás. <strong>La fuente válida es siempre la etiqueta del producto y las normas de SENASA.</strong> FincApp no reemplaza el asesoramiento de un ingeniero agrónomo.</p>
    <h3>Precios regionales</h3><p>Son precios mayoristas de referencia publicados por mercados concentradores. No son el precio que te va a pagar un comprador.</p>
    <h3>Tus datos</h3><p>Los datos de tu explotación son tuyos. Podés exportarlos y borrarlos cuando quieras. Ver la <a href={href('legal', { d: 'privacidad' })}>política de privacidad</a>.</p>
    <h3>Arrepentimiento y baja</h3><p>Tenés 10 días corridos desde la contratación para arrepentirte sin costo, y podés dar de baja la suscripción en cualquier momento, por el mismo medio en que la contrataste.</p></> },
  arrepentimiento: { t: 'Botón de arrepentimiento', body: <>
    <p>Si contrataste el plan Pro hace <strong>10 días corridos o menos</strong>, podés arrepentirte y te devolvemos lo cobrado.</p>
    <ol><li>Ingresá con tu cuenta y andá a <strong>Plan → Dar de baja</strong>: la baja es inmediata y te damos un código.</li>
      <li>Escribinos a <strong>{CONTACTO}</strong> con ese código y el asunto “Arrepentimiento” para la devolución.</li></ol>
    <p>Si no podés ingresar, escribinos igual al mismo correo desde la dirección con la que te registraste. Te respondemos con un código de trámite dentro de las 24 horas.</p></> },
  baja: { t: 'Botón de baja', body: <>
    <p>Podés dar de baja la suscripción Pro en cualquier momento, sin llamar ni dar explicaciones.</p>
    <ol><li>Ingresá con tu cuenta y andá a <strong>Plan → Dar de baja</strong>. Es un solo paso y te mostramos un código de baja.</li>
      <li>Seguís con Pro hasta el final del período ya pagado; después la cuenta pasa sola al plan Gratis. <strong>No se borra ningún dato.</strong></li></ol>
    <p>Si no podés ingresar, escribí a <strong>{CONTACTO}</strong> con el asunto “Baja”. Te respondemos con el código de baja dentro de las 24 horas.</p></> },
}
export const LEGAL_KEYS = Object.keys(DOCS)

/** Páginas legales: públicas, se ven sin iniciar sesión (los botones de arrepentimiento y baja deben estar a la vista desde el primer acceso). */
export function Legal({ doc, standalone }: { doc: string; standalone?: boolean }) {
  const d = DOCS[doc] ?? DOCS.terminos
  const page = <div className="page legal"><h1>{d.t}</h1><p className="muted small">Versión {LEGAL_VERSION}</p>{d.body}
    <nav className="links" style={{ justifyContent: 'flex-start', marginTop: 24 }}>{LEGAL_KEYS.filter((k) => k !== doc).map((k) => <a key={k} className="link" href={href('legal', { d: k })}>{DOCS[k].t}</a>)}</nav></div>
  if (!standalone) return page
  return <div className="legal-wrap"><a className="brand" href="#/"><Logo size={30} /><span>FincApp</span></a>{page}<p><a className="btn" href="#/">Volver</a></p></div>
}
export function LegalLinks() {
  return <nav className="links legal-links" aria-label="Legales">{LEGAL_KEYS.map((k) => <a key={k} className="link" href={href('legal', { d: k })}>{DOCS[k].t}</a>)}</nav>
}
