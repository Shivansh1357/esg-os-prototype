from fastapi import APIRouter, UploadFile, File, Body, HTTPException, Query, Request
from typing import Optional, Dict, Any, Literal
from io import BytesIO
from time import perf_counter

import pytesseract
from PIL import Image
from pydantic import BaseModel, Field

from app.config import settings
from app.logging import log
from app.utils.storage import fetch_bytes
from app.utils.ocr_utils import (
    extract_texts_from_pdf,
    candidates_from_texts,
    detect_primary_language,
)


class OcrCandidate(BaseModel):
    value: str
    conf: float


class OcrField(BaseModel):
    name: str
    candidates: list[OcrCandidate]


class OcrResponse(BaseModel):
    tables: list[Any] = Field(default_factory=list)
    fields: list[OcrField]
    confidence: float
    confidence_band: str
    fallback_used: bool
    latency_ms: float
    lang: str


class DetectLanguageResponse(BaseModel):
    language: str
    latency_ms: float


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


@router.post("/utility-bill", response_model=OcrResponse)
async def ocr_utility_bill(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[Dict[str, Any]] = Body(None),
    lang: Literal["eng", "hin", "eng+hin"] = Query("eng", description="Tesseract language code"),
):
    """
    Accepts EITHER:
    - multipart/form-data with `file` (PDF/image), OR
    - JSON: { s3Key?: string, url?: string }
    Returns: { tables: [], fields: [{name, candidates:[{value, conf}]}] }

    Query params:
    - lang: OCR language — 'eng' (default), 'hin', or 'eng+hin'
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
        raw = fetch_bytes(s3Key=s3Key, url=url, default_bucket=None)
        kind = "pdf"

    try:
        if kind == "pdf":
            texts = extract_texts_from_pdf(raw, max_pages=4, lang=lang)
        else:
            image = Image.open(BytesIO(raw))
            texts = [pytesseract.image_to_string(image, lang=lang)]
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((perf_counter() - started_at) * 1000, 2)
        log.error("ocr_error", error=str(exc), latency_ms=latency_ms, lang=lang)
        raise HTTPException(400, f"OCR failed: {exc}") from exc

    fields = candidates_from_texts(texts)
    confidence, confidence_band = _confidence_summary(fields)
    fallback_used = all(len(candidates) == 0 for candidates in fields.values())
    latency_ms = round((perf_counter() - started_at) * 1000, 2)

    out = OcrResponse(
        tables=[],
        fields=[OcrField(name=k, candidates=[OcrCandidate(**c) for c in v]) for k, v in fields.items()],
        confidence=confidence,
        confidence_band=confidence_band,
        fallback_used=fallback_used,
        latency_ms=latency_ms,
        lang=lang,
    )
    log.info(
        "ocr_done",
        pages=len(texts),
        kwh=len(fields.get("kWh", [])),
        date=len(fields.get("date", [])),
        confidence=confidence,
        confidence_band=confidence_band,
        fallback_used=fallback_used,
        latency_ms=latency_ms,
        lang=lang,
    )
    return out


@router.post("/detect-language", response_model=DetectLanguageResponse)
async def detect_language(
    file: Optional[UploadFile] = File(None),
    payload: Optional[Dict[str, Any]] = Body(None),
):
    """
    Accepts an image or single-page PDF and returns the detected primary language
    ('eng', 'hin', or 'eng+hin').
    """
    started_at = perf_counter()
    raw: bytes | None = None

    if file is not None:
        raw = await file.read()
        name = (file.filename or "").lower()
        is_pdf = not any(name.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"])
    else:
        s3Key = (payload or {}).get("s3Key")
        url = (payload or {}).get("url")
        if not s3Key and not url:
            raise HTTPException(400, "Provide multipart file OR JSON with s3Key/url")
        raw = fetch_bytes(s3Key=s3Key, url=url, default_bucket=None)
        is_pdf = True

    try:
        if is_pdf:
            # Extract first page as image for detection
            texts = extract_texts_from_pdf(raw, max_pages=1, lang="eng+hin")
            # If text layer exists, use heuristic on text content
            if texts and texts[0].strip():
                # Check for Devanagari Unicode range
                devanagari_count = sum(1 for ch in texts[0] if "\u0900" <= ch <= "\u097F")
                latin_count = sum(1 for ch in texts[0] if ch.isascii() and ch.isalpha())
                if devanagari_count > latin_count:
                    detected = "hin"
                elif latin_count > devanagari_count + 10:
                    detected = "eng"
                else:
                    detected = "eng+hin"
            else:
                detected = "eng"
        else:
            image = Image.open(BytesIO(raw))
            detected = detect_primary_language(image)
    except Exception as exc:  # noqa: BLE001
        latency_ms = round((perf_counter() - started_at) * 1000, 2)
        log.error("detect_language_error", error=str(exc), latency_ms=latency_ms)
        raise HTTPException(400, f"Language detection failed: {exc}") from exc

    latency_ms = round((perf_counter() - started_at) * 1000, 2)
    log.info("detect_language_done", language=detected, latency_ms=latency_ms)
    return DetectLanguageResponse(language=detected, latency_ms=latency_ms)
