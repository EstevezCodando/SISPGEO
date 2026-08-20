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
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
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
from app.models.audit_log import AuditLog
from app.models.pedido import Pedido
from app.models.prioridade import PrioridadeEncaminhamento
from app.models.user import Usuario
from app.services.prioridade_service import ciclo_atual
from app.utils.busca import normalizar

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


# ── Leitura tolerante de planilha ────────────────────────────────────────────
# O gestor sobe o arquivo **como o consolidador enviou**. Cada consolidador
# nomeia as colunas do seu jeito (o COTER usa ``ORDEM`` e ``NR PEDIDO #``),
# salva no encoding do Excel dele (CP1252 no Windows pt-BR) e com o separador
# da sua região. Exigir um formato fixo obrigaria o gestor a transcrever a
# lista para outro arquivo — e a transcrição manual é justamente onde o erro
# entra.

# Apelidos aceitos, em ordem de preferência: o primeiro que casar vence.
# `sequencia` fica de fora de propósito — é o nome de uma coluna da nossa
# própria exportação, que guarda o escopo e não um número de ordem.
_ALIAS_PEDIDO = (
    "pedido id", "nr pedido", "nr do pedido",
    # `Nº` vira `no` na normalização NFKD — grafia comum em planilha brasileira.
    "no do pedido", "no pedido", "n do pedido", "n pedido",
    "numero do pedido", "numero pedido", "pedido", "id",
)
_ALIAS_PRIORIDADE = (
    "nova prioridade", "ordem", "prioridade", "prio",
)


def _chave_cabecalho(nome: str) -> str:
    """Reduz um cabeçalho à forma comparável: sem acento, caixa ou pontuação.

    ``NR PEDIDO #`` vira ``nr pedido``; ``Pedido_ID`` vira ``pedido id``.
    """
    base = normalizar(nome or "")
    return " ".join(re.sub(r"[^0-9a-z]+", " ", base).split())


def detectar_colunas(cabecalhos: list[str]) -> tuple[str | None, str | None]:
    """Descobre qual coluna traz o número do pedido e qual traz a prioridade."""
    chaves = {c: _chave_cabecalho(c) for c in cabecalhos if c and c.strip()}

    def _primeira(aliases: tuple[str, ...]) -> str | None:
        for alias in aliases:
            for original, chave in chaves.items():
                if chave == alias:
                    return original
        return None

    return _primeira(_ALIAS_PEDIDO), _primeira(_ALIAS_PRIORIDADE)


def decodificar(bruto: bytes) -> str:
    """Decodifica o CSV tentando os encodings que o Excel realmente produz."""
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return bruto.decode(enc)
        except UnicodeDecodeError:
            continue
    # latin-1 aceita qualquer byte — este ramo é inalcançável na prática.
    return bruto.decode("latin-1", errors="replace")


def detectar_separador(cabecalho: str) -> str:
    """Escolhe o separador pelo que mais aparece na linha de cabeçalho."""
    return max((";", ",", "\t"), key=cabecalho.count)


