import app.utils.ocr_utils as ocr_utils
from app.utils.ocr_utils import candidates_from_texts
from app.routers.ocr import _confidence_summary


def test_candidates_from_texts_simple():
    texts = ["Bill Date: 2025-08-01\nTotal consumption 12,345 kWh\nSite: HQ-01"]
    f = candidates_from_texts(texts)
    assert f["kWh"], "should find kWh"
    assert any("2025" in c["value"] for c in f["date"])
    assert any("HQ-01" in c["value"] for c in f["site"])


def test_confidence_summary_returns_band():
    fields = {
        "kWh": [{"value": "1234", "conf": 0.9}],
        "date": [{"value": "2025-08-01", "conf": 0.8}],
        "site": [{"value": "HQ-01", "conf": 0.6}],
    }
    confidence, band = _confidence_summary(fields)
    assert confidence > 0
    assert band in {"low", "medium", "high"}


class _FakePage:
    def __init__(self, text: str):
        self._text = text

    def extract_text(self):
        return self._text


class _FakePdf:
    def __init__(self, texts):
        self.pages = [_FakePage(text) for text in texts]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_extract_texts_from_pdf_without_fitz_uses_text_layer(monkeypatch):
    monkeypatch.setattr(ocr_utils, "fitz", None)
    monkeypatch.setattr(ocr_utils.pdfplumber, "open", lambda *_args, **_kwargs: _FakePdf(["Bill Date: 2025-08-01"]))

    texts = ocr_utils.extract_texts_from_pdf(b"%PDF-1.4", max_pages=1)

    assert texts == ["Bill Date: 2025-08-01"]


def test_extract_texts_from_pdf_without_fitz_raises_for_empty_pages(monkeypatch):
    monkeypatch.setattr(ocr_utils, "fitz", None)
    monkeypatch.setattr(ocr_utils.pdfplumber, "open", lambda *_args, **_kwargs: _FakePdf([""]))

    try:
        ocr_utils.extract_texts_from_pdf(b"%PDF-1.4", max_pages=1)
    except RuntimeError as exc:
        assert "PyMuPDF" in str(exc)
    else:
        raise AssertionError("expected extract_texts_from_pdf to require PyMuPDF for blank pages")
