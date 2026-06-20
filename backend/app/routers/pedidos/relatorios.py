"""Endpoints de relatórios, exportação e visualização geoespacial de pedidos."""

import csv
import io
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.pedido import Pedido
from app.models.user import Usuario
from app.models.enums import (
    StatusPedidoEnum, PerfilEnum, OrgaoVinculanteEnum,
    SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES,
)
from app.schemas.pedido import PedidoOut
from app.utils.postos import abrev_posto as _abrev_posto
from app.routers.pedidos._guards import (
    _enrich, _rm_do_supervisor, GESTOR_PROFILES, _GESTORES_POR_RM,
)

router = APIRouter(prefix="/pedidos", tags=["Pedidos — Relatórios"])


class ExportRequest(BaseModel):
    pedido_ids: list[int] | None = None
    status_filter: list[str] | None = None


class AdminPedidoUpdate(BaseModel):
    status: StatusPedidoEnum | None = None
    data_entrega: date | None = None
    finalidade: str | None = None
    observacoes: str | None = None
    cgeo_id: int | None = None
    prioridade: int | None = None
    link_bdgex: str | None = None
    motivo_reprovacao: str | None = None
    orgao_vinculante: OrgaoVinculanteEnum | None = None


@router.get("/map-features")
async def get_map_features(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """GeoJSON FeatureCollection de todos os itens de pedido com geometria GeoJSON por escala."""
    from app.services.bdgex_service import get_inom_geometries

    if current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        q = select(Pedido).where(
            Pedido.status.in_([StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, StatusPedidoEnum.ATRIBUIDO_CGEO])
        )
    elif current_user.perfil == PerfilEnum.ANALISTA_CGEO:
        q = select(Pedido).where(Pedido.cgeo_id == current_user.cgeo_id)
    elif current_user.perfil in _GESTORES_POR_RM:
        q = select(Pedido).where(Pedido.regiao_militar == _rm_do_supervisor(current_user))
    elif current_user.perfil in CONSOLIDADOR_PROFILES:
        q = select(Pedido).where(Pedido.orgao_vinculante == current_user.orgao_vinculante)
    else:
        q = select(Pedido).where(Pedido.usuario_id == current_user.id)

    pedidos = list(await db.scalars(q))
    enriched = await _enrich(db, pedidos)

    from app.models.enums import EscalaEnum
    import asyncio as _asyncio
    _scale_geoms: dict[str, dict] = {}
    for _p in enriched:
        for _it in _p.itens:
            _sv = _it.escala.value
            if _sv not in _scale_geoms:
                _scale_geoms[_sv] = await _asyncio.to_thread(get_inom_geometries, EscalaEnum(_sv))
    features = []
    for p in enriched:
        for item in p.itens:
            geom = _scale_geoms.get(item.escala.value, {}).get(item.inom)
            if not geom:
                continue
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "pedido_id": p.id,
                    "inom": item.inom,
                    "mi": item.mi,
                    "tipo_produto": item.tipo_produto.value,
                    "escala": item.escala.value,
                    "data_entrega": p.data_entrega.isoformat() if p.data_entrega else None,
                    "usuario_nome": p.usuario_nome,
                    "operacao_nome": p.operacao_nome,
                    "status": p.status.value,
                    "finalidade": p.finalidade,
                    "disponivel_bdgex": item.disponivel_bdgex,
                    "data_producao_bdgex": item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else None,
                    "idade_anos": (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else None,
                },
            })
    return {"type": "FeatureCollection", "features": features}


