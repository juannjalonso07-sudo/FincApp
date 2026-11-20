/** Motivos de rechazo del servidor, en lenguaje claro para el productor. */
export const REJECT_MESSAGES: Record<string, string> = {
  plan_limit_fincas: 'Tu plan Gratis permite 1 finca. Pasá al plan Pro para cargar más.',
  role_forbidden: 'Tu rol (Encargado) no puede hacer esto. Pedíselo al Dueño.',
  invalid_op: 'Este dato no tiene un formato válido y no se pudo guardar.',
  too_large: 'Este dato es demasiado grande para guardarlo.',
  bad_clock: 'La fecha u hora de este equipo está mal configurada. Corregila y volvé a sincronizar.',
  entity_mismatch: 'Este registro entra en conflicto con otro. Revisalo y volvé a cargarlo.',
}
export const rejectMessage = (r: string) => REJECT_MESSAGES[r] ?? 'El servidor no aceptó este cambio. Revisalo y volvé a intentarlo.'