def ler_planilha(
    conteudo: str,
    coluna_pedido: str | None = None,
    coluna_prioridade: str | None = None,
) -> tuple[dict[int, int], dict, list[str]]:
    """Extrai ``{pedido_id: prioridade}`` de uma planilha de consolidador.

    Args:
        conteudo:          Texto já decodificado do CSV.
        coluna_pedido:     Força a coluna do número do pedido (opcional).
        coluna_prioridade: Força a coluna da prioridade (opcional).

    Returns:
        ``(mapa, meta, erros)`` — ``meta`` traz os cabeçalhos lidos, as colunas
        efetivamente usadas e quantas linhas foram ignoradas.
    """
    texto = conteudo.lstrip("﻿")
    linhas_texto = texto.splitlines()
    if not linhas_texto:
        return {}, {"cabecalhos": [], "linhas_ignoradas": 0}, ["Arquivo vazio"]

    leitor = csv.DictReader(
        io.StringIO(texto), delimiter=detectar_separador(linhas_texto[0])
    )
    cabecalhos = [c for c in (leitor.fieldnames or []) if c and c.strip()]
    meta: dict = {"cabecalhos": cabecalhos, "linhas_ignoradas": 0}

    auto_pedido, auto_prioridade = detectar_colunas(cabecalhos)
    col_pedido = coluna_pedido or auto_pedido
    col_prioridade = coluna_prioridade or auto_prioridade
    meta["colunas_detectadas"] = {"pedido": col_pedido, "prioridade": col_prioridade}

    ausentes = []
    if not col_pedido:
        ausentes.append("o número do pedido")
    if not col_prioridade:
        ausentes.append("a prioridade")
    if ausentes:
        return {}, meta, [
            "Não identifiquei a coluna com " + " nem ".join(ausentes) + ". "
            f"Colunas encontradas: {', '.join(cabecalhos) or '(nenhuma)'}. "
            "Selecione a coluna correta na tela."
        ]

    novas: dict[int, int] = {}
    erros: list[str] = []
    ignoradas = 0

    for n, linha in enumerate(leitor, start=2):   # linha 1 é o cabeçalho
        bruto_id = (linha.get(col_pedido) or "").strip()
        bruto_prio = (linha.get(col_prioridade) or "").strip()

        # Linha totalmente vazia (rodapé de planilha) — nem conta.
        if not bruto_id and not bruto_prio:
            continue

        # Prioridade não numérica: é como o consolidador marca a linha que não
        # entra na ordem — o COTER usa "XX" para pedido a excluir. Decisão do
        # usuário: ignorar em silêncio, sem virar erro.
        try:
            prioridade = int(bruto_prio)
        except ValueError:
            ignoradas += 1
            continue

        try:
            pedido_id = int(bruto_id)
        except ValueError:
            erros.append(f"Linha {n}: número de pedido inválido ({bruto_id!r})")
            continue

        if prioridade < 1:
            erros.append(f"Linha {n}: prioridade deve ser 1 ou maior (pedido {pedido_id})")
            continue
        if pedido_id in novas:
            erros.append(f"Linha {n}: pedido {pedido_id} aparece mais de uma vez na planilha")
            continue

        novas[pedido_id] = prioridade

    meta["linhas_ignoradas"] = ignoradas
    return novas, meta, erros


def conflitos_de_prioridade(
    novas: dict[int, int], pedidos: dict[int, Pedido]
) -> list[str]:
    """Dentro de um mesmo escalão, dois pedidos não podem dividir o número.

    É exatamente o defeito que esta ferramenta veio consertar, então a regra
    vale tanto na análise quanto na gravação.
    """
    vistos: dict[tuple[str, int], int] = {}
    conflitos: list[str] = []
    for pid, prioridade in sorted(novas.items()):
        pedido = pedidos.get(pid)
        if pedido is None:
            continue
        chave = (escopo_remetente(pedido), prioridade)
        if chave in vistos:
            conflitos.append(
                f"Prioridade {prioridade} repetida em {chave[0]}: "
                f"pedidos {vistos[chave]} e {pid}"
            )
        else:
            vistos[chave] = pid
    return conflitos


async def gravar_prioridades(
    db: AsyncSession,
    novas: dict[int, int],
    pedidos: dict[int, Pedido],
    autor_id: int | None,
) -> set[str]:
    """Grava as prioridades e reescreve o histórico dos escalões afetados.

    Não valida — o chamador é responsável por isso. Não faz commit, para que a
    operação inteira caiba numa transação de quem chamou.

    Returns:
        Conjunto dos escopos tocados.
    """
    ciclo = await ciclo_atual(db)
    escopos = {escopo_remetente(p) for p in pedidos.values()}

    # Reescrever o histórico exige limpar os registros do escalão antes, senão
    # a UNIQUE(escopo, ciclo, prioridade) barra estados intermediários.
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
                definida_por_id=autor_id,
            )
        )

    db.add(AuditLog(
        usuario_id=autor_id,
        acao="importar_prioridades",
        entidade="pedido",
        entidade_id=min(novas) if novas else None,
        dados_extras={
            "escopos": sorted(escopos),
            "ciclo": ciclo,
            "aplicadas": {str(k): v for k, v in novas.items()},
        },
    ))
    return escopos


