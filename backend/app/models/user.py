from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.enums import PerfilEnum, OrgaoVinculanteEnum, PostoGraduacaoEnum


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    nome_de_guerra: Mapped[str | None] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    telefone: Mapped[str | None] = mapped_column(String(20))
    telefone_ritex: Mapped[str | None] = mapped_column(String(10))   # formato NNN-NNNN (Ritex)
    secao_om: Mapped[str | None] = mapped_column(String(200))
    om: Mapped[str] = mapped_column(String(200), nullable=False)
    posto_graduacao: Mapped[str | None] = mapped_column(String(50))
    regiao_militar: Mapped[str | None] = mapped_column(String(20))
    perfil: Mapped[PerfilEnum] = mapped_column(
        SAEnum(PerfilEnum, name="perfil_enum"),
        nullable=False,
        default=PerfilEnum.SOLICITANTE,
    )
    orgao_vinculante: Mapped[OrgaoVinculanteEnum | None] = mapped_column(
        SAEnum(OrgaoVinculanteEnum, name="orgao_vinculante_enum")
    )
    cgeo_id: Mapped[int | None] = mapped_column(Integer)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    email_confirmado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ultima_senha_alterada: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ultima_confirmacao_dados: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pedidos_transferidos_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tentativas_login: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bloqueado_ate: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activation_email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TokenSenha(Base):
    __tablename__ = "tokens_senha"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(Integer, nullable=False)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
