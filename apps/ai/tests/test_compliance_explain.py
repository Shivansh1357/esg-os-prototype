from app.routers.compliance import ExplainReq, explain


def _to_dict(resp):
    if isinstance(resp, dict):
        return resp
    if hasattr(resp, "model_dump"):
        return resp.model_dump()  # pydantic v2
    if hasattr(resp, "dict"):
        return resp.dict()  # pydantic v1
    return {"bullets": getattr(resp, "bullets", []), "checklist": getattr(resp, "checklist", [])}


def test_explain_structure():
    req = ExplainReq(
        ruleCode="BRSR-9.1",
        periodStart="2025-04-01",
        periodEnd="2025-06-30",
        requiredFields=["electricity.kWh", "billingPeriod", "site"],
        presentMetrics=["electricity.kWh"],
        missingMetrics=["billingPeriod", "site"],
    )
    res = _to_dict(explain(req))  # type: ignore
    assert "bullets" in res and "checklist" in res
    assert any("Rule BRSR-9.1" in bullet for bullet in res["bullets"])
    labels = [item["label"] for item in res["checklist"]]
    assert "electricity.kWh" in labels
    done_map = {item["label"]: item["done"] for item in res["checklist"]}
    assert done_map["electricity.kWh"] is True
