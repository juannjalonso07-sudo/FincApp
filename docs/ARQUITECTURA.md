# FincApp · Arquitectura del producto comercial

## 1. Stack
| Capa | Tecnología | Por qué |
|---|---|---|
| Interfaz | Vite + React 19 + TypeScript | Estándar, fácil de mantener y de delegar |
| Datos locales | IndexedDB (`idb`), una base por **usuario + empresa** | Offline real, aislada en equipos compartidos |
| Nube | Supabase: Auth + PostgreSQL + RLS | Cuentas, roles y aislamiento por empresa en la base |
| PWA | `vite-plugin-pwa` (Workbox) | Instalable en Android/iOS, abre sin conexión |
| Escritorio | Tauri 2 (instalador NSIS ~5–10 MB) | Reemplaza a Electron (~100 MB) y a los `.bat` |
| Pruebas | Vitest + PGlite (PostgreSQL real en WASM) + Playwright | La base se prueba con SQL real, no simulada |

## 2. Estructura
```
src/lib        hlc.ts (reloj híbrido), ids.ts (UUIDv7)
src/db         store.ts (IndexedDB + cola de salida + copias), types.ts
src/sync       engine.ts (ciclo push→pull, reintentos), supabaseTransport.ts, messages.ts
src/plans      plans.ts (Gratis/Pro, roles)
src/app        AuthProvider, DataProvider, App (pantallas)
src/ui         theme.ts (claro/oscuro por hora), validate.ts, styles.css
supabase/migrations/0001_core.sql   tablas, RLS, funciones sync_push / sync_pull
src-tauri      configuración del instalador de Windows
tests          db (SQL real), engine (cliente ↔ SQL), validate, e2e-local (navegador)
```

## 3. Modelo multi-empresa y seguridad
- `organizations` (empresa, plan) · `memberships` (usuario, rol) · `invites` · `records` (datos) · `regional_prices` (Pro).
- **Todo** está protegido con Row Level Security: un usuario solo ve filas de empresas donde es miembro.
- Los datos **no se escriben con INSERT/UPDATE directos** (permisos revocados): solo por `sync_push`, que valida rol, plan, formato y tamaño.
- El plan **no lo puede cambiar el usuario** (solo `name` es editable); lo cambia el backend de pagos con `service_role`.
- Las invitaciones solo las acepta el correo invitado, una vez, y vencen a los 7 días.
- La clave `anon` es pública por diseño; la `service_role` nunca va en la app.

### Roles
| Acción | Dueño | Encargado |
|---|---|---|
| Cargar curaciones, riegos, cosechas, tareas | ✔ | ✔ |
| Crear / quitar fincas y cuadros | ✔ | ✘ |
| Invitar personas, cambiar nombre de la empresa | ✔ | ✘ |
| Cambiar de plan | ✔ | ✘ |

### Planes
| | Gratis | Pro |
|---|---|---|
| Fincas | 1 | Ilimitadas |
| Pizarra de precios regionales | ✘ (la base no devuelve filas) | ✔ |
| Reportes exportables | ✘ (pendiente de implementar) | ✔ |
Un plan Pro vencido vuelve a Gratis automáticamente (`plan_expires_at`).

## 4. Garantías de datos
1. **Escritura local primero**: guardar nunca depende de la red. Registro + cola + reloj se guardan en **una sola transacción** de IndexedDB.
2. **Cola idempotente**: cada operación tiene un id único; si se pierde la respuesta del servidor, reintentar no duplica (probado).
3. **Conflictos**: gana el reloj mayor **por campo** (HLC); dos personas que editan campos distintos no se pisan (probado).
4. **Rechazos del servidor** (plan, rol, formato): el cambio se retira del equipo, se vuelve a bajar el estado real y se muestra un aviso en castellano (probado). Nunca quedan datos "fantasma".
5. **Reintentos**: 1, 2, 4… hasta 300 s con variación aleatoria; se retoma al volver la red o al abrir la app.
6. **Copias**: (a) la nube; (b) exportación/restauración manual con validación (formato, empresa, integridad); (c) recomendación de copia cada 7 días.
7. **Almacenamiento persistente**: se pide `navigator.storage.persist()` para que el navegador no purgue los datos.

## 5. Qué está verificado y qué no
**Probado automáticamente (39 pruebas + 11 de navegador):** aislamiento RLS, roles, límites de plan, invitaciones, idempotencia, LWW por campo, borrado, paginación, offline→online, lotes de >50, copias de seguridad, validaciones, modo local en navegador (persistencia, sin conexión, descarga de copia).

**NO verificado todavía (necesita cuentas o equipos que no tengo acá):**
- Un proyecto real de Supabase: Auth (confirmación de correo, recuperación), llamadas RPC vía PostgREST, tiempos reales.
- El instalador de Tauri (solo está la configuración; compila en el flujo de GitHub en Windows).
- Instalación de la PWA en iPhone/Android reales.

