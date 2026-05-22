"""Reconstrói dados/cache/*.gz com enriquecimento SOPEGEO.
Executar: python scripts/rebuild_cache.py
"""
import csv, json, gzip, os
from datetime import date

DADOS_DIR   = os.path.join(os.path.dirname(__file__), '..', 'dados')
GEOJSON_DIR = os.path.join(DADOS_DIR, 'GEOJSON')
CACHE_DIR   = os.path.join(DADOS_DIR, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

NA = frozenset({'<NA>', 'NA', 'None', 'nan', ''})

def is_na(v):
    return v is None or str(v).strip() in NA

def parse_date(raw):
    if is_na(raw): return None
    try:
        d, m, y = str(raw).strip().split('/')
        return date(int(y), int(m), int(d))
    except Exception:
        return None

def age_years(d):
    return max(0, (date.today() - d).days // 365) if d else None

def strip_z(geom):
    dep = {'Point':0,'LineString':1,'Polygon':2,'MultiPoint':1,'MultiLineString':2,'MultiPolygon':3}
    def trim(c, d):
        return list(c)[:2] if d == 0 else [trim(i, d-1) for i in c]
    coords = geom.get('coordinates')
    if coords is None:
        return geom
    return {**geom, 'coordinates': trim(coords, dep.get(geom.get('type',''), 2))}

# ── SOPEGEO ──────────────────────────────────────────────────────────────────
TIPO_MAP = {
    'SCN Carta Topografica Matricial':              'CARTA_TOPOGRAFICA',
    'SCN Carta Topografica Vetorial':               'CDGV',
    'SCN Carta Topografica Vetorial EDGV 3.0':      'CDGV',
    'SCN Carta Ortoimagem':                         'CARTA_ORTOIMAGEM',
    'Modelo Tridimensional MDS':                    'MDS',
    'Ortoimagem SCN':                               'ORTOIMAGEM',
    'Nao SCN Carta Topografica Especial Matricial': 'IMPRESSAO',
}

def load_sopegeo():
    result = {}
    csv_path = os.path.join(DADOS_DIR, 'SOPEGEO',
                            'relatorio_recursoscadastrados_fonte-20260304_1130.csv')
    if not os.path.exists(csv_path):
        print('AVISO: SOPEGEO CSV não encontrado')
        return result
    with open(csv_path, encoding='latin-1', errors='replace') as f:
        reader = csv.reader(f, delimiter='|')
        headers = [h.strip().lower() for h in next(reader)]
        mi_idx   = next((i for i,h in enumerate(headers) if h == 'mi'), None)
        inom_idx = next((i for i,h in enumerate(headers) if 'nomencl' in h or 'ndice' in h), None)
        date_idx = next((i for i,h in enumerate(headers) if 'conclus' in h), None)
        tipo_idx = next((i for i,h in enumerate(headers) if 'tipo de recurso' in h), None)
        for row in reader:
            idxs = [i for i in [mi_idx, inom_idx, date_idx, tipo_idx] if i is not None]
            if not idxs or len(row) <= max(idxs):
                continue
            d = parse_date(row[date_idx] if date_idx is not None else '')
            if not d:
                continue
            produto = TIPO_MAP.get((row[tipo_idx].strip() if tipo_idx is not None else ''), 'CARTA_TOPOGRAFICA')
            bucket  = result.setdefault(produto, {})
            for k in filter(None, [
                row[mi_idx].strip() if mi_idx is not None else None,
                row[inom_idx].strip() if inom_idx is not None else None,
            ]):
                if k and (k not in bucket or d > bucket[k]):
                    bucket[k] = d
    return result

sopegeo = load_sopegeo()
print('SOPEGEO:', {p: len(v) for p, v in sopegeo.items()})

# ── Mapeamento produto → GeoJSON ──────────────────────────────────────────────
PRODUCT_FILES = {
    ('CARTA_TOPOGRAFICA', '25k'):  'SCN_Carta_Topografica_Matricial_25k.geojson',
    ('CARTA_TOPOGRAFICA', '50k'):  'SCN_Carta_Topografica_Matricial_50k.geojson',
    ('CARTA_TOPOGRAFICA', '100k'): 'SCN_Carta_Topografica_Matricial_100k.geojson',
    ('CARTA_TOPOGRAFICA', '250k'): 'SCN_Carta_Topografica_Matricial_250k.geojson',
    ('CARTA_ORTOIMAGEM',  '25k'):  'SCN_Carta_Ortoimagem_25k.geojson',
    ('CARTA_ORTOIMAGEM',  '50k'):  'SCN_Carta_Ortoimagem_50k.geojson',
    ('CARTA_ORTOIMAGEM',  '100k'): 'SCN_Carta_Ortoimagem_100k.geojson',
    ('CARTA_ORTOIMAGEM',  '250k'): 'SCN_Carta_Ortoimagem_250k.geojson',
    ('ORTOIMAGEM',        '25k'):  'Ortoimagem_SCN_25k.geojson',
    ('ORTOIMAGEM',        '50k'):  'Ortoimagem_SCN_50k.geojson',
    ('ORTOIMAGEM',        '100k'): 'SCN_Carta_Topografica_Matricial_100k.geojson',
    ('ORTOIMAGEM',        '250k'): 'Ortoimagem_SCN_250k.geojson',
    ('MDT',               '25k'):  'Modelo_Tridimensional_MDS_25k.geojson',
    ('MDT',               '50k'):  'Modelo_Tridimensional_MDS_50k.geojson',
    ('MDT',               '100k'): 'Modelo_Tridimensional_MDS_100k.geojson',
    ('MDT',               '250k'): 'SCN_Carta_Topografica_Matricial_250k.geojson',
    ('MDS',               '25k'):  'MDS_RAM_25k.geojson',
    ('MDS',               '50k'):  'MDS_RAM_50k.geojson',
    ('MDS',               '100k'): 'Modelo_Tridimensional_MDS_100k.geojson',
    ('MDS',               '250k'): 'SCN_Carta_Topografica_Matricial_250k.geojson',
    ('IMPRESSAO',         '25k'):  'SCN_Carta_Topografica_Matricial_25k.geojson',
    ('IMPRESSAO',         '50k'):  'SCN_Carta_Topografica_Matricial_50k.geojson',
    ('IMPRESSAO',         '100k'): 'SCN_Carta_Topografica_Matricial_100k.geojson',
    ('IMPRESSAO',         '250k'): 'SCN_Carta_Topografica_Matricial_250k.geojson',
}
CDGV_MERGE = {
    '25k':  ['SCN_Carta_Topografica_Vetorial_25k.geojson',  'SCN_Carta_Topografica_Vetorial_EDGV_3_0_25k.geojson'],
    '50k':  ['SCN_Carta_Topografica_Vetorial_50k.geojson',  'SCN_Carta_Topografica_Vetorial_EDGV_3_0_50k.geojson'],
    '100k': ['SCN_Carta_Topografica_Vetorial_100k.geojson', 'SCN_Carta_Topografica_Vetorial_EDGV_3_0_100k.geojson'],
    '250k': ['SCN_Carta_Topografica_Vetorial_250k.geojson', 'SCN_Carta_Topografica_Vetorial_EDGV_3_0_250k.geojson'],
}

def load_feats(fn):
    p = os.path.join(GEOJSON_DIR, fn)
    if not os.path.exists(p):
        return []
    with open(p, encoding='utf-8') as f:
        return json.load(f).get('features', [])

def enrich(props, geom, produto):
    sop = sopegeo.get(produto, {})
    inom = props.get('inom')
    if is_na(inom):
        return None
    inom_str = str(inom)
    mi_raw = props.get('mi')
    mi  = str(mi_raw).strip() if not is_na(mi_raw) else None
    nome_raw = props.get('nome_validado') or props.get('nome')
    nome = str(nome_raw).strip() if not is_na(nome_raw) else None
    geo_date = parse_date(props.get('data_conclusao_validada'))
    sop_date = (sop.get(mi) if mi else None) or sop.get(inom_str)
    if sop_date and geo_date:
        prod_date = max(sop_date, geo_date)
    else:
        prod_date = sop_date or geo_date
    return {
        'type': 'Feature',
        'geometry': strip_z(geom),
        'properties': {
            'inom':           inom_str,
            'mi':             mi,
            'nome':           nome,
            'data_conclusao': prod_date.isoformat() if prod_date else None,
            'idade_anos':     age_years(prod_date),
            'disponivel':     prod_date is not None,
        }
    }

def build(feats, produto):
    out = []
    for feat in feats:
        props = feat.get('properties') or {}
        geom  = feat.get('geometry')
        if not geom:
            continue
        r = enrich(props, geom, produto)
        if r:
            out.append(r)
    return out

def build_cdgv(suffix):
    sop = sopegeo.get('CDGV', {})
    merged = {}
    for fn in CDGV_MERGE.get(suffix, []):
        for feat in load_feats(fn):
            props = feat.get('properties') or {}
            geom  = feat.get('geometry')
            if not geom:
                continue
            r = enrich(props, geom, 'CDGV')
            if not r:
                continue
            inom_str = r['properties']['inom']
            ex = merged.get(inom_str)
            ex_date_str = ex['properties']['data_conclusao'] if ex else None
            new_date_str = r['properties']['data_conclusao']
            if ex is None or (new_date_str and (ex_date_str is None or new_date_str > ex_date_str)):
                merged[inom_str] = r
    return list(merged.values())

def save(produto, suffix, feats):
    raw = json.dumps(
        {'type': 'FeatureCollection', 'features': feats},
        separators=(',', ':'), ensure_ascii=False
    ).encode('utf-8')
    gz   = gzip.compress(raw, compresslevel=6)
    path = os.path.join(CACHE_DIR, f'{produto}_{suffix}.gz')
    with open(path, 'wb') as f:
        f.write(gz)
    disp = sum(1 for x in feats if x['properties'].get('disponivel'))
    print(f'  {produto}_{suffix}.gz  {len(feats):6d} feat  {disp:5d} disp  {len(gz)/1024:.0f} KB')

print('\nConstruindo cache...')
for (produto, suffix), fn in PRODUCT_FILES.items():
    feats = load_feats(fn)
    if not feats:
        print(f'  SKIP {produto}_{suffix} (arquivo ausente: {fn})')
        continue
    save(produto, suffix, build(feats, produto))

for suffix in ['25k', '50k', '100k', '250k']:
    feats = build_cdgv(suffix)
    if feats:
        save('CDGV', suffix, feats)
    else:
        print(f'  SKIP CDGV_{suffix}')

print('\nTotal cache:')
total = 0
for f in sorted(os.listdir(CACHE_DIR)):
    sz = os.path.getsize(os.path.join(CACHE_DIR, f))
    total += sz
print(f'  {len(os.listdir(CACHE_DIR))} arquivos, {total/1024/1024:.1f} MB total')
print('Concluido!')
