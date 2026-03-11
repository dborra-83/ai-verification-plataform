# validators.py — Lógica de validación de reglas institucionales configurables
import re
from datetime import datetime, date

# Configuración de umbrales (se pueden sobreescribir via env vars)
MIN_PROMEDIO = 5.0
MAX_DOC_AGE_MONTHS = 12
MIN_AGE = 17


def _parse_date(value: str):
    """Intenta parsear una fecha en múltiples formatos comunes."""
    if not value:
        return None
    formats = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _months_between(d1: date, d2: date) -> int:
    """Calcula la diferencia en meses entre dos fechas (d2 - d1)."""
    return (d2.year - d1.year) * 12 + (d2.month - d1.month)


def _years_between(birth: date, today: date) -> int:
    """Calcula la edad en años completos."""
    age = today.year - birth.year
    if (today.month, today.day) < (birth.month, birth.day):
        age -= 1
    return age


def _parse_float(value) -> float | None:
    """Convierte un valor a float, manejando comas como separador decimal."""
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "."))
    except (ValueError, TypeError):
        return None


def _validate_email(email: str) -> bool:
    pattern = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, str(email)))


def _check_required_fields(fields: dict, required: list) -> dict:
    missing = [f for f in required if not fields.get(f)]
    if missing:
        return {
            "rule": "campos_minimos_presentes",
            "status": "fail",
            "detail": f"Campos faltantes: {', '.join(missing)}"
        }
    return {
        "rule": "campos_minimos_presentes",
        "status": "pass",
        "detail": "Todos los campos requeridos encontrados"
    }


def _check_promedio(fields: dict, min_val: float = MIN_PROMEDIO) -> dict:
    raw = fields.get("promedio")
    val = _parse_float(raw)
    if val is None:
        return {"rule": "promedio_minimo", "status": "warning", "detail": "No se pudo leer el promedio"}
    if val >= min_val:
        return {"rule": "promedio_minimo", "status": "pass", "detail": f"Promedio {val} supera el umbral mínimo de {min_val}"}
    return {"rule": "promedio_minimo", "status": "fail", "detail": f"Promedio {val} no alcanza el mínimo requerido de {min_val}"}


def _check_fecha_vigente(fields: dict, field: str, max_months: int = MAX_DOC_AGE_MONTHS) -> dict:
    raw = fields.get(field)
    doc_date = _parse_date(raw)
    if doc_date is None:
        return {"rule": "fecha_vigente", "status": "warning", "detail": "No se pudo leer la fecha de emisión"}
    months_old = _months_between(doc_date, date.today())
    if months_old <= max_months:
        return {"rule": "fecha_vigente", "status": "pass", "detail": f"Documento emitido dentro del período válido ({max_months} meses)"}
    return {"rule": "fecha_vigente", "status": "warning", "detail": f"Documento emitido hace más de {max_months} meses"}


def _check_no_vencido(fields: dict, field: str) -> dict:
    raw = fields.get(field)
    exp_date = _parse_date(raw)
    if exp_date is None:
        return {"rule": "no_vencido", "status": "warning", "detail": "No se pudo leer la fecha de vencimiento"}
    if exp_date >= date.today():
        return {"rule": "no_vencido", "status": "pass", "detail": f"Documento vigente hasta {exp_date}"}
    return {"rule": "no_vencido", "status": "fail", "detail": f"Documento vencido el {exp_date}"}


def _check_mayor_edad(fields: dict, field: str, min_age: int = MIN_AGE) -> dict:
    raw = fields.get(field)
    birth = _parse_date(raw)
    if birth is None:
        return {"rule": "mayor_edad", "status": "warning", "detail": "No se pudo leer la fecha de nacimiento"}
    age = _years_between(birth, date.today())
    if age >= min_age:
        return {"rule": "mayor_edad", "status": "pass", "detail": f"Edad {age} años cumple el requisito mínimo de {min_age}"}
    return {"rule": "mayor_edad", "status": "fail", "detail": f"Edad {age} años no cumple el mínimo de {min_age} años"}


def _check_email(fields: dict, field: str) -> dict:
    val = fields.get(field)
    if not val:
        return {"rule": "correo_valido", "status": "fail", "detail": "Correo electrónico no encontrado"}
    if _validate_email(val):
        return {"rule": "correo_valido", "status": "pass", "detail": f"Correo {val} tiene formato válido"}
    return {"rule": "correo_valido", "status": "fail", "detail": f"Correo '{val}' no tiene formato válido"}


def _check_completeness(fields: dict) -> dict:
    nulls = [k for k, v in fields.items() if v is None]
    if not nulls:
        return {"rule": "sin_campos_vacios", "status": "pass", "detail": "Todos los campos extraídos tienen valor"}
    return {"rule": "sin_campos_vacios", "status": "warning", "detail": f"Campos sin valor: {', '.join(nulls)}"}


# ── Dispatcher principal ──────────────────────────────────────────────────────

def run_validations(fields: dict, doc_type: str) -> list:
    """
    Ejecuta las reglas de validación correspondientes al tipo de documento.
    Retorna lista de dicts con {rule, status, detail}.
    """
    results = []

    if doc_type == "certificado_academico":
        results.append(_check_required_fields(fields, ["nombre_completo", "institucion", "fecha_emision"]))
        results.append(_check_promedio(fields))
        results.append(_check_fecha_vigente(fields, "fecha_emision"))
        if not fields.get("institucion"):
            results.append({"rule": "institucion_presente", "status": "fail", "detail": "Institución no encontrada"})
        else:
            results.append({"rule": "institucion_presente", "status": "pass", "detail": f"Institución: {fields.get('institucion')}"})

    elif doc_type == "documento_identidad":
        results.append(_check_required_fields(fields, ["nombre", "numero_documento", "fecha_nacimiento"]))
        results.append(_check_no_vencido(fields, "fecha_vencimiento"))
        results.append(_check_mayor_edad(fields, "fecha_nacimiento"))

    elif doc_type == "formulario_inscripcion":
        results.append(_check_required_fields(fields, ["nombre", "carrera", "correo"]))
        results.append(_check_email(fields, "correo"))
        results.append(_check_completeness(fields))

    elif doc_type == "historial_academico":
        results.append(_check_required_fields(fields, ["nombre_completo", "institucion", "promedio_general"]))
        results.append(_check_promedio({**fields, "promedio": fields.get("promedio_general")}))

    elif doc_type == "comprobante_pago":
        results.append(_check_required_fields(fields, ["nombre", "monto", "fecha", "concepto"]))
        results.append(_check_fecha_vigente(fields, "fecha", max_months=3))

    elif doc_type == "carta_motivacion":
        results.append(_check_required_fields(fields, ["nombre", "carrera_postulada"]))

    elif doc_type == "constancia_administrativa":
        results.append(_check_required_fields(fields, ["nombre_completo", "tipo_constancia", "institucion"]))
        results.append(_check_fecha_vigente(fields, "fecha_emision"))

    else:
        # Tipo desconocido: solo verificar que haya algún campo
        if fields:
            results.append({"rule": "campos_detectados", "status": "pass", "detail": f"Se detectaron {len(fields)} campos"})
        else:
            results.append({"rule": "campos_detectados", "status": "warning", "detail": "No se detectaron campos estructurados"})

    return results
