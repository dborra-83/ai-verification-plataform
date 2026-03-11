// doc-automation-history.js — Historial de análisis de documentos

const DOC_HISTORY = (() => {
  "use strict";

  let allItems = [];
  let filtered = [];
  let currentPage = 1;
  const PAGE_SIZE = 10;
  let selectedItem = null;

  // ── API ──────────────────────────────────────────────────────────
  async function apiCall(path, options = {}) {
    let authHeaders = {};
    if (window.authModule?.getAuthHeader) {
      try {
        authHeaders = (await window.authModule.getAuthHeader()) || {};
      } catch (_) {}
    }
    const resp = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
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
    document
      .getElementById("searchInput")
      ?.addEventListener("input", applyFilters);
    document
      .getElementById("filterType")
      ?.addEventListener("change", applyFilters);
    document
      .getElementById("filterStatus")
      ?.addEventListener("change", applyFilters);
    document
      .getElementById("refreshBtn")
      ?.addEventListener("click", loadHistory);
    document
      .getElementById("exportAllBtn")
      ?.addEventListener("click", exportAll);
    loadHistory();
  }

  // ── Carga ────────────────────────────────────────────────────────
  async function loadHistory() {
    showLoading(true);
    try {
      const resp = await apiCall("/doc-automation/history");
      if (!resp.ok) throw new Error(`Error ${resp.status}`);
      const data = await resp.json();
      allItems = data.items || [];
      updateStats();
      applyFilters();
    } catch (e) {
      showTableError(e.message);
    } finally {
      showLoading(false);
    }
  }

  // ── Stats ────────────────────────────────────────────────────────
  function updateStats() {
    const total = allItems.length;
    const passed = allItems.filter((i) =>
      (i.validations || []).every((v) => v.status !== "fail"),
    ).length;
    const failed = allItems.filter((i) =>
      (i.validations || []).some((v) => v.status === "fail"),
    ).length;
    const types = [
      ...new Set(allItems.map((i) => i.document_type).filter(Boolean)),
    ].length;

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statPassed").textContent = passed;
    document.getElementById("statFailed").textContent = failed;
    document.getElementById("statTypes").textContent = types;

    // Poblar filtro de tipos
    const sel = document.getElementById("filterType");
    if (sel) {
      const current = sel.value;
      const uniqueTypes = [
        ...new Set(allItems.map((i) => i.document_type).filter(Boolean)),
      ].sort();
      sel.innerHTML =
        '<option value="">Todos los tipos</option>' +
        uniqueTypes
          .map(
            (t) =>
              `<option value="${t}" ${t === current ? "selected" : ""}>${t.replace(/_/g, " ")}</option>`,
          )
          .join("");
    }
  }

  // ── Filtros ──────────────────────────────────────────────────────
  function applyFilters() {
    const search = (
      document.getElementById("searchInput")?.value || ""
    ).toLowerCase();
    const typeFilter = document.getElementById("filterType")?.value || "";
    const statusFilter = document.getElementById("filterStatus")?.value || "";

    filtered = allItems.filter((item) => {
      const matchSearch =
        !search ||
        (item.document_type || "").toLowerCase().includes(search) ||
        (item.document_id || "").toLowerCase().includes(search) ||
        JSON.stringify(item.fields || {})
          .toLowerCase()
          .includes(search);

      const matchType = !typeFilter || item.document_type === typeFilter;

      const hasFail = (item.validations || []).some((v) => v.status === "fail");
      const hasWarning = (item.validations || []).some(
        (v) => v.status === "warning",
      );
      const matchStatus =
        !statusFilter ||
        (statusFilter === "pass" && !hasFail && !hasWarning) ||
        (statusFilter === "warning" && !hasFail && hasWarning) ||
        (statusFilter === "fail" && hasFail);

      return matchSearch && matchType && matchStatus;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
  }

  // ── Tabla ────────────────────────────────────────────────────────
  function renderTable() {
    const tbody = document.getElementById("historyTbody");
    if (!tbody) return;

    const start = (currentPage - 1) * PAGE_SIZE;
    const page = filtered.slice(start, start + PAGE_SIZE);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">
        <i class="bi bi-inbox fs-3 d-block mb-2"></i>No hay registros que coincidan con los filtros.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = page
      .map((item) => {
        const hasFail = (item.validations || []).some(
          (v) => v.status === "fail",
        );
        const hasWarning = (item.validations || []).some(
          (v) => v.status === "warning",
        );
        const statusBadge = hasFail
          ? '<span class="badge bg-danger">Con errores</span>'
          : hasWarning
            ? '<span class="badge bg-warning text-dark">Con advertencias</span>'
            : '<span class="badge bg-success">Aprobado</span>';

        const confPct = Math.round((item.confidence || 0) * 100);
        const date = item.processed_at
          ? new Date(item.processed_at).toLocaleString("es-AR")
          : "—";
        const docType = (item.document_type || "otro").replace(/_/g, " ");
        const shortId = (item.document_id || "").substring(0, 8) + "…";

        // Nombre del archivo desde s3_key
        const s3parts = (item.s3_key || "").split("/");
        const filename = s3parts[s3parts.length - 1] || "—";
        const shortFilename =
          filename.length > 30 ? filename.substring(0, 28) + "…" : filename;

        return `<tr class="history-row" onclick="DOC_HISTORY.openDetail('${item.document_id}')" style="cursor:pointer;">
        <td><span class="text-muted font-monospace small" title="${item.document_id}">${shortId}</span></td>
        <td><span title="${filename}">${shortFilename}</span></td>
        <td><span class="doc-type-pill">${docType}</span></td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="mini-conf-bar"><div style="width:${confPct}%"></div></div>
            <span class="small">${confPct}%</span>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td class="text-muted small">${date}</td>
      </tr>`;
      })
      .join("");
  }

  function renderPagination() {
    const container = document.getElementById("pagination");
    if (!container) return;
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const countEl = document.getElementById("resultCount");
    if (countEl)
      countEl.textContent = `${filtered.length} registro${filtered.length !== 1 ? "s" : ""}`;

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = `<nav><ul class="pagination pagination-sm mb-0">`;
    html += `<li class="page-item ${currentPage === 1 ? "disabled" : ""}">
      <a class="page-link" href="#" onclick="DOC_HISTORY.goPage(${currentPage - 1});return false;">‹</a></li>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<li class="page-item ${i === currentPage ? "active" : ""}">
        <a class="page-link" href="#" onclick="DOC_HISTORY.goPage(${i});return false;">${i}</a></li>`;
    }
    html += `<li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
      <a class="page-link" href="#" onclick="DOC_HISTORY.goPage(${currentPage + 1});return false;">›</a></li>`;
    html += `</ul></nav>`;
    container.innerHTML = html;
  }

  function goPage(n) {
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    if (n < 1 || n > totalPages) return;
    currentPage = n;
    renderTable();
    renderPagination();
  }

  // ── Modal detalle ────────────────────────────────────────────────
  function openDetail(documentId) {
    const item = allItems.find((i) => i.document_id === documentId);
    if (!item) return;
    selectedItem = item;

    const modal = document.getElementById("detailModal");
    const body = document.getElementById("detailModalBody");
    if (!body) return;

    const confPct = Math.round((item.confidence || 0) * 100);
    const date = item.processed_at
      ? new Date(item.processed_at).toLocaleString("es-AR")
      : "—";
    const action = item.recommended_action || {};
    const priority = (action.priority || "media").toLowerCase();
    const priorityIcon =
      priority === "alta" ? "🔴" : priority === "baja" ? "🟢" : "🟡";

    const validationsHtml =
      (item.validations || [])
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
        <div><div class="val-rule">${(v.rule || "").replace(/_/g, " ")}</div><div class="val-detail">${v.detail || ""}</div></div>
      </div>`;
        })
        .join("") || '<p class="text-muted small">Sin validaciones.</p>';

    const fieldsHtml =
      item.fields && Object.keys(item.fields).length
        ? `<table class="fields-table w-100">${Object.entries(item.fields)
            .map(
              ([k, v]) =>
                `<tr><td>${k.replace(/_/g, " ")}</td><td>${v ?? "—"}</td></tr>`,
            )
            .join("")}</table>`
        : '<p class="text-muted small">No se extrajeron campos.</p>';

    const findingsHtml = (item.findings || []).length
      ? item.findings
          .map(
            (f) =>
              `<div class="finding-item"><i class="bi bi-exclamation-circle-fill"></i><span>${escHtml(f)}</span></div>`,
          )
          .join("")
      : '<p class="text-success small"><i class="bi bi-check-circle me-1"></i>Sin hallazgos.</p>';

    body.innerHTML = `
      <div class="row g-3 mb-3">
        <div class="col-sm-6">
          <div class="detail-meta-card">
            <div class="detail-meta-label">Tipo de documento</div>
            <div class="doc-type-badge">${(item.document_type || "otro").replace(/_/g, " ")}</div>
          </div>
        </div>
        <div class="col-sm-6">
          <div class="detail-meta-card">
            <div class="detail-meta-label">Confianza de clasificación</div>
            <div class="d-flex align-items-center gap-2 mt-1">
              <div class="confidence-bar flex-grow-1"><div class="confidence-fill" style="width:${confPct}%"></div></div>
              <strong>${confPct}%</strong>
            </div>
          </div>
        </div>
        <div class="col-sm-6">
          <div class="detail-meta-card">
            <div class="detail-meta-label">Fecha de procesamiento</div>
            <div class="mt-1">${date}</div>
          </div>
        </div>
        <div class="col-sm-6">
          <div class="detail-meta-card">
            <div class="detail-meta-label">Calidad OCR</div>
            <div class="mt-1">${item.ocr_quality || "—"}</div>
          </div>
        </div>
      </div>

      <ul class="nav nav-tabs mb-3" id="detailTabs">
        <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-summary">Resumen</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-fields">Campos</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-validations">Validaciones</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-findings">Hallazgos</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-text">Texto OCR</a></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="tab-summary">
          <p style="font-size:.9rem;line-height:1.7;">${escHtml(item.summary || "Sin resumen.")}</p>
          <div class="next-action-card priority-${priority} mt-3">
            <div class="action-icon">${priorityIcon}</div>
            <div>
              <div class="action-title">${action.action || "Derivar a revisión manual"}</div>
              <div class="action-reason">${action.reason || ""}</div>
            </div>
          </div>
        </div>
        <div class="tab-pane fade" id="tab-fields">${fieldsHtml}</div>
        <div class="tab-pane fade" id="tab-validations">${validationsHtml}</div>
        <div class="tab-pane fade" id="tab-findings">${findingsHtml}</div>
        <div class="tab-pane fade" id="tab-text">
          <div class="extracted-text-box">${escHtml(item.extracted_text || "Sin texto.")}</div>
        </div>
      </div>`;

    new bootstrap.Modal(modal).show();
  }

  // ── Export ───────────────────────────────────────────────────────
  function exportAll() {
    if (!filtered.length) return;
    const blob = new Blob([JSON.stringify(filtered, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-documentos-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSelected() {
    if (!selectedItem) return;
    const blob = new Blob([JSON.stringify(selectedItem, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analisis-${selectedItem.document_type || "doc"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── UI helpers ───────────────────────────────────────────────────
  function showLoading(on) {
    const el = document.getElementById("loadingRow");
    if (el) el.style.display = on ? "" : "none";
    const tbody = document.getElementById("historyTbody");
    if (on && tbody) tbody.innerHTML = "";
  }

  function showTableError(msg) {
    const tbody = document.getElementById("historyTbody");
    if (tbody)
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">
      <i class="bi bi-exclamation-triangle me-2"></i>${escHtml(msg)}</td></tr>`;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return { init, goPage, openDetail, exportAll, exportSelected };
})();

document.addEventListener("DOMContentLoaded", () => DOC_HISTORY.init());
