import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.models.user import Usuario
from app.models.enums import EscalaEnum
from app.services.bdgex_service import get_grid_gz, get_inom_geometries

router = APIRouter(prefix="/map", tags=["Mapa"])


@router.get("/inom-grid")
async def inom_grid(
    request: Request,
    scale: EscalaEnum = Query(..., description="Escala da grade INOM"),
    tipo_produto: str = Query("CARTA_TOPOGRAFICA", description="Tipo de produto (TipoProduto enum)"),
    _: Usuario = Depends(get_current_user),
):
    """Retorna grade INOM como GeoJSON gzip para a escala e produto informados.

    A resposta é pré-comprimida e cacheada em memória no servidor.
    Suporta ETag / 304 Not Modified para economizar banda em re-fetches.
    """
    gz_bytes, etag = get_grid_gz(tipo_produto, scale)

    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    return Response(
        content=gz_bytes,
        media_type="application/json",
        headers={
            "Content-Encoding": "gzip",
            "Cache-Control": "private, max-age=3600",
            "ETag": etag,
            "Vary": "Accept-Encoding",
        },
    )


# ── Features Preview ──────────────────────────────────────────────────────────

class FeaturePreviewItem(BaseModel):
    inom: str
    escala: str
    tipo_produto: Optional[str] = None


@router.post("/features-preview")
async def features_preview(
    items: list[FeaturePreviewItem],
    _: Usuario = Depends(get_current_user),
):
    """Retorna geometrias de INOMs específicos sem baixar a grade inteira.

    Usado pelo modal de revisão para exibir apenas os polígonos selecionados.
    Muito mais rápido que baixar o grid completo e filtrar no cliente.
    """
    if not items:
        return {"type": "FeatureCollection", "features": []}

    # Agrupa por escala para carregar geom_cache uma única vez por escala
    scales_needed = {item.escala for item in items}
    scale_geoms: dict[str, dict] = {}
    for scale_str in scales_needed:
        try:
            scale_enum = EscalaEnum(scale_str)
            # asyncio.to_thread: evita bloquear o event loop na 1ª carga por escala
            scale_geoms[scale_str] = await asyncio.to_thread(get_inom_geometries, scale_enum)
        except ValueError:
            scale_geoms[scale_str] = {}

    features = []
    for item in items:
        geom = scale_geoms.get(item.escala, {}).get(item.inom)
        if geom:
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "inom": item.inom,
                    "escala": item.escala,
                    "tipo_produto": item.tipo_produto,
                },
            })

    return {"type": "FeatureCollection", "features": features}
