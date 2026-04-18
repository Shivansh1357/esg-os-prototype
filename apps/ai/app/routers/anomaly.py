"""Anomaly detection and explanation endpoint for ESG fact data."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logging import log
from app.utils.llm import suggest_mapping_llm
import time


router = APIRouter(prefix="/anomaly", tags=["anomaly"])


class AnomalyReq(BaseModel):
    metricCode: str = Field(description="e.g., ELEC_KWH")
    currentValue: float = Field(description="The current period value")
    unit: str = Field(description="e.g., kWh, kL, MT")
    historicalValues: List[float] = Field(default_factory=list, description="Previous period values (newest first)")
    periodStart: str = ""
    periodEnd: str = ""
    entityName: Optional[str] = None


class AnomalyResp(BaseModel):
    isOutlier: bool
    severity: str  # "none", "mild", "moderate", "severe"
    zScore: float
    explanation: str
    suggestions: List[str]
    historicalMean: Optional[float] = None
    historicalStd: Optional[float] = None


def _compute_stats(values: List[float]) -> tuple[float, float]:
    if len(values) < 2:
        return 0.0, 0.0
    mean = sum(values) / len(values)
    variance = sum((v - mean) ** 2 for v in values) / len(values)
    std = variance ** 0.5
    return mean, std


def _severity(z: float) -> str:
    az = abs(z)
    if az < 2:
        return "none"
    if az < 3:
        return "mild"
    if az < 5:
        return "moderate"
    return "severe"


def _explain(
    metric: str, value: float, unit: str, mean: float, std: float,
    z: float, severity: str, entity: str | None, period: str
) -> str:
    direction = "above" if value > mean else "below"
    pct_diff = abs(value - mean) / mean * 100 if mean else 0

    if severity == "none":
        return f"{metric} value of {value:,.1f} {unit} is within normal range for {entity or 'this entity'}."

    parts = [
        f"{metric} value of {value:,.1f} {unit} for {entity or 'this entity'} ({period}) "
        f"is {pct_diff:.0f}% {direction} the historical average of {mean:,.1f} {unit}.",
        f"This represents a {abs(z):.1f}σ deviation (severity: {severity}).",
    ]

    if severity in ("moderate", "severe"):
        parts.append(
            "This warrants investigation — check for data entry errors, "
            "meter reading anomalies, or significant operational changes."
        )

    return " ".join(parts)


def _suggestions(metric: str, severity: str, value: float, mean: float) -> List[str]:
    if severity == "none":
        return []

    sugs = [
        f"Verify the source document for {metric} — confirm the value was transcribed correctly.",
    ]

    if value > mean:
        sugs.append("Check if there was a change in reporting boundary or meter readings.")
        sugs.append("Investigate operational changes (new equipment, extended hours, etc.).")
    else:
        sugs.append("Verify no data was missed or undercounted for this period.")
        sugs.append("Check if operational shutdown or reduced activity explains the drop.")

    if severity in ("moderate", "severe"):
        sugs.append("Flag for manual review before approving this fact.")
        sugs.append("Compare with same quarter in prior year for seasonal context.")

    return sugs[:5]


@router.post("/explain", response_model=AnomalyResp)
def anomaly_explain(body: AnomalyReq):
    started = time.time()

    historical = body.historicalValues or []
    mean, std = _compute_stats(historical)
    period = f"{body.periodStart} to {body.periodEnd}" if body.periodStart else "current period"

    if len(historical) < 2:
        explanation = (
            f"Not enough historical data to determine whether {body.metricCode} value of "
            f"{body.currentValue:,.1f} {body.unit} for {body.entityName or 'this entity'} ({period}) "
            "is anomalous."
        )
        suggestions = [
            "Compare against at least two prior reporting periods before treating this as normal.",
            f"Review the source document for {body.metricCode} before approval.",
        ]
        ms = round((time.time() - started) * 1000, 2)
        log.info(
            "anomaly.explain",
            metric=body.metricCode,
            z=0.0,
            outlier=False,
            severity="none",
            baseline_points=len(historical),
            ms=ms,
        )
        return AnomalyResp(
            isOutlier=False,
            severity="none",
            zScore=0.0,
            explanation=explanation,
            suggestions=suggestions,
            historicalMean=None,
            historicalStd=None,
        )

    if std > 0:
        z_score = round((body.currentValue - mean) / std, 2)
    else:
        z_score = 0.0

    is_outlier = abs(z_score) >= 3
    sev = _severity(z_score)

    explanation = _explain(
        body.metricCode, body.currentValue, body.unit,
        mean, std, z_score, sev, body.entityName, period
    )
    suggestions = _suggestions(body.metricCode, sev, body.currentValue, mean)

    ms = round((time.time() - started) * 1000, 2)
    log.info("anomaly.explain", metric=body.metricCode, z=z_score, outlier=is_outlier, severity=sev, ms=ms)

    return AnomalyResp(
        isOutlier=is_outlier,
        severity=sev,
        zScore=z_score,
        explanation=explanation,
        suggestions=suggestions,
        historicalMean=round(mean, 2) if mean else None,
        historicalStd=round(std, 2) if std else None,
    )
