# DB Explorer — GitHub Pages

Aplicación web estática para abrir bases de datos SQLite (`.db`, `.sqlite`, `.sqlite3`) directamente en el navegador.

## Características

- Apertura local de SQLite.
- Lista de tablas y número de registros.
- Vista de datos con paginación.
- Búsqueda en todas las columnas o en una columna concreta.
- Opción de distinguir mayúsculas/minúsculas.
- Consulta SQL avanzada en modo lectura (`SELECT`, `WITH`, `PRAGMA`).
- Exportación de los resultados filtrados a Excel (`.xlsx`).
- El `.xlsx` generado se puede abrir directamente con Apple Numbers.
- Diseño responsive para iPhone/iPad.
- Sin backend y sin base de datos propia.
- GitHub Pages compatible.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube **todos los archivos de esta carpeta** a la raíz del repositorio.
3. En `Settings → Pages`, selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
4. Guarda y abre la URL que te proporcione GitHub.

No hay que ejecutar `npm`, instalar Node ni compilar nada.

## Privacidad

El archivo seleccionado se procesa en el navegador. Esta versión no contiene ningún backend para subir la base de datos.

La aplicación carga `sql.js` y `SheetJS` desde CDN para mantener el repositorio pequeño. Por ello, la primera carga necesita conexión a Internet. Una vez cargada, la interfaz propia puede quedar en caché mediante el service worker; las librerías externas dependen de su disponibilidad en CDN.

## Archivo de prueba

La base de datos proporcionada para desarrollar esta aplicación es SQLite y contiene la tabla `archivos` con 3.821 registros y los campos:

`id`, `carpeta_raiz`, `subcarpeta`, `nombre`, `extension`, `tamaño_mb`, `fecha_modif`, `ruta_relativa`, `importado_el`.

La aplicación, no obstante, es genérica y no está limitada a esa tabla.
