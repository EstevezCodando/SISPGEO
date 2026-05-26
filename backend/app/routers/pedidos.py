# SisPGeo — Sistema de Pedidos de Geoinformação
# © 2026 Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
# Regras de negócio: Raphael Perrut <perrut.raphael@eb.mil.br>  ·  Eng. Cartógrafo

import csv
import io
import json
import re
import unicodedata
import zipfile
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.pedido import Pedido, ItemPedido
from app.models.operacao import Operacao
from app.models.user import Usuario
from app.models.enums import StatusPedidoEnum, PerfilEnum, OrgaoVinculanteEnum, SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES
from app.schemas.pedido import (
    PedidoCreate, PedidoUpdate, PedidoOut,
    ReviewPedidoRequest, AssignCGEORequest, CGEOReviewRequest,
    ReorderRequest,
)
from app.services import pedido_service


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


async def _enrich(db: AsyncSession, pedidos: list[Pedido]) -> list[PedidoOut]:
    """Enrich pedido list with usuario_nome, contact info and operacao_nome."""
    if not pedidos:
        return []

    user_ids = {p.usuario_id for p in pedidos}
    if hasattr(pedidos[0], 'criador_id'):
        user_ids |= {p.criador_id for p in pedidos if p.criador_id is not None}
    op_ids = {p.operacao_id for p in pedidos if p.operacao_id}

    user_rows = await db.execute(
        select(
            Usuario.id, Usuario.nome, Usuario.om, Usuario.email,
            Usuario.telefone, Usuario.telefone_ritex, Usuario.secao_om, Usuario.perfil,
        ).where(Usuario.id.in_(user_ids))
    )
    users: dict[int, dict] = {
        r.id: {
            "nome": r.nome,
            "om": r.om,
            "email": r.email,
            "telefone": r.telefone,
            "telefone_ritex": r.telefone_ritex,
            "secao_om": r.secao_om,
            "perfil": r.perfil.value if r.perfil else None,
        }
        for r in user_rows
    }

    ops: dict[int, str] = {}
    if op_ids:
        op_rows = await db.execute(
            select(Operacao.id, Operacao.nome).where(Operacao.id.in_(op_ids))
        )
        ops = {r.id: r.nome for r in op_rows}

    result = []
    for p in pedidos:
        out = PedidoOut.model_validate(p)
        u = users.get(p.usuario_id, {})
        out.usuario_nome = u.get("nome")
        out.usuario_om = u.get("om")
        out.usuario_email = u.get("email")
        out.usuario_telefone = u.get("telefone")
        out.usuario_telefone_ritex = u.get("telefone_ritex")
        out.usuario_secao_om = u.get("secao_om")
        out.usuario_perfil = u.get("perfil")
        out.operacao_nome = ops.get(p.operacao_id) if p.operacao_id else None
        out.criador_id = p.criador_id
        out.criador_nome = users.get(p.criador_id, {}).get("nome") if p.criador_id else None
        ov = p.orgao_vinculante.value if p.orgao_vinculante else ""
        out.cadeia_aprovacao = pedido_service.cadeia_aprovacao(ov, p.regiao_militar)
        result.append(out)
    return result


async def _check_janela_open(db: AsyncSession, user: Usuario) -> None:
    """Raises HTTP 403 if the user's temporal janela is not currently open.

    Gestores cartográficos and analistas CGEO are always unrestricted (janela=None).
    """
    from app.models.janela import JanelaPedidos
    from app.models.enums import TipoJanelaEnum

    _PERFIL_TO_JANELA_LOCAL: dict[PerfilEnum, TipoJanelaEnum | None] = {
        PerfilEnum.SUPERVISOR:        TipoJanelaEnum.SUPERVISOR,
        PerfilEnum.CONSOLIDADOR:      TipoJanelaEnum.CONSOLIDADOR,
        PerfilEnum.GESTOR_CARTOGRAFICO: None,
        PerfilEnum.ANALISTA_CGEO:     None,
    }
    tipo = _PERFIL_TO_JANELA_LOCAL.get(user.perfil)
    if tipo is None:
        return  # perfil irrestrito

    now = datetime.now(timezone.utc)
    result = await db.scalars(
        select(JanelaPedidos)
        .where(JanelaPedidos.tipo_janela == tipo)
        .order_by(JanelaPedidos.data_inicio.desc())
    )
    janelas = list(result)
    if not janelas:
        raise HTTPException(status_code=403, detail="Fora do período de ação: janela não configurada para o seu perfil")

    ativa = next((j for j in janelas if j.data_inicio <= now <= j.data_fim), None)
    if not ativa:
        prox = next((j for j in sorted(janelas, key=lambda j: j.data_inicio) if j.data_inicio > now), None)
        if prox:
            raise HTTPException(
                status_code=403,
                detail=f"Sua janela de ação ainda não iniciou. Início previsto: {prox.data_inicio.strftime('%d/%m/%Y')}",
            )
        raise HTTPException(status_code=403, detail="Sua janela de ação foi encerrada. Aguarde o próximo ciclo.")

router = APIRouter(prefix="/pedidos", tags=["Pedidos"])

GESTOR_PROFILES = tuple(SUPERVISOR_PROFILES | CONSOLIDADOR_PROFILES)
# Alias — supervisores regionais roteiam pedidos por regiao_militar
_GESTORES_POR_RM = SUPERVISOR_PROFILES



