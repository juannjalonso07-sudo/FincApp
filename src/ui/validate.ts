export interface FincaForm { n: string; ha: string }
export interface FincaClean { n: string; ha: number }

export function validateFinca(f: FincaForm): { ok: true; value: FincaClean } | { ok: false; errors: Partial<Record<keyof FincaForm, string>> } {
  const errors: Partial<Record<keyof FincaForm, string>> = {}
  const n = f.n.trim().replace(/\s+/g, ' ')
  if (n.length < 2) errors.n = 'Escribí el nombre de la finca (al menos 2 letras).'
  else if (n.length > 80) errors.n = 'El nombre es muy largo (máximo 80 letras).'
  const ha = Number(f.ha.replace(',', '.'))
  if (!f.ha.trim()) errors.ha = 'Indicá las hectáreas.'
  else if (!Number.isFinite(ha) || ha <= 0) errors.ha = 'Las hectáreas deben ser un número mayor que 0.'
  else if (ha > 100000) errors.ha = 'Ese número de hectáreas parece un error. Revisalo.'
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { n, ha: Math.round(ha * 100) / 100 } }
}

export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
export const validPassword = (s: string) => s.length >= 8
export function friendlyAuthError(msg: string): string {
  if (/invalid login/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/already registered|already exists/i.test(msg)) return 'Ya existe una cuenta con ese correo. Probá iniciar sesión.'
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar tu correo. Revisá tu bandeja de entrada.'
  if (/plan_limit_orgs/i.test(msg)) return 'En el plan Gratis podés tener una sola empresa propia. Pasá a Pro para crear otra.'
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos.'
  if (/network|fetch/i.test(msg)) return 'No hay conexión. Para iniciar sesión necesitás internet.'
  return 'No pudimos completar la operación. Intentá de nuevo.'
}
