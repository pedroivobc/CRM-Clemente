"""Módulo de Vendas — apenas a casca.

Rotas protegidas pela feature flag ``module_sales``. A especificação completa
(funil, propostas, negócios) virá em fase posterior; nada de lógica aqui.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import require_module

router = APIRouter(
    prefix="/sales",
    tags=["vendas"],
    dependencies=[Depends(require_module("module_sales"))],
)


@router.get("/status")
async def module_status() -> dict:
    return {
        "module": "module_sales",
        "status": "em_breve",
        "message": "O módulo de Vendas está em desenvolvimento.",
    }
