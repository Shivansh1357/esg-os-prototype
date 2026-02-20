# AI Service (FastAPI)

FastAPI service providing OCR, column mapping suggestions, narrative drafting, and compliance guidance.

## Run
```bash
python -m venv .venv && . .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Endpoints
- POST `/ocr/utility-bill` → { tables, fields:[{name, candidates:[{value, conf}]}] }
- POST `/map/columns` → { mapping:{kWh, date, site}, confidence }
- POST `/narrative/section` → { text, citations }
- POST `/compliance/explain` → { bullets, checklist }

## Env
- `CORS_ORIGINS` (e.g., http://localhost:5050)
- Optional LLM: `USE_LLM=true`, `OPENAI_API_KEY` or `BEDROCK_REGION`
- Optional S3 reads: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT`

## Tests
```bash
pytest -q
```
