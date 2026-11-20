# Lo legal: qué hay en la app y qué falta

**Ya está en la app** (los textos son *borradores*; que los revise un abogado):
- Política de privacidad, términos, botón de arrepentimiento y botón de baja.
  - Son páginas públicas, sin iniciar sesión, y están enlazadas desde la pantalla de ingreso y desde el pie de todas las pantallas (Disp. SCI 954/2025).
- Consentimiento al crear la cuenta, incluida la transferencia internacional (servidores fuera de Argentina). Queda registrado en la tabla `consents` con la versión del texto.
- Derechos ARCO (Ley 25.326):
  - Descargar todos los datos (Copias).
  - Borrar la cuenta (Cuenta → Borrar mi cuenta, Edge Function `cuenta-borrar`).
  - Correo de contacto visible.
- Cuadrillas: no se guardan datos personales de cada trabajador.
- Baja de la suscripción en un paso, con código de baja.

**Falta hacer (fuera del código)**
1. Completar `VITE_LEGAL_NAME`, `VITE_LEGAL_CUIT` y `VITE_CONTACT_EMAIL`.
2. Inscribir la base de datos en el Registro Nacional de Bases de Datos (AAIP, trámite gratuito por TAD). Consultá con un abogado si corresponde.
3. Transferencia internacional: firmar con Supabase las cláusulas contractuales modelo (Res. AAIP 198/2023) o confirmar que alcanza con el consentimiento expreso.
4. Facturación electrónica (ARCA) de las suscripciones: definir con el contador.
5. Revisar si los productores contratan como consumidores (Ley 24.240) o como empresa. Los botones quedan igual, por las dudas.
