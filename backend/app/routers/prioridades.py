"""Reorganização em massa das prioridades por planilha.

Ferramenta corretiva do Gestor Cartográfico: exporta os pedidos já submetidos
com a prioridade atual e uma coluna editável, e reimporta a planilha aplicando
a nova ordem.

Existe porque o arrasto gravava ``1..N`` sobre a fila pendente e cada leva
enviada saía dela — a leva seguinte reaproveitava os números. O passivo desse
defeito são pedidos distintos com a mesma prioridade, que só a intervenção
manual consegue desempatar segundo a intenção de quem priorizou.

A importação é **tudo-ou-nada**: valida a planilha inteira antes de gravar
qualquer linha. Uma planilha com erro não deixa o banco pela metade.
"""

import csv
import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_profiles
from app.models.enums import (
    DIRETORIA_TO_SUPERVISOR,
    OrgaoVinculanteEnum,
    PerfilEnum,
    StatusPedidoEnum,
)
from app.models.pedido import Pedido
from app.models.prioridade import PrioridadeEncaminhamento
from app.models.user import Usuario
from app.services.prioridade_service import ciclo_atual

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prioridades", tags=["Prioridades"])

# Cabeçalho da planilha. Só `Nova_Prioridade` é lida na importação — as demais
# colunas existem para o operador saber o que está reordenando.
COLUNAS = [
    "Pedido_ID", "Nova_Prioridade", "Prioridade_Atual",
    "Escalao_Remetente", "Sequencia",
    "Status", "Orgao_Vinculante", "C_Mil_A", "OM", "Solicitante",
    "Leva_Enviada_Em",
]

# Status já submetidos — rascunho e cancelado não têm prioridade a organizar.
STATUS_SUBMETIDOS = [
    StatusPedidoEnum.AGUARDANDO_SUPERVISOR,
    StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR,
    StatusPedidoEnum.AGUARDANDO_CARTOGRAFICO,
    StatusPedidoEnum.ATRIBUIDO_CGEO,
    StatusPedidoEnum.APROVADO,
    StatusPedidoEnum.PRODUZIDO,
]

_ORGAO_PARA_CONSOLIDADOR: dict[OrgaoVinculanteEnum, str] = {
    OrgaoVinculanteEnum.COTER: "CONSOLIDADOR_COTER",
    OrgaoVinculanteEnum.DSG:   "CONSOLIDADOR_DSG",
    OrgaoVinculanteEnum.DEC:   "CONSOLIDADOR_DEC",
    OrgaoVinculanteEnum.COLOG: "CONSOLIDADOR_COLOG",
    OrgaoVinculanteEnum.DECEx: "CONSOLIDADOR_DECEX",
    OrgaoVinculanteEnum.DCT:   "CONSOLIDADOR_DSG",   # legado
}

_RM_PARA_SUPERVISOR: dict[str, str] = {
    "CMP": "SUPERVISOR_CMP", "CML": "SUPERVISOR_CML", "CMS": "SUPERVISOR_CMS",
    "CMO": "SUPERVISOR_CMO", "CMAO": "SUPERVISOR_CMAO", "CMA": "SUPERVISOR_CMA",
    "CMNE": "SUPERVISOR_CMNE", "CMSE": "SUPERVISOR_CMSE",
}


def escopo_remetente(pedido: Pedido) -> str:
    """Qual escalão encaminhou este pedido, deduzido do status em que ele parou.

    Os pedidos anteriores à criação do histórico não têm carimbo, então a
    origem precisa ser inferida: quem está aguardando o supervisor foi enviado
    pelo solicitante, quem aguarda o consolidador veio do supervisor, e daí em
    diante veio do consolidador do órgão.
    """
    if pedido.status == StatusPedidoEnum.AGUARDANDO_SUPERVISOR:
        return f"SOLICITANTE:{pedido.usuario_id}"

    if pedido.status == StatusPedidoEnum.AGUARDANDO_CONSOLIDADOR:
        if pedido.orgao_vinculante == OrgaoVinculanteEnum.DECEx and pedido.diretoria:
            perfil = DIRETORIA_TO_SUPERVISOR.get(pedido.diretoria)
            if perfil:
                return perfil.value
        rm = _RM_PARA_SUPERVISOR.get(pedido.regiao_militar or "")
        return rm or f"SUPERVISOR_SEM_RM:{pedido.orgao_vinculante.value}"

    return _ORGAO_PARA_CONSOLIDADOR.get(pedido.orgao_vinculante, "CONSOLIDADOR_DESCONHECIDO")


def _rotulo_escalao(escopo: str) -> str:
    if escopo.startswith("SOLICITANTE"):
        return "SOLICITANTE"
    if escopo.startswith("SUPERVISOR"):
        return "SUPERVISOR"
    return "CONSOLIDADOR"


