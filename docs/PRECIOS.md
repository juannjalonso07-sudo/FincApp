# Pizarra de precios regionales (plan Pro)

**Fuente elegida**
- El informe mensual *Monitoreo Federal* del **Mercado Central de Buenos Aires** (PDF).
- Trae el precio **mayorista** promedio en $/kg por especie: manzana, pera, durazno, ciruela, uva, kiwi y otras. Se compara con el mes anterior.
- **No es precio al productor ni por variedad.** La app lo rotula como "referencia mayorista".

**Cómo se carga**
- La Edge Function `precios-mcba` prueba las direcciones posibles del PDF del mes actual y del anterior.
- Lee la tabla y guarda en `regional_prices`: fuente, enlace y variación respecto del mes anterior.
- Solo acepta un par de precios si su variación coincide con el % informado. Si el formato del PDF cambia, responde 422 y no guarda nada raro.

**Programación (SQL Editor, con las extensiones `pg_cron` y `pg_net` activas)**
```sql
select cron.schedule('precios-mcba', '0 9 * * 1', $$
  select net.http_post(url := 'https://lxcomomwiprwgnazloql.supabase.co/functions/v1/precios-mcba',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')))
$$);
select cron.schedule('purge-op-log', '0 4 * * 0', $$ select purge_op_log() $$);
```
(Guardá la service role key en Vault con el nombre `service_role_key`.)

**⚠️ Antes de cobrar por esto**
- El PDF del MCBA no declara licencia.
- Pedile al Mercado Central, por escrito, autorización para mostrar sus precios en un servicio pago, citando la fuente.
- Alternativas para sumar después:
  - Los boletines mensuales de la SAGyP.
  - Los listados semanales de los mercados de Mendoza.
  - Promedios anónimos de los precios que cargan los propios productores.
