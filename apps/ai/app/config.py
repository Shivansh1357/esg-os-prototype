from pydantic import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    APP_NAME: str = "ESG AI Service"
    APP_VERSION: str = "0.1.0"
    USE_TEXTRACT: bool = False
    USE_LLM: bool = False
    AWS_REGION: str = "ap-south-1"
    # Legacy list form
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    # New string form (comma-separated)
    CORS_ORIGINS: str = "http://localhost:3000"

    # Optional S3 read config for JSON {s3Key}
    S3_REGION: Optional[str] = None
    S3_ENDPOINT: Optional[str] = None
    S3_BUCKET: Optional[str] = None
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    # OCR config
    OCR_MAX_PAGES: int = 4

    # --- D3 options ---
    LLM_PROVIDER: str = "openai"  # "openai" | "bedrock"
    OPENAI_API_KEY: Optional[str] = None
    BEDROCK_REGION: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()


