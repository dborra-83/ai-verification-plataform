// Analysis detail page functionality

let currentAnalysis = null;

document.addEventListener("DOMContentLoaded", function () {
  loadAnalysisDetail();
});

async function loadAnalysisDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const analysisId = urlParams.get("id");

  if (!analysisId) {
    showErrorState("ID de análisis no proporcionado");
    return;
  }

  try {
    showLoadingState();

    const response = await apiCall(`/analysis/${analysisId}`);
    currentAnalysis = response.item;

    if (!currentAnalysis) {
      showErrorState("Análisis no encontrado");
      return;
    }

    populateAnalysisDetail(currentAnalysis);
    showDetailState();
  } catch (error) {
    console.error("Error loading analysis detail:", error);
    showErrorState("Error al cargar el análisis: " + error.message);
  }
}

function showLoadingState() {
  document.getElementById("loadingState").style.display = "block";
  document.getElementById("analysisDetail").style.display = "none";
  document.getElementById("errorState").style.display = "none";
}

function showDetailState() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("analysisDetail").style.display = "block";
  document.getElementById("errorState").style.display = "none";
}

function showErrorState(message) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("analysisDetail").style.display = "none";
  document.getElementById("errorState").style.display = "block";

  // Update error message if needed
  const errorState = document.getElementById("errorState");
  const errorText = errorState.querySelector("p");
  if (errorText && message) {
    errorText.textContent = message;
  }
}

function populateAnalysisDetail(analysis) {
  // Header information
  document.getElementById("studentName").textContent =
    analysis.metadata?.studentName || "Sin nombre";
  document.getElementById("courseName").textContent =
    analysis.metadata?.course || "Sin curso";
  document.getElementById("assignmentName").textContent =
    analysis.metadata?.assignmentName || "Sin tarea";
  document.getElementById("analysisDate").textContent = formatDate(
    analysis.createdAt,
  );

  // Status badge
  const statusBadge = document.getElementById("statusBadge");
  statusBadge.className = `badge ${getStatusBadgeClass(analysis.status)}`;
  statusBadge.textContent = getStatusText(analysis.status);

  // Scores
  populateScores(analysis);

  // Summary
  document.getElementById("analysisSummary").textContent =
    analysis.summary || "No hay resumen disponible";

  // Signals
  populateSignals(analysis.signals || []);

  // Recommendations
  populateRecommendations(analysis.recommendations || []);

  // Limitations
  populateLimitations(analysis.limitations || []);

  // Technical details
  populateTechnicalDetails(analysis);

  // Teacher notes
  populateTeacherNotes(analysis);

  // Setup download button
  setupDownloadButton(analysis.analysisId);

  // Update tags display
  updateTagsDisplay();
}

function populateTeacherNotes(analysis) {
  const notesInput = document.getElementById("teacherNotesInput");
  const notesLastSaved = document.getElementById("notesLastSaved");
  if (!notesInput) return;

  notesInput.value = analysis.teacherNotes || "";
  if (analysis.notesUpdatedAt) {
    notesLastSaved.textContent = `Última edición: ${formatDate(analysis.notesUpdatedAt)}`;
  }
}

