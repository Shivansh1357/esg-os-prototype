from typing import List, Optional

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ImportError:  # pragma: no cover - compatibility with pydantic v1
    from pydantic import BaseSettings
    SettingsConfigDict = None


class Settings(BaseSettings):
    APP_NAME: str = "ESG AI Service"
    APP_VERSION: str = "0.1.0"
    USE_TEXTRACT: bool = False
    USE_LLM: bool = False
    AWS_REGION: str = "ap-south-1"
    # Legacy list form
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5050",
        "http://127.0.0.1:5050",
    ]
    # New string form (comma-separated)
    CORS_ORIGINS: str = "http://localhost:5050"

    # Optional S3 read config for JSON {s3Key}
    S3_REGION: Optional[str] = None
    S3_ENDPOINT: Optional[str] = None
    S3_BUCKET: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    # OCR config
    OCR_MAX_PAGES: int = 4
    OCR_CONFIDENCE_HIGH: float = 0.8
    OCR_CONFIDENCE_MEDIUM: float = 0.6

    # --- D3 options ---
    LLM_PROVIDER: str = "openai"  # "openai" | "bedrock"
    OPENAI_API_KEY: Optional[str] = None
    BEDROCK_REGION: Optional[str] = None
    MAP_LOW_CONF_THRESHOLD: float = 0.55

    if SettingsConfigDict is not None:
        model_config = SettingsConfigDict(env_file=".env")
    else:
        class Config:
            env_file = ".env"


settings = Settings()
