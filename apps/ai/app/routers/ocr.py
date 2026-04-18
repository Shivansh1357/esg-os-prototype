from fastapi import APIRouter, UploadFile, File, Body, HTTPException, Request
from typing import Optional, Dict, Any
from io import BytesIO
from time import perf_counter

import pytesseract
from PIL import Image

from app.config import settings
from app.logging import log
from app.utils.storage import fetch_bytes
from app.utils.ocr_utils import extract_texts_from_pdf, candidates_from_texts


router = APIRouter(prefix="/ocr", tags=["ocr"])


def _confidence_band(score: float) -> str:
    if score >= settings.OCR_CONFIDENCE_HIGH:
        return "high"
    if score >= settings.OCR_CONFIDENCE_MEDIUM:
        return "medium"
    return "low"


def _confidence_summary(fields: Dict[str, list[Dict[str, Any]]]) -> tuple[float, str]:
    confidence_values: list[float] = []
    for candidates in fields.values():
        for candidate in candidates:
            conf = candidate.get("conf")
            if isinstance(conf, (int, float)):
                confidence_values.append(float(conf))

    if not confidence_values:
        return 0.0, "low"

    average = round(sum(confidence_values) / len(confidence_values), 4)
    return average, _confidence_band(average)


@router.post("/utility-bill")
async def ocr_utility_bill(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[Dict[str, Any]] = Body(None),
):
    """
    Accepts EITHER:
    - multipart/form-data with `file` (PDF/image), OR
    - JSON: { s3Key?: string, url?: string }
    Returns: { tables: [], fields: [{name, candidates:[{value, conf}]}] }
    """
    started_at = perf_counter()
    raw: bytes | None = None

    # Case 1: multipart upload
    if file is not None:
        name = (file.filename or "").lower()
        content = await file.read()
        raw = content
        kind = "image" if any(name.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]) else "pdf"
    else:
        # Case 2: JSON with s3Key/url
        s3Key = (payload or {}).get("s3Key")
        url = (payload or {}).get("url")
        if not s3Key and not url:
            raise HTTPException(400, "Provide multipart file OR JSON with s3Key/url")
        # default bucket can come from env S3_BUCKET if you use it
        raw = fetch_bytes(s3Key=s3Key, url=url, default_bucket=None)
        # naive type guess: treat as PDF; if image, OCR still works via PIL open
        kind = "pdf"

    try:
        if kind == "pdf":
            texts = extract_texts_from_pdf(raw, max_pages=4)
        else:
            image = Image.open(BytesIO(raw))
            texts = [pytesseract.image_to_string(image)]
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((perf_counter() - started_at) * 1000, 2)
        log.error("ocr_error", error=str(exc), latency_ms=latency_ms)
        raise HTTPException(400, f"OCR failed: {exc}") from exc

    fields = candidates_from_texts(texts)
    confidence, confidence_band = _confidence_summary(fields)
    fallback_used = all(len(candidates) == 0 for candidates in fields.values())
    latency_ms = round((perf_counter() - started_at) * 1000, 2)

    out = {
        "tables": [],
        "fields": [{"name": k, "candidates": v} for k, v in fields.items()],
        "confidence": confidence,
        "confidence_band": confidence_band,
        "fallback_used": fallback_used,
        "latency_ms": latency_ms,
    }
    log.info(
        "ocr_done",
        pages=len(texts),
        kwh=len(fields.get("kWh", [])),
        date=len(fields.get("date", [])),
        confidence=confidence,
        confidence_band=confidence_band,
        fallback_used=fallback_used,
        latency_ms=latency_ms,
    )
    return out