async function saveTeacherNotes() {
  if (!currentAnalysis) return;
  const notes = document.getElementById("teacherNotesInput").value.trim();

  try {
    await apiCall(`/analysis/${currentAnalysis.analysisId}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ notes }),
    });
    const ts = new Date().toLocaleString("es-ES");
    document.getElementById("notesLastSaved").textContent = `Guardado: ${ts}`;
    showSuccess("Notas guardadas correctamente");
  } catch (err) {
    showError("Error al guardar las notas: " + err.message);
  }
}

async function reanalyzeDocument() {
  if (!currentAnalysis) return;

  const confirm = await Swal.fire({
    title: "¿Re-analizar documento?",
    text: "Se volverá a procesar el documento con el modelo de IA actual. Los resultados anteriores serán reemplazados.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#f0a500",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sí, re-analizar",
    cancelButtonText: "Cancelar",
  });

  if (!confirm.isConfirmed) return;

  try {
    showLoading("Iniciando re-análisis...");
    const result = await apiCall(
      `/analysis/${currentAnalysis.analysisId}/reanalyze`,
      { method: "POST" },
    );
    hideLoading();

    await Swal.fire({
      icon: "success",
      title: "Re-análisis iniciado",
      text: result.message || "El documento está siendo re-analizado.",
      confirmButtonColor: "#008FD0",
    });

    window.location.reload();
  } catch (err) {
    hideLoading();
    showError("Error al iniciar re-análisis: " + err.message);
  }
}

function viewStudentHistory() {
  if (!currentAnalysis) return;
  const studentName = currentAnalysis.metadata?.studentName;
  if (!studentName) {
    showError("No se encontró el nombre del alumno");
    return;
  }
  window.location.href = `student-history.html?student=${encodeURIComponent(studentName)}`;
}

window.saveTeacherNotes = saveTeacherNotes;
window.reanalyzeDocument = reanalyzeDocument;
window.viewStudentHistory = viewStudentHistory;

function populateScores(analysis) {
  const aiScore = analysis.aiLikelihoodScore || 0;
  const originalityScore = analysis.originalityScore || 0;
  const confidence = analysis.confidence || 0;

  // AI Score
  const aiScoreBar = document.getElementById("aiScoreBar");
  const aiScoreText = document.getElementById("aiScoreText");
  aiScoreBar.style.width = `${aiScore}%`;
  aiScoreBar.className = `progress-bar progress-bar-${getScoreColor(aiScore)}`;
  aiScoreText.textContent = `${aiScore}%`;

  // Originality Score
  const originalityScoreBar = document.getElementById("originalityScoreBar");
  const originalityScoreText = document.getElementById("originalityScoreText");
  originalityScoreBar.style.width = `${originalityScore}%`;
  originalityScoreBar.className = `progress-bar progress-bar-${getScoreColor(
    100 - originalityScore,
  )}`;
  originalityScoreText.textContent = `${originalityScore}%`;

  // Confidence
  const confidenceBar = document.getElementById("confidenceBar");
  const confidenceText = document.getElementById("confidenceText");
  confidenceBar.style.width = `${confidence}%`;
  confidenceBar.className = `progress-bar progress-bar-${getConfidenceColor(
    confidence,
  )}`;
  confidenceText.textContent = `${confidence}%`;
}

function populateSignals(signals) {
  const signalsAccordion = document.getElementById("signalsAccordion");
  const signalsCard = document.getElementById("signalsCard");

  if (signals.length === 0) {
    signalsCard.style.display = "none";
    return;
  }

  signalsCard.style.display = "block";

  signalsAccordion.innerHTML = signals
    .map((signal, index) => {
      const signalId = `signal-${index}`;
      const signalType = getSignalTypeInfo(signal.type);

      return `
            <div class="accordion-item">
                <h2 class="accordion-header" id="heading-${signalId}">
                    <button class="accordion-button ${
                      index === 0 ? "" : "collapsed"
                    }" type="button" 
                            data-bs-toggle="collapse" data-bs-target="#collapse-${signalId}">
                        <i class="bi ${signalType.icon} me-2 text-${
                          signalType.color
                        }"></i>
                        <strong>${signalType.title}</strong>
                    </button>
                </h2>
                <div id="collapse-${signalId}" class="accordion-collapse collapse ${
                  index === 0 ? "show" : ""
                }" 
                     data-bs-parent="#signalsAccordion">
                    <div class="accordion-body">
                        <p class="mb-2">${signal.description}</p>
                        ${
                          signal.evidenceSnippet
                            ? `
                            <div class="alert alert-light">
                                <small class="text-muted">Evidencia:</small><br>
                                <code class="text-dark">"${signal.evidenceSnippet}"</code>
                            </div>
                        `
                            : ""
                        }
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

function populateRecommendations(recommendations) {
  const recommendationsList = document.getElementById("recommendationsList");
  const recommendationsCard = document.getElementById("recommendationsCard");

  if (recommendations.length === 0) {
    recommendationsCard.style.display = "none";
    return;
  }

  recommendationsCard.style.display = "block";

  recommendationsList.innerHTML = recommendations
    .map(
      (recommendation, index) => `
        <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="rec-${index}">
            <label class="form-check-label" for="rec-${index}">
                ${recommendation}
            </label>
        </div>
    `,
    )
    .join("");
}

