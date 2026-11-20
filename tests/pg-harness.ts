import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/** Base de datos PostgreSQL real (WASM) con la migración de FincApp y roles de Supabase simulados. */
export async function makeDb() {
  const db = new PGlite()
  await db.exec(`create role anon nologin; create role authenticated nologin;`)
  for (const f of readdirSync(join(here, '../supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(here, '../supabase/migrations', f), 'utf8'))
  return db
}

const emails = new Map<string, string>()
export const setEmail = (uid: string, email: string) => emails.set(uid, email)

/** Ejecuta una consulta "como" un usuario autenticado (igual que PostgREST: rol + claim sub). */
export async function asUser<T = any>(db: PGlite, uid: string | null, sql: string, params: any[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [uid ?? '', JSON.stringify({ sub: uid, email: uid ? emails.get(uid) ?? `${uid}@test.local` : null })])
    return tx.query<T>(sql, params)
  })
}
