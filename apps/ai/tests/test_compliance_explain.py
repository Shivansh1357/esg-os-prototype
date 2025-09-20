from app.routers.compliance import explain, ExplainReq


def test_explain_structure():
    req = ExplainReq(
        ruleCode="BRSR-9.1",
        periodStart="2025-04-01",
        periodEnd="2025-06-30",
        requiredFields=["electricity.kWh", "billingPeriod", "site"],
        presentMetrics=["electricity.kWh"],
        missingMetrics=["billingPeriod", "site"],
    )
    res = explain(req)  # type: ignore
    assert "bullets" in res and "checklist" in res
    assert any("Rule BRSR-9.1" in b for b in res["bullets"])
    labels = [c["label"] for c in res["checklist"]]
    assert "electricity.kWh" in labels
    done_map = {c["label"]: c["done"] for c in res["checklist"]}
    assert done_map["electricity.kWh"] is True

from app.routers.compliance import explain, ExplainReq


def test_explain_structure():
    req = ExplainReq(
        ruleCode="BRSR-9.1",
        periodStart="2025-04-01",
        periodEnd="2025-06-30",
        requiredFields=["electricity.kWh", "billingPeriod", "site"],
        presentMetrics=["electricity.kWh"],
        missingMetrics=["billingPeriod", "site"],
    )
    res = explain(req)  # type: ignore
    assert "bullets" in res and "checklist" in res
    assert any("Rule BRSR-9.1" in b for b in res["bullets"])
    labels = [c["label"] for c in res["checklist"]]
    assert "electricity.kWh" in labels
    done_map = {c["label"]: c["done"] for c in res["checklist"]}
    assert done_map["electricity.kWh"] is True


