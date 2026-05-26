# SisPGeo — Sistema de Pedidos de Geoinformação
# © 2026 2º Sgt Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
# Regras de negócio e contratos: Cap Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer
# Revisão técnica do projeto: Cel Azeredo <azeredo.marcio@eb.mil.br>  ·  Cartographic Engineer

"""
Pipeline de grade INOM baseada em cache em disco.

Fluxo:
  Startup → preload_caches() roda em background (asyncio.create_task)
    ├─ Para cada (produto, sufixo):
    │    cache_gz = /app/dados/cache/{PRODUTO}_{sufixo}.gz
    │    SE existe  → lê bytes do disco → _GRID_CACHE
    │    SE não existe → lê GeoJSON → filtra/strip → enriquece SOPEGEO → gzip → salva → _GRID_CACHE
    └─ _GEOM_CACHE por escala: carregado on-demand na 1ª chamada

Sem Shapely, sem geoalchemy2, sem round-trips ao Postgres.
Geometrias Z são simplificadas para 2D em Python puro.
CDGV merge: dois arquivos, vence data_conclusao_validada mais recente por INOM.
SOPEGEO: CSV do BDGEx enriquece disponibilidade célula a célula.

Para forçar reconstrução do cache: apagar /app/dados/cache/*.gz e reiniciar.
"""
import asyncio
import csv
import gzip
import hashlib
import json
import logging
import os
from datetime import date
from typing import Optional

from app.models.enums import EscalaEnum

logger = logging.getLogger(__name__)

DADOS_DIR  = os.getenv("DADOS_PATH", "/app/dados")
GEOJSON_DIR = os.path.join(DADOS_DIR, "GEOJSON")
CACHE_DIR  = os.path.join(DADOS_DIR, "cache")

# ── Scale helpers ─────────────────────────────────────────────────────────────
_SCALE_SUFFIX: dict[str, str] = {
    "1:25.000":  "25k",
    "1:50.000":  "50k",
    "1:100.000": "100k",
    "1:250.000": "250k",
}

# ── Product → GeoJSON filename ────────────────────────────────────────────────
_PRODUCT_FILES: dict[tuple[str, str], str] = {
    ("CARTA_TOPOGRAFICA", "25k"):  "SCN_Carta_Topografica_Matricial_25k.geojson",
    ("CARTA_TOPOGRAFICA", "50k"):  "SCN_Carta_Topografica_Matricial_50k.geojson",
    ("CARTA_TOPOGRAFICA", "100k"): "SCN_Carta_Topografica_Matricial_100k.geojson",
    ("CARTA_TOPOGRAFICA", "250k"): "SCN_Carta_Topografica_Matricial_250k.geojson",
    ("CARTA_ORTOIMAGEM",  "25k"):  "SCN_Carta_Ortoimagem_25k.geojson",
    ("CARTA_ORTOIMAGEM",  "50k"):  "SCN_Carta_Ortoimagem_50k.geojson",
    ("CARTA_ORTOIMAGEM",  "100k"): "SCN_Carta_Ortoimagem_100k.geojson",
    ("CARTA_ORTOIMAGEM",  "250k"): "SCN_Carta_Ortoimagem_250k.geojson",
    ("ORTOIMAGEM",        "25k"):  "Ortoimagem_SCN_25k.geojson",
    ("ORTOIMAGEM",        "50k"):  "Ortoimagem_SCN_50k.geojson",
    ("ORTOIMAGEM",        "100k"): "SCN_Carta_Topografica_Matricial_100k.geojson",
    ("ORTOIMAGEM",        "250k"): "Ortoimagem_SCN_250k.geojson",
    ("MDT",               "25k"):  "Modelo_Tridimensional_MDS_25k.geojson",
    ("MDT",               "50k"):  "Modelo_Tridimensional_MDS_50k.geojson",
    ("MDT",               "100k"): "Modelo_Tridimensional_MDS_100k.geojson",
    ("MDT",               "250k"): "SCN_Carta_Topografica_Matricial_250k.geojson",
    ("MDS",               "25k"):  "MDS_RAM_25k.geojson",
    ("MDS",               "50k"):  "MDS_RAM_50k.geojson",
    ("MDS",               "100k"): "Modelo_Tridimensional_MDS_100k.geojson",
    ("MDS",               "250k"): "SCN_Carta_Topografica_Matricial_250k.geojson",
    # CDGV: merge via _CDGV_MERGE_FILES (data mais recente por INOM vence)
    ("CDGV",              "25k"):  "SCN_Carta_Topografica_Vetorial_25k.geojson",
    ("CDGV",              "50k"):  "SCN_Carta_Topografica_Vetorial_50k.geojson",
    ("CDGV",              "100k"): "SCN_Carta_Topografica_Vetorial_100k.geojson",
    ("CDGV",              "250k"): "SCN_Carta_Topografica_Vetorial_250k.geojson",
    ("IMPRESSAO",         "25k"):  "SCN_Carta_Topografica_Matricial_25k.geojson",
    ("IMPRESSAO",         "50k"):  "SCN_Carta_Topografica_Matricial_50k.geojson",
    ("IMPRESSAO",         "100k"): "SCN_Carta_Topografica_Matricial_100k.geojson",
    ("IMPRESSAO",         "250k"): "SCN_Carta_Topografica_Matricial_250k.geojson",
}

