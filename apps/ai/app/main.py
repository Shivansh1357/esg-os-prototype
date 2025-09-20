from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.logging import log
from app.routers import health, ocr
from app.routers import map_columns, compliance


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

# CORS (dev-friendly; tighten via env in prod)
allowed_origins = (
    [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    if getattr(settings, "CORS_ORIGINS", None)
    else settings.ALLOWED_ORIGINS
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter


@app.on_event("startup")
async def startup_event():
    log.info("startup", app=settings.APP_NAME, version=settings.APP_VERSION)


app.include_router(health.router)
app.include_router(ocr.router)
app.include_router(map_columns.router)
app.include_router(compliance.router)


@app.get("/")
async def root():
    return {"message": "AI service up"}


