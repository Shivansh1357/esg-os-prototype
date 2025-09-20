from __future__ import annotations
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from rapidfuzz import fuzz, process

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
LOW_CONF_THRESHOLD = 0.55  # average of best scores (0..1)


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


def _rank(headers: List[str], query: str, aliases: List[str]) -> Tuple[str, float, List[Tuple[str, float]]]:
    # rank headers vs either target key or best alias, WRatio handles noise/spaces
    direct = process.extractOne(query, headers, scorer=fuzz.WRatio)
    best_h = direct[0] if direct else ""
    best_s = direct[1] if direct else 0
    alias = process.extractOne(query, aliases, scorer=fuzz.WRatio)
    if alias and alias[1] > best_s:
        alt_header = process.extractOne(alias[0], headers, scorer=fuzz.WRatio)
        if alt_header and alt_header[1] > best_s:
            best_h = alt_header[0]
            best_s = alt_header[1]
    # top alternatives
    alts = process.extract(query, headers, scorer=fuzz.WRatio, limit=TOP_N)
    alts = [(h, float(s) / 100.0) for (h, s, _) in alts]
    return best_h, float(best_s) / 100.0, alts


@router.post("/columns", response_model=MapResp)
def map_columns(body: MapReq):
    if not body.headers:
        raise HTTPException(400, "headers: non-empty string[] required")
    headers = [str(h or "").strip() for h in body.headers]

    mapping: Dict[str, str] = {}
    alternatives: Dict[str, List[Dict[str, float]]] = {}
    scores: List[float] = []
    for key, aliases in TARGETS.items():
        best_h, best_s, alts = _rank(headers, key, aliases)
        mapping[key] = best_h
        alternatives[key] = [{"header": h, "score": s} for (h, s) in alts]
        scores.append(best_s)

    conf = sum(scores) / max(1, len(scores))

    warnings: List[str] = []
    # duplicate target to same header?
    if len(set(mapping.values())) < len(mapping.values()):
        warnings.append("Multiple targets map to the same header; review mapping.")
    if conf < LOW_CONF_THRESHOLD:
        warnings.append("Low confidence mapping; consider manual review.")
        llm_suggestion = suggest_mapping_llm(headers)
        if llm_suggestion:
            for k, v in llm_suggestion.items():
                if v and isinstance(v, str):
                    mapping[k] = v

    return {
        "mapping": mapping,
        "confidence": conf,
        "alternatives": alternatives,
        "warnings": warnings,
    }



