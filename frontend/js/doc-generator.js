// doc-generator.js — Generador de documentos de ejemplo (frontend, usa jsPDF)

const DOC_GEN = (() => {
  "use strict";

  const TEMPLATES = {
    certificado_academico: {
      label: "Certificado Académico",
      icon: "🎓",
      fields: [
        {
          id: "nombre",
          label: "Nombre completo",
          default: "María Fernanda González Rojas",
        },
        { id: "rut", label: "RUT / DNI / Cédula", default: "15.234.567-8" },
        {
          id: "carrera",
          label: "Carrera",
          default: "Ingeniería Civil en Informática",
        },
        {
          id: "institucion",
          label: "Institución",
          default: "Universidad de Chile",
        },
        { id: "promedio", label: "Promedio (1-7)", default: "6.2" },
        {
          id: "fecha",
          label: "Fecha de emisión",
          default: new Date().toISOString().split("T")[0],
        },
      ],
    },
    documento_identidad: {
      label: "Documento de Identidad",
      icon: "🪪",
      fields: [
        {
          id: "nombre",
          label: "Nombre completo",
          default: "Carlos Andrés Ramírez Vega",
        },
        { id: "numero", label: "Número de documento", default: "1.234.567-8" },
        {
          id: "nacimiento",
          label: "Fecha de nacimiento",
          default: "1998-05-14",
        },
        {
          id: "vencimiento",
          label: "Fecha de vencimiento",
          default: "2028-05-14",
        },
        { id: "nacionalidad", label: "Nacionalidad", default: "Chilena" },
      ],
    },
    formulario_inscripcion: {
      label: "Formulario de Inscripción",
      icon: "📋",
      fields: [
        {
          id: "nombre",
          label: "Nombre completo",
          default: "Valentina Sofía Morales Pérez",
        },
        { id: "carrera", label: "Carrera postulada", default: "Medicina" },
        { id: "campus", label: "Campus", default: "Campus Central" },
        {
          id: "correo",
          label: "Correo electrónico",
          default: "v.morales@estudiante.edu",
        },
        { id: "telefono", label: "Teléfono", default: "+56 9 8765 4321" },
      ],
    },
    carta_motivacion: {
      label: "Carta de Motivación",
      icon: "✉️",
      fields: [
        {
          id: "nombre",
          label: "Nombre del postulante",
          default: "Sebastián Ignacio Torres Fuentes",
        },
        {
          id: "carrera",
          label: "Carrera postulada",
          default: "Doctorado en Ciencias de la Computación",
        },
        {
          id: "institucion",
          label: "Institución destino",
          default: "Pontificia Universidad Católica de Chile",
        },
        {
          id: "fecha",
          label: "Fecha",
          default: new Date().toISOString().split("T")[0],
        },
      ],
    },
  };

  let currentType = "certificado_academico";

  function init() {
    renderTypeSelector();
    renderFields(currentType);
    document
      .getElementById("generateBtn")
      ?.addEventListener("click", generatePDF);
    document
      .getElementById("useInDemoBtn")
      ?.addEventListener("click", useInDemo);
  }

  function renderTypeSelector() {
    const sel = document.getElementById("docTypeSelect");
    if (!sel) return;
    sel.innerHTML = Object.entries(TEMPLATES)
      .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
      .join("");
    sel.addEventListener("change", (e) => {
      currentType = e.target.value;
      renderFields(currentType);
      clearPreview();
    });
  }

  function renderFields(type) {
    const container = document.getElementById("fieldsContainer");
    if (!container) return;
    const tpl = TEMPLATES[type];
    container.innerHTML = tpl.fields
      .map(
        (f) => `
      <div class="mb-3">
        <label class="form-label">${f.label}</label>
        <input type="text" class="form-control" id="gen-${f.id}" value="${f.default}">
      </div>`,
      )
      .join("");
  }

  function getFieldValues(type) {
    const tpl = TEMPLATES[type];
    const vals = {};
    tpl.fields.forEach((f) => {
      vals[f.id] = document.getElementById(`gen-${f.id}`)?.value || f.default;
    });
    return vals;
  }

  function generatePDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      alert("jsPDF no disponible");
      return;
    }

    const doc = new jsPDF();
    const vals = getFieldValues(currentType);
    const tpl = TEMPLATES[currentType];

    // Encabezado
    doc.setFillColor(0, 102, 204);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(tpl.label.toUpperCase(), 105, 18, { align: "center" });

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    let y = 45;

    if (currentType === "certificado_academico") {
      doc.setFontSize(12);
      doc.text(`${vals.institucion || "Universidad"}`, 105, y, {
        align: "center",
      });
      y += 8;
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Secretaría de Estudios — Certificado Oficial", 105, y, {
        align: "center",
      });
      y += 14;
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.text("Por medio del presente documento se certifica que:", 20, y);
      y += 10;
      doc.setFont("helvetica", "bold");
      doc.text(`${vals.nombre}`, 20, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`RUT/DNI: ${vals.rut}`, 20, y);
      y += 8;
      doc.text(`Ha cursado satisfactoriamente la carrera de:`, 20, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text(`${vals.carrera}`, 20, y);
      y += 8;
      doc.setFont("helvetica", "normal");
      doc.text(`Promedio general: ${vals.promedio}`, 20, y);
      y += 8;
      doc.text(`Fecha de emisión: ${vals.fecha}`, 20, y);
      y += 20;
      doc.text("_______________________________", 20, y);
      y += 6;
      doc.text("Firma y Sello Institucional", 20, y);
    } else if (currentType === "documento_identidad") {
      doc.text("REPÚBLICA — DOCUMENTO DE IDENTIDAD OFICIAL", 105, y, {
        align: "center",
      });
      y += 14;
      const rows = [
        ["Nombre completo:", vals.nombre],
        ["Número de documento:", vals.numero],
        ["Fecha de nacimiento:", vals.nacimiento],
        ["Fecha de vencimiento:", vals.vencimiento],
        ["Nacionalidad:", vals.nacionalidad],
      ];
      rows.forEach(([label, val]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 20, y);
        doc.setFont("helvetica", "normal");
        doc.text(val, 90, y);
        y += 10;
      });
    } else if (currentType === "formulario_inscripcion") {
      doc.text("FORMULARIO DE INSCRIPCIÓN — PROCESO DE ADMISIÓN", 105, y, {
        align: "center",
      });
      y += 14;
      const rows = [
        ["Nombre:", vals.nombre],
        ["Carrera postulada:", vals.carrera],
        ["Campus:", vals.campus],
        ["Correo electrónico:", vals.correo],
        ["Teléfono:", vals.telefono],
      ];
      rows.forEach(([label, val]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 20, y);
        doc.setFont("helvetica", "normal");
        doc.text(val, 80, y);
        y += 10;
      });
      y += 10;
      doc.text("Firma del postulante: _______________________", 20, y);
    } else if (currentType === "carta_motivacion") {
      doc.text(`${vals.institucion}`, 105, y, { align: "center" });
      y += 8;
      doc.text(`Fecha: ${vals.fecha}`, 20, y);
      y += 12;
      doc.setFont("helvetica", "bold");
      doc.text("Estimado Comité de Admisiones:", 20, y);
      y += 10;
      doc.setFont("helvetica", "normal");
      const body = doc.splitTextToSize(
        `Por medio de la presente, yo, ${vals.nombre}, me dirijo a ustedes con el propósito de expresar mi interés en postular al programa de ${vals.carrera}. ` +
          `A lo largo de mi trayectoria académica y profesional he desarrollado competencias que considero relevantes para este programa. ` +
          `Estoy convencido/a de que esta institución me brindará las herramientas necesarias para alcanzar mis objetivos. ` +
          `Quedo a disposición para cualquier consulta adicional.`,
        170,
      );
      doc.text(body, 20, y);
      y += body.length * 7 + 14;
      doc.text(`Atentamente,`, 20, y);
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text(vals.nombre, 20, y);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      "Documento generado para fines de demostración — CloudHesive Demo",
      105,
      285,
      { align: "center" },
    );

    // Preview
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    window._lastGeneratedPdfBlob = pdfBlob;
    window._lastGeneratedPdfName = `${currentType}_ejemplo.pdf`;

    const preview = document.getElementById("pdfPreview");
    if (preview) {
      preview.innerHTML = `<iframe src="${url}" width="100%" height="500px" style="border:1px solid var(--border-color);border-radius:8px;"></iframe>`;
    }

    document.getElementById("downloadBtn")?.removeAttribute("disabled");
    document.getElementById("useInDemoBtn")?.removeAttribute("disabled");

    document.getElementById("downloadBtn").onclick = () => {
      doc.save(window._lastGeneratedPdfName);
    };
  }

  function useInDemo() {
    if (!window._lastGeneratedPdfBlob) return;
    const file = new File(
      [window._lastGeneratedPdfBlob],
      window._lastGeneratedPdfName,
      { type: "application/pdf" },
    );
    sessionStorage.setItem("docAutoPreloadFile", "pending");
    // Guardar en IndexedDB-like via sessionStorage no funciona para blobs grandes,
    // usamos URL object y lo pasamos via window
    window._docAutoPreloadFile = file;
    window.location.href = "doc-automation.html";
  }

  function clearPreview() {
    const preview = document.getElementById("pdfPreview");
    if (preview) preview.innerHTML = "";
    document.getElementById("downloadBtn")?.setAttribute("disabled", "true");
    document.getElementById("useInDemoBtn")?.setAttribute("disabled", "true");
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => DOC_GEN.init());
