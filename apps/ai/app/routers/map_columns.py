from __future__ import annotations

from time import perf_counter
from typing import Dict, List, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from rapidfuzz import fuzz, process

from app.config import settings
from app.logging import log
from app.utils.llm import suggest_mapping_llm


router = APIRouter(prefix="/map", tags=["map"])

TARGETS: Dict[str, List[str]] = {
    "date": [
        "date",
        "reading_date",
        "bill_date",
        "period",
        "timestamp",
        "readingdate",
        "reading date",
    ],
    "kWh": [
        "kwh",
        "consumption",
        "usage",
        "energy",
        "units",
        "kwh_used",
        "kwh used",
        "kwh (consumption)",
    ],
    "site": [
        "site",
        "location",
        "facility",
        "meter",
        "account",
        "service_point",
        "service point",
        "premises",
        "building",
    ],
}

TOP_N = 5


class MapReq(BaseModel):
    headers: List[str]


class Alt(BaseModel):
    header: str
    score: float


class MapResp(BaseModel):
    mapping: Dict[str, str]
    confidence: float
    alternatives: Dict[str, List[Alt]]
    warnings: List[str] = []
    confidence_band: str
    fallback_used: bool
    latency_ms: float


def _clean_headers(headers: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for header in headers:
        value = str(header or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _normalize_choice(choice: str, headers: List[str]) -> str:
    return choice if choice in headers else ""


def _confidence_band(confidence: float) -> str:
    if confidence >= 0.8:
        return "high"
    if confidence >= settings.MAP_LOW_CONF_THRESHOLD:
        return "medium"
    return "low"


def _rank(headers: List[str], query: str, aliases: List[str]) -> Tuple[str, float, List[Tuple[str, float]]]:
    if not headers:
        return "", 0.0, []

    best_header = ""
    best_score = 0.0
    combined_queries = [query, *aliases]

    for candidate_query in combined_queries:
        ranked = process.extract(candidate_query, headers, scorer=fuzz.WRatio, limit=TOP_N)
        ranked_norm = sorted(
            [(header, float(score) / 100.0) for header, score, _ in ranked],
            key=lambda item: (-item[1], item[0].lower()),
        )
        if ranked_norm and ranked_norm[0][1] > best_score:
            best_header = ranked_norm[0][0]
            best_score = ranked_norm[0][1]

    alternatives = process.extract(query, headers, scorer=fuzz.WRatio, limit=TOP_N)
    alternatives_norm = sorted(
        [(header, float(score) / 100.0) for header, score, _ in alternatives],
        key=lambda item: (-item[1], item[0].lower()),
    )
    return best_header, best_score, alternatives_norm


def _apply_llm_suggestions(mapping: Dict[str, str], headers: List[str]) -> tuple[Dict[str, str], bool]:
    llm_suggestion = suggest_mapping_llm(headers)
    if not llm_suggestion:
        return mapping, False

    out = dict(mapping)
    changed = False
    for key in TARGETS.keys():
        suggested_header = llm_suggestion.get(key)
        if not suggested_header:
            continue
        normalized = _normalize_choice(str(suggested_header), headers)
        if normalized and normalized != out.get(key):
            out[key] = normalized
            changed = True
    return out, changed


@router.post("/columns", response_model=MapResp)
def map_columns(body: MapReq):
    started_at = perf_counter()
    headers = _clean_headers(body.headers or [])
    if not headers:
        raise HTTPException(400, "headers: non-empty string[] required")

    mapping: Dict[str, str] = {}
    alternatives: Dict[str, List[Dict[str, float]]] = {}
    scores: List[float] = []

    for key, aliases in TARGETS.items():
        best_header, best_score, ranked_alternatives = _rank(headers, key, aliases)
        mapping[key] = _normalize_choice(best_header, headers)
        alternatives[key] = [{"header": header, "score": score} for header, score in ranked_alternatives]
        scores.append(best_score)

    confidence = round(sum(scores) / max(1, len(scores)), 4)
    warnings: List[str] = []
    fallback_used = False

    if len(set(mapping.values())) < len(mapping.values()):
        warnings.append("Multiple targets map to the same header; review mapping.")

    if confidence < settings.MAP_LOW_CONF_THRESHOLD:
        warnings.append("Low confidence mapping; deterministic fallback plus manual review recommended.")
        mapping, fallback_used = _apply_llm_suggestions(mapping, headers)

    confidence_band = _confidence_band(confidence)
    latency_ms = round((perf_counter() - started_at) * 1000, 2)

    log.info(
        "map_columns_done",
        header_count=len(headers),
        confidence=confidence,
        confidence_band=confidence_band,
        fallback_used=fallback_used,
        warnings_count=len(warnings),
        latency_ms=latency_ms,
    )

    return {
        "mapping": mapping,
        "confidence": confidence,
        "alternatives": alternatives,
        "warnings": warnings,
        "confidence_band": confidence_band,
        "fallback_used": fallback_used,
        "latency_ms": latency_ms,
    }
