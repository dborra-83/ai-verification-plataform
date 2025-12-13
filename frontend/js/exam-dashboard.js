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
      const response = await apiCall("/exam-history?pageSize=100");
      const exams = response.items || response.exams || []; // Support both formats

      // Calculate KPIs
      const totalExams = exams.length;
      const completedExams = exams.filter(
        (exam) => exam.status === "COMPLETED"
      ).length;
      const processingExams = exams.filter(
        (exam) => exam.status === "PROCESSING"
      ).length;
      const failedExams = exams.filter(
        (exam) => exam.status === "FAILED"
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
    }
  } catch (error) {
    console.error("Error loading exam dashboard data:", error);
  }
}

// Load recent exams
async function loadRecentExams() {
  const tableBody = document.getElementById("recentExamsTable");

  try {
    const response = await apiCall("/exam-history?pageSize=5");
    const exams = response.items || response.exams || []; // Support both formats

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
                    </div>
                </td>
            </tr>
        `
      )
      .join("");
  } catch (error) {
    console.error("Error loading recent exams:", error);
    // Show empty state instead of error for better UX
    tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    No hay exámenes recientes
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
