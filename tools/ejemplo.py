"""Genera datos de EJEMPLO para probar la web antes de tener fotos reales.

Uso (desde la carpeta gis-ciudadano):
    python tools/ejemplo.py

Escribe data/puntos.js y data/puntos.geojson con puntos inventados (ejemplo: true).
Algunos tienen defectos a propósito para que se vean los controles de calidad.
"""
import json
import random
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
rnd = random.Random(7)

TIPOS = ["microbasural", "contenedor", "escombros", "quema"]
PESOS_TIPO = [45, 25, 18, 12]
VOLUMENES = ["chico", "medio", "grande"]
PESOS_VOL = [40, 40, 20]
NOTAS = {
    "microbasural": ["Bolsas sobre la vereda", "Residuos mezclados en la esquina", "Basura junto al cordón"],
    "contenedor": ["Contenedor lleno, residuos alrededor", "Contenedor desbordado", "Tapa rota y bolsas afuera"],
    "escombros": ["Restos de obra sobre la calle", "Escombros en terreno baldío", "Montículo de material de demolición"],
    "quema": ["Restos de quema reciente", "Humo y residuos quemados", "Ceniza y plástico derretido"],
}

# (centro lat, centro lon, desvío en grados, cantidad)
CLUSTERS = [
    (-26.8350, -65.2090, 0.0025, 11),
    (-26.8010, -65.2330, 0.0030, 7),
    (-26.8460, -65.2400, 0.0020, 4),
]


def punto(i, lat, lon):
    tipo = rnd.choices(TIPOS, PESOS_TIPO)[0]
    dia = rnd.randint(1, 8)
    hora = rnd.randint(8, 19)
    minuto = rnd.randint(0, 59)
    return {
        "id": f"ej-{i:02d}",
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "fecha": f"2026-11-{dia:02d}T{hora:02d}:{minuto:02d}:00-03:00",
        "tipo": tipo,
        "volumen": rnd.choices(VOLUMENES, PESOS_VOL)[0],
        "estado": "recurrente" if rnd.random() < 0.35 else "nuevo",
        "nota": rnd.choice(NOTAS[tipo]),
        "foto": "fotos/ejemplo.svg",
        "miniatura": "fotos/ejemplo.svg",
        "precision_m": rnd.randint(4, 15),
        "ejemplo": True,
    }


def main():
    pts = []
    n = 0
    for clat, clon, sd, cant in CLUSTERS:
        for _ in range(cant):
            n += 1
            pts.append(punto(n, rnd.gauss(clat, sd), rnd.gauss(clon, sd)))
    for _ in range(8):
        n += 1
        pts.append(punto(n, rnd.uniform(-26.87, -26.77), rnd.uniform(-65.28, -65.15)))

    # Defectos a propósito, para mostrar los controles de calidad.
    pts[3]["foto"] = None
    pts[3]["miniatura"] = None
    pts[9]["foto"] = None
    pts[9]["miniatura"] = None
    pts[5]["precision_m"] = 48
    n += 1
    dup = dict(pts[1])
    dup["id"] = f"ej-{n:02d}"
    dup["lat"] = round(dup["lat"] + 0.00005, 6)
    dup["fecha"] = "2026-11-08T10:12:00-03:00"
    pts.append(dup)
    n += 1
    mal = punto(n, -26.8200, 65.2200)  # longitud sin el signo menos
    mal["nota"] = "Coordenada cargada con la longitud al revés"
    pts.append(mal)

    (RAIZ / "data").mkdir(exist_ok=True)
    (RAIZ / "data" / "puntos.js").write_text(
        "window.PUNTOS = " + json.dumps(pts, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    feats = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
        "properties": {k: v for k, v in p.items() if k not in ("lat", "lon")},
    } for p in pts]
    (RAIZ / "data" / "puntos.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(pts)} puntos de ejemplo escritos en data/")


if __name__ == "__main__":
    main()
