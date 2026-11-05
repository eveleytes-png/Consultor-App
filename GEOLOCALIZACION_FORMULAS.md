# Geolocalización alternativa y protección de fórmulas — 5 de noviembre de 2026

## Arquitectura revisada

La aplicación publicada utiliza `dist/`; `vercel.json` genera su service worker con `tools/build-pwa.cjs`. Los archivos históricos y las copias de releases no se usan como fuente de publicación y no se modificaron.

- `dist/home.js` mapea los encabezados LatLog/LatLong y conserva todos los valores originales en `sourceValues`. En el esquema actual, LatLong es E (índice 4), Dirección es V (índice 21), y Cust_id comercio es P (índice 15). La dirección se busca por encabezado, sin fijarla a V.
- `dist/sheets-app.js` obtiene snapshots de BaseApp y renueva la cartera cada 30 segundos mientras está visible y sin borradores abiertos. Las fichas de consulta pueden refrescarse; los formularios conservan sus borradores. El listado Sin ubicación ahora también permite refrescar la cartera.
- `dist/customization.js` dibuja el mapa Leaflet/MapLibre con los componentes existentes. `dist/improvements.js` contiene el listado modal Sin ubicación y las rutas.
- La edición de sellers escribe celdas individuales A–O mediante `editSeller` en `api/sheets.mjs`. Mantiene la identificación por Cust ID, la validación del encabezado y valor esperado, y el bloqueo existente entre guardados de la app. No amplía las columnas editables.

## Ubicación implementada

`sellerCoordinates` resuelve primero LatLong con su validador habitual. Solo a falta de coordenadas válidas utiliza un resultado geocodificado vigente cuya dirección original coincide exactamente con la actual. Todos los consumidores de ubicación comparten este criterio: mapa, agrupaciones, contadores, rutas, enlaces de contacto y Sin ubicación.

La API recibe únicamente IDs de sellers (máximo cinco), vuelve a leer sus direcciones desde BaseApp y no consulta el proveedor si encuentra LatLong válido, aunque el navegador esté desactualizado. No admite direcciones arbitrarias suministradas por el cliente. Reutiliza la autenticación, el origen permitido y el acceso fijo a la planilla de la API existente.

Se acepta únicamente un resultado Geoapify: tipo `building`, `full_match`, confianza general, de calle y de edificio iguales a 1, país AR, calle/altura/localidad presentes y concordantes con la consulta interpretada; provincia concordante cuando está presente. La altura debe aparecer fuera del nombre de la calle en la primera parte de la dirección. Se rechazan calles sin altura, localidades generales, coincidencias parciales, alternativas múltiples, alturas/localidades distintas, respuestas incompletas y errores. No se aceptan Plus Codes como excepción automática a estas comprobaciones: si no se obtiene una dirección de edificio verificable, permanecen sin ubicación.

Los resultados permanecen en memoria; no se escriben en Sheets, LatLog, Supabase ni almacenamiento persistente del navegador. Cambiar la dirección invalida inmediatamente su uso. LatLong nuevo siempre prevalece. Respuestas que llegan tarde no sustituyen una dirección o LatLong que ya cambió.

La caché del proveedor usa un hash de la dirección exacta, deduplica peticiones concurrentes y conserva resultados y rechazos por 24 horas; fallos por 60 segundos. Tiene un máximo de 5.000 entradas por instancia. Las peticiones al proveedor se serializan con 300 ms entre comienzos y timeout de 8 segundos. El cliente procesa de a cinco sellers, conserva su propia caché temporal y reintenta fallos al refrescar después del minuto. Un error no detiene la carga de la cartera.

Sin ubicación conserva las tarjetas, datos principales, acceso a ficha y descarga del subconjunto. Refresca su contenido cuando se resuelven direcciones o se actualiza la cartera. Corregir LatLong desde la ficha lo retira del listado y lo muestra en el mapa.

## Protección de fórmulas

La lectura de celdas usa el tipo real `userEnteredValue.formulaValue` de Google Sheets. Un texto que empieza con `=` no se trata como fórmula. La lectura se restringe en servidor al campo editable del seller identificado.

Antes del primer guardado, se comprueban todos los campos modificados. Cada fórmula requiere dos diálogos explícitos que nombran el campo y advierten sobre reemplazar/eliminar el cálculo. Cancelar cualquiera detiene todo ese envío, conservando el borrador y sin escrituras.

Después de cada confirmación se solicita un permiso firmado al servidor. El segundo exige el primero. El permiso final vence a los cinco minutos y está vinculado al seller, columna, encabezado, fórmula original y nuevo valor. La API vuelve a comprobar el tipo y valor de la celda antes de escribir y rechaza fórmulas sin permiso final, permisos parciales o permisos para valores distintos. Si cambió la celda, se debe cerrar la edición y revisar el dato actualizado. Las celdas sin fórmulas no agregan confirmaciones.

