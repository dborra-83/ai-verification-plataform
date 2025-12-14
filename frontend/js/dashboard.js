// AI Detection Dashboard functionality - Updated 2025-12-13 with proper data filtering
// This dashboard shows ONLY AI detection analysis results, NOT exam generation data

// Dashboard KPI loading function - called from app.js

// Load KPI data
async function loadDashboardKPIs() {
  try {
    // Load recent AI detection analyses to calculate KPIs
    const response = await apiCall("/analysis?pageSize=100"); // Get more data for KPI calculation
    const analyses = response.items || [];

    console.log("Raw analyses received:", analyses.length);
    console.log("Sample analyses:", analyses.slice(0, 3));

    // Enhanced filtering: More permissive approach - exclude obvious exam records but include AI detection analyses
    const aiDetectionAnalyses = analyses.filter((analysis) => {
      // Primary exclusion: Skip obvious exam/topic records first
      const hasExamPrefix = analysis.analysisId?.startsWith("exam-");
      const hasTopicPrefix =
        analysis.analysisId?.startsWith("topic-extraction-");
      const isExamType =
        analysis.type === "TOPIC_EXTRACTION" ||
        analysis.type === "EXAM_GENERATION";

      // Exclude if it has exam/topic identifiers
      if (hasExamPrefix || hasTopicPrefix || isExamType) {
        console.log("❌ EXCLUDED - Exam/Topic record:", analysis.analysisId);
        return false;
      }

      // Secondary exclusion: Skip records with exam-specific fields
      const hasExamConfig = analysis.hasOwnProperty("examConfig");
      const hasTopicOutline = analysis.hasOwnProperty("topicOutline");
      const hasSelectedTopics = analysis.hasOwnProperty("selectedTopics");
      const hasGeneratedFiles = analysis.hasOwnProperty("generatedFiles");

      // Exclude if it has exam-specific fields
      if (
        hasExamConfig ||
        hasTopicOutline ||
        hasSelectedTopics ||
        hasGeneratedFiles
      ) {
        console.log("❌ EXCLUDED - Has exam fields:", analysis.analysisId);
        return false;
      }

      // More permissive inclusion: Include if it looks like an AI detection record
      const hasAIScore = analysis.hasOwnProperty("aiLikelihoodScore");
      const hasOriginalityScore = analysis.hasOwnProperty("originalityScore");
      const hasStudentName =
        analysis.studentName || analysis.metadata?.studentName;
      const hasAnalysisFields =
        analysis.summary || analysis.signals || analysis.recommendations;

      // Include if it has AI detection characteristics
      if (
        hasAIScore ||
        hasOriginalityScore ||
        (hasStudentName && hasAnalysisFields)
      ) {
        console.log("✅ INCLUDED AI DETECTION RECORD:", {
          analysisId: analysis.analysisId,
          studentName: hasStudentName,
          aiScore: analysis.aiLikelihoodScore,
          originalityScore: analysis.originalityScore,
          status: analysis.status,
          createdAt: analysis.createdAt,
        });
        return true;
      }

      console.log(
        "❌ EXCLUDED - No AI detection indicators:",
        analysis.analysisId
      );
      return false;
    });

    console.log("Filtered AI detection analyses:", aiDetectionAnalyses.length);

    // Monitor for data contamination
    const contaminationReport = monitorDataContamination(
      analyses,
      "AI_DETECTION"
    );
    console.log("Contamination monitoring report:", contaminationReport);

    // Calculate KPIs
    const now = new Date();
    const settings = window.appSettings || { kpiPeriod: "30" };
    const daysBack = parseInt(settings.kpiPeriod);
    const periodAgo = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const recentAnalyses = aiDetectionAnalyses.filter((analysis) => {
      const analysisDate = new Date(analysis.createdAt);
      return analysisDate >= periodAgo;
    });

    const completedAnalyses = recentAnalyses.filter(
      (analysis) => analysis.status === "COMPLETED"
    );

    // Update KPI cards
    updateKPICard("totalAnalyses", recentAnalyses.length);

    // Calculate average AI score
    if (completedAnalyses.length > 0) {
      const avgScore =
        completedAnalyses.reduce((sum, analysis) => {
          return sum + (analysis.aiLikelihoodScore || 0);
        }, 0) / completedAnalyses.length;

      updateKPICard("avgAiScore", avgScore.toFixed(1) + "%");
    } else {
      updateKPICard("avgAiScore", "0.0%");
    }

    // Calculate high risk count (AI Score > threshold from settings)
    const threshold = parseInt(settings.highRiskThreshold || "70");
    const highRiskCount = completedAnalyses.filter(
      (analysis) => (analysis.aiLikelihoodScore || 0) > threshold
    ).length;
    updateKPICard("highRiskCount", highRiskCount);

    // Calculate average originality score
    if (completedAnalyses.length > 0) {
      const avgOriginality =
        completedAnalyses.reduce((sum, analysis) => {
          return sum + (analysis.originalityScore || 0);
        }, 0) / completedAnalyses.length;

      updateKPICard("avgOriginalityScore", avgOriginality.toFixed(1) + "%");
    } else {
      updateKPICard("avgOriginalityScore", "0.0%");
    }

    // Calculate today's analyses
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayAnalyses = recentAnalyses.filter((analysis) => {
      const analysisDate = new Date(analysis.createdAt);
      analysisDate.setHours(0, 0, 0, 0);
      return analysisDate.getTime() === today.getTime();
    }).length;
    updateKPICard("todayAnalyses", todayAnalyses);

    // Calculate average confidence
    if (completedAnalyses.length > 0) {
      const avgConfidence =
        completedAnalyses.reduce((sum, analysis) => {
          return sum + (analysis.confidence || 0);
        }, 0) / completedAnalyses.length;

      updateKPICard("avgConfidence", avgConfidence.toFixed(1) + "%");
    } else {
      updateKPICard("avgConfidence", "0.0%");
    }

    // Load recent analyses table
    loadRecentAnalysesTable(aiDetectionAnalyses.slice(0, 5));
  } catch (error) {
    console.error("Error loading dashboard KPIs:", error);

    // Show appropriate error message based on error type
    const isNetworkError =
      error.message.includes("fetch") || error.message.includes("network");
    const errorMessage = isNetworkError
      ? "Error de conexión. Verifica tu conexión a internet."
      : "Error al cargar los datos. Intenta refrescar la página.";

    // Show empty state with error context
    updateKPICard("totalAnalyses", "0");
    updateKPICard("avgAiScore", "0.0%");
    updateKPICard("highRiskCount", "0");
    updateKPICard("avgOriginalityScore", "0.0%");
    updateKPICard("todayAnalyses", "0");
    updateKPICard("avgConfidence", "0.0%");

    const tableBody = document.getElementById("recentAnalysesTable");
    if (tableBody) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        <i class="bi bi-exclamation-triangle me-2 text-warning"></i>
                        ${errorMessage}
                        <br>
                        <small class="text-muted">
                          <button class="btn btn-sm btn-outline-primary mt-2" onclick="loadDashboardKPIs()">
                            <i class="bi bi-arrow-clockwise me-1"></i>Reintentar
                          </button>
                        </small>
                    </td>
                </tr>
            `;
    }

    // Add retry mechanism for network errors
    if (isNetworkError) {
      console.log("Network error detected, will retry in 5 seconds...");
      setTimeout(() => {
        console.log("Retrying dashboard load...");
        loadDashboardKPIs();
      }, 5000);
    }
  }
}

function updateKPICard(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value;

    // Add animation
    element.style.opacity = "0";
    setTimeout(() => {
      element.style.opacity = "1";
    }, 100);
  }
}

function loadRecentAnalysesTable(analyses) {
  const tableBody = document.getElementById("recentAnalysesTable");
  if (!tableBody) return;

  if (analyses.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="bi bi-inbox me-2"></i>
                    No hay análisis recientes
                    <br>
                    <small class="text-muted">Sube tu primer documento para comenzar</small>
                </td>
            </tr>
        `;
    return;
  }

  tableBody.innerHTML = analyses
    .map((analysis) => {
      const aiScore = analysis.aiLikelihoodScore || 0;
      const scoreColor = getScoreColor(aiScore);

      return `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="me-2">
                            <i class="bi bi-person-circle text-muted"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="fw-medium">${
                              analysis.studentName || "Sin nombre"
                            }</div>
                            ${
                              analysis.metadata?.studentId
                                ? `<small class="text-muted">ID: ${analysis.metadata.studentId}</small>`
                                : ""
                            }
                        </div>
                        <div class="ms-2">
                            ${
                              renderTagIcons
                                ? renderTagIcons(analysis.analysisId)
                                : ""
                            }
                        </div>
                    </div>
                </td>
                <td>
                    <div class="fw-medium">${analysis.course || "-"}</div>
                    ${
                      analysis.metadata?.subject
                        ? `<small class="text-muted">${analysis.metadata.subject}</small>`
                        : ""
                    }
                </td>
                <td>
                    <div>${formatDate(analysis.createdAt)}</div>
                    <small class="text-muted">${getTimeAgo(
                      analysis.createdAt
                    )}</small>
                </td>
                <td>
                    <span class="badge badge-${scoreColor} fs-6">
                        ${aiScore}%
                    </span>
                </td>
                <td>${getStatusBadge(analysis.status)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="viewAnalysis('${
                          analysis.analysisId
                        }')" title="Ver detalle">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${
                          analysis.status === "COMPLETED"
                            ? `
                            <button class="btn btn-outline-secondary" onclick="downloadPDF('${analysis.analysisId}')" title="Descargar PDF">
                                <i class="bi bi-download"></i>
                            </button>
                        `
                            : ""
                        }
                        <button class="btn btn-outline-info" onclick="showTagModal('${
                          analysis.analysisId
                        }', '${(analysis.studentName || "Sin nombre").replace(
        /'/g,
        "\\'"
      )}')" title="Gestionar etiquetas">
                            <i class="bi bi-tags me-1"></i>Tags
                        </button>
                        <button class="btn btn-outline-danger" onclick="deleteAnalysis('${
                          analysis.analysisId
                        }', '${(analysis.studentName || "Sin nombre").replace(
        /'/g,
        "\\'"
      )}')" title="Eliminar análisis">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    })
    .join("");
}

// History functionality
async function loadHistoryData(filters = {}) {
  const tableBody = document.getElementById("historyTable");
  if (!tableBody) return;

  try {
    // Show loading state
    tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                    Cargando historial...
                </td>
            </tr>
        `;

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (filters.from) queryParams.append("from", filters.from);
    if (filters.to) queryParams.append("to", filters.to);
    if (filters.course) queryParams.append("course", filters.course);
    if (filters.pageSize) queryParams.append("pageSize", filters.pageSize);
    if (filters.nextToken) queryParams.append("nextToken", filters.nextToken);

    const queryString = queryParams.toString();
    const endpoint = `/analysis${queryString ? "?" + queryString : ""}`;

    const response = await apiCall(endpoint);
    let analyses = response.items || [];

    console.log("History - Raw analyses received:", analyses.length);
    if (analyses.length > 0) {
      console.log("History - Sample analysis:", analyses[0]);
    }

    // Enhanced filtering for history: More permissive approach - exclude obvious exam records but include AI detection analyses
    analyses = analyses.filter((analysis) => {
      // Primary exclusion: Skip obvious exam/topic records first
      const hasExamPrefix = analysis.analysisId?.startsWith("exam-");
      const hasTopicPrefix =
        analysis.analysisId?.startsWith("topic-extraction-");
      const isExamType =
        analysis.type === "TOPIC_EXTRACTION" ||
        analysis.type === "EXAM_GENERATION";

      // Exclude if it has exam/topic identifiers
      if (hasExamPrefix || hasTopicPrefix || isExamType) {
        console.log(
          "❌ HISTORY EXCLUDED - Exam/Topic record:",
          analysis.analysisId
        );
        return false;
      }

      // Secondary exclusion: Skip records with exam-specific fields
      const hasExamConfig = analysis.hasOwnProperty("examConfig");
      const hasTopicOutline = analysis.hasOwnProperty("topicOutline");
      const hasSelectedTopics = analysis.hasOwnProperty("selectedTopics");
      const hasGeneratedFiles = analysis.hasOwnProperty("generatedFiles");

      // Exclude if it has exam-specific fields
      if (
        hasExamConfig ||
        hasTopicOutline ||
        hasSelectedTopics ||
        hasGeneratedFiles
      ) {
        console.log(
          "❌ HISTORY EXCLUDED - Has exam fields:",
          analysis.analysisId
        );
        return false;
      }

      // More permissive inclusion: Include if it looks like an AI detection record
      const hasAIScore = analysis.hasOwnProperty("aiLikelihoodScore");
      const hasOriginalityScore = analysis.hasOwnProperty("originalityScore");
      const hasStudentName =
        analysis.studentName || analysis.metadata?.studentName;
      const hasAnalysisFields =
        analysis.summary || analysis.signals || analysis.recommendations;

      // Include if it has AI detection characteristics
      if (
        hasAIScore ||
        hasOriginalityScore ||
        (hasStudentName && hasAnalysisFields)
      ) {
        console.log("✅ HISTORY INCLUDED AI DETECTION RECORD:", {
          analysisId: analysis.analysisId,
          studentName: hasStudentName,
          aiScore: analysis.aiLikelihoodScore,
          originalityScore: analysis.originalityScore,
          status: analysis.status,
        });
        return true;
      }

      console.log(
        "❌ HISTORY EXCLUDED - No AI detection indicators:",
        analysis.analysisId
      );
      return false;
    });

    console.log("History - Filtered analyses:", analyses.length);

    // Apply client-side filters for tags and text search
    if (filters.tag && typeof filterAnalysesByTag === "function") {
      analyses = filterAnalysesByTag(analyses, filters.tag);
    }

    if (filters.searchText && typeof filterAnalysesByText === "function") {
      analyses = filterAnalysesByText(analyses, filters.searchText);
    }

    if (analyses.length === 0) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        <i class="bi bi-inbox me-2"></i>
                        No se encontraron análisis
                        <br>
                        <small class="text-muted">Intenta ajustar los filtros o sube un nuevo documento</small>
                    </td>
                </tr>
            `;
      return;
    }

    // Populate table
    tableBody.innerHTML = analyses
      .map((analysis) => {
        const aiScore = analysis.aiLikelihoodScore || 0;
        const originalityScore = analysis.originalityScore || 0;

        return `
                <tr>
                    <td>
                        <div class="fw-medium">${
                          analysis.studentName || "Sin nombre"
                        }</div>
                        ${
                          analysis.metadata?.studentId
                            ? `<small class="text-muted">ID: ${analysis.metadata.studentId}</small>`
                            : ""
                        }
                    </td>
                    <td>
                        <div class="fw-medium">${analysis.course || "-"}</div>
                        ${
                          analysis.metadata?.subject
                            ? `<small class="text-muted">${analysis.metadata.subject}</small>`
                            : ""
                        }
                    </td>
                    <td>
                        <div class="fw-medium">${
                          analysis.assignmentName || "-"
                        }</div>
                    </td>
                    <td>
                        <div>${formatDate(analysis.createdAt)}</div>
                        <small class="text-muted">${getTimeAgo(
                          analysis.createdAt
                        )}</small>
                    </td>
                    <td>
                        <span class="badge badge-${getScoreColor(
                          aiScore
                        )} fs-6">
                            ${aiScore}%
                        </span>
                    </td>
                    <td>
                        <span class="badge badge-${getScoreColor(
                          100 - originalityScore
                        )} fs-6">
                            ${originalityScore}%
                        </span>
                    </td>
                    <td>${getStatusBadge(analysis.status)}</td>
                    <td>${
                      renderAnalysisTags
                        ? renderAnalysisTags(analysis.analysisId)
                        : '<span class="text-muted small">-</span>'
                    }</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="viewAnalysis('${
                              analysis.analysisId
                            }')" title="Ver detalle">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${
                              analysis.status === "COMPLETED"
                                ? `
                                <button class="btn btn-outline-secondary" onclick="downloadPDF('${analysis.analysisId}')" title="Descargar PDF">
                                    <i class="bi bi-download"></i>
                                </button>
                            `
                                : ""
                            }
                            <button class="btn btn-outline-info" onclick="showTagModal('${
                              analysis.analysisId
                            }', '${(
          analysis.studentName || "Sin nombre"
        ).replace(/'/g, "\\'")}')" title="Gestionar etiquetas">
                                <i class="bi bi-tags"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="deleteAnalysis('${
                              analysis.analysisId
                            }', '${(
          analysis.studentName || "Sin nombre"
        ).replace(/'/g, "\\'")}')" title="Eliminar análisis">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
      })
      .join("");

    // Update pagination
    updateHistoryPagination(response.nextToken);

    // Update course filter options
    updateCourseFilter(analyses);
  } catch (error) {
    console.error("Error loading history data:", error);
    tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Error al cargar el historial
                    <br>
                    <small class="text-muted">${error.message}</small>
                </td>
            </tr>
        `;
  }
}

function updateCourseFilter(analyses) {
  const filterCourse = document.getElementById("filterCourse");
  if (!filterCourse) return;

  // Get unique courses
  const courses = [...new Set(analyses.map((a) => a.course).filter(Boolean))];

  // Keep current selection
  const currentValue = filterCourse.value;

  // Update options
  filterCourse.innerHTML =
    '<option value="">Todos los cursos</option>' +
    courses
      .map((course) => `<option value="${course}">${course}</option>`)
      .join("");

  // Restore selection
  if (currentValue && courses.includes(currentValue)) {
    filterCourse.value = currentValue;
  }
}

function updateHistoryPagination(nextToken) {
  const pagination = document.getElementById("historyPagination");
  if (!pagination) return;

  // Simple pagination - just show next button if there's more data
  if (nextToken) {
    pagination.innerHTML = `
            <li class="page-item">
                <button class="page-link" onclick="loadMoreHistory('${nextToken}')">
                    Cargar más <i class="bi bi-arrow-right ms-1"></i>
                </button>
            </li>
        `;
  } else {
    pagination.innerHTML = "";
  }
}

// Filter functions
function applyFilters() {
  const filters = {
    from: document.getElementById("filterFrom")?.value,
    to: document.getElementById("filterTo")?.value,
    course: document.getElementById("filterCourse")?.value,
    tag: document.getElementById("filterTag")?.value,
    searchText: document.getElementById("searchText")?.value,
    pageSize: 20,
  };

  loadHistoryData(filters);
}

function loadMoreHistory(nextToken) {
  const filters = {
    from: document.getElementById("filterFrom")?.value,
    to: document.getElementById("filterTo")?.value,
    course: document.getElementById("filterCourse")?.value,
    tag: document.getElementById("filterTag")?.value,
    searchText: document.getElementById("searchText")?.value,
    pageSize: 20,
    nextToken: nextToken,
  };

  loadHistoryData(filters);
}

// Utility functions
function getTimeAgo(dateString) {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return "";
  } catch (error) {
    return "";
  }
}

// PDF download function
async function downloadPDF(analysisId) {
  try {
    showLoading("Generando enlace de descarga...");

    const response = await apiCall(
      `/downloads/presign?analysisId=${analysisId}`
    );

    hideLoading();

    // Open download URL in new tab
    window.open(response.downloadUrl, "_blank");
  } catch (error) {
    hideLoading();
    showError("Error al generar el enlace de descarga: " + error.message);
  }
}

// Delete analysis function
async function deleteAnalysis(analysisId, studentName) {
  try {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: "¿Eliminar análisis?",
      html: `
                <p>¿Estás seguro de que deseas eliminar el análisis de:</p>
                <p><strong>${studentName || "Sin nombre"}</strong></p>
                <p class="text-muted small">Esta acción no se puede deshacer. Se eliminará el análisis y el archivo PDF asociado.</p>
            `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: '<i class="bi bi-trash me-2"></i>Eliminar',
      cancelButtonText: "Cancelar",
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    // Show loading
    showLoading("Eliminando análisis...");

    // Call delete API
    await apiCall(`/analysis/${analysisId}`, {
      method: "DELETE",
    });

    hideLoading();

    // Show success message
    Swal.fire({
      icon: "success",
      title: "¡Análisis eliminado!",
      text: "El análisis ha sido eliminado correctamente.",
      confirmButtonColor: "#008FD0",
      timer: 2000,
      showConfirmButton: false,
    });

    // Refresh the current view
    if (
      window.location.pathname.includes("index.html") ||
      window.location.pathname === "/"
    ) {
      // Refresh dashboard
      loadDashboardKPIs();
    } else {
      // Refresh history if we're on history page
      loadHistoryData();
    }
  } catch (error) {
    hideLoading();
    console.error("Error deleting analysis:", error);

    Swal.fire({
      icon: "error",
      title: "Error al eliminar",
      text: "No se pudo eliminar el análisis: " + error.message,
      confirmButtonColor: "#008FD0",
    });
  }
}

// Data validation utilities for cross-contamination prevention
function validateAIDetectionRecord(record) {
  // Check for AI detection indicators
  const hasAIScore = record.hasOwnProperty("aiLikelihoodScore");
  const hasOriginalityScore = record.hasOwnProperty("originalityScore");
  const hasStudentName = record.studentName || record.metadata?.studentName;
  const hasAnalysisFields =
    record.summary || record.signals || record.recommendations;

  // Check for exam-specific fields (should not be present)
  const hasExamConfig = record.hasOwnProperty("examConfig");
  const hasTopicOutline = record.hasOwnProperty("topicOutline");
  const hasSelectedTopics = record.hasOwnProperty("selectedTopics");
  const hasGeneratedFiles = record.hasOwnProperty("generatedFiles");
  const hasExamPrefix = record.analysisId?.startsWith("exam-");
  const hasTopicPrefix = record.analysisId?.startsWith("topic-extraction-");
  const isExamType =
    record.type === "TOPIC_EXTRACTION" || record.type === "EXAM_GENERATION";

  // Validation result
  const isValidAIRecord =
    (hasAIScore ||
      hasOriginalityScore ||
      (hasStudentName && hasAnalysisFields)) &&
    !(
      hasExamConfig ||
      hasTopicOutline ||
      hasSelectedTopics ||
      hasGeneratedFiles ||
      hasExamPrefix ||
      hasTopicPrefix ||
      isExamType
    );

  if (!isValidAIRecord) {
    console.warn("❌ CROSS-CONTAMINATION DETECTED - Invalid AI record:", {
      recordId: record.analysisId,
      hasAIIndicators: hasAIScore || hasOriginalityScore,
      hasExamFields:
        hasExamConfig ||
        hasTopicOutline ||
        hasSelectedTopics ||
        hasGeneratedFiles,
      hasExamIdentifiers: hasExamPrefix || hasTopicPrefix || isExamType,
    });
  }

  return isValidAIRecord;
}

function monitorDataContamination(records, expectedType) {
  const contaminationReport = {
    totalRecords: records.length,
    validRecords: 0,
    contaminatedRecords: 0,
    contaminationDetails: [],
  };

  records.forEach((record) => {
    if (expectedType === "AI_DETECTION") {
      if (validateAIDetectionRecord(record)) {
        contaminationReport.validRecords++;
      } else {
        contaminationReport.contaminatedRecords++;
        contaminationReport.contaminationDetails.push({
          recordId: record.analysisId,
          reason: "Contains exam-specific fields or identifiers",
        });
      }
    }
  });

  if (contaminationReport.contaminatedRecords > 0) {
    console.error("🚨 DATA CONTAMINATION DETECTED:", contaminationReport);

    // Send contamination alert (in production, this could be sent to monitoring service)
    if (window.appSettings?.enableContaminationAlerts) {
      alert(
        `Advertencia: Se detectaron ${contaminationReport.contaminatedRecords} registros contaminados en el Dashboard de Análisis de IA.`
      );
    }
  }

  return contaminationReport;
}

// Export functions for global access
window.loadHistoryData = loadHistoryData;
window.applyFilters = applyFilters;
window.loadMoreHistory = loadMoreHistory;
window.downloadPDF = downloadPDF;
window.deleteAnalysis = deleteAnalysis;
window.validateAIDetectionRecord = validateAIDetectionRecord;
window.monitorDataContamination = monitorDataContamination;
