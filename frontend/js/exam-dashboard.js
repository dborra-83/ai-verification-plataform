// Exam Generation Dashboard JavaScript - Updated 2025-12-13 with proper data filtering
// This dashboard shows ONLY exam generation data, NOT AI detection analysis results
// Handles the exam dashboard functionality

// Initialize dashboard when page loads
document.addEventListener("DOMContentLoaded", function () {
  loadExamDashboardData();
  loadRecentExams();
});

// Load exam dashboard KPIs
async function loadExamDashboardData() {
  try {
    console.log("Loading exam dashboard data...");

    // For now, show placeholder data until API is ready
    document.getElementById("totalExams").textContent = "0";
    document.getElementById("completedExams").textContent = "0";
    document.getElementById("processingExams").textContent = "0";
    document.getElementById("avgQuestions").textContent = "0";
    document.getElementById("todayExams").textContent = "0";
    document.getElementById("successRate").textContent = "0%";

    // Try to load real data from API
    try {
      const response = await apiCall("/exam/history?pageSize=100");
      let exams = response.items || response.exams || []; // Support both formats

      console.log("Raw exams received:", exams.length);
      if (exams.length > 0) {
        console.log("Sample exam:", exams[0]);
      }

      // Enhanced filtering: More permissive - include exam records, exclude AI detection
      exams = exams.filter((exam) => {
        // First exclude obvious AI detection records
        const hasAIScore = exam.hasOwnProperty("aiLikelihoodScore");
        const hasOriginalityScore = exam.hasOwnProperty("originalityScore");
        const hasStudentName = exam.studentName || exam.metadata?.studentName;
        const hasAnalysisFields =
          exam.summary || exam.signals || exam.recommendations;

        // If it has AI detection characteristics, exclude it
        if (
          hasAIScore ||
          hasOriginalityScore ||
          (hasStudentName && hasAnalysisFields)
        ) {
          console.log(
            "❌ EXAM DASHBOARD EXCLUDED - AI Detection record:",
            exam.examId || exam.analysisId
          );
          return false;
        }

        // More permissive inclusion for exam records
        const hasExamId = exam.examId || exam.analysisId?.startsWith("exam-");
        const hasExamConfig =
          exam.examConfig || exam.hasOwnProperty("examConfig");
        const hasQuestionCount = exam.questionCount !== undefined;
        const hasSelectedTopics =
          exam.selectedTopics && Array.isArray(exam.selectedTopics);
        const hasGeneratedFiles =
          exam.generatedFiles && Array.isArray(exam.generatedFiles);
        const hasTeacherId = exam.teacherId;
        const hasStatus = exam.status;

        // Include if it has any exam characteristics or comes from exam endpoint
        if (
          hasExamId ||
          hasExamConfig ||
          hasQuestionCount ||
          hasSelectedTopics ||
          hasGeneratedFiles ||
          hasTeacherId ||
          hasStatus
        ) {
          console.log("✅ EXAM DASHBOARD INCLUDED:", {
            examId: exam.examId || exam.analysisId,
            status: exam.status,
            questionCount: exam.questionCount,
            hasConfig: !!exam.examConfig,
            hasTeacherId: !!exam.teacherId,
          });
          return true;
        }

        console.log(
          "❌ EXAM DASHBOARD EXCLUDED - No exam indicators:",
          exam.examId || exam.analysisId
        );
        return false;
      });

      console.log("Filtered exams count:", exams.length);

      // Monitor for data contamination
      const originalExams = response.items || response.exams || [];
      const contaminationReport = monitorExamDataContamination(originalExams);
      console.log("Exam contamination monitoring report:", contaminationReport);

      // Calculate KPIs
      const totalExams = exams.length;
      const completedExams = exams.filter(
        (exam) => exam.status === "COMPLETED"
      ).length;
      const processingExams = exams.filter(
        (exam) => exam.status === "PROCESSING"
      ).length;

      // Calculate today's exams
      const today = new Date();
      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const todayExams = exams.filter((exam) => {
        const examDate = new Date(exam.createdAt);
        return examDate >= todayStart;
      }).length;

      // Calculate average questions
      const completedExamsWithQuestions = exams.filter(
        (exam) => exam.status === "COMPLETED" && exam.questionCount
      );
      const avgQuestions =
        completedExamsWithQuestions.length > 0
          ? Math.round(
              completedExamsWithQuestions.reduce(
                (sum, exam) => sum + (exam.questionCount || 0),
                0
              ) / completedExamsWithQuestions.length
            )
          : 0;

      // Calculate success rate
      const successRate =
        totalExams > 0 ? Math.round((completedExams / totalExams) * 100) : 0;

      // Update KPIs
      document.getElementById("totalExams").textContent = totalExams;
      document.getElementById("completedExams").textContent = completedExams;
      document.getElementById("processingExams").textContent = processingExams;
      document.getElementById("avgQuestions").textContent = avgQuestions;
      document.getElementById("todayExams").textContent = todayExams;
      document.getElementById("successRate").textContent = successRate + "%";
    } catch (apiError) {
      console.log("API not available yet, showing placeholder data");

      // Add visual indicator that data is not available
      const statusElements = [
        "totalExams",
        "completedExams",
        "processingExams",
        "avgQuestions",
        "todayExams",
        "successRate",
      ];
      statusElements.forEach((elementId) => {
        const element = document.getElementById(elementId);
        if (element) {
          element.style.opacity = "0.5";
          element.title = "Datos no disponibles - API en desarrollo";
        }
      });
    }
  } catch (error) {
    console.error("Error loading exam dashboard data:", error);

    // Show error state for KPIs
    const statusElements = [
      "totalExams",
      "completedExams",
      "processingExams",
      "avgQuestions",
      "todayExams",
      "successRate",
    ];
    statusElements.forEach((elementId) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = "Error";
        element.style.color = "#dc3545";
        element.title = "Error al cargar datos";
      }
    });
  }
}

