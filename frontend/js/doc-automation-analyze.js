// doc-automation-analyze.js — Página dedicada de análisis y resultados
const DOC_ANALYZE = (() => {
  "use strict";
  let lastResult = null;
  const STEPS = [
    "Subiendo archivo…",
    "Extrayendo texto con Textract…",
    "Clasificando documento con IA…",
    "Extrayendo campos…",
    "Validando reglas institucionales…",
    "Detectando hallazgos…",
    "Generando recomendación…",
  ];

  async function apiCall(path, opts = {}) {
    let auth = {};
    if (window.authModule?.getAuthHeader) {
      try {
        auth = (await window.authModule.getAuthHeader()) || {};
      } catch (_) {}
    }
    const r = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...auth, ...opts.headers },
      ...opts,
    });
    if (r.status === 401) {
      window.location.href = "login.html";
      throw new Error("Unauthorized");
    }
    return r;
  }
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  function init() {
    const job = JSON.parse(sessionStorage.getItem("docAnalyzeJob") || "null");
    if (!job) {
      window.location.href = "doc-automation.html";
      return;
    }
    sessionStorage.removeItem("docAnalyzeJob");
    const nameEl = document.getElementById("docNameDisplay");
    const keyEl = document.getElementById("docKeyDisplay");
    if (nameEl) nameEl.textContent = job.name || "Documento";
    if (keyEl) keyEl.textContent = job.s3Key || "";
    runAnalysis(job);
  }

  async function runAnalysis(job) {
    showProgress();
    try {
      let s3Key = job.s3Key;
      if (job.fileData) {
        setStep(0);
        const byteStr = atob(job.fileData);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: job.fileType });
        const up = await apiCall("/doc-automation/upload", {
          method: "POST",
          body: JSON.stringify({
            filename: job.name,
            contentType: job.fileType,
          }),
        });
        if (!up.ok) throw new Error("Error al obtener URL de subida");
        const { uploadUrl, s3Key: key } = await up.json();
        s3Key = key;
        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": job.fileType },
        });
        if (!put.ok) throw new Error("Error al subir el archivo a S3");
      }
      setStep(1);
      await delay(400);
      setStep(2);
      const ar = await apiCall("/doc-automation/analyze", {
        method: "POST",
        body: JSON.stringify({ s3Key }),
      });
      if (!ar.ok) {
        const e = await ar.json().catch(() => ({}));
        if (e.error === "DOCUMENTO_ILEGIBLE")
          throw new Error(
            "El documento no es legible. Verifique que el archivo tenga texto visible.",
          );
        throw new Error(e.message || `Error ${ar.status}`);
      }
      setStep(3);
      await delay(200);
      setStep(4);
      await delay(200);
      setStep(5);
      await delay(200);
      setStep(6);
      lastResult = await ar.json();
      hideProgress();
      renderResults(lastResult);
    } catch (e) {
      hideProgress();
      showError(e.message || "Error inesperado.");
    }
  }

  function showProgress() {
    const el = document.getElementById("progressSection");
    if (!el) return;
    el.innerHTML = `<div class="card mb-4"><div class="card-body">
      <div class="d-flex align-items-center gap-3 mb-3">
        <div class="spinner-border text-primary" role="status"></div>
        <strong id="progressLabel">Iniciando análisis…</strong>
      </div>
      <div class="analysis-progress">${STEPS.map((s, i) => `<div class="progress-step" id="pstep-${i}"><div class="step-dot"></div><span>${s}</span></div>`).join("")}</div>
    </div></div>`;
  }
  function setStep(idx) {
    STEPS.forEach((_, i) => {
      const el = document.getElementById(`pstep-${i}`);
      if (el)
        el.className =
          "progress-step" + (i < idx ? " done" : i === idx ? " active" : "");
    });
    const lbl = document.getElementById("progressLabel");
    if (lbl && STEPS[idx]) lbl.textContent = STEPS[idx];
  }
  function hideProgress() {
    const el = document.getElementById("progressSection");
    if (el) el.innerHTML = "";
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderResults(r) {
    const section = document.getElementById("resultsSection");
    if (!section) return;
    const confPct = Math.round((r.confidence || 0) * 100);
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
          return `<div class="validation-item ${cls}"><i class="bi ${icon} val-icon"></i><div><div class="val-rule">${(v.rule || "").replace(/_/g, " ")}</div><div class="val-detail">${v.detail || ""}</div></div></div>`;
        })
        .join("") || '<p class="text-muted small">Sin validaciones.</p>';

    const findingsHtml = (r.findings || []).length
      ? r.findings
          .map(
            (f) =>
              `<div class="finding-item"><i class="bi bi-exclamation-circle-fill"></i><span>${escHtml(f)}</span></div>`,
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

    section.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-file-earmark-check"></i> Estado del Documento</div>
          <div class="panel-body text-center py-4">
            <div class="mb-2"><i class="bi bi-check-circle-fill text-success" style="font-size:2.5rem"></i></div>
            <div class="fw-bold text-success mb-1">Procesado correctamente</div>
            <small class="text-muted">Calidad OCR: <strong>${r.ocr_quality || "—"}</strong></small>
          </div>
        </div></div>
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-file-text"></i> Texto Extraído</div>
          <div class="panel-body"><div class="extracted-text-box">${escHtml(r.extracted_text || "Sin texto extraído.")}</div></div>
        </div></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-tag"></i> Tipo de Documento Detectado</div>
          <div class="panel-body">
            <div class="doc-type-badge mb-3"><i class="bi bi-file-earmark-text"></i> ${(r.document_type || "otro").replace(/_/g, " ")}</div>
            <div class="text-muted small mb-1">Confianza: <strong>${confPct}%</strong></div>
            <div class="confidence-bar"><div class="confidence-fill" style="width:${confPct}%"></div></div>
          </div>
        </div></div>
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-list-ul"></i> Campos Extraídos</div>
          <div class="panel-body">${fieldsHtml}</div>
        </div></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-chat-text"></i> Resumen IA</div>
          <div class="panel-body"><p style="font-size:.9rem;line-height:1.6;">${escHtml(r.summary || "Sin resumen.")}</p></div>
        </div></div>
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-shield-check"></i> Validaciones Institucionales</div>
          <div class="panel-body">${validationsHtml}</div>
        </div></div>
      </div>
      <div class="row g-3 mb-3">
        <div class="col-md-6"><div class="result-panel h-100">
          <div class="panel-header"><i class="bi bi-search"></i> Hallazgos</div>
          <div class="panel-body">${findingsHtml}</div>
        </div></div>
        <div class="col-md-6"><div class="result-panel h-100">
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
        </div></div>
      </div>
      <div class="text-end mt-2">
        <button class="btn btn-outline-primary" onclick="DOC_ANALYZE.exportResult()">
          <i class="bi bi-download me-2"></i>Exportar análisis (JSON)
        </button>
      </div>
      <div class="result-panel mt-3">
        <div class="panel-header d-flex align-items-center justify-content-between">
          <span><i class="bi bi-braces"></i> Resultado JSON — Integración con otros sistemas</span>
          <button class="btn btn-sm btn-outline-secondary" onclick="DOC_ANALYZE.copyJson()" id="copyJsonBtn">
            <i class="bi bi-clipboard me-1"></i>Copiar
          </button>
        </div>
        <div class="panel-body p-0">
          <pre id="jsonViewer" style="background:#1e1e2e;color:#cdd6f4;padding:1.25rem;border-radius:0 0 10px 10px;font-size:.78rem;line-height:1.6;overflow-x:auto;max-height:400px;overflow-y:auto;margin:0;max-width:100%;box-sizing:border-box;word-break:normal;white-space:pre;">${escHtml(JSON.stringify(r, null, 2))}</pre>
        </div>
      </div>`;
  }

  function showError(msg) {
    const s = document.getElementById("resultsSection");
    if (s)
      s.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle-fill me-2"></i><strong>Error:</strong> ${escHtml(msg)}<div class="mt-2"><a href="doc-automation.html" class="btn btn-sm btn-outline-danger">Volver e intentar de nuevo</a></div></div>`;
  }

  function exportResult() {
    if (!lastResult) return;
    const blob = new Blob([JSON.stringify(lastResult, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analisis-${lastResult.document_type || "doc"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyJson() {
    if (!lastResult) return;
    navigator.clipboard
      .writeText(JSON.stringify(lastResult, null, 2))
      .then(() => {
        const btn = document.getElementById("copyJsonBtn");
        if (btn) {
          btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Copiado';
          setTimeout(() => {
            btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copiar';
          }, 2000);
        }
      });
  }

  return { init, exportResult, copyJson };
})();

document.addEventListener("DOMContentLoaded", () => DOC_ANALYZE.init());
