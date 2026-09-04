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

Abre `http://localhost:4173` en el navegador (Chrome/Edge recomendado para la captura de pantalla y cámara). El servidor debe correr en `localhost` porque la grabación de pantalla/cámara solo funciona en contextos seguros.

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
```

## Flujo de trabajo

1. **Trámites → + Nuevo trámite**: título, categoría (sistema) y descripción.
2. Agregar pasos: cada paso tiene texto con formato y un "escenario" donde se coloca video o imagen.
3. Captura por paso: grabar pantalla + audio, grabar cámara, tomar pantallazo, o subir video/imagen ya existente.
4. Anotar sobre la imagen/video: flechas, formas, texto de color, íconos y cajas de aviso/tip.
5. Vincular con otros trámites o manuales relacionados.
6. Guardar. El trámite queda como archivo (`tramite.json` + medios) dentro de `/tramites`, listo para `git add` / `git commit`.

Para archivos de video grandes, se recomienda usar [Git LFS](https://git-lfs.com/) en el repositorio.
