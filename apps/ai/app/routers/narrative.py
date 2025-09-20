from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.utils.llm import narrative_llm
from app.utils.redact import scrub
from app.logging import log
import time


router = APIRouter(prefix="/narrative", tags=["narrative"])


class FactorSet(BaseModel):
    code: Optional[str] = None
    version: Optional[str] = None


class NarrativeReq(BaseModel):
    template: str = Field(description="e.g., BRSR")
    section: str = Field(description="e.g., EMISSIONS")
    periodStart: str
    periodEnd: str
    kpis: Dict[str, Any] = Field(default_factory=dict)
    factorSet: Optional[FactorSet] = None
    tone: Optional[str] = Field(default="neutral")


class NarrativeResp(BaseModel):
    text: str
    citations: List[str] = []


def _wc(text: str) -> int:
    return len([w for w in text.strip().split() if w])


def _token(factor: Optional[FactorSet]) -> str:
    if factor and factor.code and factor.version:
        return f"[FACTOR_VSN:{factor.code}:{factor.version}]"
    return "[FACTOR_VSN:DEFAULT]"


def _compose_free(body: NarrativeReq) -> str:
    ps, pe = body.periodStart, body.periodEnd
    k = body.kpis or {}
    totals = k.get("totals", {})
    yoy = (k.get("yoy") or {}).get("deltaPct", {})
    comp = k.get("completeness", {})
    supp = k.get("suppliers", {})

    parts: List[str] = []
    parts.append(
        f"During {ps} to {pe}, we consolidated activity data and updated emissions across Scopes 1, 2 and 3. "
    )

    s1 = totals.get("s1")
    s2l = totals.get("s2_loc")
    s2m = totals.get("s2_mkt")
    s3 = totals.get("s3")
    vals: List[str] = []
    if s1 is not None:
        vals.append(f"Scope 1 {s1:,.0f} kgCO₂e")
    if s2l is not None:
        vals.append(f"Scope 2 (location) {s2l:,.0f} kgCO₂e")
    if s2m is not None:
        vals.append(f"Scope 2 (market) {s2m:,.0f} kgCO₂e")
    if s3 is not None:
        vals.append(f"Scope 3 {s3:,.0f} kgCO₂e")
    if vals:
        parts.append("Reported totals: " + "; ".join(vals) + ". ")

    moves: List[str] = []
    for key, label in [
        ("s1", "Scope 1"),
        ("s2_loc", "Scope 2 (location)"),
        ("s2_mkt", "Scope 2 (market)"),
        ("s3", "Scope 3"),
    ]:
        d = yoy.get(key)
        if isinstance(d, (int, float)):
            arrow = "increased" if d > 0 else "decreased" if d < 0 else "was flat"
            pct = f"{abs(d):.2f}%"
            if d == 0:
                moves.append(f"{label} was flat vs. prior quarter")
            else:
                moves.append(f"{label} {arrow} by {pct}")
    if moves:
        parts.append("Quarter-on-quarter, " + "; ".join(moves) + ". ")

    if isinstance(comp.get("percent"), (int, float)):
        parts.append(
            f"Compliance completeness reached {comp['percent']:.0f}% with remaining findings under review. "
        )
    if isinstance(supp.get("coveragePercent"), (int, float)):
        parts.append(
            f"Supplier coverage stands at {supp['coveragePercent']:.0f}% of spend for Scope 3 data. "
        )

    parts.append(
        "Next steps focus on closing residual gaps, documenting calculation methods, and validating activity data for key sources. "
    )

    txt = "".join(parts).strip()
    words = txt.split()
    if len(words) < 120:
        pad = (
            " Data-quality flags and boundary assumptions are disclosed alongside emission factors. "
            "Method updates will be reflected in subsequent recalculations."
        )
        txt = (txt + pad)[:]
    if _wc(txt) > 180:
        txt = " ".join(words[:180])

    txt += " " + _token(body.factorSet)
    return txt


@router.post("/section", response_model=NarrativeResp)
def narrative_section(body: NarrativeReq):
    started = time.time()
    safe_body = body.model_copy(update={"kpis": body.kpis})

    text = narrative_llm(
        {
            "template": safe_body.template,
            "section": safe_body.section,
            "periodStart": safe_body.periodStart,
            "periodEnd": safe_body.periodEnd,
            "kpis": safe_body.kpis,
            "factorToken": _token(safe_body.factorSet),
            "tone": safe_body.tone,
        }
    )

    if not text or _wc(text) < 60 or "FACTOR_VSN" not in text:
        text = _compose_free(safe_body)

    if _wc(text) > 200:
        text = " ".join(text.split()[:200])
    if "FACTOR_VSN" not in text:
        text += " " + _token(safe_body.factorSet)

    ms = round((time.time() - started) * 1000, 2)
    log.info("narrative.generate", ms=ms, section=body.section, words=_wc(text))
    return NarrativeResp(text=text, citations=[])