# CDGV: [primário (Vetorial), secundário (EDGV 3.0)] — vence data mais recente
_CDGV_MERGE_FILES: dict[str, list[str]] = {
    "25k":  ["SCN_Carta_Topografica_Vetorial_25k.geojson",
             "SCN_Carta_Topografica_Vetorial_EDGV_3_0_25k.geojson"],
    "50k":  ["SCN_Carta_Topografica_Vetorial_50k.geojson",
             "SCN_Carta_Topografica_Vetorial_EDGV_3_0_50k.geojson"],
    "100k": ["SCN_Carta_Topografica_Vetorial_100k.geojson",
             "SCN_Carta_Topografica_Vetorial_EDGV_3_0_100k.geojson"],
    "250k": ["SCN_Carta_Topografica_Vetorial_250k.geojson",
             "SCN_Carta_Topografica_Vetorial_EDGV_3_0_250k.geojson"],
}

_BASE_FILE: dict[str, str] = {
    "25k":  "SCN_Carta_Topografica_Matricial_25k.geojson",
    "50k":  "SCN_Carta_Topografica_Matricial_50k.geojson",
    "100k": "SCN_Carta_Topografica_Matricial_100k.geojson",
    "250k": "SCN_Carta_Topografica_Matricial_250k.geojson",
}

# ── SOPEGEO: mapeamento Tipo de recurso (CSV) → chave de produto interna ──────
_SOPEGEO_TIPO_MAP: dict[str, str] = {
    "SCN Carta Topografica Matricial":          "CARTA_TOPOGRAFICA",
    "SCN Carta Topografica Vetorial":           "CDGV",
    "SCN Carta Topografica Vetorial EDGV 3.0":  "CDGV",
    "SCN Carta Ortoimagem":                     "CARTA_ORTOIMAGEM",
    "Modelo Tridimensional MDS":                "MDS",
    "Ortoimagem SCN":                           "ORTOIMAGEM",
    "Nao SCN Carta Topografica Especial Matricial": "IMPRESSAO",
}

# ── In-memory caches ──────────────────────────────────────────────────────────
_GEOM_CACHE: dict[str, dict[str, dict]] = {}               # suffix → {inom: geom}
_GRID_CACHE: dict[tuple[str, str], tuple[bytes, str]] = {}  # (produto, suffix) → (gz, etag)
# {produto → {escala_csv → {mi → date, inom → date}}}
_SOPEGEO_AGES: dict[str, dict[str, dict[str, date]]] = {}

# ── Helpers ───────────────────────────────────────────────────────────────────
_NA: frozenset = frozenset({"<NA>", "NA", "None", "nan", ""})

