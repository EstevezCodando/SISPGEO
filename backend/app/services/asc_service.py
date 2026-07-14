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
        cgeo_id = lookup.get(candidate)
        if cgeo_id:
            return cgeo_id

    return None