@router.get("/duplicatas")
async def listar_duplicatas(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna grupos de itens duplicados (mesmo MI + tipo_produto + escala) em pedidos pendentes."""
    if current_user.perfil in SUPERVISOR_PROFILES:
        q = select(Pedido).where(
            Pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
            Pedido.regiao_militar == _rm_do_supervisor(current_user),
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES:
        q = select(Pedido).where(
            Pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
            Pedido.orgao_vinculante == current_user.orgao_vinculante,
        )
    elif current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        q = select(Pedido).where(
            Pedido.status.in_([StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, StatusPedidoEnum.ATRIBUIDO_CGEO])
        )
    elif current_user.perfil == PerfilEnum.SOLICITANTE:
        q = select(Pedido).where(Pedido.usuario_id == current_user.id)
    else:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    pedidos = list(await db.scalars(q))
    if not pedidos:
        return []

    enriched = await _enrich(db, pedidos)

    grupos: dict[tuple, list[dict]] = defaultdict(list)
    for p in enriched:
        for item in p.itens:
            key = (item.inom, item.tipo_produto.value, item.escala.value)
            grupos[key].append({
                "pedido_id": p.id,
                "usuario_nome": p.usuario_nome,
                "status": p.status.value,
                "mi": item.mi,
            })

    duplicatas = []
    for (inom, tipo, escala), ocorrencias in grupos.items():
        if len(ocorrencias) > 1:
            duplicatas.append({
                "inom": inom,
                "tipo_produto": tipo,
                "escala": escala,
                "mi": ocorrencias[0].get("mi"),
                "ocorrencias": len(ocorrencias),
                "pedidos": ocorrencias,
            })

    return sorted(duplicatas, key=lambda x: x["ocorrencias"], reverse=True)


@router.get("/relatorio")
async def exportar_relatorio(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(
        PerfilEnum.SOLICITANTE,
        *SUPERVISOR_PROFILES,
        *CONSOLIDADOR_PROFILES,
    )),
):
    """Exporta relatório completo de pedidos como ZIP."""
    from app.services.bdgex_service import get_inom_geometries
    from app.models.enums import EscalaEnum

    if current_user.perfil == PerfilEnum.SOLICITANTE:
        q = select(Pedido).where(
            (Pedido.usuario_id == current_user.id) | (Pedido.criador_id == current_user.id),
            Pedido.status.notin_([StatusPedidoEnum.CANCELADO, StatusPedidoEnum.REPROVADO]),
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    elif current_user.perfil in SUPERVISOR_PROFILES:
        q = select(Pedido).where(
            Pedido.regiao_militar == _rm_do_supervisor(current_user),
            Pedido.status.notin_([StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.CANCELADO]),
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    else:  # CONSOLIDADOR_*
        q = select(Pedido).where(
            Pedido.orgao_vinculante == current_user.orgao_vinculante,
            Pedido.status.notin_([StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.CANCELADO]),
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    pedidos = list(await db.scalars(q))
    enriched = await _enrich(db, pedidos)

    from app.services.bdgex_service import _load_sopegeo_ages as _load_sop
    _sopegeo = _load_sop()

    def _bdgex_info(item) -> tuple[bool, object]:
        if item.data_producao_bdgex is not None:
            return item.disponivel_bdgex, item.data_producao_bdgex
        bucket = _sopegeo.get(item.tipo_produto.value, {})
        d = (bucket.get(item.mi) if item.mi else None) or bucket.get(item.inom)
        return d is not None, d

    _scale_geoms: dict[str, dict] = {}
    for p in enriched:
        for it in p.itens:
            sv = it.escala.value
            if sv not in _scale_geoms:
                _scale_geoms[sv] = get_inom_geometries(EscalaEnum(sv))

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, dialect="excel")
    writer.writerow([
        "Pedido_ID", "Prioridade_Pedido", "Status",
        "Posto_Graduacao", "Solicitante", "OM", "Secao_OM", "Email", "Telefone",
        "Finalidade_Geo", "Informacao_Complementar", "Orgao_Vinculante", "Regiao_Militar",
        "Data_Entrega", "Criado_Em",
        "Item_Prioridade", "MI", "INOM", "Tipo_Produto", "Escala",
        "Disponivel_BDGEx", "Data_Producao_BDGEx", "Idade_Anos",
        "Impressao_Solicitada", "Impressao_Quantidade", "Impressao_Material",
    ])
    for pedido_rank, p in enumerate(enriched, 1):
        for item_rank, item in enumerate(sorted(p.itens, key=lambda x: x.prioridade), 1):
            _disp, _dprod = _bdgex_info(item)
            idade_anos = (date.today() - _dprod).days // 365 if _dprod else ""
            _sol = (
                f"{_abrev_posto(p.usuario_posto_graduacao)} {p.usuario_nome}".strip()
                if p.usuario_posto_graduacao else (p.usuario_nome or "")
            )
            writer.writerow([
                p.id, pedido_rank, p.status.value,
                _abrev_posto(p.usuario_posto_graduacao), _sol,
                p.usuario_om or "", p.usuario_secao_om or "", p.usuario_email or "", p.usuario_telefone or "",
                p.finalidade_geo or "", p.finalidade or "",
                p.orgao_vinculante.value if p.orgao_vinculante else "", p.regiao_militar or "",
                p.data_entrega.isoformat() if p.data_entrega else "",
                p.criado_em.strftime("%d/%m/%Y %H:%M") if p.criado_em else "",
                item_rank, item.mi or "", item.inom, item.tipo_produto.value, item.escala.value,
                "Sim" if _disp else "Não", _dprod.isoformat() if _dprod else "", idade_anos,
                "Sim" if p.impressao_solicitada else "Não",
                item.impressao_quantidade or "", item.impressao_tipo_material or "",
            ])
    csv_bytes = csv_buf.getvalue().encode("utf-8-sig")

    geojsons: dict[str, list[dict]] = {}
    _suffix_map = {"1:25.000": "25k", "1:50.000": "50k", "1:100.000": "100k", "1:250.000": "250k"}
    for pedido_rank, p in enumerate(enriched, 1):
        for item_rank, item in enumerate(sorted(p.itens, key=lambda x: x.prioridade), 1):
            sv = item.escala.value
            suffix = _suffix_map.get(sv, sv.replace(":", "").replace(".", "").replace(" ", ""))
            geom = _scale_geoms.get(sv, {}).get(item.inom)
            _disp, _dprod = _bdgex_info(item)
            _idade = (date.today() - _dprod).days // 365 if _dprod else None
            _sol = (
                f"{_abrev_posto(p.usuario_posto_graduacao)} {p.usuario_nome}".strip()
                if p.usuario_posto_graduacao else p.usuario_nome
            )
            feat = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "pedido_id": p.id, "prioridade_pedido": pedido_rank,
                    "prioridade_item": item_rank, "status": p.status.value,
                    "posto_graduacao": _abrev_posto(p.usuario_posto_graduacao),
                    "solicitante": _sol, "om": p.usuario_om, "secao_om": p.usuario_secao_om,
                    "c_mil_a": p.regiao_militar, "tel_ritex": p.usuario_telefone_ritex,
                    "tel_comercial": p.usuario_telefone, "email": p.usuario_email,
                    "finalidade_geo": p.finalidade_geo, "informacao_complementar": p.finalidade,
                    "orgao_vinculante": p.orgao_vinculante.value if p.orgao_vinculante else None,
                    "mi": item.mi, "inom": item.inom,
                    "tipo_produto": item.tipo_produto.value, "escala": item.escala.value,
                    "data_entrega": p.data_entrega.isoformat() if p.data_entrega else None,
                    "criado_em": p.criado_em.isoformat() if p.criado_em else None,
                    "disponivel_bdgex": _disp,
                    "data_producao_bdgex": _dprod.isoformat() if _dprod else None,
                    "bdgex_idade_produto": _idade,
                    "impressao_solicitada": p.impressao_solicitada,
                    "impressao_quantidade": item.impressao_quantidade,
                    "impressao_material": item.impressao_tipo_material,
                },
            }
            geojsons.setdefault(suffix, []).append(feat)

    # ── LEIA-ME ───────────────────────────────────────────────────────────────
    _perfil_labels = {
        "SOLICITANTE": "Solicitante (OMDS)", "SUPERVISOR": "Supervisor (C Mil. A)",
        "CONSOLIDADOR_COTER": "Consolidador (COTER)", "CONSOLIDADOR_DSG": "Consolidador (DSG)",
        "CONSOLIDADOR_DEC": "Consolidador (DEC)", "CONSOLIDADOR_COLOG": "Consolidador (COLOG)",
        "CONSOLIDADOR_DECEX": "Consolidador (DECEx)", "GESTOR_CARTOGRAFICO": "Gestor Cartográfico (DSG)",
    }
    _cmila_labels: dict[str, str] = {
        "CMA": "CMA — Comando Militar da Amazônia", "CMAO": "CMAO — Comando Militar da Amazônia Oriental",
        "CML": "CML — Comando Militar do Leste", "CMP": "CMP — Comando Militar do Planalto",
        "CMO": "CMO — Comando Militar do Oeste", "CMS": "CMS — Comando Militar do Sul",
        "CMNE": "CMNE — Comando Militar do Nordeste", "CMNOR": "CMNOR — Comando Militar do Norte",
        "CMSE": "CMSE — Comando Militar do Sudeste",
    }
    _ov_labels: dict[str, str] = {
        "DSG": "DSG  (Diretoria de Serviço Geográfico)", "COTER": "COTER  (Seção de Geoinformação e Cartografia)",
        "DEC": "DEC  (Departamento de Engenharia e Construção)", "COLOG": "COLOG  (Comando Logístico)",
        "DECEx": "DECEx  (Depto. de Educação e Cultura do Exército)",
    }
    perfil_label = _perfil_labels.get(current_user.perfil.value, current_user.perfil.value)
    cmila_code = (current_user.regiao_militar or "").strip()
    cmila_label = _cmila_labels.get(cmila_code, cmila_code) if cmila_code else "—"
    ritex = (current_user.telefone_ritex or "").strip() or "—"
    telefone = (current_user.telefone or "").strip() or "—"
    secao = (current_user.secao_om or "").strip() or "—"
    posto = (current_user.posto_graduacao or "").strip() or "—"
    hoje = datetime.now().strftime("%d/%m/%Y %H:%M")
    geojson_files = "  ".join(f"pedidos_{s}.geojson" for s in sorted(geojsons))
    cmila_short = cmila_code if cmila_code else "C Mil. A"
    om_display = current_user.om or "OMDS"
    ov_value = current_user.orgao_vinculante.value if current_user.orgao_vinculante else ""

    if current_user.perfil == PerfilEnum.SOLICITANTE:
        if ov_value == "DSG":
            _cadeia_titulo = f"Cadeia prevista — {om_display} subordinada à DSG:"
            _cadeia_diagrama = f"  {om_display}\n    └─► DSG  (Diretoria de Serviço Geográfico)"
        elif ov_value == "COTER":
            _cadeia_titulo = f"Cadeia prevista — {om_display} subordinada ao COTER:"
            _cadeia_diagrama = (
                f"  {om_display}\n"
                f"    └─► {cmila_short}  (Supervisor de Geoinformação)\n"
                f"          └─► COTER  (Seção de Geoinformação e Cartografia)\n"
                f"                └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        elif ov_value in _ov_labels:
            _ov_disp = _ov_labels[ov_value]
            _cadeia_titulo = f"Cadeia prevista — {om_display} subordinada ao {ov_value}:"
            _cadeia_diagrama = (
                f"  {om_display}\n    └─► {_ov_disp}\n          └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        else:
            _cadeia_titulo = f"Cadeia prevista — {om_display}:"
            _cadeia_diagrama = f"  {om_display}\n    └─► DSG  (Diretoria de Serviço Geográfico)"
    elif current_user.perfil in SUPERVISOR_PROFILES:
        _cmila_display = cmila_label if cmila_label != "—" else cmila_short
        if ov_value == "COTER":
            _cadeia_titulo = f"Cadeia prevista — {_cmila_display} ao COTER:"
            _cadeia_diagrama = (
                f"  {_cmila_display}\n"
                f"    └─► COTER  (Seção de Geoinformação e Cartografia)\n"
                f"          └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        else:
            _cadeia_titulo = f"Cadeia prevista — {_cmila_display} à DSG:"
            _cadeia_diagrama = f"  {_cmila_display}\n    └─► DSG  (Diretoria de Serviço Geográfico)"
    else:
        if current_user.perfil == PerfilEnum.CONSOLIDADOR_COTER:
            _cadeia_titulo = "Cadeia prevista — COTER ao DSG:"
            _cadeia_diagrama = "  COTER  (Seção de Geoinformação e Cartografia)\n    └─► DSG  (Diretoria de Serviço Geográfico)"
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_DEC:
            _cadeia_titulo = "Cadeia prevista — DEC ao DSG:"
            _cadeia_diagrama = "  DEC  (Departamento de Engenharia e Construção)\n    └─► DSG  (Diretoria de Serviço Geográfico)"
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_COLOG:
            _cadeia_titulo = "Cadeia prevista — COLOG ao DSG:"
            _cadeia_diagrama = "  COLOG  (Comando Logístico)\n    └─► DSG  (Diretoria de Serviço Geográfico)"
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_DECEX:
            _cadeia_titulo = "Cadeia prevista — DECEx ao DSG:"
            _cadeia_diagrama = "  DECEx  (Depto. de Educação e Cultura do Exército)\n    └─► DSG  (Diretoria de Serviço Geográfico)"
        else:
            _cadeia_titulo = "Órgão responsável pelo processamento:"
            _cadeia_diagrama = "  DSG  (Diretoria de Serviço Geográfico)"

    readme = f"""\
LEIA-ME — SisPGeo: Sistema de Pedidos de Geoinformação
=======================================================
Diretoria de Serviço Geográfico (DSG) / Exército Brasileiro

Gerado por : {current_user.nome}
Perfil     : {perfil_label}
Data/Hora  : {hoje}

-------------------------------------------------------
DADOS DO SIGNATÁRIO
-------------------------------------------------------

  Posto/Grad.    : {posto}
  Nome           : {current_user.nome}
  OM / Órgão     : {om_display}
  Seção          : {secao}
  Subordinação   : {cmila_label}
  Tel. Ritex     : {ritex}
  Tel. Comercial : {telefone}
  E-mail         : {current_user.email}

-------------------------------------------------------
RESUMO
-------------------------------------------------------

  Total de pedidos : {len(enriched)}
  Total de itens   : {sum(len(p.itens) for p in enriched)}

-------------------------------------------------------
CONTEÚDO DESTE PACOTE
-------------------------------------------------------

  LEIA-ME.txt          — Este arquivo de instruções
  itens_pedidos.csv    — Relação completa de itens solicitados (abrir no Excel)
  {geojson_files}
                         Articulações por escala (abrir no QGIS / ArcGIS)

Os arquivos GeoJSON e o CSV contêm as geometrias das folhas
cartográficas solicitadas com todos os metadados: solicitante,
OM, MI, INOM, tipo de produto, escala, finalidade da geoinformação,
informação complementar, dados de impressão e idade do produto.

-------------------------------------------------------
INSTRUÇÃO DE CONTINGÊNCIA — CADEIA DE COMANDO
-------------------------------------------------------

Em caso de qualquer eventual falha técnica, indisponibilidade
do sistema, impossibilidade de acesso à plataforma SisPGeo ou
necessidade de registro físico das solicitações, este pacote
deve ser remetido integralmente pelo solicitante ou gestor
responsável via cadeia de comando ao escalão imediatamente
superior, até que as informações cheguem ao escalão competente
para processamento.

{_cadeia_titulo}

{_cadeia_diagrama}

O recebedor de cada escalão deverá confirmar o recebimento
e dar prosseguimento ao trâmite de forma a não prejudicar
o cumprimento dos prazos do ciclo de produção cartográfica.

-------------------------------------------------------
Este é um documento gerado automaticamente pelo SisPGeo.
Para suporte: contate o administrador do sistema (DSG).
-------------------------------------------------------"""

    def _slug(s: str) -> str:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = re.sub(r"[^\w]+", "_", s)
        return s.strip("_").lower()

    all_ids = [str(p.id) for p in enriched]
    if len(all_ids) <= 10:
        ids_str = "-".join(all_ids) if all_ids else "0"
    else:
        ids_str = "-".join(all_ids[:10]) + f"-e-mais-{len(all_ids) - 10}"

    om_slug = _slug(current_user.om or "omds")
    nome_slug = _slug(current_user.nome or "usuario")
    base_name = f"pedido_sispgeo_{ids_str}"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("LEIA-ME.txt", readme.encode("utf-8"))
        zf.writestr(f"{base_name}.csv", csv_bytes)
        for suffix, feats in sorted(geojsons.items()):
            fc = json.dumps(
                {"type": "FeatureCollection", "features": feats},
                ensure_ascii=False, indent=2,
            ).encode("utf-8")
            zf.writestr(f"{base_name}_{suffix}.geojson", fc)
    buf.seek(0)

    filename = f"{base_name}_{om_slug}_{nome_slug}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


async def _build_admin_zip(
    enriched: list,
    current_user: Usuario,
    filtro: str = "Todos",
) -> StreamingResponse:
    """Gera ZIP completo para o admin/DSG."""
    from app.services.bdgex_service import get_inom_geometries
    from app.models.enums import EscalaEnum

    suffix_map = {"1:25.000": "25k", "1:50.000": "50k", "1:100.000": "100k", "1:250.000": "250k"}

    _scale_geoms: dict[str, dict] = {}
    for _p in enriched:
        for _it in _p.itens:
            _sv = _it.escala.value
            if _sv not in _scale_geoms:
                _scale_geoms[_sv] = get_inom_geometries(EscalaEnum(_sv))

    from app.services.bdgex_service import _load_sopegeo_ages as _load_sop_adm
    _sopegeo_adm = _load_sop_adm()

    def _bdgex_info_adm(item) -> tuple[bool, object]:
        if item.data_producao_bdgex is not None:
            return item.disponivel_bdgex, item.data_producao_bdgex
        bucket = _sopegeo_adm.get(item.tipo_produto.value, {})
        d = (bucket.get(item.mi) if item.mi else None) or bucket.get(item.inom)
        return d is not None, d

    _pedido_rank: dict[int, int] = {p.id: rank for rank, p in enumerate(enriched, 1)}

    _dup_map: dict[tuple, list] = defaultdict(list)
    for _p in enriched:
        for _it in _p.itens:
            if _it.mi:
                _dup_map[(_it.mi, _it.tipo_produto.value)].append((_p, _it))
    dup_entries: dict[tuple, list] = {
        k: v for k, v in _dup_map.items()
        if len({e[0].id for e in v}) > 1
    }
    dup_keys = set(dup_entries.keys())

    geojsons: dict[str, list[dict]] = {}
    for p in enriched:
        _p_rank = _pedido_rank[p.id]
        for item_rank, item in enumerate(sorted(p.itens, key=lambda x: x.prioridade), 1):
            sv = item.escala.value
            suffix = suffix_map.get(sv, sv.replace(":", "").replace(".", "").replace(" ", ""))
            geom = _scale_geoms.get(sv, {}).get(item.inom)
            _is_dup = bool(item.mi and (item.mi, item.tipo_produto.value) in dup_keys)
            _disp, _dprod = _bdgex_info_adm(item)
            _idade = (date.today() - _dprod).days // 365 if _dprod else None
            _sol = (
                f"{_abrev_posto(p.usuario_posto_graduacao)} {p.usuario_nome}".strip()
                if p.usuario_posto_graduacao else p.usuario_nome
            )
            feat = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "pedido_id": p.id, "item_id": item.id,
                    "prioridade_pedido": _p_rank, "prioridade_item": item_rank,
                    "status": p.status.value,
                    "posto_graduacao": _abrev_posto(p.usuario_posto_graduacao),
                    "solicitante": _sol, "om": p.usuario_om, "secao_om": p.usuario_secao_om,
                    "c_mil_a": p.regiao_militar, "tel_ritex": p.usuario_telefone_ritex,
                    "tel_comercial": p.usuario_telefone, "email": p.usuario_email,
                    "finalidade_geo": p.finalidade_geo, "informacao_complementar": p.finalidade,
                    "orgao_vinculante": p.orgao_vinculante.value if p.orgao_vinculante else None,
                    "observacoes": p.observacoes, "motivo_reprovacao": p.motivo_reprovacao,
                    "link_bdgex": p.link_bdgex, "duplicado": _is_dup,
                    "mi": item.mi, "inom": item.inom,
                    "tipo_produto": item.tipo_produto.value, "escala": item.escala.value,
                    "data_entrega": p.data_entrega.isoformat() if p.data_entrega else None,
                    "criado_em": p.criado_em.isoformat() if p.criado_em else None,
                    "disponivel_bdgex": _disp,
                    "data_producao_bdgex": _dprod.isoformat() if _dprod else None,
                    "idade_anos": _idade,
                    "impressao_solicitada": p.impressao_solicitada,
                    "impressao_quantidade": item.impressao_quantidade,
                    "impressao_material": item.impressao_tipo_material,
                },
            }
            geojsons.setdefault(suffix, []).append(feat)

    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, dialect="excel")
    writer.writerow([
        "Pedido_ID", "Item_ID", "Prioridade_Pedido", "Prioridade_Item", "Status",
        "Posto_Graduacao", "Solicitante", "OM", "Secao_OM", "C_Mil_A",
        "Tel_Ritex", "Tel_Comercial", "Email",
        "Finalidade_Geo", "Informacao_Complementar", "Orgao_Vinculante",
        "Observacoes", "Motivo_Reprovacao", "Link_BDGEx",
        "Data_Entrega", "Criado_Em",
        "MI", "INOM", "Tipo_Produto", "Escala",
        "Disponivel_BDGEx", "Data_Producao_BDGEx", "Bdgex_Idade_Produto",
        "Duplicado",
        "Impressao_Solicitada", "Impressao_Quantidade", "Impressao_Material",
    ])
    for p in enriched:
        _p_rank = _pedido_rank[p.id]
        for item_rank, item in enumerate(sorted(p.itens, key=lambda x: x.prioridade), 1):
            _disp, _dprod = _bdgex_info_adm(item)
            idade_anos = (date.today() - _dprod).days // 365 if _dprod else ""
            is_dup = "Sim" if (item.mi, item.tipo_produto.value) in dup_keys else "Não"
            _sol = (
                f"{_abrev_posto(p.usuario_posto_graduacao)} {p.usuario_nome}".strip()
                if p.usuario_posto_graduacao else (p.usuario_nome or "")
            )
            writer.writerow([
                p.id, item.id, _p_rank, item_rank, p.status.value,
                _abrev_posto(p.usuario_posto_graduacao), _sol,
                p.usuario_om or "", p.usuario_secao_om or "", p.regiao_militar or "",
                p.usuario_telefone_ritex or "", p.usuario_telefone or "", p.usuario_email or "",
                p.finalidade_geo or "", p.finalidade or "",
                p.orgao_vinculante.value if p.orgao_vinculante else "",
                p.observacoes or "", p.motivo_reprovacao or "", p.link_bdgex or "",
                p.data_entrega.isoformat() if p.data_entrega else "",
                p.criado_em.strftime("%d/%m/%Y %H:%M") if p.criado_em else "",
                item.mi or "", item.inom, item.tipo_produto.value, item.escala.value,
                "Sim" if _disp else "Não", _dprod.isoformat() if _dprod else "", idade_anos,
                is_dup,
                "Sim" if p.impressao_solicitada else "Não",
                item.impressao_quantidade or "", item.impressao_tipo_material or "",
            ])
    csv_bytes = csv_buf.getvalue().encode("utf-8-sig")

    hoje = datetime.now().strftime("%d/%m/%Y %H:%M")
    total_itens = sum(len(p.itens) for p in enriched)
    linhas = [
        "RELATÓRIO DE PEDIDOS — SisPGeo", "=" * 70,
        "Diretoria de Serviço Geográfico (DSG) / Exército Brasileiro",
        "COTER — Comando de Operações Terrestres", "",
        f"Exportado por : {current_user.nome}", f"Data/Hora     : {hoje}",
        f"Filtro        : {filtro}", f"Total pedidos : {len(enriched)}",
        f"Total itens   : {total_itens}", "=" * 70,
    ]

    if dup_entries:
        linhas += [
            "", "=" * 70, "ATENÇÃO — ITENS DUPLICADOS ENTRE PEDIDOS DISTINTOS", "=" * 70,
            "Os itens abaixo foram solicitados em mais de um pedido.",
            "Verificar disponibilidade e data no BDGEx antes de produzir.", "-" * 70,
        ]
        for (mi, tipo), entries in sorted(dup_entries.items()):
            rep_item = next((e[1] for e in entries if e[1].data_producao_bdgex), entries[0][1])
            _rep_disp, _rep_dprod = _bdgex_info_adm(rep_item)
            bdgex_flag = "✓ Disponível" if _rep_disp else "✗ Não disponível"
            if _rep_dprod:
                _ia = (date.today() - _rep_dprod).days // 365
                bdgex_data = f" — Produzido em {_rep_dprod.strftime('%d/%m/%Y')} ({_ia} ano{'s' if _ia != 1 else ''})"
            else:
                bdgex_data = " — Data de produção não disponível"
            escalas_unicas = list(dict.fromkeys(e[1].escala.value for e in entries))
            linhas += [
                "", f"  MI: {mi}  |  Produto: {tipo}  |  Escala(s): {', '.join(escalas_unicas)}",
                f"  BDGEx: {bdgex_flag}{bdgex_data}",
                f"  Pedidos envolvidos ({len({e[0].id for e in entries})}):",
            ]
            por_pedido: dict[int, tuple] = {}
            for (pp, it) in entries:
                por_pedido[pp.id] = (pp, it)
            for pid, (pp, it) in sorted(por_pedido.items()):
                dup_posto = _abrev_posto(pp.usuario_posto_graduacao)
                dup_nome = pp.usuario_nome or "—"
                dup_om = pp.usuario_om or "—"
                dup_fin = pp.finalidade_geo or pp.finalidade or "—"
                linhas.append(
                    f"    • Pedido #{pid}  [{pp.status.value}]  Prio {_pedido_rank.get(pid, pp.prioridade)}"
                    f" — {dup_posto} {dup_nome} / {dup_om}"
                    f"\n      Finalidade: {dup_fin}"
                )
        linhas += ["", "-" * 70, "FIM DA SEÇÃO DE DUPLICATAS", "=" * 70]

    for p in enriched:
        _p_rank = _pedido_rank[p.id]
        imp_pedido = f"Sim ({p.impressao_quantidade}x {p.impressao_tipo_material})" if p.impressao_solicitada and p.impressao_quantidade else ("Sim" if p.impressao_solicitada else "Não")
        _itens_dup = {
            it.id for it in p.itens
            if it.mi and (it.mi, it.tipo_produto.value) in dup_keys
        }
        linhas += [
            "", f"PEDIDO #{p.id}  [{p.status.value}]  — Prioridade {_p_rank}",
            f"  Posto/Grad.         : {_abrev_posto(p.usuario_posto_graduacao) or '—'}",
            f"  Solicitante         : {p.usuario_nome or '—'}",
            f"  OM                  : {p.usuario_om or '—'}",
            f"  Seção               : {p.usuario_secao_om or '—'}",
            f"  C Mil. A            : {p.regiao_militar or '—'}",
            f"  Tel. Ritex          : {p.usuario_telefone_ritex or '—'}",
            f"  Tel. Comercial      : {p.usuario_telefone or '—'}",
            f"  E-mail              : {p.usuario_email or '—'}",
            f"  Órgão Vinculante    : {p.orgao_vinculante.value if p.orgao_vinculante else '—'}",
            f"  Finalidade Geo      : {p.finalidade_geo or '—'}",
            f"  Inf. Complementar   : {p.finalidade or '—'}",
            f"  Data de Entrega     : {p.data_entrega.strftime('%d/%m/%Y') if p.data_entrega else '—'}",
            f"  Criado em           : {p.criado_em.strftime('%d/%m/%Y %H:%M') if p.criado_em else '—'}",
            f"  Impressão Solicitada: {imp_pedido}",
            f"  Observações         : {p.observacoes or '—'}",
            f"  Motivo Reprovação   : {p.motivo_reprovacao or '—'}",
            f"  Link BDGEx          : {p.link_bdgex or '—'}",
            f"  Itens ({len(p.itens)}):",
        ]
        for i, item in enumerate(sorted(p.itens, key=lambda x: x.prioridade), 1):
            _disp, _dprod = _bdgex_info_adm(item)
            bdgex = "✓" if _disp else "✗"
            if _dprod:
                _ia = (date.today() - _dprod).days // 365
                prod = f" | Produção: {_dprod.strftime('%d/%m/%Y')} ({_ia} ano{'s' if _ia != 1 else ''})"
            else:
                prod = ""
            imp_item = f" | Impr.: {item.impressao_quantidade}x {item.impressao_tipo_material}" if item.impressao_quantidade else ""
            dup_flag = " ⚠ DUPLICADO" if item.id in _itens_dup else ""
            linhas.append(
                f"    {i:2}. [Prio {i:2}] {item.tipo_produto.value}"
                f" | {item.escala.value} | MI: {item.mi or '—'} | INOM: {item.inom}"
                f" | BDGEx: {bdgex}{prod}{imp_item}{dup_flag}"
            )
        linhas.append("-" * 70)
    txt_bytes = "\n".join(linhas).encode("utf-8")

    def _slug(s: str) -> str:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = re.sub(r"[^\w]+", "_", s)
        return s.strip("_").lower()

    today_str = date.today().isoformat()
    base_name = f"pedido_sispgeo_{today_str}_{len(enriched)}pedidos"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("relatorio.txt", txt_bytes)
        zf.writestr(f"{base_name}.csv", csv_bytes)
        for suffix, feats in sorted(geojsons.items()):
            fc = json.dumps(
                {"type": "FeatureCollection", "features": feats},
                ensure_ascii=False, indent=2,
            ).encode("utf-8")
            zf.writestr(f"{base_name}_{suffix}.geojson", fc)
    buf.seek(0)

    nom_slug = _slug(current_user.nome or "dsg")
    filename = f"{base_name}_{nom_slug}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export")
async def exportar_pedidos(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """DSG: exporta todos os pedidos ativos como ZIP completo."""
    result = await db.scalars(
        select(Pedido)
        .where(Pedido.status.notin_([StatusPedidoEnum.CANCELADO, StatusPedidoEnum.RASCUNHO]))
        .order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())
    )
    pedidos = list(result)
    enriched = await _enrich(db, pedidos)
    return await _build_admin_zip(enriched, current_user, filtro="Todos os ativos (sem rascunho/cancelado)")


@router.get("/admin/produtos-recentes")
async def admin_produtos_recentes_bdgex(
    anos: int = Query(default=5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Retorna itens de pedidos ativos com produto BDGEx mais novo que N anos."""
    q = select(Pedido).where(
        Pedido.status.in_([
            StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
            StatusPedidoEnum.ATRIBUIDO_CGEO,
            StatusPedidoEnum.APROVADO,
        ])
    )
    pedidos = list(await db.scalars(q))
    if not pedidos:
        return []

    enriched = await _enrich(db, pedidos)
    hoje = date.today()

    grupos: dict[tuple, dict] = {}
    pedidos_por_grupo: dict[tuple, list] = defaultdict(list)

    for p in enriched:
        for item in p.itens:
            if item.data_producao_bdgex is None:
                continue
            idade_dias = (hoje - item.data_producao_bdgex).days
            idade_anos = idade_dias / 365.25
            if idade_anos >= anos:
                continue
            key = (item.inom, item.tipo_produto.value, item.escala.value)
            if key not in grupos:
                grupos[key] = {
                    "inom": item.inom, "mi": item.mi,
                    "tipo_produto": item.tipo_produto.value, "escala": item.escala.value,
                    "data_producao_bdgex": item.data_producao_bdgex.isoformat(),
                    "idade_anos": round(idade_anos, 1),
                }
            _display_nome = p.usuario_nome_de_guerra or p.usuario_nome or "—"
            _display_full = (
                f"{_abrev_posto(p.usuario_posto_graduacao)} {_display_nome}".strip()
                if p.usuario_posto_graduacao else _display_nome
            )
            pedidos_por_grupo[key].append({
                "pedido_id": p.id, "usuario_nome": _display_full,
                "status": p.status.value, "om": p.usuario_om,
            })

    result = [
        {**grupo, "pedidos": pedidos_por_grupo[key]}
        for key, grupo in grupos.items()
    ]
    return sorted(result, key=lambda x: x["idade_anos"])


@router.get("/admin/all", response_model=list[PedidoOut])
async def admin_list_all(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
    status: str | None = Query(default=None),
    orgao_vinculante: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    """Gestor Cartográfico (DSG): lista TODOS os pedidos do sistema."""
    stmt = select(Pedido)
    if status:
        try:
            stmt = stmt.where(Pedido.status == StatusPedidoEnum(status))
        except ValueError:
            pass
    if orgao_vinculante:
        try:
            stmt = stmt.where(Pedido.orgao_vinculante == OrgaoVinculanteEnum(orgao_vinculante))
        except ValueError:
            pass
    stmt = stmt.order_by(Pedido.criado_em.desc())
    result = await db.scalars(stmt)
    pedidos = list(result)
    enriched = await _enrich(db, pedidos)

    if q:
        q_lower = q.lower()
        enriched = [
            p for p in enriched
            if (p.usuario_nome and q_lower in p.usuario_nome.lower())
            or any(q_lower in (item.inom or '').lower() for item in p.itens)
        ]

    return enriched


@router.delete("/admin/{pedido_id}")
async def admin_delete_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Gestor Cartográfico (DSG): remove qualquer pedido do sistema."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    await db.delete(pedido)
    await db.commit()
    return {"message": f"Pedido #{pedido_id} removido"}


@router.put("/admin/{pedido_id}", response_model=PedidoOut)
async def admin_update_pedido(
    pedido_id: int,
    body: AdminPedidoUpdate,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Gestor Cartográfico (DSG): atualiza qualquer campo de um pedido (admin override)."""
    from app.services.historico_service import registrar_historico

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    status_anterior = pedido.status

    if body.status is not None:
        pedido.status = body.status
    if body.data_entrega is not None:
        pedido.data_entrega = body.data_entrega
    if body.finalidade is not None:
        pedido.finalidade = body.finalidade
    if body.observacoes is not None:
        pedido.observacoes = body.observacoes
    if body.cgeo_id is not None:
        pedido.cgeo_id = body.cgeo_id
    if body.prioridade is not None:
        pedido.prioridade = body.prioridade
    if body.link_bdgex is not None:
        pedido.link_bdgex = body.link_bdgex
    if body.motivo_reprovacao is not None:
        pedido.motivo_reprovacao = body.motivo_reprovacao
    if body.orgao_vinculante is not None:
        pedido.orgao_vinculante = body.orgao_vinculante

    if body.status is not None and body.status != status_anterior:
        await registrar_historico(
            db, pedido=pedido, usuario=None, acao="admin_override",
            status_anterior=status_anterior,
        )

    await db.commit()
    await db.refresh(pedido)
    enriched = await _enrich(db, [pedido])
    return enriched[0]


@router.post("/admin/export")
async def admin_export_geojson(
    body: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """DSG: exporta pedidos (filtráveis) como ZIP completo."""
    stmt = select(Pedido)
    if body.pedido_ids:
        stmt = stmt.where(Pedido.id.in_(body.pedido_ids))
    if body.status_filter:
        valid_statuses = []
        for s in body.status_filter:
            try:
                valid_statuses.append(StatusPedidoEnum(s))
            except ValueError:
                pass
        if valid_statuses:
            stmt = stmt.where(Pedido.status.in_(valid_statuses))
    stmt = stmt.order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    result = await db.scalars(stmt)
    pedidos = list(result)
    enriched = await _enrich(db, pedidos)

    filtro_parts: list[str] = []
    if body.pedido_ids:
        filtro_parts.append(f"IDs: {', '.join(str(i) for i in body.pedido_ids)}")
    if body.status_filter:
        filtro_parts.append(f"Status: {', '.join(body.status_filter)}")
    filtro = "; ".join(filtro_parts) if filtro_parts else "Todos (sem filtro)"

    return await _build_admin_zip(enriched, current_user, filtro=filtro)


@router.get("/{pedido_id}/features")
async def get_pedido_features(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """GeoJSON das geometrias de um pedido específico."""
    from app.services.bdgex_service import get_inom_geometries

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    is_owner = pedido.usuario_id == current_user.id
    is_gestor = current_user.perfil in {PerfilEnum.GESTOR_CARTOGRAFICO, PerfilEnum.ANALISTA_CGEO, *GESTOR_PROFILES}
    if not is_owner and not is_gestor:
        raise HTTPException(status_code=403, detail="Acesso negado")

    from app.models.enums import EscalaEnum
    import asyncio as _asyncio
    _scale_geoms: dict[str, dict] = {}
    for _it in pedido.itens:
        _sv = _it.escala.value
        if _sv not in _scale_geoms:
            _scale_geoms[_sv] = await _asyncio.to_thread(get_inom_geometries, EscalaEnum(_sv))
    features = []
    for item in pedido.itens:
        geom = _scale_geoms.get(item.escala.value, {}).get(item.inom)
        if geom:
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "inom": item.inom, "mi": item.mi,
                    "tipo_produto": item.tipo_produto.value, "escala": item.escala.value,
                    "disponivel_bdgex": item.disponivel_bdgex,
                    "data_producao_bdgex": item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else None,
                    "idade_anos": (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else None,
                },
            })
    return {"type": "FeatureCollection", "features": features}
