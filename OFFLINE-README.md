# Los Años Maravillosos Offline

Esta carpeta es una edición local separada. La versión publicada y su rama
main no se modifican desde aquí.

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

La aplicación conserva el último estado consultado y, si una escritura hacia
Supabase o Apps Script no puede salir por red, la encola de forma persistente
en el navegador. Cuando retorna la conexión, la cola se reintenta
automáticamente.

No borres los datos del navegador de Chrome ni cambies de perfil de Chrome:
allí se conserva la cola offline.

## Actualizaciones del código

El remoto de GitHub se conserva solo para leer actualizaciones y el push está
bloqueado en esta copia. Al iniciar, el actualizador consulta main antes de
abrir el POS. Si no hay red, hay cambios locales o existe un conflicto,
conserva la última copia funcional y no arriesga la operación.

Las actualizaciones del código deben integrarse y probarse antes de usarlas;
GitHub no es una base de datos para ventas.
