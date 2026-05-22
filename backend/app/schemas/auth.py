import re
from pydantic import BaseModel, EmailStr, field_validator

EB_EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+\-]+@eb\.mil\.br$")
PASSWORD_PATTERN = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$")


class RegisterRequest(BaseModel):
    nome: str
    email: str
    telefone: str
    telefone_ritex: str | None = None   # NNN-NNNN (Ritex)
    om: str
    regiao_militar: str | None = None
    secao_om: str
    senha: str
    orgao_vinculante: str | None = None
    posto_graduacao: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not EB_EMAIL_PATTERN.match(v):
            raise ValueError("Somente emails @eb.mil.br são aceitos")
        return v.lower()

    @field_validator("senha")
    @classmethod
    def validate_senha(cls, v: str) -> str:
        if not PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Senha deve ter mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial"
            )
        return v

    @field_validator("nome")
    @classmethod
    def validate_nome(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Nome deve ter ao menos 3 caracteres")
        return v


class LoginRequest(BaseModel):
    email: str
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    nova_senha: str

    @field_validator("nova_senha")
    @classmethod
    def validate_senha(cls, v: str) -> str:
        if not PASSWORD_PATTERN.match(v):
            raise ValueError(
                "Senha deve ter mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial"
            )
        return v
