"""Pacote de routers de pedidos — organizado por responsabilidade.

Sub-módulos:
- _guards      : helpers compartilhados (_enrich, _check_janela_open, _rm_do_supervisor)
- solicitante  : criar, listar, editar, submeter, cancelar, reordenar
- gestor       : revisar, consolidar, atribuir CGEO, homologados, dar-pronto
- relatorios   : exportações ZIP, GeoJSON, duplicatas, admin endpoints
"""

from fastapi import APIRouter

from app.routers.pedidos import solicitante, gestor, relatorios

# Rota base — sem prefixo aqui: cada sub-router já carrega "/pedidos"
router = APIRouter()

# A ORDEM importa: rotas fixas devem vir antes de /{pedido_id}
# Solicitante registra "/" e "/{pedido_id}" então deve vir por último
# para não shadowing de rotas como "/pending", "/admin/all", etc.
router.include_router(gestor.router)
router.include_router(relatorios.router)
router.include_router(solicitante.router)
