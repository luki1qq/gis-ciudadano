"""Convierte las fotos del celular (con GPS) en los datos de la web.

Flujo:
  1. Sacá las fotos con la ubicación del celular activada.
  2. Copiá los .jpg a la carpeta fotos-originales/.
  3. Corré:  python tools/ingest.py
  4. Abrí tools/atributos.csv, completá tipo / volumen / estado / nota y volvé a correr el paso 3.

Qué hace con cada foto:
  - Lee las coordenadas y la fecha del EXIF.
  - Guarda una copia achicada SIN EXIF en fotos/ y una miniatura en fotos/thumbs/.
  - Escribe data/puntos.js (lo que usa la web) y data/puntos.geojson (para abrir en QGIS).

Las originales no se publican: la carpeta fotos-originales/ está en .gitignore.
"""
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
ORIG = RAIZ / "fotos-originales"
FOTOS = RAIZ / "fotos"
THUMBS = FOTOS / "thumbs"
DATA = RAIZ / "data"
CSV_ATRIB = Path(__file__).resolve().parent / "atributos.csv"

TIPOS = {"microbasural", "contenedor", "escombros", "quema"}
VOLUMENES = {"chico", "medio", "grande"}
ESTADOS = {"nuevo", "recurrente"}
EXTENSIONES = {".jpg", ".jpeg"}


def a_decimal(dms, ref):
    grados, minutos, segundos = (float(x) for x in dms)
    valor = grados + minutos / 60 + segundos / 3600
    return -valor if ref in ("S", "W") else valor


def leer_exif(img):
    """Devuelve (lat, lon, fecha_iso, precision_m); cualquier dato puede faltar."""
    exif = img.getexif()
    gps = exif.get_ifd(0x8825)
    lat = lon = prec = None
    if gps and 2 in gps and 4 in gps:
        lat = a_decimal(gps[2], gps.get(1, "N"))
        lon = a_decimal(gps[4], gps.get(3, "E"))
        if 31 in gps:  # GPSHPositioningError, en metros
            try:
                prec = round(float(gps[31]))
            except (TypeError, ValueError):
                prec = None
    fecha = None
    bruta = exif.get_ifd(0x8769).get(36867) or exif.get(306)
    if bruta:
        try:
            fecha = datetime.strptime(str(bruta), "%Y:%m:%d %H:%M:%S").strftime("%Y-%m-%dT%H:%M:%S-03:00")
        except ValueError:
            fecha = None
    return lat, lon, fecha, prec


def guardar_sin_exif(img, destino, lado):
    copia = ImageOps.exif_transpose(img).convert("RGB")
    copia.thumbnail((lado, lado))
    copia.save(destino, "JPEG", quality=82, optimize=True)  # no se copia el EXIF


def leer_atributos():
    if not CSV_ATRIB.exists():
        return {}
    with CSV_ATRIB.open(newline="", encoding="utf-8-sig") as f:
        return {fila["archivo"]: fila for fila in csv.DictReader(f)}


def escribir_atributos(filas):
    with CSV_ATRIB.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["archivo", "tipo", "volumen", "estado", "nota"])
        w.writeheader()
        w.writerows(filas)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # para que los acentos salgan bien en la terminal de Windows
    ORIG.mkdir(exist_ok=True)
    FOTOS.mkdir(exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(exist_ok=True)

    archivos = sorted(p for p in ORIG.iterdir() if p.suffix.lower() in EXTENSIONES)
    if not archivos:
        print("No hay fotos .jpg en fotos-originales/. Copiá ahí las fotos del celular y volvé a correr.")
        print("(Si tu iPhone las guarda como .heic: Ajustes > Cámara > Formatos > Más compatible.)")
        return 1

    atrib = leer_atributos()
    filas = []
    puntos = []
    avisos = []
    for i, ruta in enumerate(archivos, start=1):
        a = atrib.get(ruta.name) or {"archivo": ruta.name, "tipo": "microbasural", "volumen": "medio", "estado": "nuevo", "nota": ""}
        for campo, validos, defecto in (("tipo", TIPOS, "microbasural"), ("volumen", VOLUMENES, "medio"), ("estado", ESTADOS, "nuevo")):
            if (a.get(campo) or "").strip() not in validos:
                avisos.append(f"{ruta.name}: {campo} '{a.get(campo)}' no es válido, uso '{defecto}'. Opciones: {', '.join(sorted(validos))}")
                a[campo] = defecto
        filas.append({k: (a.get(k) or "").strip() for k in ("archivo", "tipo", "volumen", "estado", "nota")})

        with Image.open(ruta) as img:
            lat, lon, fecha, prec = leer_exif(img)
            if lat is None or lon is None:
                avisos.append(f"{ruta.name}: no tiene GPS en la foto. Se omite (activá la ubicación de la cámara).")
                continue
            pid = f"p-{i:02d}"
            guardar_sin_exif(img, FOTOS / f"{pid}.jpg", 1000)
            guardar_sin_exif(img, THUMBS / f"{pid}.jpg", 360)
        puntos.append({
            "id": pid,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "fecha": fecha,
            "tipo": a["tipo"].strip(),
            "volumen": a["volumen"].strip(),
            "estado": a["estado"].strip(),
            "nota": re.sub(r"\s+", " ", a["nota"]).strip(),
            "foto": f"fotos/{pid}.jpg",
            "miniatura": f"fotos/thumbs/{pid}.jpg",
            "precision_m": prec,
            "ejemplo": False,
        })

    escribir_atributos(filas)
    (DATA / "puntos.js").write_text(
        "window.PUNTOS = " + json.dumps(puntos, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    feats = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
        "properties": {k: v for k, v in p.items() if k not in ("lat", "lon")},
    } for p in puntos]
    (DATA / "puntos.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(puntos)} puntos escritos en data/puntos.js y data/puntos.geojson")
    for av in avisos:
        print("AVISO:", av)
    print(f"Completá los atributos en {CSV_ATRIB.relative_to(RAIZ)} y volvé a correr si hace falta.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
