# CATA — Capacitador de Atención de Trámites de Asociados

Capacitador Virtual para trámites de la plataforma de servicios (Sistema Open, Salesforce, Qupos, MBA Case, Agentes de Ayuda en trámites) y documentación adicional.

CATA permite crear el **archivo digital de trámites**: documentos paso a paso con video, pantallazos anotados, texto con formato y color, cajas de Tip/Aviso/Importante, y vínculos editables entre trámites y manuales.

## Funcionalidades

- **Captura de audio y video**: graba pantalla + micrófono, o cámara, directamente desde el navegador para explicar un trámite.
- **Pantallazos**: toma capturas de pantalla puntuales para ilustrar un paso.
- **Videos externos**: carga un video ya grabado (Zoom, Teams, celular, etc.) y captura fotogramas puntuales que se convierten en pasos anotables — mismo flujo que con capturas propias.
- **Anotaciones**: rectángulos, óvalos, flechas, texto de color, íconos/imágenes y cajas con formato de **Tip 💡**, **Aviso ⚠️**, **Importante ❗** e **Info ℹ️**.
- **Texto enriquecido**: cada paso tiene un editor con negrita, cursiva y color de texto.
- **Manuales**: cualquier PDF, HTML, Markdown o texto colocado en `/manuales` (o subido desde la app) aparece listado y es editable en título/categoría/descripción.
- **Vínculos entre documentos**: cada trámite puede enlazar con otros trámites o manuales; en el visor aparecen como accesos directos editables para que la persona elija cuál ver, todo con las mismas herramientas de visualización.
- **Organizado por categoría**: Sistema Open, Salesforce, Qupos, MBA Case, Agentes de Ayuda, General.

## Instalación y ejecución

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

**Opcional pero recomendado:** si `ffmpeg` está instalado en el sistema (`ffmpeg -version` funciona en la terminal), el servidor comprime automáticamente cada video que se sube o graba, para ahorrar espacio en disco. Si no está instalado, la app funciona igual, solo que guarda los videos sin comprimir.

```bash
# Debian/Ubuntu
sudo apt-get install -y ffmpeg
# macOS (con Homebrew)
brew install ffmpeg
```

Abre `http://localhost:4173` en el navegador (Chrome/Edge recomendado para la captura de pantalla y cámara). El servidor debe correr en `localhost` porque la grabación de pantalla/cámara solo funciona en contextos seguros.

**Contraseña de edición:** crear, editar o borrar trámites/manuales, y subir archivos, requiere la contraseña de Administración (`ADMIN_PASSWORD`). Este repositorio es público, así que el valor por defecto en `server.js` queda visible para cualquiera — si vas a exponer el servidor fuera de tu máquina (link público, Codespace público, etc.), definí siempre tu propia contraseña por variable de entorno antes de arrancar:

```bash
ADMIN_PASSWORD="tu-contraseña-propia" npm start
```

La vista de trámites/manuales/evaluaciones queda pública para cualquiera con el link; solo la edición pide esa contraseña.

### Empleados, invitaciones por correo y prácticas de refuerzo

Desde Administración → Empleados se registra manualmente a cada persona (nombre, apellido, email). Al hacer una evaluación, quien responde elige su nombre de esa lista en vez de escribirlo libremente, lo que permite:

- **Resultados por empleado, tema y fecha** en Administración → Resultados → "Por empleado" (filtros por empleado y rango de fechas en "Por evaluación").
- **Prácticas de refuerzo automáticas**: el botón "Generar práctica" arma una evaluación a medida con las preguntas de todo lo que esa persona todavía no aprueba (nota ≥ 70).
- **Invitaciones por correo**: el botón "Invitar" en cada evaluación envía por email un enlace directo y personalizado (la persona no tiene que elegir su nombre, ya llega identificada).

El envío de correos requiere configurar un servidor SMTP propio (Gmail con contraseña de aplicación, SendGrid, etc.) mediante variables de entorno — sin esto, "Invitar" muestra un error explicándolo en vez de fallar en silencio:

```bash
SMTP_HOST="smtp.tudominio.com"
SMTP_PORT="587"                 # opcional, 587 por defecto (465 = conexión implícita TLS)
SMTP_USER="usuario@tudominio.com"
SMTP_PASS="contraseña-o-token-de-aplicación"
SMTP_FROM="Capacitación CATA <usuario@tudominio.com>"   # opcional, usa SMTP_USER si no se define
```

## Despliegue

La app corre en un contenedor Docker (`Dockerfile`) con `node server.js`. Sin importar el host, siempre hay que definir `ADMIN_PASSWORD` (y `SMTP_*` si se quiere invitar por correo) como variables de entorno — nunca dejar la contraseña por defecto en un despliegue público.

### Railway

`railway.json` ya le indica a Railway que construya con el `Dockerfile` del repo. Falta un paso que no se puede declarar en ese archivo: el disco persistente. Sin él, cada nuevo deploy reemplaza el contenedor y se pierden los trámites/manuales/evaluaciones subidos desde la app (el código vuelve a su estado del repo, pero los datos vivían solo en el contenedor anterior).

1. En el servicio de Railway, pestaña **Volumes** → **New Volume**, con *mount path* `/data`.
2. En **Variables**, definir:
   - `DATA_ROOT=/data`
   - `ADMIN_PASSWORD=<tu-contraseña>`
   - Opcional: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (invitaciones por correo).
3. Deploy. En el primer arranque contra el volumen vacío, el servidor copia automáticamente los trámites/manuales de ejemplo del repo a `/data` (ver `seedSiVacio` en `server.js`); después de eso el volumen manda y ya no se vuelve a pisar con el contenido del repo.

### Render

`render.yaml` ya declara el disco persistente (`/data`) y las variables (`ADMIN_PASSWORD` se pide al crear el servicio, `DATA_ROOT` viene fijo en `/data`). Basta con conectar el repo desde el dashboard de Render y crear el servicio a partir del blueprint.

## Estructura del proyecto

```
server.js            Servidor Express: sirve la app y expone la API de trámites/manuales
public/               Front-end (HTML/CSS/JS, sin build)
  index.html           Listado de trámites
  editor.html           Editor: pasos, captura, anotaciones, vínculos
  viewer.html            Visor de un trámite (documento final)
  manuales.html            Listado de manuales
  manual.html               Visor de un manual con metadatos editables
tramites/<id>/tramite.json  Un documento por trámite + su carpeta media/ con video/imágenes
manuales/               Manuales cargados en el repositorio (versionados con git)
data/manuales-meta.json   Metadatos editables de cada manual (título, categoría, descripción)
data/empleados.json        Padrón de empleados habilitados para evaluaciones (nombre, apellido, email)
evaluaciones/<id>/evaluacion.json + intentos/  Preguntas de cada evaluación y cada respuesta registrada
```

## Flujo de trabajo

1. **Trámites → + Nuevo trámite**: título, categoría (sistema) y descripción.
2. Agregar pasos: cada paso tiene texto con formato y un "escenario" donde se coloca video o imagen.
3. Captura por paso: grabar pantalla + audio, grabar cámara, tomar pantallazo, o subir video/imagen ya existente.
4. Anotar sobre la imagen/video: flechas, formas, texto de color, íconos y cajas de aviso/tip.
5. Vincular con otros trámites o manuales relacionados.
6. Guardar. El trámite queda como archivo (`tramite.json` + medios) dentro de `/tramites`, listo para `git add` / `git commit`.

Para archivos de video grandes, se recomienda usar [Git LFS](https://git-lfs.com/) en el repositorio.
