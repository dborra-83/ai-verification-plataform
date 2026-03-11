#!/usr/bin/env python3
"""
generate_demo_docs.py — Genera 4 PDFs de ejemplo para la demo de Document Automation.
Requiere: pip install fpdf2

Uso:
    python scripts/generate_demo_docs.py
    # Luego subir a S3:
    # aws s3 cp scripts/demo_docs/ s3://[bucket]/demo-docs/ --recursive
"""
import os
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("ERROR: fpdf2 no instalado. Ejecuta: pip install fpdf2")
    raise

OUTPUT_DIR = Path(__file__).parent / "demo_docs"
OUTPUT_DIR.mkdir(exist_ok=True)


class DocPDF(FPDF):
    def header_block(self, title: str, subtitle: str = ""):
        self.set_fill_color(0, 102, 204)
        self.rect(0, 0, 210, 28, "F")
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 16)
        self.set_xy(0, 8)
        self.cell(210, 8, title, align="C")
        if subtitle:
            self.set_font("Helvetica", "", 10)
            self.set_xy(0, 18)
            self.cell(210, 6, subtitle, align="C")
        self.set_text_color(30, 30, 30)
        self.set_y(35)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 6, "Documento generado para fines de demostración — CloudHesive Demo", align="C")

    def field_row(self, label: str, value: str):
        self.set_font("Helvetica", "B", 10)
        self.set_x(20)
        self.cell(60, 8, label)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 8, value)
        self.ln()

    def section_title(self, text: str):
        self.set_font("Helvetica", "B", 11)
        self.set_fill_color(240, 247, 255)
        self.set_x(20)
        self.cell(170, 8, text, fill=True)
        self.ln(10)


# ── 1. Certificado de notas ───────────────────────────────────────────────────

def gen_certificado_notas():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CERTIFICADO DE NOTAS", "Universidad de Chile — Secretaría de Estudios")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_x(20)
    pdf.multi_cell(170, 7, "Por medio del presente documento, la Secretaría de Estudios de la Universidad de Chile certifica que:")
    pdf.ln(4)

    pdf.field_row("Nombre completo:", "María Fernanda González Rojas")
    pdf.field_row("RUT:", "15.234.567-8")
    pdf.field_row("Carrera:", "Ingeniería Civil en Informática")
    pdf.field_row("Facultad:", "Facultad de Ciencias Físicas y Matemáticas")
    pdf.field_row("Promedio general:", "6.2 (escala 1.0 – 7.0)")
    pdf.field_row("Fecha de emisión:", "2024-11-15")
    pdf.field_row("Año de ingreso:", "2019")
    pdf.field_row("Estado académico:", "Alumna regular")
    pdf.ln(6)

    pdf.section_title("Detalle de asignaturas (últimos 2 semestres)")
    materias = [
        ("Sistemas Distribuidos", "6.5"),
        ("Inteligencia Artificial", "6.8"),
        ("Ingeniería de Software", "5.9"),
        ("Bases de Datos Avanzadas", "6.1"),
        ("Proyecto de Título I", "6.4"),
    ]
    for nombre, nota in materias:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_x(25)
        pdf.cell(130, 7, nombre)
        pdf.cell(0, 7, nota)
        pdf.ln()

    pdf.ln(10)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(20)
    pdf.cell(80, 7, "Santiago, 15 de noviembre de 2024")
    pdf.ln(14)
    pdf.set_x(20)
    pdf.cell(60, 7, "_______________________________")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(60, 7, "Secretaria de Estudios")
    pdf.ln(4)
    pdf.set_x(20)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(60, 7, "Universidad de Chile")

    path = OUTPUT_DIR / "certificado_notas_ejemplo.pdf"
    pdf.output(str(path))
    print(f"✓ {path}")


# ── 2. Documento de identidad ─────────────────────────────────────────────────

def gen_documento_identidad():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CÉDULA DE IDENTIDAD", "República de Chile — Registro Civil e Identificación")

    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_x(20)
    pdf.cell(0, 10, "DOCUMENTO DE IDENTIDAD OFICIAL")
    pdf.ln(12)

    pdf.field_row("Apellidos:", "RAMÍREZ VEGA")
    pdf.field_row("Nombres:", "Carlos Andrés")
    pdf.field_row("Número de documento:", "1.234.567-8")
    pdf.field_row("Fecha de nacimiento:", "14 de mayo de 1998")
    pdf.field_row("Nacionalidad:", "Chilena")
    pdf.field_row("Sexo:", "Masculino")
    pdf.field_row("Fecha de emisión:", "2022-05-14")
    pdf.field_row("Fecha de vencimiento:", "2028-05-14")
    pdf.field_row("Lugar de emisión:", "Santiago, Región Metropolitana")

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_x(20)
    pdf.multi_cell(170, 6, "Este documento es válido como identificación oficial en todo el territorio nacional. "
                           "Cualquier alteración o falsificación es penada por la ley.")

    path = OUTPUT_DIR / "documento_identidad_ejemplo.pdf"
    pdf.output(str(path))
    print(f"✓ {path}")


