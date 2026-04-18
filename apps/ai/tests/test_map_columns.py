from app.routers.map_columns import MapReq, map_columns
import app.routers.map_columns as map_module


def test_map_columns_returns_confidence_telemetry():
    req = MapReq(headers=["bill_date", "kwh_used", "site_name"])
    res = map_columns(req)  # type: ignore
    assert "mapping" in res
    assert "confidence" in res
    assert "confidence_band" in res
    assert "fallback_used" in res
    assert "latency_ms" in res
    assert res["mapping"]["date"] == "bill_date"
    assert res["mapping"]["kWh"] == "kwh_used"
    assert res["fallback_used"] is False
    assert res["latency_ms"] >= 0


def test_map_columns_low_confidence_uses_deterministic_fallback(monkeypatch):
    monkeypatch.setattr(
        map_module,
        "suggest_mapping_llm",
        lambda headers: {"date": "hdr_a", "kWh": "hdr_b", "site": "hdr_c"},
    )
    req = MapReq(headers=["hdr_a", "hdr_b", "hdr_c"])
    res = map_columns(req)  # type: ignore
    assert res["confidence_band"] in {"low", "medium", "high"}
    assert res["fallback_used"] is True
    assert res["mapping"]["date"] == "hdr_a"
    assert res["mapping"]["kWh"] == "hdr_b"
    assert res["mapping"]["site"] == "hdr_c"
