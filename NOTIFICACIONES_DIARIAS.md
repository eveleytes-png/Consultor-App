# Resumen diario — implementación para el consultor actual

Actualizado el 21/10/2026. Código implementado y probado localmente. **No desplegado, SQL no ejecutado, cron no instalado y proveedores reales no probados.** No se enviaron mensajes reales.

El usuario confirmó que hoy existe un solo consultor. Esta etapa usa exactamente una cuenta de `AUTH_ALLOWED_EMAILS`; las APIs privadas y el worker rechazan configuraciones con varias cuentas. No se implementaron usuarios/contraseñas ni importaciones independientes para usuarios futuros.

## Arquitectura encontrada y decisiones

- `api/sheets.mjs` autentica Google ID tokens, limita correos autorizados y firma una cookie HttpOnly/Secure/SameSite=Lax de siete días. Lee un archivo intermediario fijo con BaseApp, Points_ConsultoresApp y Links_ConsultoresApp. Se conserva esa fuente: no hay conexión con una planilla oficial adicional.
- Sellers, links y equipos proceden de Sheets. Agenda, acciones, asignaciones comerciales y perfil proceden del registro `consultor_shared_state`, ID `demo`, de Supabase. Los caminos antiguos locales no son leídos por el worker. Se reutilizan las reglas y RPC existentes.
- El esquema SQL anterior permite acceso anónimo a ese registro. La migración nueva revoca esos permisos y el navegador pasa por `/api/state`, autenticado con la misma cookie Google. La clave de servicio queda exclusivamente en Vercel. Es necesario activar ambos cambios coordinadamente; aplicar solo el SQL impediría que los clientes antiguos guarden hasta actualizarse.
- Se encontraron registros reales en el archivo público `dist/demo-data.js`. Se quitaron los comercios y colecciones operativas de ese paquete; se conservan únicamente los encabezados y esquema público. Las pruebas que necesitaban registros usan ahora datos ficticios. Esto no borra Sheets ni Supabase. Revisar y retirar despliegues antiguos si todavía sirven esos registros; publicar el nuevo código no borra versiones históricas.
- La app muestra como porcentaje **encuestas válidas / comercios con aceptación**. No mide aceptados / total. El cálculo se conserva íntegro, se exporta para Node y se usa directamente en el resumen. Las metas cambian de 60/70 a 60/75/100 por el requisito del pedido. Sin aceptados se informa que no existe base de cálculo; no se inventa 0%.
- Calendar considera pendientes los registros de la fecha seleccionada con `!completed`. El resumen conserva esa regla (incluidos registros antiguos sin el campo), no modifica actividades y desde las 20 muestra hoy y mañana por separado, en Buenos Aires. Presenta hasta cinco descripciones breves por grupo, informa el total y enlaza a la agenda completa.

## Qué quedó implementado

El perfil incorpora activación, hora, correo, solicitud y validación de código, vinculación/desvinculación de Telegram, estado de configuración, vista previa y últimos estados por canal. Los datos se guardan en una tabla privada asociada a la cuenta autorizada, no en localStorage.

Correo: código aleatorio de seis dígitos, hash en DB, caducidad de diez minutos, cinco intentos y espera de un minuto entre solicitudes. Cambiar el destino revoca su verificación. Envío textual mediante Resend, con clave de idempotencia estable por trabajo. Se registra aceptación del proveedor, **no entrega ni lectura**. No se implementó webhook de entrega.

Telegram: enlace `/start` con desafío aleatorio, hash, caducidad y un solo uso; webhook protegido por su secret header; solo chats privados. El usuario consulta el vínculo pendiente, ve la cuenta/chat y confirma desde la sesión autenticada. El chat ID no se acepta desde el navegador. Texto sin parse_mode, dividido cuando hace falta; cada fragmento tiene su propio estado para evitar repetir los anteriores.

El worker lee BaseApp con la cuenta de servicio existente y la agenda de Supabase, construye un resumen estructurado y congela el texto por fecha. El denominador, normalización, mapeo de encabezados y parser de comercios se comparten con la aplicación. No se usa un porcentaje redondeado para elegir metas ni calcular encuestas faltantes.