@router.post("/", response_model=PedidoOut, status_code=201)
async def create_pedido(
    body: PedidoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    from app.routers.config import get_or_create_config, PRAZOS_MINIMOS

    ov = body.orgao_vinculante if body.orgao_vinculante is not None else current_user.orgao_vinculante
    if ov is None:
        raise HTTPException(status_code=400, detail="Informe o órgão vinculante ou configure-o no seu perfil")

    # Valida data_entrega >= data_base + prazo_minimo do produto mais restritivo
    if body.itens and body.data_entrega:
        cfg = await get_or_create_config(db)
        max_prazo = max(PRAZOS_MINIMOS.get(item.tipo_produto.value, 30) for item in body.itens)
        data_minima = cfg.data_base + timedelta(days=max_prazo)
        if body.data_entrega < data_minima:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Data de entrega mínima para este pedido: "
                    f"{data_minima.strftime('%d/%m/%Y')} "
                    f"({max_prazo} dias a partir de {cfg.data_base.strftime('%d/%m/%Y')})."
                ),
            )

    # impressao_solicitada derivado: verdadeiro se qualquer item tiver qty de impressão
    any_impressao = any(i.impressao_quantidade for i in body.itens if i.impressao_quantidade)
    pedido = Pedido(
        usuario_id=current_user.id,
        criador_id=current_user.id,
        operacao_id=body.operacao_id,
        data_entrega=body.data_entrega,
        finalidade_geo=body.finalidade_geo,
        finalidade=body.finalidade,
        orgao_vinculante=ov,
        regiao_militar=current_user.regiao_militar,
        impressao_solicitada=any_impressao,
    )
    db.add(pedido)
    await db.flush()

    for item_data in body.itens:
        item = ItemPedido(
            pedido_id=pedido.id,
            tipo_produto=item_data.tipo_produto,
            escala=item_data.escala,
            inom=item_data.inom,
            mi=item_data.mi,
            solicitar_mesmo_disponivel=item_data.solicitar_mesmo_disponivel,
            impressao_quantidade=item_data.impressao_quantidade,
            impressao_tipo_material=item_data.impressao_tipo_material,
        )
        db.add(item)

    await db.commit()
    await db.refresh(pedido)
    return pedido


@router.get("/", response_model=list[PedidoOut])
async def list_pedidos(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status.in_([StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO, StatusPedidoEnum.ATRIBUIDO_CGEO]))
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil == PerfilEnum.ANALISTA_CGEO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.cgeo_id == current_user.cgeo_id)
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil in _GESTORES_POR_RM:
        # Supervisor (C. Mil. A) — roteado por Região Militar
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.regiao_militar == current_user.regiao_militar)
            .order_by(Pedido.criado_em.desc())
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES or current_user.perfil == PerfilEnum.CONSOLIDADOR:
        # Consolidador — roteado por orgao_vinculante
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.orgao_vinculante == current_user.orgao_vinculante)
            .order_by(Pedido.criado_em.desc())
        )
    else:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.usuario_id == current_user.id)
            .order_by(Pedido.criado_em.desc())
        )
    return await _enrich(db, list(result))


_PENDING_STATUS: dict[PerfilEnum, StatusPedidoEnum] = {
    PerfilEnum.SUPERVISOR:   StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
    PerfilEnum.CONSOLIDADOR: StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
}


@router.get("/pending", response_model=list[PedidoOut])
async def list_pending(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.perfil in _GESTORES_POR_RM:
        # Supervisor regional — filtro por Região Militar
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
                Pedido.regiao_militar == current_user.regiao_militar,
            )
            .order_by(Pedido.submetido_gestor_em.asc())
        )
    elif current_user.perfil in CONSOLIDADOR_PROFILES or current_user.perfil == PerfilEnum.CONSOLIDADOR:
        # Consolidador — filtro por orgao_vinculante
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
                Pedido.orgao_vinculante == current_user.orgao_vinculante,
            )
            .order_by(Pedido.submetido_gestor_em.asc())
        )
    elif current_user.perfil == PerfilEnum.GESTOR_CARTOGRAFICO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status == StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO)
            .order_by(Pedido.submetido_dsg_em.asc())
        )
    elif current_user.perfil == PerfilEnum.ANALISTA_CGEO:
        result = await db.scalars(
            select(Pedido)
            .where(Pedido.status == StatusPedidoEnum.ATRIBUIDO_CGEO, Pedido.cgeo_id == current_user.cgeo_id)
            .order_by(Pedido.criado_em.asc())
        )
    else:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    return await _enrich(db, list(result))


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
        q = select(Pedido).where(Pedido.regiao_militar == current_user.regiao_militar)
    elif current_user.perfil in CONSOLIDADOR_PROFILES or current_user.perfil == PerfilEnum.CONSOLIDADOR:
        q = select(Pedido).where(Pedido.orgao_vinculante == current_user.orgao_vinculante)
    else:
        q = select(Pedido).where(Pedido.usuario_id == current_user.id)

    pedidos = list(await db.scalars(q))
    enriched = await _enrich(db, pedidos)

    # Load geometry lookup per scale (items may span multiple scales)
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
                },
            })
    return {"type": "FeatureCollection", "features": features}


# ── /duplicatas and /export MUST be before /{pedido_id} to avoid shadowing ──

