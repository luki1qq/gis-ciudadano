# Basurales de Tucumán

Mapa web pensado para el celular. Se llega desde el QR del póster del PA2 de GIS (4K07, UTN FRT, 2026), tema 23 del ensayo *Essays on Geography and GIS, vol. 7*: **Geoenabling Citizen Science**, de Joseph Kerski.

- **Puntos azules y verdes:** basurales activos y erradicados de la Municipalidad de San Miguel de Tucumán (corte 31/07/2026). El municipio publica solo la dirección; las ubicaciones se calcularon con OpenStreetMap y son aproximadas.
- **Aportes de la comunidad:** cualquiera puede sumar un basural con foto y ubicación. No se publica enseguida: pasa por una revisión.

## Cómo funciona la revisión

1. La web envía el aporte a un **Formulario de Google** (foto achicada y sin EXIF, tipo, tamaño, nota, lat/lon).
2. Las respuestas caen en una **hoja de cálculo**. Para aprobar un aporte, se escribe `si` en la columna `aprobado`.
3. La pestaña `Hoja 1` de esa hoja muestra solo las filas aprobadas y está **publicada como CSV**. La web lee ese CSV y dibuja los pines.

Qué mirar al revisar: que la foto no muestre personas ni patentes y que el punto esté bien ubicado. Para sacar un aporte, borrá la fila o dejá `aprobado` vacío.

Los datos de configuración (URL del formulario, ids de los campos y URL del CSV) están al principio de `js/app.js`.

## Probarla en tu PC

```bash
python -m http.server 5280
```

Abrí http://localhost:5280. Hace falta internet (mapa, Leaflet y la hoja).

## Capa CONICET/UNT (opcional)

`data/conicet.js` tiene los 512 puntos de San Miguel de Tucumán del relevamiento «Microbasurales en el Gran San Miguel de Tucumán (2022-2024)» (INTEPH e IER, UNT-CONICET, http://hdl.handle.net/11336/255324). Licencia **CC BY-NC-SA 2.5 AR**: uso no comercial, con atribución y compartir igual; ese archivo conserva esa licencia. Son de otra fecha y otra definición que los datos del municipio: un punto sin vecino oficial no prueba un basural sin declarar.

## Datos oficiales

`data/oficial.js` se generó a partir de `datos-oficiales/` (no se publica en el repo; tiene la trazabilidad, el hash y las capturas). Cómo citarlo: Municipalidad de San Miguel de Tucumán, Dirección de Ambiente. *Mapa de basurales o volcaderos activos e inactivos*. Portal de Datos de la Ciudad, https://smtendatos.gob.ar/basurales/.

## Créditos

Ensayo: Joseph Kerski, Esri, 2014. Mapa base: colaboradores de OpenStreetMap. Visor: Leaflet.
