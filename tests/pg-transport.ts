import type { PGlite } from '@electric-sql/pglite'
import type { Transport } from '../src/db/types'
import { asUser } from './pg-harness'

/** Transporte de prueba: llama a las mismas funciones SQL que Supabase, pudiendo simular cortes de red. */
export function pgTransport(db: PGlite, uid: string, ctl: { offline?: boolean; dropAckOnce?: boolean } = {}): Transport {
  return {
    async push(org, ops) {
      if (ctl.offline) throw new Error('Failed to fetch')
      const r = (await asUser(db, uid, `select sync_push($1::uuid,$2::jsonb) r`, [org, JSON.stringify(ops)])).rows[0] as any
      if (ctl.dropAckOnce) { ctl.dropAckOnce = false; throw new Error('Failed to fetch') } // el servidor aplicó, pero la respuesta se perdió
      return r.r
    },
    async pull(org, since, limit) {
      if (ctl.offline) throw new Error('Failed to fetch')
      return ((await asUser(db, uid, `select sync_pull($1::uuid,$2::bigint,$3::int) r`, [org, since, limit])).rows[0] as any).r
    },
  }
}
