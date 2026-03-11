// doc-automation.js — Lógica del módulo Document Automation

const DOC_AUTO = (() => {
  "use strict";

  // ── Estado ──────────────────────────────────────────────────────
  let selectedFile = null;
  let selectedS3Key = null;
  let lastResult = null;

  const STEPS = [
    { id: "step-upload", label: "Subiendo archivo…" },
    { id: "step-ocr", label: "Extrayendo texto con Textract…" },
    { id: "step-classify", label: "Clasificando documento con IA…" },
    { id: "step-extract", label: "Extrayendo campos…" },
    { id: "step-validate", label: "Validando reglas institucionales…" },
    { id: "step-findings", label: "Detectando hallazgos…" },
    { id: "step-recommend", label: "Generando recomendación…" },
  ];

  // ── API helper ───────────────────────────────────────────────────
  async function apiCall(path, options = {}) {
    let authHeaders = {};
    if (window.authModule?.getAuthHeader) {
      try {
        authHeaders = (await window.authModule.getAuthHeader()) || {};
      } catch (_) {}
    }
    const url = `${CONFIG.API_BASE_URL}${path}`;
    const resp = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...options.headers,
      },
      ...options,
    });
    if (resp.status === 401) {
      window.location.href = "login.html";
      throw new Error("Unauthorized");
    }
    return resp;
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    setupDropZone();
    setupFileInput();
    document
      .getElementById("selectFileBtn")
      ?.addEventListener("click", () =>
        document.getElementById("docFileInput").click(),
      );
    document
      .getElementById("analyzeBtn")
      ?.addEventListener("click", startAnalysis);
    document
      .getElementById("exportBtn")
      ?.addEventListener("click", exportResult);
    loadDemoDocs();
  }

  // ── Drop zone ────────────────────────────────────────────────────
  function setupDropZone() {
    const zone = document.getElementById("docDropZone");
    if (!zone) return;
    zone.addEventListener("click", (e) => {
      // Evitar doble disparo si el click viene del botón interno
      if (e.target.closest("button")) return;
      document.getElementById("docFileInput").click();
    });
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelected(file);
    });
  }

  function setupFileInput() {
    const input = document.getElementById("docFileInput");
    if (!input) return;
    input.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFileSelected(e.target.files[0]);
    });
  }

  function handleFileSelected(file) {
    const MAX = 10 * 1024 * 1024;
    const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!ALLOWED.includes(file.type)) {
      showAlert("Tipo de archivo no soportado. Use PDF, JPG o PNG.", "warning");
      return;
    }
    if (file.size > MAX) {
      showAlert(
        "El archivo supera el límite de 10 MB. Reduzca el tamaño e intente nuevamente.",
        "warning",
      );
      return;
    }
    selectedFile = file;
    selectedS3Key = null;

    const info = document.getElementById("fileInfo");
    if (info) {
      info.innerHTML = `<i class="bi bi-file-earmark-pdf me-2 text-primary"></i>
        <strong>${file.name}</strong>
        <span class="text-muted ms-2">(${(file.size / 1024).toFixed(1)} KB — ${file.type})</span>
        <button class="btn btn-sm btn-link text-danger ms-2" onclick="DOC_AUTO.clearFile()">
          <i class="bi bi-x-circle"></i>
        </button>`;
      info.style.display = "block";
    }
    document.getElementById("analyzeBtn").disabled = false;
    hideResults();
  }

  function clearFile() {
    selectedFile = null;
    selectedS3Key = null;
    const info = document.getElementById("fileInfo");
    if (info) {
      info.style.display = "none";
      info.innerHTML = "";
    }
    const input = document.getElementById("docFileInput");
    if (input) input.value = "";
    document.getElementById("analyzeBtn").disabled = true;
    hideResults();
  }

  // ── Demo docs ────────────────────────────────────────────────────
  async function loadDemoDocs() {
    const container = document.getElementById("demoDocsContainer");
    if (!container) return;
    try {
      const resp = await apiCall("/doc-automation/demo-docs");
      const data = await resp.json();
      const docs = data.docs || [];
      if (!docs.length) {
        container.innerHTML =
          '<p class="text-muted small">No hay documentos de ejemplo disponibles.</p>';
        return;
      }
      container.innerHTML = docs
        .map(
          (d) => `
        <div class="demo-doc-card" onclick="DOC_AUTO.selectDemoDoc('${d.s3Key}', '${d.name}')">
          <span class="doc-icon">${getDocIcon(d.name)}</span>
          <div>
            <div class="doc-name">${formatDocName(d.name)}</div>
            <div class="doc-type">${(d.size / 1024).toFixed(1)} KB</div>
          </div>
        </div>`,
        )
        .join("");
    } catch (e) {
      container.innerHTML =
        '<p class="text-muted small">No se pudieron cargar los documentos de ejemplo.</p>';
    }
  }

  function selectDemoDoc(s3Key, name) {
    selectedFile = null;
    selectedS3Key = s3Key;
    const info = document.getElementById("fileInfo");
    if (info) {
      info.innerHTML = `<i class="bi bi-file-earmark-check me-2 text-success"></i>
        <strong>Documento de ejemplo:</strong> ${formatDocName(name)}
        <button class="btn btn-sm btn-link text-danger ms-2" onclick="DOC_AUTO.clearFile()">
          <i class="bi bi-x-circle"></i>
        </button>`;
      info.style.display = "block";
    }
    document.getElementById("analyzeBtn").disabled = false;
    hideResults();
  }

  function getDocIcon(name) {
    if (name.includes("certif") || name.includes("nota")) return "🎓";
    if (
      name.includes("identidad") ||
      name.includes("dni") ||
      name.includes("rut")
    )
      return "🪪";
    if (name.includes("inscripcion") || name.includes("formulario"))
      return "📋";
    if (name.includes("motivacion") || name.includes("carta")) return "✉️";
    if (name.includes("pago") || name.includes("comprobante")) return "💳";
    return "📄";
  }

  function formatDocName(name) {
    return name
      .replace(/[-_]/g, " ")
      .replace(/\.pdf$/i, "")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ── Análisis ─────────────────────────────────────────────────────
  async function startAnalysis() {
    if (!selectedFile && !selectedS3Key) return;
    showProgress();
    hideResults();

    try {
      let s3Key = selectedS3Key;

      if (selectedFile) {
        // 1. Upload
        setStep(0);
        const uploadResp = await apiCall("/doc-automation/upload", {
          method: "POST",
          body: JSON.stringify({
            filename: selectedFile.name,
            contentType: selectedFile.type,
          }),
        });
        if (!uploadResp.ok) throw new Error("Error al obtener URL de subida");
        const { uploadUrl, s3Key: key } = await uploadResp.json();
        s3Key = key;

        // PUT directo a S3
        const putResp = await fetch(uploadUrl, {
          method: "PUT",
          body: selectedFile,
          headers: { "Content-Type": selectedFile.type },
        });
        if (!putResp.ok) throw new Error("Error al subir el archivo a S3");
      }

      // 2-7. Analyze (el backend hace todo)
      setStep(1);
      await delay(400);
      setStep(2);
      const analyzeResp = await apiCall("/doc-automation/analyze", {
        method: "POST",
        body: JSON.stringify({ s3Key }),
      });

      if (!analyzeResp.ok) {
        const errData = await analyzeResp.json().catch(() => ({}));
        const msg = errData.message || `Error ${analyzeResp.status}`;
        if (errData.error === "DOCUMENTO_ILEGIBLE") {
          throw new Error(
            "El documento no es legible. Verifique que el archivo tenga texto visible.",
          );
        }
        throw new Error(msg);
      }

      setStep(3);
      await delay(200);
      setStep(4);
      await delay(200);
      setStep(5);
      await delay(200);
      setStep(6);

      const result = await analyzeResp.json();
      lastResult = result;

      hideProgress();
      renderResults(result);
    } catch (e) {
      hideProgress();
      showError(e.message || "Error inesperado al procesar el documento.");
    }
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Progress UI ──────────────────────────────────────────────────
  function showProgress() {
    const el = document.getElementById("progressSection");
    if (!el) return;
    el.style.display = "block";
    el.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center gap-3 mb-3">
            <div class="spinner-border text-primary" role="status"></div>
            <strong id="progressLabel">Iniciando análisis…</strong>
          </div>
          <div class="analysis-progress">
            ${STEPS.map(
              (s, i) => `
              <div class="progress-step" id="pstep-${i}">
                <div class="step-dot"></div>
                <span>${s.label}</span>
              </div>`,
            ).join("")}
          </div>
        </div>
      </div>`;
  }

  function setStep(idx) {
    STEPS.forEach((_, i) => {
      const el = document.getElementById(`pstep-${i}`);
      if (!el) return;
      el.className =
        "progress-step" + (i < idx ? " done" : i === idx ? " active" : "");
    });
    const label = document.getElementById("progressLabel");
    if (label && STEPS[idx]) label.textContent = STEPS[idx].label;
  }

  function hideProgress() {
    const el = document.getElementById("progressSection");
    if (el) el.style.display = "none";
  }

  // ── Render resultados ────────────────────────────────────────────
  function renderResults(r) {
    const section = document.getElementById("resultsSection");
    if (!section) return;

    const validationsHtml =
      (r.validations || [])
        .map((v) => {
          const cls =
            v.status === "pass"
              ? "val-pass"
              : v.status === "warning"
                ? "val-warning"
                : "val-fail";
          const icon =
            v.status === "pass"
              ? "bi-check-circle-fill"
              : v.status === "warning"
                ? "bi-exclamation-triangle-fill"
                : "bi-x-circle-fill";
          return `<div class="validation-item ${cls}">
        <i class="bi ${icon} val-icon"></i>
        <div><div class="val-rule">${v.rule?.replace(/_/g, " ")}</div><div class="val-detail">${v.detail || ""}</div></div>
      </div>`;
        })
        .join("") || '<p class="text-muted small">Sin validaciones.</p>';

    const findingsHtml = (r.findings || []).length
      ? r.findings
          .map(
            (f) =>
              `<div class="finding-item"><i class="bi bi-exclamation-circle-fill"></i><span>${f}</span></div>`,
          )
          .join("")
      : '<p class="text-success small"><i class="bi bi-check-circle me-1"></i>No se detectaron hallazgos relevantes.</p>';

    const fieldsHtml =
      r.fields && Object.keys(r.fields).length
        ? `<table class="fields-table">${Object.entries(r.fields)
            .map(
              ([k, v]) =>
                `<tr><td>${k.replace(/_/g, " ")}</td><td>${v ?? '<span class="text-muted">—</span>'}</td></tr>`,
            )
            .join("")}</table>`
        : '<p class="text-muted small">No se extrajeron campos.</p>';

    const action = r.recommended_action || {};
    const priority = (action.priority || "media").toLowerCase();
    const priorityLabel =
      {
        alta: "Prioridad Alta",
        media: "Prioridad Media",
        baja: "Prioridad Baja",
      }[priority] || priority;
    const actionIcon =
      priority === "alta" ? "🔴" : priority === "baja" ? "🟢" : "🟡";

    const confPct = Math.round((r.confidence || 0) * 100);

    section.style.display = "block";
    section.innerHTML = `
      <div class="row g-3 mb-3">
        <!-- Panel 1: Estado -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-file-earmark-check"></i> Estado del Documento</div>
            <div class="panel-body text-center py-4">
              <div class="mb-2"><i class="bi bi-check-circle-fill text-success" style="font-size:2.5rem"></i></div>
              <div class="fw-bold text-success mb-1">Procesado correctamente</div>
              <small class="text-muted">Calidad OCR: <strong>${r.ocr_quality || "—"}</strong></small>
            </div>
          </div>
        </div>
        <!-- Panel 2: Texto extraído -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-file-text"></i> Texto Extraído</div>
            <div class="panel-body">
              <div class="extracted-text-box">${escHtml(r.extracted_text || "Sin texto extraído.")}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <!-- Panel 3: Tipo detectado -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-tag"></i> Tipo de Documento Detectado</div>
            <div class="panel-body">
              <div class="doc-type-badge mb-3">
                <i class="bi bi-file-earmark-text"></i>
                ${(r.document_type || "otro").replace(/_/g, " ")}
              </div>
              <div class="text-muted small mb-1">Confianza: <strong>${confPct}%</strong></div>
              <div class="confidence-bar">
                <div class="confidence-fill" style="width:${confPct}%"></div>
              </div>
            </div>
          </div>
        </div>
        <!-- Panel 4: Campos extraídos -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-list-ul"></i> Campos Extraídos</div>
            <div class="panel-body">${fieldsHtml}</div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <!-- Panel 5: Resumen -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-chat-text"></i> Resumen IA</div>
            <div class="panel-body">
              <p class="mb-0" style="font-size:.9rem;line-height:1.6;">${escHtml(r.summary || "Sin resumen disponible.")}</p>
            </div>
          </div>
        </div>
        <!-- Panel 6: Validaciones -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-shield-check"></i> Validaciones Institucionales</div>
            <div class="panel-body">${validationsHtml}</div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <!-- Panel 7: Hallazgos -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-search"></i> Hallazgos</div>
            <div class="panel-body">${findingsHtml}</div>
          </div>
        </div>
        <!-- Panel 8: Próximo paso -->
        <div class="col-md-6">
          <div class="result-panel h-100">
            <div class="panel-header"><i class="bi bi-arrow-right-circle"></i> Próximo Paso Recomendado</div>
            <div class="panel-body">
              <div class="next-action-card priority-${priority}">
                <div class="action-icon">${actionIcon}</div>
                <div>
                  <div class="action-title">${action.action || "Derivar a revisión manual"}</div>
                  <div class="action-reason">${action.reason || ""}</div>
                  <span class="priority-badge">${priorityLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="text-end mt-2">
        <button class="btn btn-outline-primary" id="exportBtn" onclick="DOC_AUTO.exportResult()">
          <i class="bi bi-download me-2"></i>Exportar análisis (JSON)
        </button>
      </div>`;
  }

  function hideResults() {
    const s = document.getElementById("resultsSection");
    if (s) {
      s.style.display = "none";
      s.innerHTML = "";
    }
  }

  function showError(msg) {
    const s = document.getElementById("resultsSection");
    if (!s) return;
    s.style.display = "block";
    s.innerHTML = `<div class="alert alert-danger">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      <strong>Error al procesar el documento:</strong> ${escHtml(msg)}
      <div class="mt-2 small text-muted">Verifique que el archivo sea legible y vuelva a intentarlo.</div>
    </div>`;
  }

  function showAlert(msg, type = "info") {
    const s = document.getElementById("resultsSection");
    if (!s) return;
    s.style.display = "block";
    s.innerHTML = `<div class="alert alert-${type}"><i class="bi bi-info-circle me-2"></i>${escHtml(msg)}</div>`;
  }

  // ── Export ───────────────────────────────────────────────────────
  function exportResult() {
    if (!lastResult) return;
    const blob = new Blob([JSON.stringify(lastResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analisis-${lastResult.document_type || "documento"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Utils ────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Public API ───────────────────────────────────────────────────
  return { init, clearFile, selectDemoDoc, exportResult };
})();

document.addEventListener("DOMContentLoaded", () => DOC_AUTO.init());