// Load recent exams
async function loadRecentExams() {
  const tableBody = document.getElementById("recentExamsTable");

  try {
    const response = await apiCall("/exam/history?pageSize=5");
    let exams = response.items || response.exams || []; // Support both formats

    console.log("Recent exams - Raw data received:", exams.length);

    // Enhanced filtering: More permissive - include exam records, exclude AI detection
    exams = exams.filter((exam) => {
      // First exclude obvious AI detection records
      const hasAIScore = exam.hasOwnProperty("aiLikelihoodScore");
      const hasOriginalityScore = exam.hasOwnProperty("originalityScore");
      const hasStudentName = exam.studentName || exam.metadata?.studentName;
      const hasAnalysisFields =
        exam.summary || exam.signals || exam.recommendations;

      // If it has AI detection characteristics, exclude it
      if (
        hasAIScore ||
        hasOriginalityScore ||
        (hasStudentName && hasAnalysisFields)
      ) {
        console.log(
          "❌ RECENT EXAMS EXCLUDED - AI Detection record:",
          exam.examId || exam.analysisId
        );
        return false;
      }

      // More permissive inclusion for exam records
      const hasExamId = exam.examId || exam.analysisId?.startsWith("exam-");
      const hasExamConfig =
        exam.examConfig || exam.hasOwnProperty("examConfig");
      const hasQuestionCount = exam.questionCount !== undefined;
      const hasSelectedTopics =
        exam.selectedTopics && Array.isArray(exam.selectedTopics);
      const hasGeneratedFiles =
        exam.generatedFiles && Array.isArray(exam.generatedFiles);
      const hasTeacherId = exam.teacherId;
      const hasStatus = exam.status;

      // Include if it has any exam characteristics
      if (
        hasExamId ||
        hasExamConfig ||
        hasQuestionCount ||
        hasSelectedTopics ||
        hasGeneratedFiles ||
        hasTeacherId ||
        hasStatus
      ) {
        console.log(
          "✅ RECENT EXAMS INCLUDED:",
          exam.examId || exam.analysisId
        );
        return true;
      }

      return false;
    });

    console.log("Recent exams - Filtered count:", exams.length);

    if (exams.length === 0) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        <i class="bi bi-inbox me-2"></i>
                        No hay exámenes recientes
                    </td>
                </tr>
            `;
      return;
    }

    tableBody.innerHTML = exams
      .map(
        (exam) => `
            <tr>
                <td>${exam.examId || "-"}</td>
                <td>${exam.teacherId || "Admin"}</td>
                <td>${formatDate(exam.createdAt)}</td>
                <td>
                    <span class="badge bg-info">
                        ${exam.questionCount || 0} preguntas
                    </span>
                </td>
                <td>
                    <span class="badge ${getDifficultyColor(exam.difficulty)}">
                        ${getDifficultyText(exam.difficulty)}
                    </span>
                </td>
                <td>${getExamStatusBadge(exam.status)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="viewExam('${
                          exam.examId
                        }')" 
                                title="Ver detalles">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${
                          exam.status === "COMPLETED"
                            ? `
                            <button class="btn btn-outline-success" onclick="downloadExam('${exam.examId}')" 
                                    title="Descargar">
                                <i class="bi bi-download"></i>
                            </button>
                        `
                            : ""
                        }
                        <button class="btn btn-outline-danger" onclick="deleteExamFromDashboard('${
                          exam.examId
                        }', '${exam.teacherId || "Admin"}')" 
                                title="Eliminar examen">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `
      )
      .join("");
  } catch (error) {
    console.error("Error loading recent exams:", error);

    // Show appropriate error message based on error type
    const isNetworkError =
      error.message.includes("fetch") || error.message.includes("network");
    const errorMessage = isNetworkError
      ? "Error de conexión al cargar exámenes"
      : "Error al cargar exámenes recientes";

    tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="bi bi-exclamation-triangle me-2 text-warning"></i>
                    ${errorMessage}
                    <br>
                    <small class="text-muted">
                      <button class="btn btn-sm btn-outline-primary mt-2" onclick="loadRecentExams()">
                        <i class="bi bi-arrow-clockwise me-1"></i>Reintentar
                      </button>
                    </small>
                </td>
            </tr>
        `;
  }
}

