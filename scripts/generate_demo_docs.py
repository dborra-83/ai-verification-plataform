#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_demo_docs.py - Genera 4 PDFs de ejemplo para Document Automation demo.
Requiere: pip install fpdf2
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
    def header_block(self, title, subtitle=""):
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
        self.cell(0, 6, "Documento generado para fines de demostracion - CloudHesive Demo", align="C")

    def field_row(self, label, value):
        self.set_font("Helvetica", "B", 10)
        self.set_x(20)
        self.cell(60, 8, label)
        self.set_font("Helvetica", "", 10)
        self.cell(0, 8, value)
        self.ln()

    def section_title(self, text):
        self.set_font("Helvetica", "B", 11)
        self.set_fill_color(240, 247, 255)
        self.set_x(20)
        self.cell(170, 8, text, fill=True)
        self.ln(10)


def gen_certificado_notas():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CERTIFICADO DE NOTAS", "Universidad de Chile - Secretaria de Estudios")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_x(20)
    pdf.multi_cell(170, 7, "Por medio del presente documento, la Secretaria de Estudios certifica que:")
    pdf.ln(4)

    pdf.field_row("Nombre completo:", "Maria Fernanda Gonzalez Rojas")
    pdf.field_row("RUT:", "15.234.567-8")
    pdf.field_row("Carrera:", "Ingenieria Civil en Informatica")
    pdf.field_row("Facultad:", "Facultad de Ciencias Fisicas y Matematicas")
    pdf.field_row("Promedio general:", "6.2 (escala 1.0 - 7.0)")
    pdf.field_row("Fecha de emision:", "2024-11-15")
    pdf.field_row("Anio de ingreso:", "2019")
    pdf.field_row("Estado academico:", "Alumna regular")
    pdf.ln(6)

    pdf.section_title("Detalle de asignaturas (ultimos 2 semestres)")
    materias = [
        ("Sistemas Distribuidos", "6.5"),
        ("Inteligencia Artificial", "6.8"),
        ("Ingenieria de Software", "5.9"),
        ("Bases de Datos Avanzadas", "6.1"),
        ("Proyecto de Titulo I", "6.4"),
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
    print("OK: " + str(path))


def gen_documento_identidad():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CEDULA DE IDENTIDAD", "Republica de Chile - Registro Civil e Identificacion")

    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_x(20)
    pdf.cell(0, 10, "DOCUMENTO DE IDENTIDAD OFICIAL")
    pdf.ln(12)

    pdf.field_row("Apellidos:", "RAMIREZ VEGA")
    pdf.field_row("Nombres:", "Carlos Andres")
    pdf.field_row("Numero de documento:", "1.234.567-8")
    pdf.field_row("Fecha de nacimiento:", "14 de mayo de 1998")
    pdf.field_row("Nacionalidad:", "Chilena")
    pdf.field_row("Sexo:", "Masculino")
    pdf.field_row("Fecha de emision:", "2022-05-14")
    pdf.field_row("Fecha de vencimiento:", "2028-05-14")
    pdf.field_row("Lugar de emision:", "Santiago, Region Metropolitana")

    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_x(20)
    pdf.multi_cell(170, 6, "Este documento es valido como identificacion oficial en todo el territorio nacional. "
                           "Cualquier alteracion o falsificacion es penada por la ley.")

    path = OUTPUT_DIR / "documento_identidad_ejemplo.pdf"
    pdf.output(str(path))
    print("OK: " + str(path))


def gen_formulario_inscripcion():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("FORMULARIO DE INSCRIPCION", "Proceso de Admision 2025 - Pontificia Universidad Catolica")

    pdf.ln(4)
    pdf.section_title("Datos personales del postulante")
    pdf.field_row("Nombre completo:", "Valentina Sofia Morales Perez")
    pdf.field_row("RUT:", "20.456.789-K")
    pdf.field_row("Fecha de nacimiento:", "03 de agosto de 2001")
    pdf.field_row("Correo electronico:", "v.morales@estudiante.edu")
    pdf.field_row("Telefono:", "+56 9 8765 4321")
    pdf.field_row("Direccion:", "Av. Providencia 1234, Santiago")

    pdf.ln(4)
    pdf.section_title("Datos academicos")
    pdf.field_row("Carrera postulada:", "Medicina")
    pdf.field_row("Campus:", "Campus San Joaquin")
    pdf.field_row("Modalidad:", "Diurna")
    pdf.field_row("Puntaje PAES:", "720 puntos")
    pdf.field_row("Establecimiento de origen:", "Colegio San Ignacio El Bosque")

    pdf.ln(4)
    pdf.section_title("Documentos adjuntos")
    docs = [
        ("Certificado de notas", "Adjunto"),
        ("Cedula de identidad", "Adjunto"),
        ("Certificado de egreso", "Adjunto"),
        ("Carta de motivacion", "Pendiente"),
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
    print("OK: " + str(path))


def gen_carta_motivacion():
    pdf = DocPDF()
    pdf.add_page()
    pdf.header_block("CARTA DE MOTIVACION")

    pdf.set_font("Helvetica", "", 11)
    pdf.set_x(20)
    pdf.cell(0, 8, "Santiago, 10 de enero de 2025")
    pdf.ln(10)

    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Comite de Admisiones")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.cell(0, 8, "Doctorado en Ciencias de la Computacion")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.cell(0, 8, "Pontificia Universidad Catolica de Chile")
    pdf.ln(10)

    pdf.set_x(20)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "Estimado Comite de Admisiones:")
    pdf.ln(10)

    paragraphs = [
        ("Mi nombre es Sebastian Ignacio Torres Fuentes, egresado de Ingenieria Civil en Computacion de la "
         "Universidad de Chile con promedio 6.4. Me dirijo a ustedes con el proposito de expresar mi interes "
         "en postular al programa de Doctorado en Ciencias de la Computacion de esta prestigiosa institucion."),

        ("Durante mi formacion de pregrado desarrolle una solida base en algoritmos, sistemas distribuidos e "
         "inteligencia artificial. Mi memoria de titulo obtuvo distincion maxima y fue presentada en el congreso "
         "CLEI 2024, lo que reforzo mi vocacion por la investigacion aplicada."),

        ("Estoy convencido de que el programa doctoral de la PUC me brindara el entorno academico y los "
         "recursos necesarios para desarrollar investigacion de impacto en el area de procesamiento de "
         "lenguaje natural aplicado a contextos latinoamericanos."),

        ("Quedo a disposicion para cualquier consulta adicional y agradezco de antemano la consideracion "
         "de mi postulacion."),
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
    pdf.cell(0, 8, "Sebastian Ignacio Torres Fuentes")
    pdf.ln(5)
    pdf.set_x(20)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 7, "RUT: 18.765.432-1")
    pdf.ln(4)
    pdf.set_x(20)
    pdf.cell(0, 7, "s.torres@uchile.cl | +56 9 1234 5678")

    path = OUTPUT_DIR / "carta_motivacion_ejemplo.pdf"
    pdf.output(str(path))
    print("OK: " + str(path))


if __name__ == "__main__":
    print("Generando documentos en: " + str(OUTPUT_DIR))
    gen_certificado_notas()
    gen_documento_identidad()
    gen_formulario_inscripcion()
    gen_carta_motivacion()
    print("\n4 documentos generados correctamente en " + str(OUTPUT_DIR))