La fecha local, canal e índice de fragmento identifican un trabajo. Un claim con actualización condicional de revisión impide procesarlo simultáneamente. Estados: pendiente, procesando, aceptado por proveedor, reintento, fallido, incierto y omitido. Respuestas 429 reciben hasta tres intentos, separados por 5/10 minutos. Un timeout, respuesta ambigua o proceso que muere durante la llamada queda incierto; no se reenvía automáticamente. Esta decisión reduce duplicados cuando el proveedor podría haber aceptado el mensaje. No existe garantía absoluta de exactamente una vez frente a fallos externos.

Correo y Telegram se procesan independientemente. Si falta proveedor/verificación/vínculo, ese canal no se intenta; el otro puede funcionar. La aceptación de uno impide reenviarlo al reintentar el otro. Los logs guardan categoría de fallo, intentos, timestamps e ID del proveedor en la tabla privada. La UI muestra estados resumidos. Los errores de fuente se registran sin credenciales ni contenido privado.

Si se omite una ejecución, la próxima procesa el resumen pendiente **del día local actual** después del horario elegido. Trabajos pendientes/reintento de fechas anteriores se marcan omitidos; no se mandan resúmenes viejos. Se conservan trabajos por 35 días. Los resultados inciertos requieren revisar el proveedor antes de intervenir; no hay botón de reenvío forzado.

## Cambios de cartera: diferencia importante con el pedido original

**BaseApp ya es la cartera activa de la app. No existe una importación en espera de aprobación.** Agregar ese comportamiento requeriría cambiar el flujo de sincronización y mantener una cartera activa diferente de la fuente. No se hizo ese cambio silenciosamente.

Se implementó detección y revisión de **cambios ya observados en BaseApp**. La primera lectura válida establece una referencia; las siguientes registran altas/bajas por ID, manteniendo las anteriores pendientes sin duplicarlas. Los mensajes vuelven a incluirlas cada día. El perfil permite verlas y registrar su revisión; el backend vuelve a leer la fuente y comprueba su versión antes de archivar los registros revisados. Se guarda la fila anterior de una baja y la fila de una alta; no se eliminan actividades, acciones ni relaciones existentes.

La revisión **no agrega ni borra filas en Sheets**, y no es una aprobación previa a cambios de la cartera activa. La notificación tampoco ejecuta esas operaciones. Si se requiere aprobación previa, esa parte del pedido sigue pendiente y debe diseñarse como una migración explícita. El texto conserva las cantidades solicitadas para agregar/eliminar y aclara mediante enlace que son cambios detectados en la fuente sincronizada.

Fuentes vacías, fallidas, encabezados inválidos/ambiguos y IDs/mails duplicados se rechazan sin alterar la referencia ni pendientes. Una reducción superior a la mitad de los registros detiene la actualización para revisión manual; no hay bypass público ni botón de aprobación masiva. Una cartera legítimamente vacía necesita revisión del operador antes de reiniciar la referencia. La copia privada solo sirve para detectar/auditar diferencias; los resúmenes leen los datos actuales de Sheets.

## Ejecución programada y activación

Se recomienda Supabase Cron + pg_net + Vault para invocar la función en Vercel cada cinco minutos. No se agregó un cron de Vercel: Hobby permite ejecución diaria con precisión horaria, insuficiente para horarios arbitrarios. Con esta estrategia el retraso nominal es de 0 a menos de cinco minutos más latencia; no se garantiza puntualidad absoluta. El perfil lo informa. Las extensiones, cuotas, disponibilidad del proyecto y permisos reales deben verificarse antes de activarlo.

Orden de configuración, manteniendo una copia de seguridad previa de Supabase:

1. Configurar en Vercel las variables de la tabla siguiente. `AUTH_ALLOWED_EMAILS` debe contener solo la cuenta del consultor actual. Conservar las credenciales Google y AUTH_SECRET existentes. Usar el dominio canónico exacto en APP_ORIGIN.
2. Desplegar el código. GET `/api/sheets` anuncia `privateStateEnabled` cuando existen las credenciales backend de Supabase, y el cliente pasa por `/api/state`. Confirmar con una sesión Google real que agenda y perfil leen/guardan por ese endpoint antes de revocar accesos anteriores. No confiar únicamente en la prueba local.
3. Aplicar `supabase/notifications.sql` después de las migraciones existentes de detalles. Crea la tabla privada y revoca los permisos públicos de datos/RPC existentes. Verificar que el REST directo con la clave pública no lee ni escribe el registro privado y que la app autenticada sí puede hacerlo. No volver a ejecutar después el SETUP/schema antiguo porque volvería a otorgar permisos públicos.
4. Crear bot en BotFather y registrar webhook de Telegram a `https://DOMINIO/api/notifications?hook=telegram`, pasando `secret_token` y `allowed_updates: ["message"]` mediante la Bot API desde un entorno seguro. No colocar bot token en historial compartido, frontend ni repositorio. Este registro externo no se realizó aquí.
5. Autenticar dominio remitente en Resend mediante DNS; comprobar envío real del código y completar su verificación desde el perfil. Vincular Telegram con el enlace, iniciar bot, pulsar Consultar vínculo pendiente, comprobar identidad y confirmar. La vinculación no se considera completada solo por abrir Telegram.
6. Pulsar Actualizar diferencias para establecer la referencia inicial y Ver resumen. Verificar los valores contra Inicio y agenda reales. Activar el resumen y guardar la hora.
7. Guardar en Supabase Vault `NOTIFICATION_WORKER_URL` = URL canónica de `/api/notifications?run=daily` y `NOTIFICATION_WORKER_AUTH` = `Bearer ` seguido del secreto de cron. Aplicar `supabase/notifications-cron.sql`. El nombre estable del job evita crear cron duplicados al repetir la instalación.
8. Comprobar `cron.job_run_details` y respuestas de pg_net, además de los estados privados de envío. Una invocación aceptada por pg_net no demuestra que se haya enviado el mensaje. Probar dos ejecuciones para la misma fecha y fallo de un canal sin duplicar el otro. No exponer el secreto del worker en enlaces del usuario.

| Variable de Vercel | Uso |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto actual |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso backend privado; nunca en dist |
| `RESEND_API_KEY` | Envío de correo |
| `NOTIFICATION_FROM` | Remitente del dominio verificado |
| `TELEGRAM_BOT_TOKEN` | Bot API |
| `TELEGRAM_BOT_USERNAME` | Nombre sin @ para enlace de vinculación |
| `TELEGRAM_WEBHOOK_SECRET` | Secret header del webhook |
| `NOTIFICATION_CRON_SECRET` | Secreto aleatorio de al menos 32 bytes para el worker |
| `APP_ORIGIN` | Origen HTTPS canónico, sin rutas ni parámetros |

`vercel.json` declara duración máxima de 300 segundos para notifications. Verificar compatibilidad con el runtime/plan contratado. Las llamadas a proveedores y DB tienen timeout; un corte del proceso no se trata como envío exitoso. Los clientes antiguos deben recargar tras la migración de permisos.

## Costos, audio y límites

Un poll cada cinco minutos supone 288 invocaciones/día antes de optimizarlo; la mayoría retorna sin leer Google si todavía no es hora o no hay canales completos. Considerar uso de Vercel, DB, Google API y logs. Resend publica límite gratuito de 100 correos/día; contar verificaciones y revisar también la cuota mensual vigente. Telegram Bot API admite envío ordinario sin contratar otro proveedor, con límites y respuestas 429.

**Audio no implementado**, según la opción permitida para primera etapa. La extensión futura reutiliza `buildDailySummary` para construir un guion determinista sin URLs; voz española de Google Cloud Text-to-Speech Neural2 es una alternativa a evaluar mediante escucha. Requiere API, permisos de síntesis y facturación; sintetizar OGG/Opus y subir multipart a `sendVoice`, sin publicar archivos ni claves. Registrar audio como trabajo separado: un fallo nunca debe repetir ni invalidar texto exitoso. No se comprobó una voz concreta, formato de salida ni latencia real. La tarifa consultada para Neural2 es USD 16/millón de caracteres tras la franquicia; el costo depende de texto y usuarios, además de almacenamiento/egreso. No usar un modelo que invente o reformule hechos del resumen.

La tabla JSON con revisión es una solución deliberadamente pequeña para **un consultor**. Tiene límite de 8 MB; referencias y archivos históricos pueden requerir compactación o migración a tablas antes de alcanzarlo. No se eliminan archivos de cambios automáticamente. El próximo diseño multiusuario deberá normalizar asignaciones y tablas, aislar Google por usuario, migrar agenda y políticas, y reemplazar las funciones actuales ligadas a `demo`. El código actual lo bloquea; no afirma soportarlo.

Referencias oficiales consultadas:

- [Vercel Cron, límites y precisión](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Supabase Cron, pg_net y Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Telegram Bot API y voz](https://core.telegram.org/bots/api#sendvoice)
- [Resend: claves de idempotencia, 24 horas](https://resend.com/changelog/idempotency-keys)
- [Resend: precios y cuotas](https://resend.com/pricing)
- [Google TTS: precios](https://cloud.google.com/text-to-speech/pricing)

## Archivos modificados o agregados

| Archivo | Propósito |
| --- | --- |
| `api/sheets.mjs` | Exporta autenticación/lector existentes y anuncia puente privado |
| `api/state.mjs` | Puente autenticado, rutas y RPC permitidos explícitamente |
| `api/notifications.mjs` | Perfil, verificación, webhook y ejecución diaria protegidos |
| `lib/notification-store.mjs` | Persistencia privada y compare-and-swap de revisión |
| `lib/notification-service.mjs` | Canales, fuente, diferencias, archivo y worker |
| `lib/notification-providers.mjs` | Resend, Bot API, fragmentación y errores conservadores |
| `lib/daily-summary.mjs` | Resumen estructurado, texto, fechas y agenda |
| `dist/home.js` | Cálculo/mapeo/parser compartidos; metas 60/75/100 |
| `dist/sheets-app.js` | Reutiliza parser, activa puente privado y aplica atajo después de login |
| `dist/supabase-store.js` | Usa puente cuando el servidor lo anuncia |
| `dist/notifications.js` | Controles y estados del perfil |
| `dist/index.html` | Carga extensión del perfil |
| `dist/customization.css` | Alineación del control de activación |
| `dist/demo-data.js` | Retira comercios del paquete público |
| `supabase/notifications.sql` | Almacenamiento privado y revocación de permisos anteriores |
| `supabase/notifications-cron.sql` | Programación de cinco minutos con secretos en Vault |
| `vercel.json` | Presupuesto de duración de la función |
| `tests/daily-summary.test.mjs` | Metas, porcentajes, contenido y agenda |
| `tests/notification-service.test.mjs` | Concurrencia, canales, verificación y cambios |
| `tests/notification-store.test.mjs` | CAS y autorización del puente |
| `tests/notifications-browser.test.cjs` | Perfil, enlaces y funciones existentes con fixtures |
| `tests/google-source.test.cjs`, `tests/three-tabs.test.cjs` | Cargan parser compartido en fixtures |
| `tests/demo.test.cjs`, `tests/customization.test.cjs` | Datos ficticios fuera de producción |
| `tests/notifications-profile-390.png` | Evidencia visual móvil con datos ficticios |
| `NOTIFICACIONES_DIARIAS.md` | Esta documentación |

## Verificación y pendientes reales

Pasaron todos los archivos `tests/*.test.cjs` y `tests/*.test.mjs` existentes al ejecutar la batería local, más el chequeo de scripts/recursos de `tools/check-static-release.cjs`. Las suites nuevas suman **22 pruebas unitarias/controladas** y una prueba de navegador. Después de los últimos ajustes de Telegram se repitieron estas suites nuevas y navegador. SQL no fue ejecutado contra PostgreSQL/Supabase real.

Verificado: seis rangos/límites de metas y comparación directa con Inicio; redondeo; ausencia de aceptados; No explícito; agenda vacía, finalizada y pendiente; umbral 20:00 y cambio de año; sin cambios y altas/bajas persistentes; revisión con versión; importaciones vacías/duplicadas; dos ejecuciones concurrentes; reintento independiente de cada canal; timeout incierto; falta de configuración; códigos y límites; Telegram privado/un solo uso; rechazo anónimo, origen incorrecto y configuración multiusuario; almacenamiento con CAS; perfil móvil sin desborde; enlaces conservados con sesión cerrada y aplicación del filtro tras cargar sesión; apertura de mapa/lista y diálogos de descarga/rutas.

La prueba de navegador usa API fixtures y simula los estados autenticado/cerrado; no completa Google OAuth real. Abrir diálogos no equivale a haber descargado un archivo ni ejecutado una ruta externa; las regresiones existentes verifican exportación y conjuntos filtrados por separado. No se probaron entregas reales, SQL/RLS instalado, cron real, límites reales ni proveedor de audio.

Pendientes para activar: variables externas, dominio/DNS de correo, bot y webhook, despliegue, migración, Vault/cron, pruebas reales supervisadas y revisión de antiguos despliegues públicos. Pendientes de alcance: aprobación **previa** a modificar la cartera activa, audio y cuentas independientes futuras. No se presentaron como terminados.
