from __future__ import annotations
from typing import Dict, List, Any, Optional
from app.config import settings
from .redact import scrub


def suggest_mapping_llm(headers: List[str]) -> Dict[str, str]:
    """
    Optional: ask an LLM to map headers when confidence is very low.
    Only runs if USE_LLM=true and creds are present. Returns {} otherwise.
    """
    if not settings.USE_LLM:
        return {}

    provider = (settings.LLM_PROVIDER or "openai").lower()
    if provider == "openai":
        try:
            import os
            from openai import OpenAI  # type: ignore
            if not settings.OPENAI_API_KEY:
                return {}
            os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
            client = OpenAI()
            prompt = (
                "Given CSV headers, map them to keys: date, kWh, site.\n"
                f"Headers: {headers}\n"
                "Respond as compact JSON object with keys date,kWh,site and header names as values."
            )
            resp = client.responses.create(
                model="gpt-4o-mini",
                input=prompt,
                temperature=0,
            )
            txt = resp.output_text  # type: ignore[attr-defined]
            import json
            m = json.loads(txt) if isinstance(txt, str) and txt.strip().startswith("{") else {}
            return {k: v for k, v in m.items() if k in {"date", "kWh", "site"} and isinstance(v, str)}
        except Exception:
            return {}
    else:
        try:
            import boto3  # type: ignore
            import json
            if not settings.BEDROCK_REGION:
                return {}
            br = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
            prompt = (
                "Given CSV headers, map them to keys: date, kWh, site.\n"
                f"Headers: {headers}\n"
                "Respond as compact JSON object with keys date,kWh,site and header names as values."
            )
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 256,
                "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            }
            out = br.invoke_model(
                modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
                body=json.dumps(body),
            )
            txt = out["body"].read().decode("utf-8")
            j = json.loads(txt) if isinstance(txt, str) and txt.strip().startswith("{") else {}
            return {k: v for k, v in j.items() if k in {"date", "kWh", "site"} and isinstance(v, str)}
        except Exception:
            return {}


def compliance_explain_llm(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not settings.USE_LLM:
        return None
    ctx = scrub(str(payload))
    try:
        provider = (settings.LLM_PROVIDER or "openai").lower()
        if provider == "openai":
            from openai import OpenAI  # type: ignore
            import os
            if not settings.OPENAI_API_KEY:
                return None
            os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
            client = OpenAI()
            prompt = (
                "You are an ESG compliance assistant. Given a rule code and context, "
                "produce 3-6 concise bullets and a checklist of data to collect. "
                "Do NOT say PASS/FAIL; no decisions.\n"
                f"Context:\n{ctx}\n"
                'Respond as JSON: {"bullets": [..], "checklist": [{"label":"...","done":true|false}]}'
            )
            r = client.responses.create(model="gpt-4o-mini", input=prompt, temperature=0)
            import json
            return json.loads(r.output_text)  # type: ignore[attr-defined]
        else:
            import boto3  # type: ignore
            import json
            if not settings.BEDROCK_REGION:
                return None
            br = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 400,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "You are an ESG compliance assistant. Given a rule code and context, "
                                    "produce 3-6 concise bullets and a checklist of data to collect. "
                                    "Do NOT say PASS/FAIL.\nContext:\n"
                                    + ctx
                                    + "\nRespond as compact JSON with keys bullets, checklist"
                                ),
                            }
                        ],
                    }
                ],
            }
            out = br.invoke_model(
                modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
                body=json.dumps(body),
            )
            txt = out["body"].read().decode("utf-8")
            return json.loads(txt)
    except Exception:
        return None


def narrative_llm(payload: Dict[str, Any]) -> Optional[str]:
    if not settings.USE_LLM:
        return None
    import json
    ctx = scrub(json.dumps(payload, ensure_ascii=False))
    try:
        provider = (settings.LLM_PROVIDER or "openai").lower()
        if provider == "openai":
            from openai import OpenAI  # type: ignore
            import os
            if not settings.OPENAI_API_KEY:
                return None
            os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY
            client = OpenAI()
            prompt = (
                "Write a 120–180 word ESG report section. "
                "Facts only, no PASS/FAIL. Include the factor token exactly as provided.\n"
                f"Context JSON:\n{ctx}\n"
                "Return ONLY the paragraph, no JSON, no preface."
            )
            r = client.responses.create(model="gpt-4o-mini", input=prompt, temperature=0.2)
            return r.output_text.strip()  # type: ignore[attr-defined]
        else:
            import boto3  # type: ignore
            if not settings.BEDROCK_REGION:
                return None
            import json as _json
            br = boto3.client("bedrock-runtime", region_name=settings.BEDROCK_REGION)
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 450,
                "temperature": 0.2,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Write a 120–180 word ESG report section. Facts only, "
                                    "no PASS/FAIL. Include the factor token exactly as provided.\n"
                                    f"Context JSON:\n{ctx}\n"
                                    "Return ONLY the paragraph."
                                ),
                            }
                        ],
                    }
                ],
            }
            out = br.invoke_model(modelId="anthropic.claude-3-5-sonnet-20240620-v1:0", body=_json.dumps(body))
            txt = out["body"].read().decode("utf-8").strip()
            return txt
    except Exception:
        return None



