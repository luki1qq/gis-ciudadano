# Del celular al mapa

Web interactiva del PA2 de GIS (4K07, UTN FRT, 2026). Tema 23 del ensayo *Essays on Geography and GIS, vol. 7*: **Geoenabling Citizen Science**, de Joseph Kerski. Caso local: basurales en el Gran Tucumán.

El flujo tiene cuatro etapas que se recorren de arriba abajo: campo, registro, mapa y análisis, calidad. Más un cierre.

## Probarla en tu PC

Desde esta carpeta:

```bash
python -m http.server 5280
```

Abrí http://localhost:5280. Hace falta internet para los mosaicos del mapa (OpenStreetMap) y para Leaflet.

## Cargar tus datos reales

La web arranca con 32 puntos de **ejemplo** (se ve un cartel arriba). Para reemplazarlos:

1. Sacá las fotos con la **ubicación del celular activada**. Que se vea el basural y no se vean caras ni patentes.
2. Copiá los `.jpg` a `fotos-originales/`. Si tu iPhone guarda `.heic`: Ajustes, Cámara, Formatos, «Más compatible».
3. Corré `python tools/ingest.py`. Lee el GPS y la fecha de cada foto, guarda copias achicadas y **sin EXIF** en `fotos/`, y escribe `data/puntos.js` y `data/puntos.geojson`.
4. Abrí `tools/atributos.csv` en Excel, completá `tipo`, `volumen`, `estado` y `nota` de cada foto, y volvé a correr el paso 3.

Valores válidos: `tipo` = microbasural, contenedor, escombros, quema. `volumen` = chico, medio, grande. `estado` = nuevo, recurrente.

Para volver a los datos de ejemplo: `python tools/ejemplo.py`.

`data/puntos.geojson` se puede abrir directo en QGIS para comparar el mapa de la web con un análisis hecho en escritorio.

## Qué hay en cada archivo

| Archivo | Para qué |
| --- | --- |
| `index.html` | Estructura de las etapas |
| `css/style.css` | Diseño, tema claro y oscuro |
| `js/app.js` | Mapa, filtros, capas, historia, controles de calidad y formulario |
| `data/puntos.js` | Los puntos que usa la web |
| `tools/ingest.py` | De fotos con GPS a datos |
| `tools/ejemplo.py` | Genera los datos de ejemplo |

## Privacidad

`fotos-originales/` está en `.gitignore`: las originales (con GPS exacto y datos del teléfono) no se suben. Las copias de `fotos/` no tienen EXIF, pero igual muestran el lugar: revisalas antes de publicar.

## Créditos

Ensayo: Joseph Kerski, Esri, 2014. Mapa base: colaboradores de OpenStreetMap. Visor: Leaflet.
