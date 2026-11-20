# Publicar FincApp: paso a paso

## 1. Supabase (una sola vez)
1. **SQL Editor**: corré en orden las migraciones que todavía no corriste: `0003_hardening.sql` y `0004_operacion_cobro_legal.sql` (la 0001 y la 0002 ya están).
2. **Authentication → Sign In / Providers → Email**: volvé a activar *Confirm email* antes de abrir al público.
3. **Authentication → URL Configuration**: *Site URL* = la dirección pública de la app (por ej. `https://tuusuario.github.io/fincapp/`).
4. **Edge Functions** (con la CLI de Supabase, desde la carpeta del proyecto):
   ```bash
   npx supabase login
   npx supabase link --project-ref lxcomomwiprwgnazloql
   npx supabase secrets set MP_ACCESS_TOKEN=APP_USR-... MP_WEBHOOK_SECRET=... PRO_PRICE_ARS=9900 APP_URL=https://tuusuario.github.io/fincapp
   npx supabase functions deploy mp-checkout
   npx supabase functions deploy mp-baja
   npx supabase functions deploy cuenta-borrar
   npx supabase functions deploy mp-webhook --no-verify-jwt
   npx supabase functions deploy precios-mcba --no-verify-jwt
   ```
5. **Programar tareas** (Integrations → Cron, o SQL con `pg_cron` + `pg_net`): ver `docs/PRECIOS.md` y la limpieza semanal `select purge_op_log();`.

## 2. App web / PWA para celulares (GitHub Pages)
1. Subí el proyecto a un repositorio de GitHub (por ej. `fincapp`).
2. *Settings → Secrets and variables → Actions*:
   - **Secrets**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (la *publishable key*).
   - **Variables**: `VITE_PRO_PRICE_ARS`, `VITE_CONTACT_EMAIL`, `VITE_LEGAL_NAME`, `VITE_LEGAL_CUIT`.
3. *Settings → Pages → Source*: **GitHub Actions**. Cada push a `main` corre los tests y publica.
4. En el celular: abrí la dirección en Chrome (Android) → menú ⋮ → **Instalar app**. En iPhone: Safari → Compartir → **Agregar a inicio**.

## 3. Instalador de Windows (.exe)
El workflow `release.yml` lo arma solo en cada push a `main` (job *windows-installer*). Bajalo desde *Actions → la última ejecución → Artifacts → FincApp-Windows-Instalador*.
Windows va a mostrar "editor desconocido" hasta que se firme el instalador con un certificado de firma de código.

## 4. Lo que hay que probar a mano antes de lanzar
- Registro real con confirmación de correo, invitación a un Encargado en otro equipo y sincronización entre los dos.
- Un pago real de Mercado Pago (o en su modo de prueba con usuarios de prueba) → el plan pasa a Pro solo; baja → conserva Pro hasta fin del período.
- Instalar la PWA en un Android y en un iPhone, cortar la señal y cargar una cura.
