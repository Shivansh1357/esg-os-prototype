from app.routers.anomaly import AnomalyReq, anomaly_explain


def _to_dict(resp):
    if isinstance(resp, dict):
        return resp
    if hasattr(resp, "model_dump"):
        return resp.model_dump()
    if hasattr(resp, "dict"):
        return resp.dict()
    return {
        "isOutlier": getattr(resp, "isOutlier", False),
        "severity": getattr(resp, "severity", "none"),
        "zScore": getattr(resp, "zScore", 0.0),
        "explanation": getattr(resp, "explanation", ""),
        "suggestions": getattr(resp, "suggestions", []),
    }


def test_anomaly_requires_sufficient_history_before_normalizing():
    req = AnomalyReq(
        metricCode="ELEC_KWH",
        currentValue=1500,
        unit="kWh",
        historicalValues=[1200],
        periodStart="2025-07-01",
        periodEnd="2025-09-30",
        entityName="HQ",
    )

    resp = _to_dict(anomaly_explain(req))  # type: ignore[arg-type]

    assert resp["isOutlier"] is False
    assert resp["severity"] == "none"
    assert "Not enough historical data" in resp["explanation"]
    assert len(resp["suggestions"]) >= 2


def test_anomaly_flags_severe_deviation():
    req = AnomalyReq(
        metricCode="ELEC_KWH",
        currentValue=3000,
        unit="kWh",
        historicalValues=[950, 1000, 1050, 980],
        periodStart="2025-07-01",
        periodEnd="2025-09-30",
        entityName="HQ",
    )

    resp = _to_dict(anomaly_explain(req))  # type: ignore[arg-type]

    assert resp["isOutlier"] is True
    assert resp["severity"] in {"moderate", "severe"}
    assert resp["zScore"] > 3
    assert "historical average" in resp["explanation"]
    assert any("manual review" in suggestion.lower() for suggestion in resp["suggestions"])
