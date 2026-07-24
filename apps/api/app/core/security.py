"""Autenticação (JWT do Supabase Auth) e autorização (RBAC granular)."""

from dataclasses import dataclass, field
from uuid import UUID

from jose import JWTError, jwt

from app.core.config import get_settings


class AuthError(Exception):
    """Token ausente, inválido ou sem vínculo com um tenant ativo."""


@dataclass
class CurrentUser:
    """Identidade resolvida da requisição, já com o tenant e as permissões."""

    user_id: UUID
    tenant_id: UUID
    full_name: str
    email: str
    tenant_name: str
    plan: str
    roles: list[str] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    modules: list[str] = field(default_factory=list)

    def has_permission(self, module: str, action: str) -> bool:
        if "Admin" in self.roles:
            return True
        return f"{module}:{action}" in self.permissions

    def has_module(self, module: str) -> bool:
        return module in self.modules


def decode_supabase_jwt(token: str) -> dict:
    """Valida a assinatura HS256 do token emitido pelo Supabase Auth."""
    settings = get_settings()
    if not settings.supabase_jwt_secret:
        raise AuthError("SUPABASE_JWT_SECRET não configurado")
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise AuthError("Token inválido ou expirado") from exc


def auth_user_id_from_token(token: str) -> UUID:
    claims = decode_supabase_jwt(token)
    sub = claims.get("sub")
    if not sub:
        raise AuthError("Token sem identificação de usuário")
    return UUID(sub)
