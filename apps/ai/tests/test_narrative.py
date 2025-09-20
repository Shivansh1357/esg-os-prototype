from app.routers.narrative import narrative_section, NarrativeReq, FactorSet


def test_narrative_basic():
    req = NarrativeReq(
        template="BRSR",
        section="EMISSIONS",
        periodStart="2025-04-01",
        periodEnd="2025-06-30",
        kpis={
            "totals": {"s1": 1200, "s2_loc": 3400, "s2_mkt": 3600, "s3": 22000},
            "yoy": {"deltaPct": {"s1": -3.2, "s2_loc": 1.5, "s2_mkt": 0.0, "s3": -0.8}},
            "completeness": {"percent": 78},
            "suppliers": {"coveragePercent": 42},
        },
        factorSet=FactorSet(code="IN-CEA-2024", version="1.0"),
    )
    resp = narrative_section(req)  # type: ignore
    text = resp["text"]
    assert "[FACTOR_VSN:" in text
    wc = len(text.split())
    assert 90 <= wc <= 200