@router.post("/planilha/analisar")
async def analisar_planilha(
    arquivo: UploadFile = File(...),
    coluna_pedido: str | None = Form(default=None),
    coluna_prioridade: str | None = Form(default=None),
    escopo_esperado: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Lê a planilha e devolve o que mudaria — **sem gravar nada**.

    O gestor confere o resultado na tela e só então confirma em
    ``POST /prioridades/aplicar``. Nenhuma escrita acontece aqui.

    ``escopo_esperado`` (ex.: ``CONSOLIDADOR_COTER``) restringe a análise aos
    pedidos daquele escalão; os demais são listados à parte e não entram no
    total a aplicar.
    """
    conteudo = decodificar(await arquivo.read())
    if not conteudo.strip():
        raise HTTPException(status_code=422, detail="Arquivo vazio")

    novas, meta, erros = ler_planilha(conteudo, coluna_pedido, coluna_prioridade)
    if erros:
        raise HTTPException(status_code=422, detail={"erros": erros[:20], **meta})
    if not novas:
        raise HTTPException(
            status_code=422,
            detail={"erros": ["Nenhuma linha com prioridade numérica na planilha."], **meta},
        )

    pedidos = {
        p.id: p for p in await db.scalars(select(Pedido).where(Pedido.id.in_(novas.keys())))
    }
    ids_usuarios = {p.usuario_id for p in pedidos.values()} or {0}
    solicitantes = {
        r.id: r for r in await db.execute(
            select(Usuario.id, Usuario.nome, Usuario.om).where(Usuario.id.in_(ids_usuarios))
        )
    }

    # ── Monta o diff, agrupado pelo escalão que encaminhou ───────────────────
    por_escalao: dict[str, dict] = {}
    problemas: list[dict] = []
    fora_do_escopo: list[dict] = []
    resumo = {"altera": 0, "sem_mudanca": 0, "nao_encontrado": 0,
              "fora_do_fluxo": 0, "fora_do_escopo": 0}

    for pid, prioridade in sorted(novas.items(), key=lambda kv: kv[1]):
        pedido = pedidos.get(pid)
        if pedido is None:
            problemas.append({"pedido_id": pid, "prioridade_nova": prioridade,
                              "situacao": "NAO_ENCONTRADO"})
            resumo["nao_encontrado"] += 1
            continue
        if pedido.status not in STATUS_SUBMETIDOS:
            problemas.append({"pedido_id": pid, "prioridade_nova": prioridade,
                              "situacao": "FORA_DO_FLUXO", "status": pedido.status.value})
            resumo["fora_do_fluxo"] += 1
            continue

        escopo = escopo_remetente(pedido)
        if escopo_esperado and escopo != escopo_esperado:
            fora_do_escopo.append({"pedido_id": pid, "prioridade_nova": prioridade,
                                   "escopo": escopo, "situacao": "FORA_DO_ESCOPO"})
            resumo["fora_do_escopo"] += 1
            continue

        grupo = por_escalao.setdefault(escopo, {
            "escopo": escopo,
            "escalao": _rotulo_escalao(escopo),
            "alteracoes": [],
            "ausentes_na_planilha": 0,
        })
        atual = pedido.prioridade or 0
        situacao = "SEM_MUDANCA" if atual == prioridade else "ALTERA"
        resumo["sem_mudanca" if situacao == "SEM_MUDANCA" else "altera"] += 1

        u = solicitantes.get(pedido.usuario_id)
        grupo["alteracoes"].append({
            "pedido_id": pid,
            "prioridade_atual": atual or None,
            "prioridade_nova": prioridade,
            "situacao": situacao,
            "status": pedido.status.value,
            "orgao_vinculante": pedido.orgao_vinculante.value if pedido.orgao_vinculante else None,
            "c_mil_a": pedido.regiao_militar,
            "om": getattr(u, "om", None),
            "solicitante": getattr(u, "nome", None),
        })

    # Conflitos apenas entre os pedidos que de fato entram na aplicação.
    aplicaveis = {
        a["pedido_id"]: a["prioridade_nova"]
        for g in por_escalao.values() for a in g["alteracoes"]
    }
    conflitos = conflitos_de_prioridade(aplicaveis, pedidos)

    # Pedidos do mesmo escalão que a planilha não citou continuam intactos —
    # decisão do usuário. Informar a contagem evita que isso passe batido.
    if por_escalao:
        no_sistema = await db.scalars(
            select(Pedido).where(Pedido.status.in_(STATUS_SUBMETIDOS))
        )
        for pedido in no_sistema:
            escopo = escopo_remetente(pedido)
            if escopo in por_escalao and pedido.id not in aplicaveis:
                por_escalao[escopo]["ausentes_na_planilha"] += 1

    return {
        **meta,
        "arquivo": arquivo.filename,
        "escopo_esperado": escopo_esperado,
        "resumo": resumo,
        "por_escalao": sorted(por_escalao.values(), key=lambda g: g["escopo"]),
        "problemas": problemas,
        "fora_do_escopo": fora_do_escopo,
        "conflitos": conflitos,
        "pode_aplicar": not conflitos and resumo["altera"] > 0,
    }


class AlteracaoPrioridade(BaseModel):
    pedido_id: int
    prioridade: int


class AplicarPrioridadesRequest(BaseModel):
    alteracoes: list[AlteracaoPrioridade]


@router.post("/aplicar")
async def aplicar_prioridades(
    body: AplicarPrioridadesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Grava as prioridades conferidas na tela. Tudo-ou-nada.

    Recebe o resultado já revisado em ``/planilha/analisar`` em vez de
    reprocessar o arquivo, para que o gravado seja exatamente o que o gestor
    viu. Ainda assim **revalida tudo aqui** — o cliente não é confiável.
    """
    if not body.alteracoes:
        raise HTTPException(status_code=422, detail="Nenhuma alteração informada")

    novas: dict[int, int] = {}
    erros: list[str] = []
    for a in body.alteracoes:
        if a.prioridade < 1:
            erros.append(f"Pedido {a.pedido_id}: prioridade deve ser 1 ou maior")
            continue
        if a.pedido_id in novas:
            erros.append(f"Pedido {a.pedido_id} informado mais de uma vez")
            continue
        novas[a.pedido_id] = a.prioridade
    if erros:
        raise HTTPException(status_code=422, detail={"erros": erros[:20]})

    pedidos = {
        p.id: p for p in await db.scalars(select(Pedido).where(Pedido.id.in_(novas.keys())))
    }
    faltando = sorted(set(novas) - set(pedidos))
    if faltando:
        raise HTTPException(
            status_code=422,
            detail={"erros": [f"Pedidos inexistentes: {', '.join(map(str, faltando[:20]))}"]},
        )

    nao_submetidos = [pid for pid, p in pedidos.items() if p.status not in STATUS_SUBMETIDOS]
    if nao_submetidos:
        raise HTTPException(
            status_code=422,
            detail={"erros": [
                "Só é possível organizar pedidos já submetidos. "
                f"Fora do fluxo: {', '.join(map(str, sorted(nao_submetidos)[:20]))}"
            ]},
        )

    conflitos = conflitos_de_prioridade(novas, pedidos)
    if conflitos:
        raise HTTPException(status_code=422, detail={"erros": conflitos[:20]})

    escopos = await gravar_prioridades(db, novas, pedidos, current_user.id)
    await db.commit()

    logger.info(
        "aplicar_prioridades → %d pedidos reorganizados por %s (escalões: %s)",
        len(novas), current_user.email, ", ".join(sorted(escopos)),
    )
    return {"atualizados": len(novas), "escaloes": sorted(escopos)}