Se mantienen los guardados individuales existentes; un fallo de red después de empezar a escribir puede dejar guardados parciales, que el formulario ya informa. Google Sheets no ofrece en este mecanismo una transacción condicional que bloquee ediciones humanas entre la comprobación y la escritura: permanece una ventana pequeña de concurrencia externa. El bloqueo existente coordina los guardados de la app, no bloquea Google Sheets a sus editores.

## Activación y costos

Configurar `GEOAPIFY_API_KEY` únicamente como variable privada del servidor en Vercel y volver a desplegar. No colocar la clave en `dist`, archivos de configuración públicos ni variables del frontend. Sin clave, la alternativa devuelve unavailable y esos comercios permanecen Sin ubicación; LatLong continúa funcionando.

Precios consultados el 05/11/2026: plan gratuito de 3.000 créditos diarios y hasta 5 solicitudes por segundo; normalmente una geocodificación consume un crédito. API 10 ofrece 10.000 créditos diarios por USD 59 mensuales, sin impuestos. El plan gratuito permite uso comercial con atribución; se agregó atribución Geoapify/OpenStreetMap junto al mapa. No se contrató un plan ni se configuraron credenciales.

- https://www.geoapify.com/pricing/
- https://www.geoapify.com/pricing-details/
- https://apidocs.geoapify.com/docs/geocoding/
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells

La cobertura y precisión efectiva de direcciones en Misiones requieren una prueba real con clave. El criterio conservador puede rechazar direcciones existentes si el proveedor no suministra todos los datos de confianza o normaliza nombres de una manera no concordante. Esto preserva el requisito de no mostrar aproximaciones. La caché y limitador son por instancia: reinicios y múltiples instancias pueden repetir consultas; no constituyen un presupuesto global. Conviene controlar el uso desde el proveedor. No se incorporó una nueva base persistente ni se cambió la estructura de la planilla.

## Archivos modificados

Producción:
- `api/sheets.mjs`: geocodificación autorizada por IDs, lectura de fórmulas reales, permisos de dos pasos y comprobación antes de escribir.
- `lib/geolocation.mjs` (nuevo): proveedor, aceptación estricta, caché, timeout y limitador.
- `dist/geolocation.js` (nuevo): resolución compartida e invalidación de coordenadas en memoria.
- `dist/index.html`: carga del módulo nuevo.
- `dist/sheets-gateway.js`: operaciones internas nuevas.
- `dist/sheets-app.js`: resolución después de sincronizar, preflight de campos y permisos de fórmula.
- `dist/customization.js`: mapa y formularios conectados a los mecanismos anteriores; atribución.
- `dist/improvements.js`: rutas y listado Sin ubicación actualizado.
- `dist/operations.js`, `dist/workspace.js`, `dist/portfolio-view.js`: mismo criterio de ubicación en tarjetas, enlaces y contadores.
- `vercel.json`: hasta 60 segundos para la API Sheets.
- `dist/sw.js`: regenerado con el módulo nuevo.

Pruebas nuevas:
- `tests/geolocation.test.mjs`
- `tests/geolocation-api.test.mjs`
- `tests/formula-consent.test.mjs`
- `tests/geolocation-formula-browser.cjs`

Pruebas existentes adaptadas al módulo y contrato nuevos:
- `tests/sheets-cell-sync.test.mjs`
- `tests/seller-data-form.test.cjs`
- `tests/map-viewport.test.cjs`
- `tests/google-source.test.cjs`
- `tests/qa-critical-regression.test.cjs`
- `tests/improvements.test.cjs`

## Verificación

19 suites controladas de Node: geolocalización, API, consentimiento de fórmulas, formulario de seller, sincronización de celdas, seguridad del servidor, viewport del mapa, operaciones, regresiones críticas, mejoras, fuente Google, gateway, sincronización, tres pestañas, personalización, navegación, acceso, espacio de trabajo y política de caché PWA.

Chrome con servicios simulados: mapa con LatLong y dirección resuelta, exclusión del seller resuelto del listado, ficha del pendiente, cancelación de la segunda confirmación sin escrituras, aceptación de ambas y carga manual de LatLong con actualización del mapa y listado; sin errores de JavaScript.

Regresión de navegador existente: escritorio y móviles de 390/320 px, navegación, filtros y agenda; sin desbordamiento ni errores de JavaScript.

Se regeneró el service worker y se verificó sintaxis de los scripts modificados. Las pruebas no escribieron en la planilla real ni consultaron Geoapify con direcciones reales. No se realizó despliegue.

## Adaptación para publicar
Se integraron los cambios sobre main 7015a7c, conservando la fuente vigente «Base Consultor App» (sheetId 192864634), el diseño actual de fichas y configuración, los indicadores y la compilación build-static.cjs. Las fuentes del repositorio están en su raíz; dist se genera al compilar. No se reemplazó la configuración de publicación por la copia histórica local ni se agregó PWA al proyecto remoto.