// Helper functions
function getDifficultyColor(difficulty) {
  switch (difficulty) {
    case "easy":
      return "bg-success";
    case "medium":
      return "bg-warning";
    case "hard":
      return "bg-danger";
    default:
      return "bg-secondary";
  }
}

function getDifficultyText(difficulty) {
  switch (difficulty) {
    case "easy":
      return "Fácil";
    case "medium":
      return "Intermedio";
    case "hard":
      return "Difícil";
    default:
      return difficulty || "N/A";
  }
}

function getExamStatusBadge(status) {
  const statusMap = {
    COMPLETED: { class: "badge-success", text: "Completado" },
    PROCESSING: { class: "badge-warning", text: "En Proceso" },
    FAILED: { class: "badge-danger", text: "Fallido" },
    PENDING: { class: "badge-secondary", text: "Pendiente" },
  };

  const statusInfo = statusMap[status] || {
    class: "badge-secondary",
    text: status || "Desconocido",
  };
  return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

// Navigation functions
function viewExam(examId) {
  // For now, redirect to exam history with filter
  window.location.href = `exam-history.html?examId=${examId}`;
}

function downloadExam(examId) {
  // This will be implemented when the download API is ready
  showComingSoon("Descarga de Exámenes");
}

// Export functions
function exportExamDashboardToPDF() {
  showComingSoon("Exportar Dashboard a PDF");
}

function exportExamDashboardToExcel() {
  showComingSoon("Exportar Dashboard a Excel");
}

// Help modal
function showHelpModal() {
  Swal.fire({
    title: "Ayuda - Dashboard de Exámenes",
    html: `
            <div class="text-start">
                <h6>Funcionalidades Disponibles:</h6>
                <ul>
                    <li><strong>Generar Examen:</strong> Crea exámenes personalizados con IA</li>
                    <li><strong>Ver Historial:</strong> Consulta todos los exámenes generados</li>
                    <li><strong>Analytics:</strong> Visualiza métricas y reportes avanzados</li>
                </ul>
                
                <h6>Métricas del Dashboard:</h6>
                <ul>
                    <li><strong>Total Exámenes:</strong> Número total de exámenes generados</li>
                    <li><strong>Completados:</strong> Exámenes listos para descargar</li>
                    <li><strong>En Proceso:</strong> Exámenes generándose actualmente</li>
                    <li><strong>Tasa de Éxito:</strong> Porcentaje de generaciones exitosas</li>
                </ul>
                
                <h6>Atajos de Teclado:</h6>
                <ul>
                    <li><kbd>Ctrl + N</kbd> - Nuevo examen</li>
                    <li><kbd>Ctrl + H</kbd> - Ver historial</li>
                    <li><kbd>F1</kbd> - Mostrar esta ayuda</li>
                </ul>
            </div>
        `,
    icon: "info",
    confirmButtonColor: "#008FD0",
    confirmButtonText: "Entendido",
    width: "600px",
  });
}

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  // Ctrl + N - New exam
  if (e.ctrlKey && e.key === "n") {
    e.preventDefault();
    window.location.href = "exam-generator.html";
  }

  // Ctrl + H - History
  if (e.ctrlKey && e.key === "h") {
    e.preventDefault();
    window.location.href = "exam-history.html";
  }

  // F1 - Help
  if (e.key === "F1") {
    e.preventDefault();
    showHelpModal();
  }
});

