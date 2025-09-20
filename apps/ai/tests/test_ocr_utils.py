from app.utils.ocr_utils import candidates_from_texts


def test_candidates_from_texts_simple():
    texts = ["Bill Date: 2025-08-01\nTotal consumption 12,345 kWh\nSite: HQ-01"]
    f = candidates_from_texts(texts)
    assert f["kWh"], "should find kWh"
    assert any("2025" in c["value"] for c in f["date"])
    assert any("HQ-01" in c["value"] for c in f["site"])


