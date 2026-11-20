export type Plan = 'free' | 'pro'
export type Role = 'owner' | 'manager'

export const PLAN_INFO = {
  free: { name: 'Gratis', maxFincas: 1, regionalPrices: false, exportReports: false },
  pro: { name: 'Pro', maxFincas: Infinity, regionalPrices: true, exportReports: true },
} as const

export type Feature = 'regionalPrices' | 'exportReports'
export const canUse = (plan: Plan, f: Feature) => PLAN_INFO[plan][f]
export const fincasLeft = (plan: Plan, current: number) => Math.max(0, PLAN_INFO[plan].maxFincas - current)

export const ROLE_NAME: Record<Role, string> = { owner: 'Dueño', manager: 'Encargado' }
/** Lo que cada rol puede hacer en la interfaz. El servidor lo vuelve a verificar (RLS + sync_push). */
export const can = {
  manageFincas: (r: Role) => r === 'owner',
  manageMembers: (r: Role) => r === 'owner',
  manageBilling: (r: Role) => r === 'owner',
  loadOperations: (_r: Role) => true,
}
