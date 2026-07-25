"""Camada de storage: Supabase Storage em produção, disco local em dev.

Caminhos são sempre prefixados por ``tenant_id``, espelhando o isolamento do
banco: ``<bucket>/<tenant_id>/<...>``.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from uuid import UUID

import httpx

from app.core.config import get_settings

BUCKET_PROPERTY_PHOTOS = "property-photos"
BUCKET_DOCUMENTS = "documents"
BUCKET_BRANDING = "branding"
BUCKET_CONTRACTS = "contracts"
BUCKET_REPORTS = "reports"

ALL_BUCKETS = (
    BUCKET_PROPERTY_PHOTOS,
    BUCKET_DOCUMENTS,
    BUCKET_BRANDING,
    BUCKET_CONTRACTS,
    BUCKET_REPORTS,
)


def tenant_path(tenant_id: UUID | str, *parts: str) -> str:
    return "/".join([str(tenant_id), *parts])


class StorageBackend(ABC):
    @abstractmethod
    async def upload(self, bucket: str, path: str, content: bytes, content_type: str) -> str: ...

    @abstractmethod
    async def download(self, bucket: str, path: str) -> bytes: ...

    @abstractmethod
    async def delete(self, bucket: str, path: str) -> None: ...

    @abstractmethod
    def public_url(self, bucket: str, path: str) -> str: ...


class LocalStorage(StorageBackend):
    """Disco local — desenvolvimento e testes, sem depender do Supabase."""

    def __init__(self, root: str) -> None:
        self.root = Path(root)

    def _full(self, bucket: str, path: str) -> Path:
        return self.root / bucket / path

    async def upload(self, bucket: str, path: str, content: bytes, content_type: str) -> str:
        target = self._full(bucket, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return path

    async def download(self, bucket: str, path: str) -> bytes:
        return self._full(bucket, path).read_bytes()

    async def delete(self, bucket: str, path: str) -> None:
        target = self._full(bucket, path)
        if target.exists():
            target.unlink()

    def public_url(self, bucket: str, path: str) -> str:
        return f"/storage/{bucket}/{path}"


class SupabaseStorage(StorageBackend):
    def __init__(self, url: str, service_key: str) -> None:
        self.base = url.rstrip("/")
        self.key = service_key

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.key}", "apikey": self.key}

    async def upload(self, bucket: str, path: str, content: bytes, content_type: str) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base}/storage/v1/object/{bucket}/{path}",
                content=content,
                headers={
                    **self._headers,
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
            )
            resp.raise_for_status()
        return path

    async def download(self, bucket: str, path: str) -> bytes:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(
                f"{self.base}/storage/v1/object/{bucket}/{path}", headers=self._headers
            )
            resp.raise_for_status()
            return resp.content

    async def delete(self, bucket: str, path: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(
                f"{self.base}/storage/v1/object/{bucket}/{path}", headers=self._headers
            )
            if resp.status_code not in (200, 404):
                resp.raise_for_status()

    def public_url(self, bucket: str, path: str) -> str:
        return f"{self.base}/storage/v1/object/public/{bucket}/{path}"


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        settings = get_settings()
        if settings.supabase_service_role_key and settings.is_production:
            _backend = SupabaseStorage(settings.supabase_url, settings.supabase_service_role_key)
        else:
            os.makedirs(settings.local_storage_dir, exist_ok=True)
            _backend = LocalStorage(settings.local_storage_dir)
    return _backend


def set_storage(backend: StorageBackend | None) -> None:
    """Ponto de injeção para testes."""
    global _backend
    _backend = backend
