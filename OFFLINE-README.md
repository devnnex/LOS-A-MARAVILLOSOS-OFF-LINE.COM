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
online. Tras confirmarse, se conserva solo un minuto y luego se libera ese
espacio local. Sin internet, permanece pendiente y se reintenta
automáticamente al regresar la conexión.

No borres los datos del navegador de Chrome ni cambies de perfil de Chrome:
allí se conserva la cola offline.

## Código y datos

GitHub no interviene en ventas, mesas, inventario ni propinas. Esta copia local
usa exclusivamente Supabase y Apps Script para sincronizar los datos del POS.
