"""Lookup de ASC/CGEO previsto a partir da grade MI em DBF."""

from __future__ import annotations

import logging
import os
import re
import struct
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

_DADOS_DIR = os.getenv("DADOS_PATH", "/app/dados")
_ASC_DBF_CANDIDATES = [
    os.getenv("ASC_GRID_DBF"),
    os.path.join(_DADOS_DIR, "ASC", "Grid_MI.dbf"),
    r"C:\Cartografia\ASC\Grid_MI.dbf",
]
_ASC_SHP_CANDIDATES = [
    os.getenv("ASC_GRID_SHP"),
    os.path.join(_DADOS_DIR, "ASC", "Grid_MI.shp"),
    r"C:\Cartografia\ASC\Grid_MI.shp",
]

# Complementos para lacunas conhecidas no Grid_MI.dbf.
# SD-23-Z-A cobre folhas 100k como SD-23-Z-A-VI / MI 2134 e pertence ao 3º CGEO.
_ASC_PREFIX_OVERRIDES: dict[str, int] = {
    "SD-23-Z-A": 3,
}


def _norm(value: object) -> str:
    return str(value or "").strip().upper()


def _parse_cgeo_id(value: object) -> int | None:
    match = re.search(r"([1-5])", _norm(value))
    return int(match.group(1)) if match else None


def _resolve_dbf_path() -> Path | None:
    for candidate in _ASC_DBF_CANDIDATES:
        if not candidate:
            continue
        path = Path(candidate)
        if path.exists():
            return path
    return None


def _resolve_shp_path() -> Path | None:
    for candidate in _ASC_SHP_CANDIDATES:
        if not candidate:
            continue
        path = Path(candidate)
        if path.exists():
            return path
    return None


def _read_dbf_records(path: Path) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    with path.open("rb") as handle:
        header = handle.read(32)
        if len(header) < 32:
            return records

        total_records = struct.unpack("<I", header[4:8])[0]
        header_len = struct.unpack("<H", header[8:10])[0]
        record_len = struct.unpack("<H", header[10:12])[0]

        fields: list[tuple[str, int]] = []
        while True:
            descriptor = handle.read(32)
            if not descriptor or descriptor[0] == 0x0D:
                break
            name = descriptor[:11].split(b"\x00", 1)[0].decode("ascii", errors="ignore")
            length = descriptor[16]
            fields.append((name, length))

        handle.seek(header_len)
        for _ in range(total_records):
            record = handle.read(record_len)
            if not record or record[0:1] == b"*":
                continue

            offset = 1
            row: dict[str, str] = {}
            for name, length in fields:
                raw = record[offset:offset + length]
                offset += length
                row[name] = raw.decode("latin1", errors="ignore").strip()
            records.append(row)

    return records


def _read_shp_polygons(path: Path) -> list[list[list[tuple[float, float]]]]:
    """Le polygons de um ESRI Shapefile sem depender de bibliotecas GIS."""
    shapes: list[list[list[tuple[float, float]]]] = []
    with path.open("rb") as handle:
        header = handle.read(100)
        if len(header) < 100:
            return shapes

        while True:
            record_header = handle.read(8)
            if not record_header:
                break
            if len(record_header) < 8:
                break

            content_words = struct.unpack(">i", record_header[4:8])[0]
            content = handle.read(content_words * 2)
            if len(content) < 44:
                shapes.append([])
                continue

            shape_type = struct.unpack("<i", content[:4])[0]
            if shape_type == 0:
                shapes.append([])
                continue
            if shape_type != 5:  # Polygon
                shapes.append([])
                continue

            num_parts = struct.unpack("<i", content[36:40])[0]
            num_points = struct.unpack("<i", content[40:44])[0]
            parts_offset = 44
            points_offset = parts_offset + (num_parts * 4)
            parts = list(struct.unpack(f"<{num_parts}i", content[parts_offset:points_offset]))
            points: list[tuple[float, float]] = []
            for index in range(num_points):
                start = points_offset + (index * 16)
                x, y = struct.unpack("<dd", content[start:start + 16])
                points.append((x, y))

            polygons: list[list[tuple[float, float]]] = []
            for idx, start in enumerate(parts):
                end = parts[idx + 1] if idx + 1 < len(parts) else num_points
                ring = points[start:end]
                if len(ring) >= 4:
                    polygons.append(ring)
            shapes.append(polygons)

    return shapes


@lru_cache(maxsize=1)
def asc_lookup() -> dict[str, int]:
    """Retorna {INOM_250K: cgeo_id} carregado do DBF de ASC."""
    path = _resolve_dbf_path()
    if not path:
        logger.warning("ASC Grid_MI.dbf nao encontrado; relatorios usarao 'Sem ASC'.")
        return {}

    lookup: dict[str, int] = {}
    for row in _read_dbf_records(path):
        inom = _norm(row.get("INOM"))
        cgeo_id = _parse_cgeo_id(row.get("ASC_"))
        if inom and cgeo_id:
            lookup[inom] = cgeo_id

    logger.info("ASC lookup carregado de %s: %d INOMs", path, len(lookup))
    return lookup


def asc_cgeo_id_for_item(inom: object, mi: object | None = None) -> int | None:
    """Resolve o CGEO previsto por ASC para um item de pedido.

    O DBF recebido esta em grade 250k. Para itens mais detalhados, usa o maior
    prefixo INOM encontrado no lookup (ex.: SB-23-Y-C-I-1 -> SB-23-Y-C).
    """
    del mi  # reservado para futura compatibilidade com bases que usem MI.

    normalized = _norm(inom)
    if not normalized:
        return None

    lookup = asc_lookup()
    if normalized in lookup:
        return lookup[normalized]

    parts = normalized.split("-")
    while len(parts) > 3:
        parts.pop()
        candidate = "-".join(parts)
        override = _ASC_PREFIX_OVERRIDES.get(candidate)
        if override:
            return override

        cgeo_id = lookup.get(candidate)
        if cgeo_id:
            return cgeo_id

    return None


@lru_cache(maxsize=1)
def asc_merged_feature_collection() -> dict:
    """Retorna uma camada ASC com uma feature MultiPolygon por CGEO."""
    dbf_path = _resolve_dbf_path()
    shp_path = _resolve_shp_path()
    if not dbf_path or not shp_path:
        logger.warning("Arquivos Grid_MI.dbf/shp nao encontrados; camada ASC vazia.")
        return {"type": "FeatureCollection", "features": []}

    records = _read_dbf_records(dbf_path)
    shapes = _read_shp_polygons(shp_path)
    grouped: dict[int, list[list[list[tuple[float, float]]]]] = {}

    for row, polygons in zip(records, shapes):
        cgeo_id = _parse_cgeo_id(row.get("ASC_"))
        if not cgeo_id or not polygons:
            continue
        target = grouped.setdefault(cgeo_id, [])
        for ring in polygons:
            target.append([ring])

    features = []
    for cgeo_id in sorted(grouped):
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": grouped[cgeo_id],
            },
            "properties": {
                "cgeo_id": cgeo_id,
                "label": f"{cgeo_id}º CGEO",
                "folhas": len(grouped[cgeo_id]),
            },
        })

    return {"type": "FeatureCollection", "features": features}
