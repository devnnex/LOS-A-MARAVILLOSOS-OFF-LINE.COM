# Los Años Maravillosos Offline

Esta carpeta es una edición local separada. La versión publicada no se
modifica desde aquí.

## Uso diario

Ejecuta Iniciar-Los-Anios-Maravillosos-Offline.cmd. La aplicación abrirá
http://127.0.0.1:8765/admin.html en una ventana independiente de Chrome.
Después de la primera apertura con internet, sus archivos esenciales quedan
disponibles localmente.

Para dejar el acceso en el escritorio y anclarlo a la barra de tareas con el
icono del negocio, abre el menú de Chrome en esa ventana y elige Instalar
Los Años Maravillosos. Chrome crea la aplicación instalada usando el icono y
el nombre configurados por el negocio.

## Sincronización de datos

Cada operación se guarda primero de forma persistente en el navegador. Con
internet se envía de inmediato al mismo Supabase y Apps Script de la versión
online. La cola intenta sincronizar cada 2,5 segundos y las consultas de
inventario/ingresos se reconcilian cada 4 segundos. Tras una confirmación
válida, la operación se libera de la cola; sin internet permanece pendiente y
se reintenta automáticamente sin bloquear formularios, modales ni botones.

No borres los datos del navegador de Chrome ni cambies de perfil de Chrome:
allí se conserva la cola offline.

## Código y datos

GitHub no interviene en ventas, mesas, inventario ni propinas. Esta copia local
usa exclusivamente Supabase y Apps Script para sincronizar los datos del POS.

## Activación del backend de sincronización

Antes de usar esta edición en producción se deben completar una sola vez estos
dos pasos sobre los mismos servicios de la versión online:

1. Ejecutar en Supabase la migración
   `supabase/migrations/20260919120000_offline_sync_realtime.sql`.
2. Publicar `appscript/Code.gs` como una nueva versión de la aplicación web.
   El endpoint debe informar la versión `2.7.0`.

La migración habilita la propagación Realtime del negocio, mesas, categorías y
productos. La versión 2.7.0 de Apps Script añade idempotencia a ventas,
inventario, movimientos e ingresos para que un reintento no procese dos veces
la misma operación.

## Verificación técnica

Desde esta carpeta ejecuta `node tests/offline-sync.test.cjs`. Deben aprobarse
los 15 escenarios automatizados de persistencia, orden, reintentos,
idempotencia, conflictos y eliminaciones.