def _chave_ordenacao(p: Pedido):
    """Ordem em que os pedidos aparecem hoje: leva, depois prioridade."""
    return (
        p.encaminhado_em or datetime.max.replace(tzinfo=timezone.utc),
        1 if not p.prioridade else 0,
        p.prioridade or 0,
        p.criado_em,
    )


def prioridades_integras(pedidos: list[Pedido]) -> bool:
    """Diz se as prioridades deste escalão sobreviveram intactas.

    Íntegras = todas preenchidas e sem repetição. Nesse caso elas são a decisão
    original de quem priorizou e devem ser respeitadas. Havendo repetição, a
    numeração foi corrompida pelo defeito do arrasto e o único sinal confiável
    que resta é a ordem das levas.
    """
    prios = [p.prioridade or 0 for p in pedidos]
    return 0 not in prios and len(set(prios)) == len(prios)


def sequencias_corrigidas(pedidos: list[Pedido]) -> dict[int, int]:
    """Renumera cada escalão em ``1..N``, sem duplicatas, preservando a intenção.

    O critério muda conforme o estado dos dados daquele escalão:

    * **prioridades íntegras** → ordena por prioridade. Foi a decisão explícita
      de quem priorizou, e a data de envio não a contradiz: ``submit_pedido``
      grava um horário por pedido, então uma leva enviada de uma vez aparece
      com horários ligeiramente diferentes e não serve para agrupar nada.
    * **prioridades repetidas** → ordena por leva e, dentro dela, por
      prioridade. É o caso em que o arrasto reaproveitou números; a leva é o
      que separa um envio do outro.

    Aplicar a regra da leva a um escalão íntegro inverteria a ordem — no
    supervisor CMP, por exemplo, a intenção 1030,1040,1025,1024,1036,1022,1008
    viraria 1030,1008,1022,1024,1025,1040,1036.
    """
    por_escopo: dict[str, list[Pedido]] = {}
    for p in pedidos:
        por_escopo.setdefault(escopo_remetente(p), []).append(p)

    novas: dict[int, int] = {}
    for lista in por_escopo.values():
        if prioridades_integras(lista):
            ordenados = sorted(lista, key=lambda p: (p.prioridade, p.criado_em))
        else:
            ordenados = sorted(lista, key=_chave_ordenacao)
        for posicao, p in enumerate(ordenados, start=1):
            novas[p.id] = posicao
    return novas