function populateLimitations(limitations) {
  const limitationsList = document.getElementById("limitationsList");
  const limitationsCard = document.getElementById("limitationsCard");

  if (limitations.length === 0) {
    limitationsCard.style.display = "none";
    return;
  }

  limitationsCard.style.display = "block";

  limitationsList.innerHTML = limitations
    .map(
      (limitation) => `
        <div class="alert alert-warning d-flex align-items-start">
            <i class="bi bi-exclamation-triangle me-2 mt-1"></i>
            <div>${limitation}</div>
        </div>
    `,
    )
    .join("");
}

function populateTechnicalDetails(analysis) {
  document.getElementById("analysisId").textContent =
    analysis.analysisId || "-";
  document.getElementById("modelUsed").textContent = analysis.modelUsed || "-";
  document.getElementById("promptVersion").textContent =
    analysis.promptVersion || "-";
  document.getElementById("s3Bucket").textContent = analysis.s3Bucket || "-";
  document.getElementById("s3Key").textContent = analysis.s3Key || "-";
  document.getElementById("teacher").textContent = analysis.teacher || "-";
}

function setupDownloadButton(analysisId) {
  const downloadBtn = document.getElementById("downloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.onclick = () => downloadPDF(analysisId);
  }
}

// Utility functions
function getStatusBadgeClass(status) {
  const statusMap = {
    COMPLETED: "badge-success",
    STARTED: "badge-warning",
    FAILED: "badge-danger",
  };
  return statusMap[status] || "badge-secondary";
}

function getStatusText(status) {
  const statusMap = {
    COMPLETED: "Completado",
    STARTED: "En Proceso",
    FAILED: "Fallido",
  };
  return statusMap[status] || status;
}

function getConfidenceColor(confidence) {
  if (confidence >= 80) return "success";
  if (confidence >= 60) return "warning";
  return "danger";
}

function getSignalTypeInfo(type) {
  const signalTypes = {
    ai_markers: {
      title: "Marcadores de IA",
      icon: "bi-robot",
      color: "danger",
    },
    repetitive_patterns: {
      title: "Patrones Repetitivos",
      icon: "bi-arrow-repeat",
      color: "warning",
    },
    style_inconsistency: {
      title: "Inconsistencia de Estilo",
      icon: "bi-exclamation-triangle",
      color: "warning",
    },
    insufficient_text: {
      title: "Texto Insuficiente",
      icon: "bi-file-text",
      color: "info",
    },
    analysis_error: {
      title: "Error de Análisis",
      icon: "bi-exclamation-circle",
      color: "danger",
    },
    default: {
      title: "Señal Detectada",
      icon: "bi-flag",
      color: "primary",
    },
  };

  return signalTypes[type] || signalTypes["default"];
}

// Action functions
function exportReport() {
  if (!currentAnalysis) return;

  // Create a simple text report
  const report = generateTextReport(currentAnalysis);

  // Create and download file
  const blob = new Blob([report], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analisis-${currentAnalysis.analysisId}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  showSuccess("Informe exportado correctamente");
}

function shareAnalysis() {
  if (!currentAnalysis) return;

  const shareUrl = window.location.href;

  if (navigator.share) {
    navigator.share({
      title: `Análisis de ${
        currentAnalysis.metadata?.studentName || "Estudiante"
      }`,
      text: `Análisis de IA completado - Score: ${
        currentAnalysis.aiLikelihoodScore || 0
      }%`,
      url: shareUrl,
    });
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        showSuccess("Enlace copiado al portapapeles");
      })
      .catch(() => {
        showError("No se pudo copiar el enlace");
      });
  }
}

