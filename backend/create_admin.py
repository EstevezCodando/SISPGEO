"""
Script para criar o usuário admin DSG inicial.
Execute DENTRO do container backend após o sistema subir:
  docker exec sispgeo_backend python create_admin.py
"""
import asyncio
from app.database import AsyncSessionLocal, engine, Base
from app.models.user import Usuario
from app.models.enums import PerfilEnum
from app.utils.security import get_password_hash
from sqlalchemy import select
from datetime import datetime, timezone


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(Usuario).where(Usuario.email == "admin@eb.mil.br"))
        if existing:
            print("Usuário admin@eb.mil.br já existe.")
            return

        user = Usuario(
            nome="Administrador DSG",
            email="admin@eb.mil.br",
            telefone="(61) 3415-0000",
            secao_om="Seção de TI",
            om="DSG",
            perfil=PerfilEnum.GESTOR_CARTOGRAFICO,
            senha_hash=get_password_hash("Admin@1234"),
            ativo=True,
            email_confirmado=True,
            ultima_senha_alterada=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.commit()
        print("✓ Admin criado: admin@eb.mil.br / Admin@1234")
        print("IMPORTANTE: Troque a senha imediatamente após o primeiro acesso!")


if __name__ == "__main__":
    asyncio.run(main())
