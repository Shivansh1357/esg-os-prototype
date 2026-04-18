from __future__ import annotations
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.utils.llm import compliance_explain_llm


router = APIRouter(prefix="/compliance", tags=["compliance"])


class ExplainReq(BaseModel):
    ruleCode: Optional[str] = None
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    requiredFields: List[str] = Field(default_factory=list)
    presentMetrics: List[str] = Field(default_factory=list)
    missingMetrics: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class ChecklistItem(BaseModel):
    label: str
    done: bool = False


class ExplainResp(BaseModel):
    bullets: List[str]
    checklist: List[ChecklistItem]


@router.post("/explain", response_model=ExplainResp)
def explain(body: ExplainReq):
    bullets: List[str] = []
    checklist: List[ChecklistItem] = []

    rp = (
        f"{body.periodStart} → {body.periodEnd}"
        if (body.periodStart and body.periodEnd)
        else "the reporting period"
    )
    if body.ruleCode:
        bullets.append(f"Rule {body.ruleCode}: gather evidence and data inputs for {rp}.")
    else:
        bullets.append(f"Evaluate requirements and provide evidence for {rp}.")

    if body.missingMetrics:
        bullets.append("Fill data gaps: " + ", ".join(sorted(set(body.missingMetrics))) + ".")
    if body.presentMetrics:
        bullets.append("Verify data quality for: " + ", ".join(sorted(set(body.presentMetrics))) + ".")

    if body.notes:
        bullets.append("Reviewer note included; ensure it is addressed in evidence.")

    required = body.requiredFields or []
    present = set(body.presentMetrics or [])
    for rf in required:
        checklist.append(ChecklistItem(label=rf, done=(rf in present)))

    checklist.append(ChecklistItem(label="Attach primary evidence document (invoice/report)", done=False))
    checklist.append(ChecklistItem(label="Link to calculation sheet or source data", done=False))

    llm = compliance_explain_llm(
        {
            "ruleCode": body.ruleCode,
            "period": rp,
            "requiredFields": required,
            "presentMetrics": list(present),
            "missingMetrics": body.missingMetrics or [],
        }
    )
    if isinstance(llm, dict):
        b = llm.get("bullets") or []
        c = llm.get("checklist") or []
        if isinstance(b, list) and b:
            bullets = [str(x) for x in b][:6]
        if isinstance(c, list) and c:
            cl: List[ChecklistItem] = []
            for it in c:
                if isinstance(it, dict) and "label" in it:
                    cl.append(ChecklistItem(label=str(it["label"]), done=bool(it.get("done", False))))
            if cl:
                checklist = cl

    bullets = bullets[:6] if bullets else ["Provide data and evidence for compliance."]
    checklist = checklist[:10]
    return ExplainResp(bullets=bullets, checklist=checklist)

