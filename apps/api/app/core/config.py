from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"), extra="ignore", case_sensitive=False
    )

    app_env: str = "development"
    base_domain: str = "localhost"

    supabase_url: str = "http://localhost:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:54322/postgres"
    redis_url: str = "redis://localhost:6379/0"
    local_storage_dir: str = "./storage-dev"

    payment_provider: str = "mock"
    signature_provider: str = "mock"
    invoice_provider: str = "mock"
    messaging_provider: str = "mock"

    asaas_api_key: str = ""
    asaas_base_url: str = "https://api-sandbox.asaas.com/v3"
    clicksign_api_key: str = ""
    focus_nfe_token: str = ""
    evolution_api_url: str = ""
    evolution_api_key: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