function generateTextReport(analysis) {
  return `
INFORME DE ANÁLISIS DE IA
========================

Información del Estudiante:
- Nombre: ${analysis.metadata?.studentName || "Sin nombre"}
- ID: ${analysis.metadata?.studentId || "No especificado"}
- Curso: ${analysis.metadata?.course || "Sin curso"}
- Materia: ${analysis.metadata?.subject || "No especificada"}
- Tarea: ${analysis.metadata?.assignmentName || "Sin nombre"}

Fecha de Análisis: ${formatDate(analysis.createdAt)}

Puntuaciones:
- Probabilidad de IA: ${analysis.aiLikelihoodScore || 0}%
- Originalidad: ${analysis.originalityScore || 0}%
- Confianza: ${analysis.confidence || 0}%

Resumen:
${analysis.summary || "No disponible"}

Señales Detectadas:
${
  (analysis.signals || [])
    .map((signal) => `- ${signal.type}: ${signal.description}`)
    .join("\n") || "Ninguna"
}

Recomendaciones:
${
  (analysis.recommendations || []).map((rec) => `- ${rec}`).join("\n") ||
  "Ninguna"
}

Limitaciones:
${(analysis.limitations || []).map((lim) => `- ${lim}`).join("\n") || "Ninguna"}

Detalles Técnicos:
- ID de Análisis: ${analysis.analysisId}
- Modelo Utilizado: ${analysis.modelUsed || "No especificado"}
- Versión del Prompt: ${analysis.promptVersion || "No especificada"}

---
Generado por AI Verification Platform
    `.trim();
}

// PDF download function
async function downloadPDF(analysisId) {
  try {
    // Show loading message using SweetAlert if available
    if (typeof Swal !== "undefined") {
      Swal.fire({
        title: "Generando enlace de descarga...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });
    }

    const response = await apiCall(
      `/downloads/presign?analysisId=${analysisId}`,
    );

    // Close loading message
    if (typeof Swal !== "undefined") {
      Swal.close();
    }

    // Open download URL in new tab
    window.open(response.downloadUrl, "_blank");
  } catch (error) {
    // Close loading message
    if (typeof Swal !== "undefined") {
      Swal.close();
    }

    // Show error message
    if (typeof Swal !== "undefined") {
      Swal.fire({
        title: "Error",
        text: "Error al generar el enlace de descarga: " + error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    } else {
      alert("Error al generar el enlace de descarga: " + error.message);
    }
  }
}

// Export functions for global access
window.exportReport = exportReport;
window.shareAnalysis = shareAnalysis;
window.downloadPDF = downloadPDF;

// Tags functionality for detail page
function showTagModalForDetail() {
  if (!currentAnalysis) {
    showError("No hay análisis cargado");
    return;
  }

  if (typeof showTagModal === "function") {
    showTagModal(
      currentAnalysis.analysisId,
      currentAnalysis.studentName || "Sin nombre",
    );
  } else {
    showError("Función de etiquetas no disponible");
  }
}

// Update tags display in detail page
function updateTagsDisplay() {
  if (!currentAnalysis) return;

  const tagsDisplay = document.getElementById("analysisTagsDisplay");
  if (!tagsDisplay) return;

  const tags = getAnalysisTags(currentAnalysis.analysisId);

  if (tags.length === 0) {
    tagsDisplay.innerHTML =
      '<span class="text-muted small">Sin etiquetas</span>';
  } else {
    tagsDisplay.innerHTML = renderAnalysisTags(currentAnalysis.analysisId);
  }
}

// Override the original showTagModal to refresh display after changes
const originalShowTagModal = window.showTagModal;
if (originalShowTagModal) {
  window.showTagModal = function (analysisId, studentName) {
    const result = originalShowTagModal(analysisId, studentName);

    // Always refresh after a delay, regardless of return type
    setTimeout(updateTagsDisplay, 1000);

    return result;
  };
}

// Update populateAnalysisDetail to include tags
const originalPopulateAnalysisDetail = window.populateAnalysisDetail;
if (originalPopulateAnalysisDetail) {
  window.populateAnalysisDetail = function (analysis) {
    originalPopulateAnalysisDetail(analysis);
    updateTagsDisplay();
  };
} else {
  // If populateAnalysisDetail doesn't exist yet, we'll add it to the existing function
  const existingPopulate = populateAnalysisDetail;
  populateAnalysisDetail = function (analysis) {
    existingPopulate(analysis);
    updateTagsDisplay();
  };
}

// Export functions for global access
window.showTagModalForDetail = showTagModalForDetail;
window.updateTagsDisplay = updateTagsDisplay;
