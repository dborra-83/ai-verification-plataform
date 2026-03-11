"""
handler.py — Lambda principal del módulo Document Automation
Orquesta: S3 upload → Textract OCR → Bedrock classify/extract/summarize → validaciones → DynamoDB
"""
import json
import os
import uuid
import time
import traceback
from datetime import datetime
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

from prompts import (
    CLASSIFY_PROMPT,
    EXTRACT_FIELDS_PROMPT,
    SUMMARIZE_PROMPT,
    FINDINGS_PROMPT,
    RECOMMEND_PROMPT,
)
from validators import run_validations

# ── Clientes AWS ──────────────────────────────────────────────────────────────
s3 = boto3.client("s3")
textract = boto3.client("textract")
bedrock = boto3.client("bedrock-runtime")
dynamodb = boto3.resource("dynamodb")

BUCKET = os.environ.get("S3_BUCKET", "")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
TABLE_NAME = os.environ.get("DYNAMO_TABLE", "DocAutomationHistory")
TEXTRACT_MODE = os.environ.get("TEXTRACT_MODE", "sync")
DEMO_PREFIX = os.environ.get("DEMO_DOCS_S3_PREFIX", "demo-docs/")

CORS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

SUPPORTED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


# ── Helpers ───────────────────────────────────────────────────────────────────

def ok(body: dict, code: int = 200):
    return {"statusCode": code, "headers": CORS, "body": json.dumps(body, ensure_ascii=False, default=_json_serial)}


def err(code: int, error_code: str, message: str):
    return {"statusCode": code, "headers": CORS, "body": json.dumps({"error": error_code, "message": message})}