# Profundidade de aninhamento de coordenadas por tipo de geometria
_Z_DEPTH: dict[str, int] = {
    "Point": 0, "LineString": 1, "Polygon": 2,
    "MultiPoint": 1, "MultiLineString": 2, "MultiPolygon": 3,
}


def _is_na(v: object) -> bool:
    return v is None or str(v).strip() in _NA


def _load_sopegeo_ages() -> dict[str, dict[str, dict[str, date]]]:
    """Lê CSV do BDGEx-SOPEGEO e retorna {produto → {chave → date}}.

    A chave pode ser MI (ex: '0806-4') ou INOM (ex: 'SB-23-V-B-IV-4').
    Produto segue a convenção interna: 'CARTA_TOPOGRAFICA', 'CDGV', etc.
    Resultado cacheado em _SOPEGEO_AGES.
    """
    global _SOPEGEO_AGES
    if _SOPEGEO_AGES:
        return _SOPEGEO_AGES

    csv_path = os.path.join(DADOS_DIR, "SOPEGEO",
                             "relatorio_recursoscadastrados_fonte-20260304_1130.csv")
    if not os.path.exists(csv_path):
        logger.warning("SOPEGEO CSV não encontrado: %s", csv_path)
        _SOPEGEO_AGES = {}
        return _SOPEGEO_AGES

    result: dict[str, dict[str, date]] = {}   # produto → {mi_ou_inom → date}

    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            with open(csv_path, encoding=enc, errors="replace") as f:
                reader = csv.reader(f, delimiter="|")
                raw_headers = next(reader)
                headers = [h.strip().lower() for h in raw_headers]

                def _col(*partials: str) -> Optional[int]:
                    for p in partials:
                        for i, h in enumerate(headers):
                            if p in h:
                                return i
                    return None

                mi_idx    = _col("mi")
                inom_idx  = _col("nomencl", "ndice")
                date_idx  = _col("conclus")
                tipo_idx  = _col("tipo de recurso", "tipo_de_recurso")

                if date_idx is None:
                    continue

                for row in reader:
                    max_idx = max(i for i in [mi_idx, inom_idx, date_idx, tipo_idx] if i is not None)
                    if len(row) <= max_idx:
                        continue

                    date_str  = row[date_idx].strip()       # type: ignore[index]
                    mi_raw    = row[mi_idx].strip()   if mi_idx   is not None else ""
                    inom_raw  = row[inom_idx].strip() if inom_idx is not None else ""
                    tipo_raw  = row[tipo_idx].strip() if tipo_idx is not None else ""

                    if not date_str:
                        continue

                    try:
                        d, m, y = date_str.split("/")
                        prod_date = date(int(y), int(m), int(d))
                    except (ValueError, AttributeError):
                        continue

                    produto = _SOPEGEO_TIPO_MAP.get(tipo_raw, "CARTA_TOPOGRAFICA")
                    bucket  = result.setdefault(produto, {})

                    # registra pelo MI e pelo INOM — vence a data mais recente
                    for key in filter(None, (mi_raw or None, inom_raw or None)):
                        existing = bucket.get(key)
                        if existing is None or prod_date > existing:
                            bucket[key] = prod_date

            break  # encoding funcionou
        except UnicodeDecodeError:
            continue

    _SOPEGEO_AGES = result  # type: ignore[assignment]
    total = sum(len(v) for v in result.values())
    logger.info("SOPEGEO carregado: %d entradas, %d produtos", total, len(result))
    return _SOPEGEO_AGES


