from fastapi import APIRouter
from app.config import settings


router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


