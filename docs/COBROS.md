# Cobro del plan Pro con Mercado Pago

**Flujo**
1. El Dueño toca *Pasar a Pro* → Edge Function `mp-checkout` crea una suscripción mensual (`POST /preapproval`, `external_reference` = id de la empresa) y lo manda a pagar a Mercado Pago.
2. Mercado Pago avisa a `mp-webhook`.
   - La función valida la firma `x-signature`.
   - **Consulta el estado real** con `GET /preapproval/{id}`: nunca confía en el cuerpo del aviso.
   - Llama a `apply_subscription`, que solo puede ejecutar el servidor.
3. Si la suscripción está `authorized`, la empresa queda en Pro hasta el próximo cobro + 5 días de gracia. Si un cobro falla, vuelve sola a Gratis al vencer.
4. **Botón de baja**: `mp-baja` cancela en Mercado Pago, conserva Pro hasta el fin del período pagado y muestra un código de baja.

**Configuración en Mercado Pago (Tus integraciones → tu app)**
- Credenciales de producción → `MP_ACCESS_TOKEN`.
- Webhooks: URL `https://lxcomomwiprwgnazloql.supabase.co/functions/v1/mp-webhook`, eventos **Planes y suscripciones** (`subscription_preapproval`, `subscription_authorized_payment`). Copiá la *clave secreta* → `MP_WEBHOOK_SECRET`.
- Probalo primero con las credenciales y usuarios de prueba.

**Para verificar al activar**
- El formato exacto de la firma (`id:…;request-id:…;ts:…;` con HMAC-SHA256) está implementado según la documentación, con tests propios. Confirmalo con un aviso real: si falla, la función responde 401 y queda en los logs.

**Facturación**: ARCA exige factura electrónica por cada cobro. Mercado Pago no factura por vos. Consultá a tu contador: se puede facturar en lote mensual o integrar un servicio de facturación.