def _parse_date(raw: object) -> Optional[date]:
    """Parse DD/MM/YYYY → date, retorna None em qualquer falha."""
    if _is_na(raw):
        return None
    try:
        d, m, y = str(raw).strip().split("/")
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def _age_years(d: Optional[date]) -> Optional[int]:
    if d is None:
        return None
    return max(0, (date.today() - d).days // 365)


def _suffix(scale: EscalaEnum) -> str:
    return _SCALE_SUFFIX.get(scale.value, "50k")


def _strip_z(geom: dict) -> dict:
    """Remove coordenada Z de uma geometria GeoJSON (puro Python, sem shapely).

    Topografia frequentemente tem 3D; a coluna PostGIS é 2D e o frontend
    só precisa de 2D para exibição.
    """
    coords = geom.get("coordinates")
    if coords is None:
        return geom
    depth = _Z_DEPTH.get(geom.get("type", ""), 2)

    def _trim(c: object, d: int) -> object:
        if d == 0:
            # c é uma coordenada [x, y] ou [x, y, z]
            return list(c)[:2]
        return [_trim(i, d - 1) for i in c]  # type: ignore[arg-type]

    return {**geom, "coordinates": _trim(coords, depth)}


def _load_features(filename: str) -> list[dict]:
    path = os.path.join(GEOJSON_DIR, filename)
    if not os.path.exists(path):
        logger.warning("GeoJSON não encontrado: %s", path)
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("features", [])


def _extract_props(props: dict) -> tuple[Optional[str], Optional[str], Optional[date]]:
    """Extrai (mi, nome, data_producao) de um dict de propriedades GeoJSON."""
    mi_raw   = props.get("mi")
    nome_raw = props.get("nome_validado") or props.get("nome")
    mi   = str(mi_raw).strip()   if not _is_na(mi_raw)   else None
    nome = str(nome_raw).strip() if not _is_na(nome_raw) else None
    prod_date = _parse_date(props.get("data_conclusao_validada"))
    return mi, nome, prod_date


def _build_stripped(feats: list[dict], produto: str = "CARTA_TOPOGRAFICA") -> list[dict]:
    """Converte features brutas → features simplificadas, enriquecidas com SOPEGEO."""
    sopegeo = _load_sopegeo_ages().get(produto, {})
    out: list[dict] = []
    for feat in feats:
        props = feat.get("properties") or {}
        geom  = feat.get("geometry")
        if not geom:
            continue
        inom = props.get("inom")
        if _is_na(inom):
            continue
        inom_str = str(inom)
        mi, nome, geojson_date = _extract_props(props)

        # SOPEGEO tem precedência quando mais recente; fallback = data do GeoJSON
        sop_date = sopegeo.get(mi) if mi else None
        if not sop_date and inom_str:
            sop_date = sopegeo.get(inom_str)

        if sop_date and geojson_date:
            prod_date = max(sop_date, geojson_date)
        else:
            prod_date = sop_date or geojson_date

        out.append({
            "type": "Feature",
            "geometry": _strip_z(geom),
            "properties": {
                "inom":           inom_str,
                "mi":             mi,
                "nome":           nome,
                "data_conclusao": prod_date.isoformat() if prod_date else None,
                "idade_anos":     _age_years(prod_date),
                "disponivel":     prod_date is not None,
            },
        })
    return out


def _build_cdgv_stripped(suffix: str) -> list[dict]:
    """Merge CDGV: Vetorial + EDGV 3.0, vence data mais recente (GeoJSON ou SOPEGEO)."""
    filenames = _CDGV_MERGE_FILES.get(suffix, [])
    sopegeo   = _load_sopegeo_ages().get("CDGV", {})
    merged: dict[str, dict] = {}  # inom → melhor registro

    for filename in filenames:
        for feat in _load_features(filename):
            props = feat.get("properties") or {}
            geom  = feat.get("geometry")
            if not geom:
                continue
            inom = props.get("inom")
            if _is_na(inom):
                continue
            inom_str  = str(inom)
            mi, nome, geojson_date = _extract_props(props)

            # Enriquece com SOPEGEO
            sop_date = (sopegeo.get(mi) if mi else None) or sopegeo.get(inom_str)
            if sop_date and geojson_date:
                prod_date = max(sop_date, geojson_date)
            else:
                prod_date = sop_date or geojson_date

            existing = merged.get(inom_str)
            ex_date  = existing["_date"] if existing else None
            if existing is None or (prod_date and (ex_date is None or prod_date > ex_date)):
                merged[inom_str] = {
                    "geom":  _strip_z(geom),
                    "_date": prod_date,
                    "mi":    mi,
                    "nome":  nome,
                }

    out: list[dict] = []
    for inom_str, rec in merged.items():
        prod_date = rec["_date"]
        out.append({
            "type": "Feature",
            "geometry": rec["geom"],
            "properties": {
                "inom":           inom_str,
                "mi":             rec["mi"],
                "nome":           rec["nome"],
                "data_conclusao": prod_date.isoformat() if prod_date else None,
                "idade_anos":     _age_years(prod_date),
                "disponivel":     prod_date is not None,
            },
        })
    return out


def _features_to_gz(stripped: list[dict]) -> tuple[bytes, str]:
    """Serializa FeatureCollection → gzip (level 6) → ETag MD5."""
    raw = json.dumps(
        {"type": "FeatureCollection", "features": stripped},
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    gz   = gzip.compress(raw, compresslevel=6)
    etag = f'"{hashlib.md5(gz).hexdigest()}"'
    return gz, etag


def _cache_path(produto: str, suffix: str) -> str:
    return os.path.join(CACHE_DIR, f"{produto}_{suffix}.gz")


def _geoms_from_gz(gz: bytes) -> dict[str, dict]:
    """Extrai {inom: geometry} de um FeatureCollection gzip já em memória.

    As features do cache já têm geometrias 2D (strip_z aplicado na geração).
    """
    raw   = gzip.decompress(gz)
    feats = json.loads(raw).get("features", [])
    geoms: dict[str, dict] = {}
    for feat in feats:
        props = feat.get("properties") or {}
        geom  = feat.get("geometry")
        inom  = props.get("inom")
        if geom and not _is_na(inom):
            geoms[str(inom)] = geom
    return geoms


# ── Preload (roda em background no startup) ────────────────────────────────────

async def preload_caches() -> None:
    """Aquece _GRID_CACHE a partir de arquivos .gz em disco (ou os constrói).

    Também popula _GEOM_CACHE por escala a partir das grades CARTA_TOPOGRAFICA,
    evitando que get_inom_geometries (usado em features-preview) tente ler os
    GeoJSONs brutos — que não estão versionados no repositório.

    Chamado via asyncio.create_task() no lifespan — não bloqueia o servidor.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    total = len(_PRODUCT_FILES)
    done  = 0

    for (produto, suffix) in _PRODUCT_FILES:
        gz, etag = await asyncio.to_thread(_load_or_build, produto, suffix)
        _GRID_CACHE[(produto, suffix)] = (gz, etag)
        done += 1
        if done % 4 == 0 or done == total:
            logger.info("Preload grid cache: %d/%d combinações", done, total)

        # Popula _GEOM_CACHE a partir das grades CARTA_TOPOGRAFICA (base geométrica)
        if produto == "CARTA_TOPOGRAFICA" and suffix not in _GEOM_CACHE:
            _GEOM_CACHE[suffix] = _geoms_from_gz(gz)
            logger.info("Geom cache [%s] populado via preload: %d entradas",
                        suffix, len(_GEOM_CACHE[suffix]))

    logger.info(
        "preload_caches concluído — %d combinações em memória, disco: %s",
        len(_GRID_CACHE), CACHE_DIR,
    )


def _load_or_build(produto: str, suffix: str) -> tuple[bytes, str]:
    """Síncrono — roda em thread separada via asyncio.to_thread."""
    path = _cache_path(produto, suffix)

    # Cache em disco existe → lê direto (muito rápido)
    if os.path.exists(path):
        gz = open(path, "rb").read()
        etag = f'"{hashlib.md5(gz).hexdigest()}"'
        logger.debug("Cache HIT disco [%s/%s]: %.1f KB", produto, suffix, len(gz) / 1024)
        return gz, etag

    # Constrói a partir do GeoJSON
    logger.info("Construindo cache [%s/%s] …", produto, suffix)
    if produto == "CDGV":
        stripped = _build_cdgv_stripped(suffix)
    else:
        filename = _PRODUCT_FILES.get((produto, suffix),
                                      _BASE_FILE.get(suffix, _BASE_FILE["50k"]))
        stripped = _build_stripped(_load_features(filename), produto)

    gz, etag = _features_to_gz(stripped)

    # Salva em disco para reinicializações futuras
    try:
        with open(path, "wb") as f:
            f.write(gz)
        logger.info(
            "Cache SALVO [%s/%s]: %d features, gz=%.1f KB → %s",
            produto, suffix, len(stripped), len(gz) / 1024, path,
        )
    except OSError as exc:
        logger.warning("Não foi possível salvar cache em disco: %s", exc)

    return gz, etag


# ── Public API (síncrona, servida do cache em memória) ────────────────────────

def get_inom_geometries(scale: Optional[EscalaEnum] = None) -> dict[str, dict]:
    """Retorna {inom: geometry_dict} para a escala.  Padrão: 50k.

    Hierarquia de fontes (da mais rápida à mais lenta):
      1. _GEOM_CACHE em memória  (populado por preload_caches — operação normal)
      2. _GRID_CACHE em memória  (CARTA_TOPOGRAFICA já aquecida → extrai geometrias)
      3. Arquivo .gz no disco    (leitura síncrona — fallback se preload ainda não acabou)
      4. GeoJSON bruto           (só disponível em dev com dados completos — nunca no clone)
    """
    suffix = _suffix(scale) if scale else "50k"

    # 1. Cache em memória — caminho normal após preload
    if suffix in _GEOM_CACHE:
        return _GEOM_CACHE[suffix]

    # 2. Já temos o .gz de CARTA_TOPOGRAFICA em memória (preload concluído parcialmente)
    cached = _GRID_CACHE.get(("CARTA_TOPOGRAFICA", suffix))
    if cached:
        geoms = _geoms_from_gz(cached[0])
        _GEOM_CACHE[suffix] = geoms
        logger.info("Geom cache [%s] via _GRID_CACHE: %d entradas", suffix, len(geoms))
        return geoms

    # 3. Arquivo .gz em disco (preload não rodou ainda ou reinício antes do preload)
    gz_path = _cache_path("CARTA_TOPOGRAFICA", suffix)
    if os.path.exists(gz_path):
        gz    = open(gz_path, "rb").read()
        geoms = _geoms_from_gz(gz)
        _GEOM_CACHE[suffix] = geoms
        logger.info("Geom cache [%s] via arquivo .gz: %d entradas", suffix, len(geoms))
        return geoms

    # 4. GeoJSON bruto (dev com dados completos — ausente em clone fresco)
    filename = _BASE_FILE.get(suffix, _BASE_FILE["50k"])
    feats    = _load_features(filename)
    geoms = {}
    for feat in feats:
        props = feat.get("properties") or {}
        geom  = feat.get("geometry")
        inom  = props.get("inom")
        if not _is_na(inom) and geom:
            geoms[str(inom)] = _strip_z(geom)

    _GEOM_CACHE[suffix] = geoms
    logger.info("Geom cache [%s] via GeoJSON bruto: %d entradas", suffix, len(geoms))
    return geoms


def get_grid_gz(tipo_produto: str, scale: EscalaEnum) -> tuple[bytes, str]:
    """Retorna (gzip bytes, ETag) do cache.  Se cache ainda aquecendo → empty."""
    suffix = _suffix(scale)
    result = _GRID_CACHE.get((tipo_produto, suffix))
    if result:
        return result

    logger.warning(
        "Grid cache miss [%s/%s] — preload ainda em andamento ou arquivo inexistente",
        tipo_produto, suffix,
    )
    # Tenta construir sincronamente como fallback (bloqueia esta requisição apenas)
    try:
        gz, etag = _load_or_build(tipo_produto, suffix)
        _GRID_CACHE[(tipo_produto, suffix)] = (gz, etag)
        return gz, etag
    except Exception as exc:
        logger.error("Fallback build falhou: %s", exc)

    empty_gz = gzip.compress(
        b'{"type":"FeatureCollection","features":[]}', compresslevel=1
    )
    return empty_gz, f'"{hashlib.md5(empty_gz).hexdigest()}"'