@router.get("/duplicatas")
async def listar_duplicatas(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna grupos de itens duplicados (mesmo MI + tipo_produto + escala) em pedidos pendentes."""
    from collections import defaultdict

    if current_user.perfil == PerfilEnum.SUPERVISOR:
        q = select(Pedido).where(
            Pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
            Pedido.regiao_militar == current_user.regiao_militar,
        )
    elif current_user.perfil == PerfilEnum.CONSOLIDADOR:
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
        PerfilEnum.SUPERVISOR,
        PerfilEnum.CONSOLIDADOR,
    )),
):
    """Exporta relatório completo de pedidos como ZIP.

    Conteúdo do ZIP:
    - ``LEIA-ME.txt``           — instruções de contingência (cadeia de comando)
    - ``itens_pedidos.csv``     — tabela completa de todos os MI com metadados
    - ``pedidos_25k.geojson``   — articulações 1:25.000
    - ``pedidos_50k.geojson``   — articulações 1:50.000
    - ``pedidos_100k.geojson``  — articulações 1:100.000
    - ``pedidos_250k.geojson``  — articulações 1:250.000

    Escopo filtrado por perfil:
    - SOLICITANTE  → seus próprios pedidos (qualquer status)
    - SUPERVISOR   → pedidos da sua Região Militar (exceto RASCUNHO/CANCELADO)
    - CONSOLIDADOR → pedidos do seu Órgão Vinculante (exceto RASCUNHO/CANCELADO)
    """
    from app.services.bdgex_service import get_inom_geometries
    from app.models.enums import EscalaEnum

    # ── Filtro por perfil ─────────────────────────────────────────────────────
    if current_user.perfil == PerfilEnum.SOLICITANTE:
        q = select(Pedido).where(
            (Pedido.usuario_id == current_user.id) | (Pedido.criador_id == current_user.id)
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    elif current_user.perfil == PerfilEnum.SUPERVISOR:
        q = select(Pedido).where(
            Pedido.regiao_militar == current_user.regiao_militar,
            Pedido.status.notin_([StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.CANCELADO]),
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    else:  # CONSOLIDADOR
        q = select(Pedido).where(
            Pedido.orgao_vinculante == current_user.orgao_vinculante,
            Pedido.status.notin_([StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.CANCELADO]),
        ).order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())

    pedidos = list(await db.scalars(q))
    enriched = await _enrich(db, pedidos)

    # ── Geometrias por escala (lazy, 1 chamada por escala presente) ───────────
    _scale_geoms: dict[str, dict] = {}
    for p in enriched:
        for it in p.itens:
            sv = it.escala.value
            if sv not in _scale_geoms:
                _scale_geoms[sv] = get_inom_geometries(EscalaEnum(sv))

    # ── CSV ───────────────────────────────────────────────────────────────────
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, dialect="excel")
    writer.writerow([
        "Pedido_ID", "Prioridade_Pedido", "Status",
        "Solicitante", "OM", "Secao_OM", "Email", "Telefone",
        "Finalidade_Geo", "Informacao_Complementar", "Orgao_Vinculante", "Regiao_Militar",
        "Data_Entrega", "Criado_Em",
        "Item_Prioridade", "MI", "INOM", "Tipo_Produto", "Escala",
        "Disponivel_BDGEx", "Data_Producao_BDGEx", "Idade_Anos",
        "Impressao_Solicitada", "Impressao_Quantidade", "Impressao_Material",
    ])
    for p in enriched:
        for item in sorted(p.itens, key=lambda x: x.prioridade):
            idade_anos = (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else ""
            writer.writerow([
                p.id,
                p.prioridade,
                p.status.value,
                p.usuario_nome or "",
                p.usuario_om or "",
                p.usuario_secao_om or "",
                p.usuario_email or "",
                p.usuario_telefone or "",
                p.finalidade_geo or "",
                p.finalidade or "",
                p.orgao_vinculante.value if p.orgao_vinculante else "",
                p.regiao_militar or "",
                p.data_entrega.isoformat() if p.data_entrega else "",
                p.criado_em.strftime("%d/%m/%Y %H:%M") if p.criado_em else "",
                item.prioridade,
                item.mi or "",
                item.inom,
                item.tipo_produto.value,
                item.escala.value,
                "Sim" if item.disponivel_bdgex else "Não",
                item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else "",
                idade_anos,
                "Sim" if p.impressao_solicitada else "Não",
                item.impressao_quantidade or "",
                item.impressao_tipo_material or "",
            ])
    csv_bytes = csv_buf.getvalue().encode("utf-8-sig")  # BOM para Excel abrir corretamente

    # ── GeoJSONs por escala ───────────────────────────────────────────────────
    geojsons: dict[str, list[dict]] = {}  # sufixo → lista de features
    for p in enriched:
        for item in p.itens:
            sv = item.escala.value
            suffix = sv.replace("1:", "").replace(".", "").replace(" ", "")  # "1:50.000" → "50000"
            # normalizar: "1:50.000" → "50k" style
            suffix_map = {"1:25.000": "25k", "1:50.000": "50k", "1:100.000": "100k", "1:250.000": "250k"}
            suffix = suffix_map.get(sv, sv.replace(":", "").replace(".", "").replace(" ", ""))
            geom = _scale_geoms.get(sv, {}).get(item.inom)
            _idade = (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else None
            feat = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    # ── Identificação do pedido/item ────────────────────────
                    "pedido_id":          p.id,
                    "prioridade_pedido":  p.prioridade,
                    "prioridade_item":    item.prioridade,
                    "status":             p.status.value,
                    # ── Dados do solicitante ────────────────────────────────
                    "solicitante":        p.usuario_nome,
                    "om":                 p.usuario_om,
                    "secao_om":           p.usuario_secao_om,
                    "c_mila":             p.regiao_militar,
                    "tel_ritex":          p.usuario_telefone_ritex,
                    "tel_comercial":      p.usuario_telefone,
                    "email":              p.usuario_email,
                    # ── Contexto do pedido ──────────────────────────────────
                    "finalidade_geo":     p.finalidade_geo,
                    "informacao_complementar": p.finalidade,
                    "orgao_vinculante":   p.orgao_vinculante.value if p.orgao_vinculante else None,
                    # ── Produto cartográfico ────────────────────────────────
                    "mi":                 item.mi,
                    "inom":               item.inom,
                    "tipo_produto":       item.tipo_produto.value,
                    "escala":             item.escala.value,
                    "data_entrega":       p.data_entrega.isoformat() if p.data_entrega else None,
                    "criado_em":          p.criado_em.isoformat() if p.criado_em else None,
                    "disponivel_bdgex":   item.disponivel_bdgex,
                    "data_producao_bdgex": item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else None,
                    "idade_anos":         _idade,
                    # ── Impressão física ────────────────────────────────────
                    "impressao_solicitada":  p.impressao_solicitada,
                    "impressao_quantidade":  item.impressao_quantidade,
                    "impressao_material":    item.impressao_tipo_material,
                },
            }
            geojsons.setdefault(suffix, []).append(feat)

    # ── LEIA-ME ───────────────────────────────────────────────────────────────
    _perfil_labels = {
        "SOLICITANTE":           "Solicitante (OMDS)",
        "SUPERVISOR":            "Supervisor (C Mil. A)",
        "CONSOLIDADOR_COTER":    "Consolidador (COTER)",
        "CONSOLIDADOR_DSG":      "Consolidador (DSG)",
        "CONSOLIDADOR_DEC":      "Consolidador (DEC)",
        "CONSOLIDADOR_COLOG":    "Consolidador (COLOG)",
        "CONSOLIDADOR_DECEX":    "Consolidador (DECEx)",
        "GESTOR_CARTOGRAFICO":   "Gestor Cartográfico (DSG)",
    }
    _cmila_labels: dict[str, str] = {
        "CMA":   "CMA — Comando Militar da Amazônia",
        "CMAO":  "CMAO — Comando Militar da Amazônia Ocidental",
        "CML":   "CML — Comando Militar do Leste",
        "CMP":   "CMP — Comando Militar do Planalto",
        "CMO":   "CMO — Comando Militar do Oeste",
        "CMS":   "CMS — Comando Militar do Sul",
        "CMNE":  "CMNE — Comando Militar do Nordeste",
        "CMNOR": "CMNOR — Comando Militar do Norte",
        "CMSE":  "CMSE — Comando Militar do Sudeste",
    }
    # Labels dos órgãos intermediários usados nas cadeias
    _ov_labels: dict[str, str] = {
        "DSG":   "DSG  (Diretoria de Serviço Geográfico)",
        "COTER": "COTER  (Seção de Geoinformação e Cartografia)",
        "DEC":   "DEC  (Departamento de Engenharia e Construção)",
        "COLOG": "COLOG  (Comando Logístico)",
        "DECEx": "DECEx  (Depto. de Educação e Cultura do Exército)",
    }
    perfil_label  = _perfil_labels.get(current_user.perfil.value, current_user.perfil.value)
    cmila_code    = (current_user.regiao_militar or "").strip()
    cmila_label   = _cmila_labels.get(cmila_code, cmila_code) if cmila_code else "—"
    ritex         = (current_user.telefone_ritex or "").strip() or "—"
    telefone      = (current_user.telefone or "").strip() or "—"
    secao         = (current_user.secao_om or "").strip() or "—"
    hoje          = datetime.now().strftime("%d/%m/%Y %H:%M")
    geojson_files = "  ".join(f"pedidos_{s}.geojson" for s in sorted(geojsons))

    cmila_short = cmila_code if cmila_code else "C Mil. A"
    om_display  = current_user.om or "OMDS"
    ov_value    = current_user.orgao_vinculante.value if current_user.orgao_vinculante else ""

    # ── Cadeia de comando — específica ao perfil e órgão vinculante ──────────
    if current_user.perfil == PerfilEnum.SOLICITANTE:
        if ov_value == "DSG":
            _cadeia_titulo = f"Cadeia prevista — {om_display} subordinada à DSG:"
            _cadeia_diagrama = (
                f"  {om_display}\n"
                f"    └─► DSG  (Diretoria de Serviço Geográfico)"
            )
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
                f"  {om_display}\n"
                f"    └─► {_ov_disp}\n"
                f"          └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        else:
            _cadeia_titulo = f"Cadeia prevista — {om_display}:"
            _cadeia_diagrama = (
                f"  {om_display}\n"
                f"    └─► DSG  (Diretoria de Serviço Geográfico)"
            )

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
            _cadeia_diagrama = (
                f"  {_cmila_display}\n"
                f"    └─► DSG  (Diretoria de Serviço Geográfico)"
            )

    else:  # CONSOLIDADOR_*  (COTER, DSG, DEC, COLOG, DECEx)
        if current_user.perfil == PerfilEnum.CONSOLIDADOR_COTER:
            _cadeia_titulo = "Cadeia prevista — COTER ao DSG:"
            _cadeia_diagrama = (
                "  COTER  (Seção de Geoinformação e Cartografia)\n"
                "    └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_DEC:
            _cadeia_titulo = "Cadeia prevista — DEC ao DSG:"
            _cadeia_diagrama = (
                "  DEC  (Departamento de Engenharia e Construção)\n"
                "    └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_COLOG:
            _cadeia_titulo = "Cadeia prevista — COLOG ao DSG:"
            _cadeia_diagrama = (
                "  COLOG  (Comando Logístico)\n"
                "    └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        elif current_user.perfil == PerfilEnum.CONSOLIDADOR_DECEX:
            _cadeia_titulo = "Cadeia prevista — DECEx ao DSG:"
            _cadeia_diagrama = (
                "  DECEx  (Depto. de Educação e Cultura do Exército)\n"
                "    └─► DSG  (Diretoria de Serviço Geográfico)"
            )
        else:  # CONSOLIDADOR_DSG ou GESTOR_CARTOGRAFICO
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
-------------------------------------------------------
"""

    # ── Nomes dos arquivos ────────────────────────────────────────────────────
    def _slug(s: str) -> str:
        """Remove acentos e caracteres especiais → snake_case seguro para filename."""
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = re.sub(r"[^\w]+", "_", s)
        return s.strip("_").lower()

    # IDs de todos os pedidos (máx 10 explícitos + contador do restante)
    all_ids = [str(p.id) for p in enriched]
    if len(all_ids) <= 10:
        ids_str = "-".join(all_ids) if all_ids else "0"
    else:
        ids_str = "-".join(all_ids[:10]) + f"-e-mais-{len(all_ids) - 10}"

    om_slug   = _slug(current_user.om or "omds")
    nome_slug = _slug(current_user.nome or "usuario")

    # Base comum usada pelos arquivos internos e pelo próprio ZIP
    base_name = f"pedido_sispgeo_{ids_str}"

    # ── ZIP ───────────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────────────────────
# Helper compartilhado pelos dois endpoints de export do admin (DSG)
# ─────────────────────────────────────────────────────────────────────────────
async def _build_admin_zip(
    enriched: list,
    current_user: Usuario,
    filtro: str = "Todos",
) -> StreamingResponse:
    """Gera ZIP completo para o admin/DSG:
    - GeoJSONs por escala (campos completos: solicitante, contato, produto)
    - CSV completo com BOM (abre direto no Excel)
    - Relatório TXT com ficha detalhada por pedido
    """
    from app.services.bdgex_service import get_inom_geometries
    from app.models.enums import EscalaEnum

    suffix_map = {"1:25.000": "25k", "1:50.000": "50k", "1:100.000": "100k", "1:250.000": "250k"}

    # ── Geometrias por escala ────────────────────────────────────────────────
    _scale_geoms: dict[str, dict] = {}
    for _p in enriched:
        for _it in _p.itens:
            _sv = _it.escala.value
            if _sv not in _scale_geoms:
                _scale_geoms[_sv] = get_inom_geometries(EscalaEnum(_sv))

    # ── GeoJSONs por escala ──────────────────────────────────────────────────
    geojsons: dict[str, list[dict]] = {}
    for p in enriched:
        for item in p.itens:
            sv = item.escala.value
            suffix = suffix_map.get(sv, sv.replace(":", "").replace(".", "").replace(" ", ""))
            geom = _scale_geoms.get(sv, {}).get(item.inom)
            feat = {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    # ── Pedido / item ───────────────────────────────────────
                    "pedido_id":           p.id,
                    "item_id":             item.id,
                    "prioridade_pedido":   p.prioridade,
                    "prioridade_item":     item.prioridade,
                    "status":              p.status.value,
                    # ── Dados do solicitante ────────────────────────────────
                    "solicitante":         p.usuario_nome,
                    "om":                  p.usuario_om,
                    "secao_om":            p.usuario_secao_om,
                    "c_mila":              p.regiao_militar,
                    "tel_ritex":           p.usuario_telefone_ritex,
                    "tel_comercial":       p.usuario_telefone,
                    "email":               p.usuario_email,
                    # ── Contexto do pedido ──────────────────────────────────
                    "finalidade_geo":      p.finalidade_geo,
                    "informacao_complementar": p.finalidade,
                    "orgao_vinculante":    p.orgao_vinculante.value if p.orgao_vinculante else None,
                    "observacoes":         p.observacoes,
                    "motivo_reprovacao":   p.motivo_reprovacao,
                    "link_bdgex":          p.link_bdgex,
                    # ── Produto cartográfico ────────────────────────────────
                    "mi":                  item.mi,
                    "inom":                item.inom,
                    "tipo_produto":        item.tipo_produto.value,
                    "escala":              item.escala.value,
                    "data_entrega":        p.data_entrega.isoformat() if p.data_entrega else None,
                    "criado_em":           p.criado_em.isoformat() if p.criado_em else None,
                    "disponivel_bdgex":    item.disponivel_bdgex,
                    "data_producao_bdgex": item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else None,
                    "idade_anos":          (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else None,
                    # ── Impressão física ────────────────────────────────────
                    "impressao_solicitada": p.impressao_solicitada,
                    "impressao_quantidade": item.impressao_quantidade,
                    "impressao_material":   item.impressao_tipo_material,
                },
            }
            geojsons.setdefault(suffix, []).append(feat)

    # ── CSV completo ─────────────────────────────────────────────────────────
    csv_buf = io.StringIO()
    writer = csv.writer(csv_buf, dialect="excel")
    writer.writerow([
        "Pedido_ID", "Item_ID", "Prioridade_Pedido", "Prioridade_Item", "Status",
        "Solicitante", "OM", "Secao_OM", "C_MilA", "Tel_Ritex", "Tel_Comercial", "Email",
        "Finalidade_Geo", "Informacao_Complementar", "Orgao_Vinculante",
        "Observacoes", "Motivo_Reprovacao", "Link_BDGEx",
        "Data_Entrega", "Criado_Em",
        "MI", "INOM", "Tipo_Produto", "Escala",
        "Disponivel_BDGEx", "Data_Producao_BDGEx", "Idade_Anos",
        "Impressao_Solicitada", "Impressao_Quantidade", "Impressao_Material",
    ])
    for p in enriched:
        for item in sorted(p.itens, key=lambda x: x.prioridade):
            idade_anos = (date.today() - item.data_producao_bdgex).days // 365 if item.data_producao_bdgex else ""
            writer.writerow([
                p.id,
                item.id,
                p.prioridade,
                item.prioridade,
                p.status.value,
                p.usuario_nome or "",
                p.usuario_om or "",
                p.usuario_secao_om or "",
                p.regiao_militar or "",
                p.usuario_telefone_ritex or "",
                p.usuario_telefone or "",
                p.usuario_email or "",
                p.finalidade_geo or "",
                p.finalidade or "",
                p.orgao_vinculante.value if p.orgao_vinculante else "",
                p.observacoes or "",
                p.motivo_reprovacao or "",
                p.link_bdgex or "",
                p.data_entrega.isoformat() if p.data_entrega else "",
                p.criado_em.strftime("%d/%m/%Y %H:%M") if p.criado_em else "",
                item.mi or "",
                item.inom,
                item.tipo_produto.value,
                item.escala.value,
                "Sim" if item.disponivel_bdgex else "Não",
                item.data_producao_bdgex.isoformat() if item.data_producao_bdgex else "",
                idade_anos,
                "Sim" if p.impressao_solicitada else "Não",
                item.impressao_quantidade or "",
                item.impressao_tipo_material or "",
            ])
    csv_bytes = csv_buf.getvalue().encode("utf-8-sig")

    # ── Relatório TXT (ficha por pedido) ─────────────────────────────────────
    hoje = datetime.now().strftime("%d/%m/%Y %H:%M")
    total_itens = sum(len(p.itens) for p in enriched)
    linhas = [
        "RELATÓRIO DE PEDIDOS — SisPGeo",
        "=" * 70,
        "Diretoria de Serviço Geográfico (DSG) / Exército Brasileiro",
        "COTER — Comando de Operações Terrestres",
        "",
        f"Exportado por : {current_user.nome}",
        f"Data/Hora     : {hoje}",
        f"Filtro        : {filtro}",
        f"Total pedidos : {len(enriched)}",
        f"Total itens   : {total_itens}",
        "=" * 70,
    ]
    for p in enriched:
        imp_pedido = f"Sim ({p.impressao_quantidade}x {p.impressao_tipo_material})" if p.impressao_solicitada and p.impressao_quantidade else ("Sim" if p.impressao_solicitada else "Não")
        linhas += [
            "",
            f"PEDIDO #{p.id}  [{p.status.value}]  — Prioridade {p.prioridade}",
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
            bdgex = "✓" if item.disponivel_bdgex else "✗"
            if item.data_producao_bdgex:
                _ia = (date.today() - item.data_producao_bdgex).days // 365
                prod = f" | Produção: {item.data_producao_bdgex.strftime('%d/%m/%Y')} ({_ia} ano{'s' if _ia != 1 else ''})"
            else:
                prod = ""
            imp_item = f" | Impr.: {item.impressao_quantidade}x {item.impressao_tipo_material}" if item.impressao_quantidade else ""
            linhas.append(
                f"    {i:2}. [Prio {item.prioridade:2}] {item.tipo_produto.value}"
                f" | {item.escala.value} | MI: {item.mi or '—'} | INOM: {item.inom}"
                f" | BDGEx: {bdgex}{prod}{imp_item}"
            )
        linhas.append("-" * 70)
    txt_bytes = "\n".join(linhas).encode("utf-8")

    # ── Nomes dos arquivos ───────────────────────────────────────────────────
    def _slug(s: str) -> str:
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = re.sub(r"[^\w]+", "_", s)
        return s.strip("_").lower()

    today_str = date.today().isoformat()
    base_name = f"pedido_sispgeo_{today_str}_{len(enriched)}pedidos"

    # ── ZIP ──────────────────────────────────────────────────────────────────
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

    nom_slug  = _slug(current_user.nome or "dsg")
    filename  = f"{base_name}_{nom_slug}.zip"
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
    """DSG: exporta todos os pedidos ativos como ZIP completo
    (GeoJSONs por escala + CSV + relatório TXT por pedido).
    """
    from app.services.bdgex_service import get_inom_geometries
    from app.models.enums import EscalaEnum

    result = await db.scalars(
        select(Pedido)
        .where(Pedido.status.notin_([StatusPedidoEnum.CANCELADO, StatusPedidoEnum.RASCUNHO]))
        .order_by(Pedido.prioridade.asc(), Pedido.criado_em.asc())
    )
    pedidos = list(result)
    enriched = await _enrich(db, pedidos)
    return await _build_admin_zip(enriched, current_user, filtro="Todos os ativos (sem rascunho/cancelado)")


class DarProntoRequest(BaseModel):
    observacoes: str
    link_bdgex: str | None = None


@router.post("/{pedido_id}/dar-pronto", response_model=PedidoOut)
async def dar_pronto(
    pedido_id: int,
    body: DarProntoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """DSG/Admin marca um pedido como PRODUZIDO e notifica toda a cadeia solicitante."""
    from app.services.historico_service import registrar_historico
    from app.services.notification_service import NotificationService

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    status_anterior = pedido.status
    pedido.status = StatusPedidoEnum.PRODUZIDO
    pedido.observacoes = body.observacoes
    if body.link_bdgex:
        pedido.link_bdgex = body.link_bdgex

    await registrar_historico(
        db, pedido=pedido, usuario=current_user, acao="dar_pronto",
        status_anterior=status_anterior,
    )
    await db.commit()
    await db.refresh(pedido)

    # ── Notificações em cascata ──────────────────────────────────────────────
    svc = NotificationService(db)
    titulo = f"✅ Pedido #{pedido_id} — Produto Disponível"
    link_txt = f" | Link: {body.link_bdgex}" if body.link_bdgex else ""
    mensagem = f"O pedido #{pedido_id} foi marcado como Produzido. {body.observacoes}{link_txt}"

    # 1. Solicitante direto
    await svc.notify_user(pedido.usuario_id, titulo, mensagem, pedido_id)

    # 2. Supervisor do CMilA (filtrado por regiao_militar)
    if pedido.regiao_militar:
        await svc.notify_by_perfil(
            PerfilEnum.SUPERVISOR, titulo, mensagem, pedido_id,
            regiao_militar=pedido.regiao_militar,
        )

    # 3. Consolidador do órgão vinculante
    if pedido.orgao_vinculante:
        await svc.notify_by_perfil(
            PerfilEnum.CONSOLIDADOR, titulo, mensagem, pedido_id,
            orgao_vinculante=pedido.orgao_vinculante,
        )

    await db.commit()

    enriched = await _enrich(db, [pedido])
    return enriched[0]


@router.delete("/{pedido_id}/items/{item_id}", status_code=204)
async def delete_item(
    pedido_id: int,
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Remove um item (célula) de um pedido.

    - Dono do pedido: pode remover se status RASCUNHO ou DEVOLVIDO.
    - Supervisor: pode remover itens de pedidos AGUARDANDO_SUPERVISOR na sua regiao_militar.
    - Consolidador: pode remover itens de pedidos AGUARDANDO_CONSOLIDADOR no seu orgao_vinculante.
    O pedido deve ter ao menos 1 item restante.
    """
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    is_owner = pedido.usuario_id == current_user.id
    is_supervisor = (
        current_user.perfil == PerfilEnum.SUPERVISOR
        and pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        and pedido.regiao_militar == current_user.regiao_militar
    )
    is_consolidador = (
        current_user.perfil == PerfilEnum.CONSOLIDADOR
        and pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR
        and pedido.orgao_vinculante == current_user.orgao_vinculante
    )

    if not (is_owner or is_supervisor or is_consolidador):
        raise HTTPException(status_code=403, detail="Acesso negado")

    if is_owner and pedido.status not in (StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.DEVOLVIDO):
        raise HTTPException(status_code=400, detail="Pedido não pode ser editado neste status")

    if (is_supervisor or is_consolidador):
        await _check_janela_open(db, current_user)

    item = await db.get(ItemPedido, item_id)
    if not item or item.pedido_id != pedido_id:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    # Conta itens restantes após a remoção
    count_res = await db.execute(
        select(ItemPedido).where(ItemPedido.pedido_id == pedido_id)
    )
    if len(count_res.all()) <= 1:
        raise HTTPException(status_code=400, detail="Não é possível remover o único item do pedido")
    await db.delete(item)
    await db.commit()


@router.get("/homologados", response_model=list[PedidoOut])
async def list_homologados(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    """Lista pedidos já encaminhados além da fila atual do gestor.

    SUPERVISOR  → pedidos da sua Região Militar em status pós-supervisor.
    CONSOLIDADOR → pedidos do seu órgão vinculante em status pós-consolidador.
    """
    if current_user.perfil == PerfilEnum.SUPERVISOR:
        forwarded = [
            StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
            StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
            StatusPedidoEnum.ATRIBUIDO_CGEO,
            StatusPedidoEnum.APROVADO,
            StatusPedidoEnum.PRODUZIDO,
            StatusPedidoEnum.REPROVADO,
        ]
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status.in_(forwarded),
                Pedido.regiao_militar == current_user.regiao_militar,
            )
            .order_by(Pedido.atualizado_em.desc())
        )
    elif current_user.perfil == PerfilEnum.CONSOLIDADOR:
        forwarded = [
            StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
            StatusPedidoEnum.ATRIBUIDO_CGEO,
            StatusPedidoEnum.APROVADO,
            StatusPedidoEnum.PRODUZIDO,
            StatusPedidoEnum.REPROVADO,
        ]
        result = await db.scalars(
            select(Pedido)
            .where(
                Pedido.status.in_(forwarded),
                Pedido.orgao_vinculante == current_user.orgao_vinculante,
            )
            .order_by(Pedido.atualizado_em.desc())
        )
    else:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    return await _enrich(db, list(result))


@router.get("/{pedido_id}", response_model=PedidoOut)
async def get_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    enriched = await _enrich(db, [pedido])
    return enriched[0]


class EnviarLoteRequest(BaseModel):
    auto_submitted: bool = False


@router.post("/enviar-lote", response_model=list[PedidoOut])
async def enviar_lote(
    body: EnviarLoteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Submete todos os pedidos RASCUNHO do usuário em lote.

    Usado ao final da janela de solicitações — manual (auto_submitted=False)
    ou automático pelo front-end quando a janela encerra (auto_submitted=True).
    Idempotente: se não houver RASCUNHO retorna lista vazia sem erro.
    """
    result = await db.execute(
        select(Pedido)
        .where(Pedido.usuario_id == current_user.id)
        .where(Pedido.status == StatusPedidoEnum.RASCUNHO)
        .order_by(Pedido.prioridade)
    )
    pedidos = result.scalars().all()

    if not pedidos:
        return []

    for pedido in pedidos:
        pedido.status = StatusPedidoEnum.AGUARDANDO_SUPERVISOR
        pedido.submetido_gestor_em = datetime.now(timezone.utc)
        pedido.auto_submitted = body.auto_submitted

    await db.commit()
    for pedido in pedidos:
        await db.refresh(pedido)

    return await _enrich(db, list(pedidos))


@router.post("/{pedido_id}/submit", response_model=PedidoOut)
async def submit(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.submit_pedido(db, pedido, current_user)


@router.put("/{pedido_id}/review", response_model=PedidoOut)
async def review(
    pedido_id: int,
    body: ReviewPedidoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    if body.acao != "observar":  # salvar observação é sempre permitido
        await _check_janela_open(db, current_user)
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.review_pedido(db, pedido, current_user, body.acao, body.motivo, body.observacoes)


class ConsolidateRequest(BaseModel):
    pedido_ids: list[int]


@router.post("/consolidate")
async def consolidate(
    body: ConsolidateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(*GESTOR_PROFILES)),
):
    await _check_janela_open(db, current_user)
    return await pedido_service.consolidate_pedidos(db, body.pedido_ids, current_user)


@router.put("/{pedido_id}/assign-cgeo", response_model=PedidoOut)
async def assign_cgeo(
    pedido_id: int,
    body: AssignCGEORequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.assign_cgeo(db, pedido, body.cgeo_id, current_user)


@router.put("/{pedido_id}/cgeo-review", response_model=PedidoOut)
async def cgeo_review(
    pedido_id: int,
    body: CGEOReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    return await pedido_service.cgeo_review(db, pedido, current_user, body.acao, body.motivo, body.link_bdgex)


@router.get("/cgeo-atendimento", response_model=list[PedidoOut])
async def cgeo_list_atendimento(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.ANALISTA_CGEO)),
):
    """CGEO: lista pedidos em atendimento (APROVADO) — candidatos a 'Dar Pronto'."""
    result = await db.scalars(
        select(Pedido)
        .where(
            Pedido.status == StatusPedidoEnum.APROVADO,
            Pedido.cgeo_id == current_user.cgeo_id,
        )
        .order_by(Pedido.aprovado_em.asc())
    )
    return await _enrich(db, list(result))


@router.get("/admin/all", response_model=list[PedidoOut])
async def admin_list_all(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
    status: str | None = Query(default=None),
    orgao_vinculante: str | None = Query(default=None),
    q: str | None = Query(default=None),
):
    """Gestor Cartográfico (DSG): lista TODOS os pedidos do sistema independente de status."""
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

    # Free-text filter (nome do solicitante ou INOM) — aplicado após enrich
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
    """DSG: exporta pedidos (filtráveis por ID / status) como ZIP completo
    (GeoJSONs por escala + CSV + relatório TXT por pedido).
    """
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


@router.put("/reorder")
async def reorder_pedidos(
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Reordena pedidos por prioridade. ordered_ids[0] = maior prioridade."""
    allowed = {PerfilEnum.SOLICITANTE, PerfilEnum.SUPERVISOR, PerfilEnum.CONSOLIDADOR}
    if current_user.perfil not in allowed:
        raise HTTPException(status_code=403, detail="Perfil não autorizado")
    # Busca todos de uma vez (1 query) ao invés de N db.get() individuais
    from sqlalchemy import update as sa_update
    for rank, pid in enumerate(body.ordered_ids, start=1):
        await db.execute(
            sa_update(Pedido).where(Pedido.id == pid).values(prioridade=rank)
        )
    await db.commit()
    return {"reordenados": len(body.ordered_ids)}


@router.put("/{pedido_id}/items/reorder")
async def reorder_items(
    pedido_id: int,
    body: ReorderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Reordena itens dentro de um pedido por prioridade."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    from sqlalchemy import update as sa_update
    for rank, item_id in enumerate(body.ordered_ids, start=1):
        await db.execute(
            sa_update(ItemPedido)
            .where(ItemPedido.id == item_id, ItemPedido.pedido_id == pedido_id)
            .values(prioridade=rank)
        )
    await db.commit()
    return {"reordenados": len(body.ordered_ids)}


class SolicitarRemocaoRequest(BaseModel):
    justificativa: str


@router.put("/{pedido_id}", response_model=PedidoOut)
async def update_pedido(
    pedido_id: int,
    body: PedidoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Usuário edita metadados do pedido (somente RASCUNHO ou DEVOLVIDO)."""
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    editable = {StatusPedidoEnum.RASCUNHO, StatusPedidoEnum.DEVOLVIDO}
    if pedido.status not in editable:
        raise HTTPException(status_code=400, detail="Pedido não pode ser editado neste estágio")

    if body.data_entrega is not None:
        pedido.data_entrega = body.data_entrega
    if body.finalidade_geo is not None:
        pedido.finalidade_geo = body.finalidade_geo
    if body.finalidade is not None:
        pedido.finalidade = body.finalidade
    if body.operacao_id is not None:
        pedido.operacao_id = body.operacao_id

    await db.commit()
    await db.refresh(pedido)
    enriched = await _enrich(db, [pedido])
    return enriched[0]


@router.post("/{pedido_id}/solicitar-remocao")
async def solicitar_remocao(
    pedido_id: int,
    body: SolicitarRemocaoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Solicita remoção ao Supervisor (somente enquanto AGUARDANDO_SUPERVISOR)."""
    from app.models.notificacao import Notificacao

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if pedido.status != StatusPedidoEnum.AGUARDANDO_SUPERVISOR:
        raise HTTPException(
            status_code=400,
            detail="Remoção só pode ser solicitada enquanto o pedido aguarda revisão do Supervisor (C. Mil. A)",
        )

    # Busca supervisor pela Região Militar do pedido
    gestores = await db.scalars(
        select(Usuario).where(
            Usuario.perfil == PerfilEnum.SUPERVISOR,
            Usuario.regiao_militar == pedido.regiao_militar,
            Usuario.ativo == True,
        )
    )
    for g in list(gestores):
        db.add(Notificacao(
            usuario_id=g.id,
            titulo=f"Solicitação de remoção — Pedido #{pedido.id}",
            mensagem=(
                f"{current_user.nome} solicita remoção do pedido #{pedido.id}. "
                f"Justificativa: {body.justificativa}"
            ),
            pedido_id=pedido.id,
        ))
    await db.commit()
    return {"message": "Solicitação de remoção enviada ao Supervisor"}


@router.get("/{pedido_id}/features")
async def get_pedido_features(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """GeoJSON das geometrias de um pedido específico (para espacialização)."""
    from app.services.bdgex_service import get_inom_geometries

    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Owner ou qualquer gestor pode ver
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
                    "inom": item.inom,
                    "mi": item.mi,
                    "tipo_produto": item.tipo_produto.value,
                    "escala": item.escala.value,
                },
            })
    return {"type": "FeatureCollection", "features": features}


@router.delete("/{pedido_id}")
async def cancel_pedido(
    pedido_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    pedido = await db.get(Pedido, pedido_id)
    if not pedido:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if pedido.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    cancelable = {
        StatusPedidoEnum.RASCUNHO,
        StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
        StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
    }
    if pedido.status not in cancelable:
        raise HTTPException(status_code=400, detail="Pedido não pode ser cancelado neste estágio")
    pedido.status = StatusPedidoEnum.CANCELADO
    from datetime import datetime, timezone
    pedido.cancelado_em = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Pedido cancelado"}
