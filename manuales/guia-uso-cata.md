# Guía rápida de CATA

**CATA** (Capacitador de Atención de Trámites de Asociados) es la herramienta interna para documentar, paso a paso, cómo se realizan los trámites de asociados en los distintos sistemas (Sistema Open, Salesforce, Qupos, MBA Case, Agentes de Ayuda, etc.).

## ¿Qué puedes hacer con CATA?

- **Grabar pantalla y audio** mientras explicas un trámite, o grabar con la cámara.
- **Tomar pantallazos** y anotarlos con rectángulos, óvalos, flechas, texto de color e íconos.
- **Cargar un video externo** (de Zoom, Teams, el celular, etc.) y capturar fotogramas para convertirlos en pasos anotados.
- **Agregar cajas de Tip, Aviso, Importante o Info** con formato ya definido, para resaltar información clave.
- **Vincular** un trámite con otros trámites o con manuales de esta carpeta `/manuales`, como accesos directos editables que la persona que capacita elige si quiere ver o no.

## Flujo recomendado

1. Entra a **Trámites → + Nuevo trámite** y define título, categoría y descripción.
2. Agrega un paso, ponle título y descríbelo con el editor de texto (permite negrita, cursiva y color).
3. Usa los botones de captura para grabar pantalla, cámara, tomar un pantallazo o subir un video/imagen ya existente.
4. Anota la imagen o el fotograma: señala con flechas, resalta con rectángulos, agrega notas de color o cajas de Tip/Aviso.
5. Repite para cada paso del trámite.
6. En la sección de **vínculos**, conecta este trámite con otros relacionados o con manuales de referencia.
7. Guarda los cambios. El documento queda disponible en `/tramites/<id>/tramite.json` junto con sus archivos multimedia, listo para versionarse en git.

## Manuales

Cualquier archivo PDF, Word exportado a HTML, Markdown o texto que coloques en la carpeta `/manuales` (o que subas desde la pantalla **Manuales**) aparece automáticamente en el listado, y puede vincularse desde cualquier trámite.
