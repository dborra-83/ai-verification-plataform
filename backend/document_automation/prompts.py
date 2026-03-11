# prompts.py — Todos los prompts de Bedrock para el módulo Document Automation
# Editar estos strings para ajustar el comportamiento del análisis sin tocar handler.py

CLASSIFY_PROMPT = """Eres un sistema de clasificación documental para una universidad latinoamericana.
Analiza el siguiente texto extraído de un documento y clasifícalo en UNA de estas categorías:
- certificado_academico
- documento_identidad
- formulario_inscripcion
- carta_motivacion
- comprobante_pago
- historial_academico
- constancia_administrativa
- otro

Responde SOLO con un JSON con este formato exacto:
{{
  "document_type": "<categoria>",
  "confidence": <número entre 0 y 1>,
  "reasoning": "<explicación breve en español>"
}}

Texto del documento:
{text}
"""

EXTRACT_FIELDS_PROMPT = """Eres un extractor de información de documentos académicos.
Dado el siguiente texto de un documento de tipo "{doc_type}", extrae todos los campos relevantes.

Para certificado_academico extrae: nombre_completo, id_documento, institucion, promedio, fecha_emision, carrera, materias (si hay lista).
Para documento_identidad extrae: nombre, numero_documento, fecha_nacimiento, fecha_vencimiento, nacionalidad.
Para formulario_inscripcion extrae: nombre, carrera, campus, correo, telefono, campos_incompletos.
Para carta_motivacion extrae: nombre, carrera_postulada, institucion_destino, fecha.
Para comprobante_pago extrae: nombre, monto, fecha, concepto, numero_operacion.
Para historial_academico extrae: nombre_completo, id_documento, institucion, promedio_general, carrera, periodo.
Para constancia_administrativa extrae: nombre_completo, tipo_constancia, institucion, fecha_emision, vigencia.
Para otro extrae: cualquier campo relevante que encuentres.

Responde SOLO con un JSON donde las claves son los nombres de campo y los valores son los datos extraídos.
Si un campo no se encuentra, usa null.

Texto del documento:
{text}
"""

SUMMARIZE_PROMPT = """Eres un asistente administrativo universitario.
Genera un resumen ejecutivo breve (2-3 oraciones) del siguiente documento de tipo "{doc_type}".
El resumen debe ser en español, profesional, y mencionar los datos más relevantes para
un proceso de admisión o gestión académica.

Responde SOLO con el texto del resumen, sin JSON ni formato adicional.

Texto del documento:
{text}
"""

FINDINGS_PROMPT = """Eres un auditor de documentos universitarios.
Analiza la siguiente información de un documento y detecta problemas, inconsistencias o información faltante.

Tipo de documento: {doc_type}
Campos extraídos: {fields}
Validaciones ejecutadas: {validations}

Genera una lista de hallazgos concretos y accionables en español.
Responde SOLO con un JSON array de strings.
Ejemplo: ["No se detectó sello institucional", "La fecha de emisión supera los 12 meses recomendados"]

Si no hay hallazgos relevantes, responde: []
"""

RECOMMEND_PROMPT = """Eres un coordinador de admisiones universitario.
Basándote en el análisis de este documento, recomienda la acción operativa más apropiada.

Tipo de documento: {doc_type}
Validaciones: {validations}
Hallazgos: {findings}

Elige UNA de estas acciones y explica brevemente el motivo:
- Aprobar preliminarmente
- Derivar a revisión manual
- Solicitar documento complementario
- Solicitar versión legible del documento
- Pasar a revisión académica
- Rechazar por documentación incompleta

Responde SOLO con un JSON:
{{
  "action": "<acción elegida>",
  "reason": "<motivo breve en español>",
  "priority": "<alta|media|baja>"
}}
"""