// Auto-refresh dashboard every 2 minutes
setInterval(function () {
  const settings = getSettings();
  if (settings && settings.autoRefresh) {
    loadExamDashboardData();
    loadRecentExams();
  }
}, 120000); // 2 minutes

// Delete exam function for dashboard
async function deleteExamFromDashboard(examId, teacherId) {
  try {
    // Show confirmation dialog
    const result = await Swal.fire({
      title: "¿Eliminar examen?",
      html: `
        <p>¿Estás seguro de que deseas eliminar este examen?</p>
        <div class="alert alert-warning mt-3">
          <strong>ID del Examen:</strong> ${examId}<br>
          <strong>Profesor:</strong> ${teacherId}
        </div>
        <p class="text-muted small">Esta acción no se puede deshacer. Se eliminará el examen y todos los archivos asociados.</p>
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
    showLoading("Eliminando examen...");

    // Call delete API
    const response = await apiCall(`/exam/history/${examId}`, {
      method: "DELETE",
    });

    hideLoading();

    // Show success message
    let successMessage = "¡Examen eliminado correctamente!";
    if (response.partialFailure) {
      successMessage = "Examen eliminado con algunas advertencias en archivos.";
    }

    Swal.fire({
      icon: "success",
      title: "¡Eliminado!",
      text: successMessage,
      confirmButtonColor: "#008FD0",
      timer: 2000,
      showConfirmButton: false,
    });

    // Refresh the dashboard data
    loadExamDashboardData();
    loadRecentExams();
  } catch (error) {
    hideLoading();
    console.error("Error deleting exam:", error);

    Swal.fire({
      icon: "error",
      title: "Error al eliminar",
      text: "No se pudo eliminar el examen: " + error.message,
      confirmButtonColor: "#008FD0",
    });
  }
}

// Data validation utilities for cross-contamination prevention
function validateExamRecord(record) {
  // Check for exam-specific indicators
  const hasExamId = record.examId || record.analysisId?.startsWith("exam-");
  const hasExamConfig =
    record.examConfig || record.hasOwnProperty("examConfig");
  const hasQuestionCount = record.questionCount !== undefined;
  const hasSelectedTopics =
    record.selectedTopics && Array.isArray(record.selectedTopics);
  const hasGeneratedFiles =
    record.generatedFiles && Array.isArray(record.generatedFiles);

  // Check for AI detection fields (should not be present)
  const hasAIScore = record.hasOwnProperty("aiLikelihoodScore");
  const hasOriginalityScore = record.hasOwnProperty("originalityScore");
  const hasStudentName = record.studentName || record.metadata?.studentName;
  const hasAnalysisFields =
    record.summary || record.signals || record.recommendations;

  // Validation result
  const isValidExamRecord =
    (hasExamId ||
      hasExamConfig ||
      hasQuestionCount ||
      hasSelectedTopics ||
      hasGeneratedFiles) &&
    !(
      hasAIScore ||
      hasOriginalityScore ||
      (hasStudentName && hasAnalysisFields)
    );

  if (!isValidExamRecord) {
    console.warn(
      "❌ EXAM CROSS-CONTAMINATION DETECTED - Invalid exam record:",
      {
        recordId: record.examId || record.analysisId,
        hasExamIndicators: hasExamId || hasExamConfig || hasQuestionCount,
        hasAIFields: hasAIScore || hasOriginalityScore || hasStudentName,
      }
    );
  }

  return isValidExamRecord;
}

function monitorExamDataContamination(records) {
  const contaminationReport = {
    totalRecords: records.length,
    validRecords: 0,
    contaminatedRecords: 0,
    contaminationDetails: [],
  };

  records.forEach((record) => {
    if (validateExamRecord(record)) {
      contaminationReport.validRecords++;
    } else {
      contaminationReport.contaminatedRecords++;
      contaminationReport.contaminationDetails.push({
        recordId: record.examId || record.analysisId,
        reason: "Contains AI detection fields or missing exam identifiers",
      });
    }
  });

  if (contaminationReport.contaminatedRecords > 0) {
    console.error("🚨 EXAM DATA CONTAMINATION DETECTED:", contaminationReport);

    // Send contamination alert (in production, this could be sent to monitoring service)
    if (window.appSettings?.enableContaminationAlerts) {
      alert(
        `Advertencia: Se detectaron ${contaminationReport.contaminatedRecords} registros contaminados en el Dashboard de Exámenes.`
      );
    }
  }

  return contaminationReport;
}

// Export delete function for global access
window.deleteExamFromDashboard = deleteExamFromDashboard;
window.validateExamRecord = validateExamRecord;
window.monitorExamDataContamination = monitorExamDataContamination;
