from __future__ import annotations
import os
from typing import Optional

import boto3
import requests
from fastapi import HTTPException


def _s3_client():
    if not (os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY")):
        return None
    return boto3.client(
        "s3",
        region_name=os.getenv("AWS_REGION") or os.getenv("S3_REGION"),
        endpoint_url=os.getenv("S3_ENDPOINT"),
    )


def fetch_bytes(*, s3Key: Optional[str] = None, url: Optional[str] = None, default_bucket: Optional[str] = None) -> bytes:
    if url:
        try:
            r = requests.get(url, timeout=15)
            if r.status_code != 200:
                raise HTTPException(400, f"URL fetch failed ({r.status_code})")
            return r.content
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"URL fetch error: {e}") from e

    if s3Key:
        s3 = _s3_client()
        if s3 is None:
            raise HTTPException(400, "S3 credentials not configured")
        bucket, key = default_bucket, s3Key
        if "://" in s3Key:  # s3://bucket/key
            _, rest = s3Key.split("://", 1)
            bucket, key = rest.split("/", 1)[0], rest.split("/", 1)[1]
        elif "/" in s3Key and not default_bucket:
            bucket, key = s3Key.split("/", 1)
        if not bucket:
            raise HTTPException(400, "S3 bucket not provided")
        try:
            obj = s3.get_object(Bucket=bucket, Key=key)
            return obj["Body"].read()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"S3 fetch failed: {e}") from e

    raise HTTPException(400, "Provide either url or s3Key")