# ── 3. Formulario de inscripción ──────────────────────────────────────────────

def gen_formulario_inscripcion():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("FORMULARIO DE INSCRIPCIÓN", "Proceso de Admisión 2025 — Pontificia Universidad Católica de Chile")

    pdf.ln(4)
    pdf.section_title("Datos personales del postulante")
    pdf.field_row("Nombre completo:", "Valentina Sofía Morales Pérez")
    pdf.field_row("RUT:", "20.456.789-K")
    pdf.field_row("Fecha de nacimiento:", "03 de agosto de 2001")
    pdf.field_row("Correo electrónico:", "v.morales@estudiante.edu")
    pdf.field_row("Teléfono:", "+56 9 8765 4321")
    pdf.field_row("Dirección:", "Av. Providencia 1234, Santiago")

    pdf.ln(4)
    pdf.section_title("Datos académicos")
    pdf.field_row("Carrera postulada:", "Medicina")
    pdf.field_row("Campus:", "Campus San Joaquín")
    pdf.field_row("Modalidad:", "Diurna")
    pdf.field_row("Puntaje PSU/PAES:", "720 puntos")
    pdf.field_row("Establecimiento de origen:", "Colegio San Ignacio El Bosque")

    pdf.ln(4)
    pdf.section_title("Documentos adjuntos")
    docs = [
        ("Certificado de notas", "✓ Adjunto"),
        ("Cédula de identidad", "✓ Adjunto"),
        ("Certificado de egreso", "✓ Adjunto"),
        ("Carta de motivación", "Pendiente"),
    ]
    for doc, estado in docs:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_x(25)
        pdf.cell(130, 7, doc)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 7, estado)
        pdf.ln()

    pdf.ln(10)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(20)
    pdf.cell(0, 7, "Firma del postulante: _______________________________")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.cell(0, 7, "Fecha: 10 de enero de 2025")

    path = OUTPUT_DIR / "formulario_inscripcion_ejemplo.pdf"
    pdf.output(str(path))
    print(f"✓ {path}")


# ── 4. Carta de motivación ────────────────────────────────────────────────────

def gen_carta_motivacion():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CARTA DE MOTIVACIÓN")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_x(20)
    pdf.cell(0, 8, "Santiago, 10 de enero de 2025")
    pdf.ln(10)

    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Comité de Admisiones")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.cell(0, 8, "Doctorado en Ciencias de la Computación")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.cell(0, 8, "Pontificia Universidad Católica de Chile")
    pdf.ln(10)

    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Estimado Comité de Admisiones:")
    pdf.ln(10)

    paragraphs = [
        ("Mi nombre es Sebastián Ignacio Torres Fuentes, egresado de Ingeniería Civil en Computación de la "
         "Universidad de Chile con promedio 6.4. Me dirijo a ustedes con el propósito de expresar mi interés "
         "en postular al programa de Doctorado en Ciencias de la Computación de esta prestigiosa institución."),

        ("Durante mi formación de pregrado desarrollé una sólida base en algoritmos, sistemas distribuidos e "
         "inteligencia artificial. Mi memoria de título, titulada 'Optimización de modelos de lenguaje para "
         "procesamiento de documentos en español', obtuvo distinción máxima y fue presentada en el congreso "
         "CLEI 2024, lo que reforzó mi vocación por la investigación aplicada."),

        ("Estoy convencido de que el programa doctoral de la PUC me brindará el entorno académico y los "
         "recursos necesarios para desarrollar investigación de impacto en el área de procesamiento de "
         "lenguaje natural aplicado a contextos latinoamericanos. Específicamente, me interesa trabajar "
         "bajo la supervisión del Dr. Juan Pérez en el laboratorio de NLP."),

        ("Quedo a disposición para cualquier consulta adicional y agradezco de antemano la consideración "
         "de mi postulación."),
    ]

    pdf.set_font("Helvetica", "", 10)
    for para in paragraphs:
        pdf.set_x(20)
        pdf.multi_cell(170, 6, para)
        pdf.ln(5)

    pdf.ln(6)
    pdf.set_x(20)
    pdf.cell(0, 8, "Atentamente,")
    pdf.ln(12)
    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Sebastián Ignacio Torres Fuentes")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, "RUT: 18.765.432-1")
    pdf.ln(4)
    pdf.set_x(20)
    pdf.cell(0, 7, "s.torres@uchile.cl | +56 9 1234 5678")

    path = OUTPUT_DIR / "carta_motivacion_ejemplo.pdf"
    pdf.output(str(path))
    print(f"✓ {path}")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Generando documentos en: {OUTPUT_DIR}\n")
    gen_certificado_notas()
    gen_documento_identidad()
    gen_formulario_inscripcion()
    gen_carta_motivacion()
    print(f"\n✅ 4 documentos generados en {OUTPUT_DIR}")
    print("\nPara subir a S3:")
    print("  aws s3 cp scripts/demo_docs/ s3://[BUCKET_NAME]/demo-docs/ --recursive")
    print("\nReemplaza [BUCKET_NAME] con el nombre de tu bucket de uploads.")