@router.get("/planilha")
async def exportar_planilha(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Exporta os pedidos submetidos com a prioridade atual e uma coluna editável.

    ``Nova_Prioridade`` já vem preenchida com uma sequência sem duplicatas por
    escalão — basta conferir, ajustar o que quiser e reimportar.
    """
    pedidos = list(await db.scalars(
        select(Pedido).where(Pedido.status.in_(STATUS_SUBMETIDOS))
    ))
    if not pedidos:
        raise HTTPException(status_code=404, detail="Nenhum pedido submetido para organizar")

    solicitantes = {
        r.id: r for r in await db.execute(
            select(Usuario.id, Usuario.nome, Usuario.om).where(
                Usuario.id.in_({p.usuario_id for p in pedidos})
            )
        )
    }
    novas = sequencias_corrigidas(pedidos)

    buf = io.StringIO()
    writer = csv.writer(buf, dialect="excel", delimiter=";")
    writer.writerow(COLUNAS)
    for p in sorted(pedidos, key=lambda x: (escopo_remetente(x), novas[x.id])):
        escopo = escopo_remetente(p)
        u = solicitantes.get(p.usuario_id)
        writer.writerow([
            p.id,
            novas[p.id],
            p.prioridade or "",
            _rotulo_escalao(escopo),
            escopo,
            p.status.value,
            p.orgao_vinculante.value if p.orgao_vinculante else "",
            p.regiao_militar or "",
            getattr(u, "om", "") or "",
            getattr(u, "nome", "") or "",
            p.encaminhado_em.strftime("%d/%m/%Y %H:%M") if p.encaminhado_em else "",
        ])

    agora = datetime.now(timezone.utc)
    nome = f"prioridades_sispgeo_{agora.strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter(["﻿" + buf.getvalue()]),   # BOM para o Excel abrir acentuado
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={nome}"},
    )


def _ler_planilha(conteudo: str) -> tuple[dict[int, int], list[str]]:
    """Extrai ``{pedido_id: nova_prioridade}`` da planilha, acumulando os erros."""
    texto = conteudo.lstrip("﻿")
    # O separador é ';' (padrão do Excel pt-BR), mas aceita ',' se vier assim.
    dialeto = ";" if texto.splitlines()[0].count(";") >= texto.splitlines()[0].count(",") else ","
    leitor = csv.DictReader(io.StringIO(texto), delimiter=dialeto)

    if not leitor.fieldnames or "Pedido_ID" not in leitor.fieldnames:
        return {}, ["Planilha sem a coluna 'Pedido_ID' — use o arquivo exportado pelo sistema."]
    if "Nova_Prioridade" not in leitor.fieldnames:
        return {}, ["Planilha sem a coluna 'Nova_Prioridade'."]

    novas: dict[int, int] = {}
    erros: list[str] = []
    for n, linha in enumerate(leitor, start=2):   # linha 1 é o cabeçalho
        bruto_id = (linha.get("Pedido_ID") or "").strip()
        bruto_prio = (linha.get("Nova_Prioridade") or "").strip()
        if not bruto_id and not bruto_prio:
            continue
        try:
            pedido_id = int(bruto_id)
        except ValueError:
            erros.append(f"Linha {n}: Pedido_ID inválido ({bruto_id!r})")
            continue
        try:
            prioridade = int(bruto_prio)
        except ValueError:
            erros.append(f"Linha {n}: Nova_Prioridade inválida ({bruto_prio!r}) no pedido {pedido_id}")
            continue
        if prioridade < 1:
            erros.append(f"Linha {n}: Nova_Prioridade deve ser 1 ou maior (pedido {pedido_id})")
            continue
        if pedido_id in novas:
            erros.append(f"Linha {n}: pedido {pedido_id} aparece mais de uma vez na planilha")
            continue
        novas[pedido_id] = prioridade
    return novas, erros


@router.post("/planilha")
async def importar_planilha(
    arquivo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Aplica as prioridades da planilha. Valida tudo antes de gravar qualquer linha."""
    bruto = await arquivo.read()
    try:
        conteudo = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        conteudo = bruto.decode("latin-1")   # Excel pt-BR às vezes salva em ANSI
    if not conteudo.strip():
        raise HTTPException(status_code=422, detail="Arquivo vazio")

    novas, erros = _ler_planilha(conteudo)
    if erros:
        raise HTTPException(status_code=422, detail={"erros": erros[:20]})
    if not novas:
        raise HTTPException(status_code=422, detail="Nenhuma linha válida na planilha")

    pedidos = {
        p.id: p for p in await db.scalars(select(Pedido).where(Pedido.id.in_(novas.keys())))
    }
    faltando = sorted(set(novas) - set(pedidos))
    if faltando:
        raise HTTPException(
            status_code=422,
            detail={"erros": [f"Pedidos inexistentes: {', '.join(map(str, faltando[:20]))}"]},
        )

    nao_submetidos = [
        pid for pid, p in pedidos.items() if p.status not in STATUS_SUBMETIDOS
    ]
    if nao_submetidos:
        raise HTTPException(
            status_code=422,
            detail={"erros": [
                "Só é possível organizar pedidos já submetidos. "
                f"Fora do fluxo: {', '.join(map(str, sorted(nao_submetidos)[:20]))}"
            ]},
        )

    # Regra central: dentro de um mesmo escalão, dois pedidos não podem dividir
    # o mesmo número — é exatamente o defeito que esta ferramenta vem consertar.
    vistos: dict[tuple[str, int], int] = {}
    conflitos: list[str] = []
    for pid, prioridade in sorted(novas.items()):
        chave = (escopo_remetente(pedidos[pid]), prioridade)
        if chave in vistos:
            conflitos.append(
                f"Prioridade {prioridade} repetida em {chave[0]}: "
                f"pedidos {vistos[chave]} e {pid}"
            )
        else:
            vistos[chave] = pid
    if conflitos:
        raise HTTPException(status_code=422, detail={"erros": conflitos[:20]})

    # ── Validado: aplica tudo numa transação ────────────────────────────────
    ciclo = await ciclo_atual(db)
    escopos = {escopo_remetente(p) for p in pedidos.values()}

    # Reescrever o histórico exige limpar os registros do escalão antes, senão a
    # UNIQUE(escopo, ciclo, prioridade) barra estados intermediários.
    await db.execute(
        delete(PrioridadeEncaminhamento).where(
            PrioridadeEncaminhamento.pedido_id.in_(novas.keys()),
            PrioridadeEncaminhamento.escopo.in_(escopos),
            PrioridadeEncaminhamento.ciclo == ciclo,
        )
    )
    await db.flush()

    for pid, prioridade in novas.items():
        pedido = pedidos[pid]
        escopo = escopo_remetente(pedido)
        pedido.prioridade = prioridade
        pedido.ordem_fila = prioridade
        db.add(
            PrioridadeEncaminhamento(
                pedido_id=pid,
                escopo=escopo,
                escalao=_rotulo_escalao(escopo),
                ciclo=ciclo,
                prioridade=prioridade,
                definida_por_id=current_user.id,
            )
        )

    await db.commit()
    logger.info(
        "importar_planilha → %d pedidos reorganizados por %s (escalões: %s)",
        len(novas), current_user.email, ", ".join(sorted(escopos)),
    )
    return {
        "atualizados": len(novas),
        "escaloes": sorted(escopos),
    }
