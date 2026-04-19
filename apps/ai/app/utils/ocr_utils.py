from __future__ import annotations
import io
import re
from typing import Any, Dict, List

import pdfplumber
import pytesseract
from PIL import Image
from app.config import settings

try:
    import fitz  # PyMuPDF
except ModuleNotFoundError:  # pragma: no cover - exercised via monkeypatch in tests
    fitz = None


DATE = re.compile(r"\b(20\d{2}[-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12]\d|3[01]))\b|\b((0?[1-9]|[12]\d|3[01])[-/\.](0?[1-9]|1[0-2])[-/]20\d{2})\b")
KWH = re.compile(r"\b([1-9]\d{0,3}(?:[,\s]?\d{3})*(?:\.\d+)?)\s*(kwh|kWh|KWH)\b")
SITE_NEAR = re.compile(r"(site|account|location|meter|service)\s*[:\-]?\s*([A-Za-z0-9\-_/]+)", re.I)


SUPPORTED_LANGS = {"eng", "hin", "eng+hin"}


def extract_texts_from_pdf(
    data: bytes, max_pages: int | None = None, lang: str = "eng"
) -> List[str]:
    if max_pages is None:
        max_pages = int(getattr(settings, "OCR_MAX_PAGES", 4))
    if lang not in SUPPORTED_LANGS:
        lang = "eng"
    texts: List[str] = []
    # Try text layer
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages[:max_pages]:
            t = page.extract_text() or ""
            texts.append(t)

    # For empty pages, OCR raster image
    if not any(not text.strip() for text in texts):
        return texts

    if fitz is None:
        raise RuntimeError("PyMuPDF is required for raster OCR on PDF pages without extractable text")

    with fitz.open(stream=data, filetype="pdf") as doc:
        for i in range(min(max_pages, len(doc))):
            if texts[i].strip():
                continue
            page = doc.load_page(i)
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes()))
            texts[i] = pytesseract.image_to_string(img, lang=lang)

    return texts


def detect_primary_language(image: Image.Image) -> str:
    """Run OCR with both eng and hin, compare confidence to pick the dominant language."""
    try:
        eng_data = pytesseract.image_to_data(image, lang="eng", output_type=pytesseract.Output.DICT)
        hin_data = pytesseract.image_to_data(image, lang="hin", output_type=pytesseract.Output.DICT)
    except pytesseract.TesseractError:
        return "eng"

    def _avg_conf(data: Dict[str, Any]) -> float:
        confs = [int(c) for c in data.get("conf", []) if int(c) >= 0]
        return sum(confs) / len(confs) if confs else 0.0

    eng_conf = _avg_conf(eng_data)
    hin_conf = _avg_conf(hin_data)

    if hin_conf > eng_conf + 5:
        return "hin"
    if eng_conf > hin_conf + 5:
        return "eng"
    return "eng+hin"


def candidates_from_texts(texts: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    fields: Dict[str, List[Dict[str, Any]]] = {"kWh": [], "date": [], "site": []}
    for t in texts:
        for m in DATE.finditer(t):
            val = m.group(0).replace(".", "-").replace("/", "-")
            fields["date"].append({"value": val, "conf": 0.7})
        for m in KWH.finditer(t):
            num = m.group(1).replace(",", "").replace(" ", "")
            try:
                v = float(num)
                fields["kWh"].append({"value": str(v), "conf": 0.85})
            except Exception:  # noqa: BLE001
                pass
        for m in SITE_NEAR.finditer(t):
            fields["site"].append({"value": m.group(2), "conf": 0.6})

    # de-dup and trim
    for k in list(fields.keys()):
        seen, out = set(), []
        for c in fields[k]:
            if c["value"] in seen:
                continue
            out.append(c)
            seen.add(c["value"])
        fields[k] = out[:5]
    return fields