def _json_serial(obj):
    """Serializa tipos no-JSON como Decimal y datetime."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def get_table():
    return dynamodb.Table(TABLE_NAME)


def bedrock_invoke(prompt: str, max_tokens: int = 1024) -> str:
    """Invoca Bedrock con retry básico (máx 2 intentos)."""
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "messages": [{"role": "user", "content": prompt}],
    }
    for attempt in range(2):
        try:
            resp = bedrock.invoke_model(modelId=MODEL_ID, body=json.dumps(payload))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt == 1:
                raise
            print(f"Bedrock attempt {attempt+1} failed: {e}. Retrying…")
            time.sleep(1)


def parse_json_from_text(text: str):
    """Extrae el primer bloque JSON válido de un string."""
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    # Intentar array
    start = text.find("[")
    end = text.rfind("]") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    return None


# ── Textract ──────────────────────────────────────────────────────────────────

def textract_extract(s3_key: str) -> tuple[str, list, list]:
    """
    Extrae texto de un documento en S3 usando Textract.
    Retorna (texto_completo, bloques_raw, tablas_detectadas).
    """
    doc = {"S3Object": {"Bucket": BUCKET, "Name": s3_key}}

    if TEXTRACT_MODE == "async":
        # Async para PDFs grandes (>5 páginas)
        job = textract.start_document_text_detection(DocumentLocation=doc)
        job_id = job["JobId"]
        for _ in range(30):
            time.sleep(3)
            result = textract.get_document_text_detection(JobId=job_id)
            if result["JobStatus"] in ("SUCCEEDED", "FAILED"):
                break
        if result["JobStatus"] != "SUCCEEDED":
            raise Exception("Textract async job failed")
        blocks = result.get("Blocks", [])
    else:
        try:
            result = textract.detect_document_text(Document=doc)
            blocks = result.get("Blocks", [])
        except ClientError as e:
            raise Exception(f"Textract error: {e}")

    lines = [b["Text"] for b in blocks if b["BlockType"] == "LINE"]
    text = "\n".join(lines)

    if len(text.strip()) < 20:
        raise Exception("documento_ilegible")

    return text, blocks, []


# ── Bedrock steps ─────────────────────────────────────────────────────────────

def bedrock_classify(text: str) -> tuple[str, float]:
    raw = bedrock_invoke(CLASSIFY_PROMPT.format(text=text[:3000]))
    parsed = parse_json_from_text(raw)
    if parsed:
        return parsed.get("document_type", "otro"), float(parsed.get("confidence", 0.5))
    return "otro", 0.5


def bedrock_extract_fields(text: str, doc_type: str) -> dict:
    raw = bedrock_invoke(EXTRACT_FIELDS_PROMPT.format(text=text[:3000], doc_type=doc_type), max_tokens=800)
    parsed = parse_json_from_text(raw)
    return parsed if isinstance(parsed, dict) else {}


def bedrock_summarize(text: str, doc_type: str) -> str:
    try:
        return bedrock_invoke(SUMMARIZE_PROMPT.format(text=text[:2000], doc_type=doc_type), max_tokens=300).strip()
    except Exception:
        return "No se pudo generar el resumen."


def bedrock_find_issues(text: str, fields: dict, validations: list) -> list:
    raw = bedrock_invoke(
        FINDINGS_PROMPT.format(
            doc_type="documento",
            fields=json.dumps(fields, ensure_ascii=False),
            validations=json.dumps(validations, ensure_ascii=False),
        ),
        max_tokens=500,
    )
    parsed = parse_json_from_text(raw)
    if isinstance(parsed, list):
        return parsed
    return []


def bedrock_recommend(doc_type: str, validations: list, findings: list) -> dict:
    raw = bedrock_invoke(
        RECOMMEND_PROMPT.format(
            doc_type=doc_type,
            validations=json.dumps(validations, ensure_ascii=False),
            findings=json.dumps(findings, ensure_ascii=False),
        ),
        max_tokens=300,
    )
    parsed = parse_json_from_text(raw)
    if isinstance(parsed, dict):
        return parsed
    return {"action": "Derivar a revisión manual", "reason": "No se pudo determinar acción automática.", "priority": "media"}


# ── Flujo principal de análisis ───────────────────────────────────────────────

def analyze(s3_key: str) -> dict:
    document_id = str(uuid.uuid4())
    processed_at = datetime.utcnow().isoformat()

    # 1. OCR con Textract
    try:
        text, blocks, tables = textract_extract(s3_key)
    except Exception as e:
        if "documento_ilegible" in str(e):
            raise Exception("documento_ilegible")
        raise

    ocr_quality = "alta" if len(text) > 500 else "baja"
    findings_extra = []
    if ocr_quality == "baja":
        findings_extra.append("Calidad de OCR baja — el texto extraído puede ser incompleto")

    # 2. Clasificar
    doc_type, confidence = bedrock_classify(text)

    # 3. Extraer campos
    fields = bedrock_extract_fields(text, doc_type)

    # 4. Resumen
    summary = bedrock_summarize(text, doc_type)

    # 5. Validaciones institucionales
    validations = run_validations(fields, doc_type)

    # 6. Hallazgos
    findings = bedrock_find_issues(text, fields, validations)
    findings = findings_extra + findings

    # 7. Recomendación
    next_action = bedrock_recommend(doc_type, validations, findings)

    result = {
        "document_id": document_id,
        "processed_at": processed_at,
        "s3_key": s3_key,
        "document_type": doc_type,
        "confidence": confidence,
        "extracted_text": text[:2000],
        "summary": summary,
        "fields": fields,
        "validations": validations,
        "findings": findings,
        "recommended_action": next_action,
        "ocr_quality": ocr_quality,
    }

    # 8. Guardar en DynamoDB
    try:
        get_table().put_item(Item=result)
    except Exception as e:
        print(f"DynamoDB save error (non-fatal): {e}")

    return result


# ── Handlers de endpoints ─────────────────────────────────────────────────────

def handle_upload(event):
    """POST /doc-automation/upload — genera presigned URL para subir a S3."""
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return err(400, "INVALID_JSON", "El body debe ser JSON válido")

    filename = body.get("filename", "")
    content_type = body.get("contentType", "")

    if not filename or not content_type:
        return err(400, "MISSING_FIELDS", "filename y contentType son requeridos")

    if content_type not in SUPPORTED_TYPES:
        return err(400, "UNSUPPORTED_TYPE", f"Tipo no soportado. Use: {', '.join(SUPPORTED_TYPES)}")

    now = datetime.utcnow()
    s3_key = f"doc-automation/{now.year:04d}/{now.month:02d}/{now.day:02d}/{uuid.uuid4()}-{filename}"

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET, "Key": s3_key, "ContentType": content_type},
            ExpiresIn=3600,
        )
    except ClientError as e:
        return err(500, "PRESIGN_ERROR", str(e))

    return ok({"uploadUrl": url, "s3Key": s3_key})


def handle_analyze(event):
    """POST /doc-automation/analyze — ejecuta el flujo completo."""
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return err(400, "INVALID_JSON", "El body debe ser JSON válido")

    s3_key = body.get("s3Key")
    if not s3_key:
        return err(400, "MISSING_S3_KEY", "s3Key es requerido")

    # Validar tamaño del archivo
    try:
        head = s3.head_object(Bucket=BUCKET, Key=s3_key)
        if head["ContentLength"] > MAX_FILE_BYTES:
            return err(400, "FILE_TOO_LARGE", "El archivo supera el límite de 10 MB")
    except ClientError:
        return err(404, "FILE_NOT_FOUND", "No se encontró el archivo en S3")

    try:
        result = analyze(s3_key)
        return ok(result)
    except Exception as e:
        msg = str(e)
        print(f"analyze error: {msg}\n{traceback.format_exc()}")
        if "documento_ilegible" in msg:
            return err(422, "DOCUMENTO_ILEGIBLE", "No se pudo extraer texto del documento. Verifique que sea legible.")
        return err(500, "PROCESSING_ERROR", f"Error al procesar el documento: {msg}")


def handle_history(event):
    """GET /doc-automation/history — lista documentos procesados."""
    try:
        items = get_table().scan(Limit=50).get("Items", [])
        # Ordenar por fecha descendente
        items.sort(key=lambda x: x.get("processed_at", ""), reverse=True)
        return ok({"items": items, "count": len(items)})
    except Exception as e:
        return err(500, "DYNAMO_ERROR", str(e))


def handle_demo_docs(event):
    """GET /doc-automation/demo-docs — lista documentos de ejemplo en S3."""
    try:
        resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=DEMO_PREFIX)
        docs = []
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            name = key.replace(DEMO_PREFIX, "").strip("/")
            if name:
                docs.append({
                    "s3Key": key,
                    "name": name,
                    "size": obj["Size"],
                    "lastModified": obj["LastModified"].isoformat(),
                })
        return ok({"docs": docs})
    except Exception as e:
        return err(500, "S3_ERROR", str(e))


# ── Router principal ──────────────────────────────────────────────────────────

def lambda_handler(event, context):
    print(f"DocAutomation event: {json.dumps({k: v for k, v in event.items() if k != 'body'})}")

    method = event.get("httpMethod", "GET").upper()
    path = event.get("path", "")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    if method == "POST" and path.endswith("/upload"):
        return handle_upload(event)
    if method == "POST" and path.endswith("/analyze"):
        return handle_analyze(event)
    if method == "GET" and path.endswith("/history"):
        return handle_history(event)
    if method == "GET" and path.endswith("/demo-docs"):
        return handle_demo_docs(event)

    return err(404, "NOT_FOUND", f"Endpoint no encontrado: {method} {path}")
