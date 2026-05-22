import json
import os
from fastapi import APIRouter
from app.config import settings

router = APIRouter(prefix="/om", tags=["OM"])

_OMS_DATA: dict | None = None


def _load_oms() -> dict:
    global _OMS_DATA
    if _OMS_DATA is not None:
        return _OMS_DATA
    path = os.path.join(os.getenv("DADOS_PATH", "/app/dados"), "SOPEGEO", "oms_data.json")
    if not os.path.exists(path):
        _OMS_DATA = {}
        return _OMS_DATA
    with open(path, encoding="utf-8") as f:
        _OMS_DATA = json.load(f)
    return _OMS_DATA


@router.get("/")
async def list_oms():
    """Return OM list grouped by Comando Militar."""
    return _load_oms()
