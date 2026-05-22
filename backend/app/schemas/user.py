from datetime import datetime
from pydantic import BaseModel
from app.models.enums import PerfilEnum, OrgaoVinculanteEnum, PostoGraduacaoEnum


class UsuarioOut(BaseModel):
    id: int
    nome: str
    email: str
    telefone: str | None
    telefone_ritex: str | None
    secao_om: str | None
    om: str
    regiao_militar: str | None
    posto_graduacao: str | None
    perfil: PerfilEnum
    orgao_vinculante: OrgaoVinculanteEnum | None
    cgeo_id: int | None
    ativo: bool
    email_confirmado: bool
    ultima_senha_alterada: datetime | None
    ultima_confirmacao_dados: datetime | None
    pedidos_transferidos_em: datetime | None
    tentativas_login: int
    bloqueado_ate: datetime | None
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


class UsuarioUpdateRequest(BaseModel):
    telefone: str | None = None
    telefone_ritex: str | None = None
    secao_om: str | None = None
    # Campos desbloqueados após herança de pedidos executada
    om: str | None = None
    regiao_militar: str | None = None
    posto_graduacao: str | None = None


class ChangePasswordRequest(BaseModel):
    senha_atual: str
    nova_senha: str


class UpdateProfileRequest(BaseModel):
    perfil: PerfilEnum
    orgao_vinculante: OrgaoVinculanteEnum | None = None
    cgeo_id: int | None = None


class NotificacaoOut(BaseModel):
    id: int
    titulo: str
    mensagem: str
    lida: bool
    pedido_id: int | None
    criado_em: datetime

    model_config = {"from_attributes": True}