## 6. Pendiente (próximas etapas)
1. **Migrar las pantallas** actuales (Mapa, Curación, Cosecha, Riego, Tareas, Mercado, Pronóstico) a componentes React usando `store.patch/list`. Hoy el shell solo tiene Fincas, Equipo, Plan y Copias.
2. **Reglas de negocio en el servidor**: p. ej. bloquear cosechas en carencia (hoy están solo en el cliente actual); portarlas a `sync_push`.
3. **Cobro**: Mercado Pago (Argentina) o Stripe + webhook que actualice `plan` / `plan_expires_at` con `service_role`.
4. **Pizarra regional**: definir de dónde salen los precios (carga propia, convenio con mercados) y cargarlos en `regional_prices`.
5. **Reportes exportables** (PDF/Excel) para Pro.
6. **Tiempo real**: hoy se consulta cada 30 s; Supabase Realtime evitaría esperas.
7. **Backups de servidor**: en Supabase revisá qué plan incluye copias diarias/PITR; recomendado además un `pg_dump` programado a almacenamiento externo.
8. **Legal**: términos, política de privacidad y registro de bases de datos (Ley 25.326, AAIP) antes de cobrar.

## 7. Licencias de terceros (para uso comercial)
- Open-Meteo: la API gratuita es **no comercial** → plan pago al vender.
- Copernicus Sentinel-2: uso comercial libre con atribución.
- Imágenes Esri: **no** libres para uso comercial.
- React, Vite, Supabase client, idb, Leaflet: MIT/BSD/Apache. Inter: OFL.

## 8. Puesta en marcha
1. Creá un proyecto en supabase.com. En **SQL Editor** pegá `supabase/migrations/0001_core.sql` y ejecutalo.
2. Copiá `.env.example` a `.env.local` con la URL y la clave anon.
3. `npm install` · `npm run dev` (navegador) · `npm test` · `npm run build`.
4. Escritorio: `npm run tauri dev` (necesita Rust) o dejá que GitHub Actions genere el `.exe` (`.github/workflows/release.yml`).

## Fase 2: pantallas migradas
Inicio (progreso de carencia, clima), Fincas y cuadros (grilla, pincel, variedades), Curación (asistente + productos), Cosecha (aviso de carencia con motivo), Riego (m³ y mm), Tareas, Mercado (tendencias; precios regionales solo Pro). Reglas de dominio en `src/domain/`.
Migración nueva: `supabase/migrations/0002_entity_types.sql` (ejecutar en el SQL Editor después de la 0001).
Pendiente: Mapa (Leaflet/satélite), turnos de riego, cuadrillas/entregas, cobro (Mercado Pago/Stripe), fuente de precios regionales, reportes exportables, reglas de carencia en servidor, realtime, aspectos legales (Ley 25.326).

## Fase 3: auditoría y design system "Surco"
Migración nueva: `supabase/migrations/0003_hardening.sql` (ejecutar después de 0002).
Corregido:
- Entrar sin internet con la sesión vencida usa los datos locales.
- Candado por empresa en `sync_push`, para que el pull no saltee registros.
- Un rechazo del servidor ya no borra datos: el usuario elige reintentar o descartar.
- Cada campo viaja con su propio reloj, tanto en ediciones parciales como al restaurar una copia.
- Relojes validados en el servidor: formato estricto y como máximo 5 minutos adelantados.
- Ops mal formadas se rechazan de a una sin trabar el lote.
- No se puede desborrar una finca para saltear el plan Gratis; una sola empresa propia en ese plan.
- El caudal de riego usa un id propio (`derivedId`).
- La carencia queda copiada en cada cura.
- El motor de sincronización se detiene de verdad al cerrar sesión.
- Clima: las alertas son solo de hoy en adelante.
- Edición de variedad y año, protección contra doble envío, kg de la última cosecha, descarga de copias.

Design system: `src/ui/tokens.css` (tokens), `src/ui/styles.css` (componentes + movimiento), `src/ui/Logo.tsx` (logo vectorial animado), `src/ui/icons.tsx`.

Pendiente de la auditoría:
- Rendimiento: notificar cambios por entidad en vez de recargar todo.
- Router con URL.
- Diálogo propio en lugar de `confirm()`.
- Encargado puede editar campos de fincas y cuadros.
- Registros huérfanos al borrar una finca.
- Limpieza de `op_log`.
- Selector de empresa e invitación cuando ya tenés empresa.
- Tests de React.

## Fase 4: operación, mapa, cobro y legal
- Pantallas nuevas: Mapa (`pages/Mapa.tsx`), Entregas, Cuadrillas, Reportes, Cuenta, Legal, y Turnos dentro de Riego.
- Rutas por hash (`app/router.ts`). Diálogos propios (`ui/Dialog.tsx`). Selector de empresa e invitaciones aunque ya tengas empresa.
- Velocidad: el store avisa por tipo y guarda las lecturas en memoria; `patchMany` hace una sola transacción; el estado de sincronización está en un contexto aparte.
- Migración `0004_operacion_cobro_legal.sql`: entregas; el Encargado solo edita variedad, estado y nota de los cuadros; suscripciones; consentimientos; `purge_op_log`.
- Edge Functions en `supabase/functions/`: mp-checkout, mp-webhook, mp-baja, precios-mcba, cuenta-borrar.
- Ver `docs/PUBLICAR.md`, `COBROS.md`, `PRECIOS.md`, `LEGAL.md`.
