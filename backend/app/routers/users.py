import csv
import io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.dependencies import get_current_user, require_profiles
from app.models.user import Usuario
from app.models.notificacao import Notificacao
from app.models.enums import PerfilEnum
from app.schemas.user import (
    UsuarioOut, UsuarioUpdateRequest, ChangePasswordRequest,
    UpdateProfileRequest, AdminDadosOrgRequest, NotificacaoOut
)
from app.schemas.pedido import TransferirPedidosRequest
from app.utils.security import verify_password, get_password_hash
from app.services import pedido_service
from app.services.email_service import send_email
from app.utils.email_templates import (
    conta_ativada as tpl_conta_ativada,
    dados_organizacionais_atualizados as tpl_dados_org,
    senha_alterada as tpl_senha_alterada,
)

router = APIRouter(prefix="/users", tags=["Usuários"])


@router.get("/me", response_model=UsuarioOut)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UsuarioOut)
async def update_me(
    body: UsuarioUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if body.telefone is not None:
        current_user.telefone = body.telefone
    if body.secao_om is not None:
        current_user.secao_om = body.secao_om
    if body.posto_graduacao is not None:
        current_user.posto_graduacao = body.posto_graduacao
    # OM e Região Militar só podem ser alterados após a herança ser executada
    if body.om is not None or body.regiao_militar is not None:
        if current_user.pedidos_transferidos_em is None:
            from fastapi import HTTPException as _HTTPException
            raise _HTTPException(
                status_code=400,
                detail="Execute a herança de solicitações antes de alterar OM ou Região Militar.",
            )
        if body.om is not None:
            current_user.om = body.om
        if body.regiao_militar is not None:
            current_user.regiao_militar = body.regiao_militar
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put("/me/password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if not verify_password(body.senha_atual, current_user.senha_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    current_user.senha_hash = get_password_hash(body.nova_senha)
    current_user.ultima_senha_alterada = datetime.now(timezone.utc)
    await db.commit()
    try:
        subject, html = tpl_senha_alterada(current_user.nome, current_user.email)
        await send_email(current_user.email, subject, html)
    except Exception:
        pass  # falha de e-mail não reverte a alteração de senha
    return {"message": "Senha alterada com sucesso"}


@router.post("/me/confirm-data")
async def confirm_data(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    current_user.ultima_confirmacao_dados = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Dados confirmados"}


@router.get("/me/notifications/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna apenas o número de notificações não lidas - endpoint leve para polling."""
    count = await db.scalar(
        select(func.count()).select_from(Notificacao)
        .where(Notificacao.usuario_id == current_user.id, Notificacao.lida == False)
    )
    return {"unread": count or 0}


@router.get("/me/notifications", response_model=list[NotificacaoOut])
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    result = await db.scalars(
        select(Notificacao)
        .where(Notificacao.usuario_id == current_user.id)
        .order_by(Notificacao.criado_em.desc())
        .limit(50)
    )
    return list(result)


@router.put("/me/notifications/{notif_id}/read")
async def mark_read(
    notif_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    notif = await db.get(Notificacao, notif_id)
    if not notif or notif.usuario_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    notif.lida = True
    await db.commit()
    return {"message": "Notificação marcada como lida"}


@router.get("/mesma-om", response_model=list[UsuarioOut])
async def list_mesma_om(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Retorna todos os usuários ativos da mesma OM do usuário logado (exceto ele mesmo).

    Usado na tela de herança de pedidos para listar candidatos a herdeiro.
    Qualquer perfil autenticado pode acessar - filtragem por OM garante o escopo.
    """
    result = await db.scalars(
        select(Usuario)
        .where(
            Usuario.om == current_user.om,
            Usuario.id != current_user.id,
            Usuario.ativo == True,
        )
        .order_by(Usuario.nome)
    )
    return list(result)


@router.get("/", response_model=list[UsuarioOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    result = await db.scalars(select(Usuario).order_by(Usuario.nome))
    return list(result)


# ── Exportação do cadastro de usuários ────────────────────────────────────────

# Rótulo legível de cada Comando Militar de Área (código gravado em
# usuario.regiao_militar). Espelha CMILA_LABELS em frontend/src/types/user.ts.
CMILA_LABELS: dict[str, str] = {
    "CMP":  "Comando Militar do Planalto (Brasília)",
    "CML":  "C Mil Leste (Rio de Janeiro)",
    "CMS":  "C Mil Sul (Porto Alegre)",
    "CMO":  "C Mil Oeste (Campo Grande)",
    "CMAO": "C Mil Amazônia Oriental (Belém)",
    "CMA":  "C Mil Amazônia (Manaus)",
    "CMNE": "C Mil Nordeste (Recife)",
    "CMSE": "C Mil Sudeste (São Paulo)",
}


def _situacao_cadastro(u: Usuario, agora: datetime) -> str:
    """Resume em uma palavra a situação do cadastro, na ordem de precedência
    usada pela tela Gerenciar Usuários."""
    if u.bloqueado_ate and u.bloqueado_ate > agora:
        return "BLOQUEADO"
    if not u.email_confirmado:
        return "E-MAIL NAO CONFIRMADO"
    if not u.ativo:
        return "INATIVO"
    return "ATIVO"


def _fmt_dt(valor: datetime | None) -> str:
    return valor.strftime("%d/%m/%Y %H:%M") if valor else ""


@router.get("/export")
async def exportar_usuarios(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
    regiao_militar: str | None = Query(
        None, description="Filtra por Comando Militar de Área (ex.: CMP, CML)"
    ),
    perfil: PerfilEnum | None = Query(None, description="Filtra por perfil"),
    apenas_ativos: bool = Query(False, description="Exporta somente cadastros ativos"),
):
    """Exporta o cadastro de usuários e a situação de cada um como CSV.

    Filtros são opcionais e combináveis; sem nenhum, exporta todos os usuários.
    """
    stmt = select(Usuario)
    if regiao_militar:
        stmt = stmt.where(Usuario.regiao_militar == regiao_militar)
    if perfil:
        stmt = stmt.where(Usuario.perfil == perfil)
    if apenas_ativos:
        stmt = stmt.where(Usuario.ativo.is_(True))
    stmt = stmt.order_by(Usuario.nome)

    usuarios = list(await db.scalars(stmt))
    agora = datetime.now(timezone.utc)

    buf = io.StringIO()
    writer = csv.writer(buf, dialect="excel", delimiter=";")
    writer.writerow([
        "ID", "Nome", "Nome_de_Guerra", "Posto_Graduacao", "Email",
        "Telefone", "Telefone_Ritex", "OM", "Secao_OM",
        "C_Mil_A", "C_Mil_A_Nome", "Orgao_Vinculante", "Perfil", "CGEO",
        "Situacao", "Ativo", "Email_Confirmado", "Bloqueado_Ate",
        "Tentativas_Login", "Ultima_Senha_Alterada", "Ultima_Confirmacao_Dados",
        "Criado_Em", "Atualizado_Em",
    ])
    for u in usuarios:
        writer.writerow([
            u.id,
            u.nome,
            u.nome_de_guerra or "",
            u.posto_graduacao or "",
            u.email,
            u.telefone or "",
            u.telefone_ritex or "",
            u.om,
            u.secao_om or "",
            u.regiao_militar or "",
            CMILA_LABELS.get(u.regiao_militar or "", ""),
            u.orgao_vinculante.value if u.orgao_vinculante else "",
            u.perfil.value,
            f"{u.cgeo_id}º CGEO" if u.cgeo_id else "",
            _situacao_cadastro(u, agora),
            "Sim" if u.ativo else "Nao",
            "Sim" if u.email_confirmado else "Nao",
            _fmt_dt(u.bloqueado_ate),
            u.tentativas_login,
            _fmt_dt(u.ultima_senha_alterada),
            _fmt_dt(u.ultima_confirmacao_dados),
            _fmt_dt(u.criado_em),
            _fmt_dt(u.atualizado_em),
        ])

    # BOM para o Excel abrir acentuação corretamente.
    conteudo = "\ufeff" + buf.getvalue()
    nome_arquivo = f"usuarios_sispgeo_{agora.strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([conteudo]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={nome_arquivo}"},
    )


@router.put("/{user_id}/profile")
async def update_profile(
    user_id: int,
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    user = await db.get(Usuario, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    user.perfil = body.perfil
    user.orgao_vinculante = body.orgao_vinculante
    user.cgeo_id = body.cgeo_id
    if body.regiao_militar is not None:
        user.regiao_militar = body.regiao_militar
    await db.commit()
    return {"message": "Perfil atualizado"}


@router.put("/{user_id}/dados-organizacionais", response_model=UsuarioOut)
async def admin_update_dados_org(
    user_id: int,
    body: AdminDadosOrgRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    """Atualiza OM, Região Militar e Órgão Vinculante de um usuário (somente DSG).

    Envia e-mail de notificação ao usuário informando os campos alterados.
    """
    user = await db.get(Usuario, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Rastreia apenas os campos que realmente mudam
    alteracoes: list[tuple[str, str, str]] = []

    if body.om and body.om.strip() != user.om:
        alteracoes.append(("OM", user.om or "-", body.om.strip()))
        user.om = body.om.strip()

    regiao_nova = body.regiao_militar or None
    if regiao_nova != user.regiao_militar:
        alteracoes.append(("Região Militar / C Mil A", user.regiao_militar or "-", regiao_nova or "-"))
        user.regiao_militar = regiao_nova

    orgao_novo = body.orgao_vinculante or None
    if orgao_novo != user.orgao_vinculante:
        alteracoes.append(("Órgão Vinculante", str(user.orgao_vinculante or "-"), str(orgao_novo or "-")))
        user.orgao_vinculante = orgao_novo

    if not alteracoes:
        return user  # nada mudou - retorna sem commit

    await db.commit()
    await db.refresh(user)

    # Notificação por e-mail (falha silenciosa - não reverte a atualização)
    try:
        subject, html = tpl_dados_org(
            nome=user.nome,
            admin_nome=current_user.nome,
            alteracoes=alteracoes,
        )
        await send_email(user.email, subject, html)
    except Exception:
        pass

    return user


@router.post("/{user_id}/transferir-pedidos")
async def transferir_pedidos(
    user_id: int,
    body: TransferirPedidosRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Transfere todos os pedidos ativos do usuário ``user_id`` para outro da mesma OM.

    Somente o próprio usuário ou um GESTOR_CARTOGRAFICO podem disparar a transferência.
    Os pedidos no estado RASCUNHO serão reatribuídos.
    O novo responsável recebe notificação in-app e e-mail.
    """
    if current_user.id != user_id and current_user.perfil != PerfilEnum.GESTOR_CARTOGRAFICO:
        raise HTTPException(status_code=403, detail="Acesso negado")

    source_user = await db.get(Usuario, user_id)
    if not source_user:
        raise HTTPException(status_code=404, detail="Usuário de origem não encontrado")

    novo = await db.get(Usuario, body.novo_responsavel_id)
    if not novo:
        raise HTTPException(status_code=404, detail="Novo responsável não encontrado")

    count = await pedido_service.transferir_pedidos(db, source_user, novo, current_user)
    return {"transferidos": count, "novo_responsavel": novo.nome}


@router.put("/{user_id}/activate")
async def toggle_activate(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(require_profiles(PerfilEnum.GESTOR_CARTOGRAFICO)),
):
    user = await db.get(Usuario, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    foi_inativo = not user.ativo
    user.ativo = not user.ativo

    # Ativação administrativa equivale à confirmação por e-mail:
    # garante que o usuário não seja barrado na tela de login por
    # "E-mail não confirmado" mesmo sem ter clicado no link de ativação.
    if user.ativo:
        user.email_confirmado = True

    await db.commit()

    if foi_inativo and user.ativo:
        try:
            subject, html = tpl_conta_ativada(user.nome, user.email)
            await send_email(user.email, subject, html)
        except Exception:
            pass  # falha de e-mail não reverte a ativação

    return {"message": f"Usuário {'ativado' if user.ativo else 'desativado'}"}
