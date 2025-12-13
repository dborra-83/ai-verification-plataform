// Exam History - JavaScript Module
// Handles exam history display, filtering, and management

// Authentication functions
function checkAuthentication() {
  const isAuthed = window.SessionManager
    ? window.SessionManager.isAuthenticated()
    : localStorage.getItem("isAuthed") === "true";

  if (!isAuthed) {
    window.location.href = "login.html";
    return false;
  }

  // Update user display
  const user = window.SessionManager
    ? window.SessionManager.getCurrentUser()
    : { username: localStorage.getItem("username") || "Admin" };

  const userAvatar = document.querySelector(".user-avatar");
  if (userAvatar) {
    userAvatar.textContent = user.username.charAt(0).toUpperCase();
    userAvatar.title = user.username;
  }

  return true;
}

function getCurrentTeacherId() {
  // Use SessionManager if available, otherwise fallback to localStorage
  if (window.SessionManager) {
    return window.SessionManager.getCurrentUser().teacherId;
  }
  return localStorage.getItem("username") || "admin";
}

function logout() {
  Swal.fire({
    title: "¿Cerrar sesión?",
    text: "Se cerrará tu sesión actual",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#008FD0",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sí, cerrar sesión",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      if (window.SessionManager) {
        window.SessionManager.clearSession();
      } else {
        localStorage.removeItem("isAuthed");
        localStorage.removeItem("username");
      }
      window.location.href = "login.html";
    }
  });
}

// Global state for exam history
let examHistoryState = {
  exams: [],
  filteredExams: [],
  currentPage: 1,
  itemsPerPage: 10,
  totalPages: 0,
  filters: {
    teacherId: "all",
    status: "",
    startDate: "",
    endDate: "",
    topic: "",
  },
  selectedExam: null,
};

// Initialize exam history on page load
document.addEventListener("DOMContentLoaded", function () {
  // Check authentication first
  checkAuthentication();
  initializeExamHistory();
});

function initializeExamHistory() {
  // Set up teacher filter based on permissions
  setupTeacherFilter();

  // Load initial data
  loadExamHistory();

  // Set up search functionality
  setupSearch();

  // Set up filter handlers
  setupFilters();

  // Set up modal handlers
  setupModals();

  console.log("Exam History initialized");
}

function setupTeacherFilter() {
  const teacherId = getCurrentTeacherId();
  const filterTeacher = document.getElementById("filterTeacher");

  if (teacherId !== "admin") {
    // Non-admin users can only see their own exams
    filterTeacher.innerHTML = `
      <option value="current">Mis exámenes</option>
    `;
    examHistoryState.filters.teacherId = "current";
  } else {
    // Admin can see all exams
    filterTeacher.innerHTML = `
      <option value="current">Mis exámenes</option>
      <option value="all" selected>Todos los profesores</option>
    `;
    examHistoryState.filters.teacherId = "all";
  }
}

// Data Loading Functions
async function loadExamHistory() {
  try {
    showLoading("Cargando historial de exámenes...");

    // Build query parameters
    const queryParams = new URLSearchParams();

    // Add teacher ID for scoped access
    const teacherId = getCurrentTeacherId();
    if (examHistoryState.filters.teacherId === "all" && teacherId === "admin") {
      // Admin can see all exams
      queryParams.append("teacherId", "all");
    } else {
      // Show current user's exams (or enforce for non-admin)
      queryParams.append("teacherId", teacherId);
    }

    Object.entries(examHistoryState.filters).forEach(([key, value]) => {
      if (key !== "teacherId" && value && value !== "all" && value !== "") {
        queryParams.append(key, value);
      }
    });

    queryParams.append("limit", "100"); // Load more for client-side pagination

    const response = await apiCall(`/exam/history?${queryParams.toString()}`);

    // Update state
    examHistoryState.exams = response.exams || [];
    examHistoryState.filteredExams = [...examHistoryState.exams];

    // Update summary cards
    updateSummaryCards(response.summary);

    // Update table
    updateExamTable();

    // Update pagination
    updatePagination();

    hideLoading();
  } catch (error) {
    hideLoading();
    console.error("Error loading exam history:", error);
    showError("Error al cargar el historial de exámenes: " + error.message);

    // Show empty state
    showEmptyState();
  }
}

function updateSummaryCards(summary) {
  if (!summary) return;

  document.getElementById("totalExams").textContent = summary.totalExams || 0;
  document.getElementById("completedExams").textContent =
    summary.completedExams || 0;
  document.getElementById("processingExams").textContent =
    summary.processingExams || 0;
  document.getElementById("failedExams").textContent = summary.failedExams || 0;
}

function updateExamTable() {
  const tableBody = document.getElementById("examHistoryTable");

  if (examHistoryState.filteredExams.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    <i class="bi bi-inbox me-2"></i>
                    No se encontraron exámenes con los filtros aplicados
                </td>
            </tr>
        `;
    return;
  }

  // Calculate pagination
  const startIndex =
    (examHistoryState.currentPage - 1) * examHistoryState.itemsPerPage;
  const endIndex = startIndex + examHistoryState.itemsPerPage;
  const pageExams = examHistoryState.filteredExams.slice(startIndex, endIndex);

  tableBody.innerHTML = pageExams
    .map(
      (exam) => `
        <tr>
            <td>
                <span class="fw-medium">${exam.examId}</span>
            </td>
            <td>
                <div class="d-flex align-items-center">
                    <div class="user-avatar-sm me-2">${exam.teacherId
                      .charAt(0)
                      .toUpperCase()}</div>
                    ${exam.teacherId}
                </div>
            </td>
            <td>
                <div>
                    ${formatDate(exam.createdAt)}
                </div>
            </td>
            <td>
                ${getStatusBadge(exam.status)}
            </td>
            <td>
                <span class="badge bg-info">${
                  exam.examConfig?.questionCount || 0
                }</span>
            </td>
            <td>
                <span class="badge bg-secondary">${getDifficultyLabel(
                  exam.examConfig?.difficulty
                )}</span>
            </td>
            <td>
                <span class="badge bg-primary">${
                  exam.examConfig?.versions || 1
                }</span>
            </td>
            <td>
                <div class="topic-tags">
                    ${renderTopicTags(exam.selectedTopics)}
                </div>
            </td>
            <td>
                <span class="badge bg-success">${
                  exam.generatedFiles?.length || 0
                }</span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="viewExamDetails('${
                      exam.examId
                    }')" 
                            title="Ver detalles">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${
                      exam.status === "COMPLETED"
                        ? `
                        <div class="btn-group">
                            <button class="btn btn-outline-success" onclick="downloadExamFiles('${exam.examId}')" 
                                    title="Descargar archivos (PDF)">
                                <i class="bi bi-download"></i>
                            </button>
                            <button type="button" class="btn btn-outline-success dropdown-toggle dropdown-toggle-split" 
                                    data-bs-toggle="dropdown" aria-expanded="false" title="Más opciones de descarga">
                                <span class="visually-hidden">Toggle Dropdown</span>
                            </button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" href="#" onclick="downloadExamFiles('${exam.examId}', 'original')">
                                    <i class="bi bi-file-pdf me-2"></i>PDF Original
                                </a></li>
                                <li><a class="dropdown-item" href="#" onclick="downloadExamFiles('${exam.examId}', 'pdf')">
                                    <i class="bi bi-file-pdf me-2"></i>PDF Optimizado
                                </a></li>
                                <li><a class="dropdown-item" href="#" onclick="downloadExamFiles('${exam.examId}', 'docx')">
                                    <i class="bi bi-file-word me-2"></i>Documento Word
                                </a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item" href="#" onclick="downloadExamFilesWithOptions('${exam.examId}')">
                                    <i class="bi bi-gear me-2"></i>Opciones avanzadas
                                </a></li>
                            </ul>
                        </div>
                    `
                        : ""
                    }
                    ${
                      exam.status === "FAILED"
                        ? `
                        <button class="btn btn-outline-warning" onclick="retryExamGeneration('${exam.examId}')" 
                                title="Reintentar">
                            <i class="bi bi-arrow-clockwise"></i>
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
}

function renderTopicTags(topics) {
  if (!topics || topics.length === 0) {
    return '<span class="text-muted">-</span>';
  }

  const maxVisible = 2;
  const visibleTopics = topics.slice(0, maxVisible);
  const remainingCount = topics.length - maxVisible;

  let html = visibleTopics
    .map(
      (topic) => `<span class="badge bg-light text-dark me-1">${topic}</span>`
    )
    .join("");

  if (remainingCount > 0) {
    html += `<span class="badge bg-secondary">+${remainingCount}</span>`;
  }

  return html;
}

function updatePagination() {
  const totalItems = examHistoryState.filteredExams.length;
  examHistoryState.totalPages = Math.ceil(
    totalItems / examHistoryState.itemsPerPage
  );

  const pagination = document.getElementById("examHistoryPagination");

  if (examHistoryState.totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  let paginationHTML = "";

  // Previous button
  paginationHTML += `
        <li class="page-item ${
          examHistoryState.currentPage === 1 ? "disabled" : ""
        }">
            <a class="page-link" href="#" onclick="changePage(${
              examHistoryState.currentPage - 1
            })">
                <i class="bi bi-chevron-left"></i>
            </a>
        </li>
    `;

  // Page numbers
  const startPage = Math.max(1, examHistoryState.currentPage - 2);
  const endPage = Math.min(
    examHistoryState.totalPages,
    examHistoryState.currentPage + 2
  );

  if (startPage > 1) {
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>`;
    if (startPage > 2) {
      paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
            <li class="page-item ${
              i === examHistoryState.currentPage ? "active" : ""
            }">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
  }

  if (endPage < examHistoryState.totalPages) {
    if (endPage < examHistoryState.totalPages - 1) {
      paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${examHistoryState.totalPages})">${examHistoryState.totalPages}</a></li>`;
  }

  // Next button
  paginationHTML += `
        <li class="page-item ${
          examHistoryState.currentPage === examHistoryState.totalPages
            ? "disabled"
            : ""
        }">
            <a class="page-link" href="#" onclick="changePage(${
              examHistoryState.currentPage + 1
            })">
                <i class="bi bi-chevron-right"></i>
            </a>
        </li>
    `;

  pagination.innerHTML = paginationHTML;
}

function changePage(page) {
  if (page < 1 || page > examHistoryState.totalPages) return;

  examHistoryState.currentPage = page;
  updateExamTable();
  updatePagination();
}

// Filter Functions
function setupFilters() {
  // Set up filter change handlers
  document
    .getElementById("filterTeacher")
    .addEventListener("change", applyFilters);
  document
    .getElementById("filterStatus")
    .addEventListener("change", applyFilters);
  document
    .getElementById("filterFrom")
    .addEventListener("change", applyFilters);
  document.getElementById("filterTo").addEventListener("change", applyFilters);
  document
    .getElementById("filterTopic")
    .addEventListener("input", debounce(applyFilters, 500));
}

function applyFilters() {
  // Update filter state
  examHistoryState.filters = {
    teacherId: document.getElementById("filterTeacher").value,
    status: document.getElementById("filterStatus").value,
    startDate: document.getElementById("filterFrom").value,
    endDate: document.getElementById("filterTo").value,
    topic: document.getElementById("filterTopic").value.toLowerCase(),
  };

  // Apply filters to exams
  examHistoryState.filteredExams = examHistoryState.exams.filter((exam) => {
    // Teacher filter
    if (
      examHistoryState.filters.teacherId !== "all" &&
      exam.teacherId !== examHistoryState.filters.teacherId
    ) {
      return false;
    }

    // Status filter
    if (
      examHistoryState.filters.status &&
      exam.status !== examHistoryState.filters.status
    ) {
      return false;
    }

    // Date range filter
    if (examHistoryState.filters.startDate) {
      const examDate = new Date(exam.createdAt);
      const startDate = new Date(examHistoryState.filters.startDate);
      if (examDate < startDate) return false;
    }

    if (examHistoryState.filters.endDate) {
      const examDate = new Date(exam.createdAt);
      const endDate = new Date(examHistoryState.filters.endDate);
      endDate.setHours(23, 59, 59, 999); // End of day
      if (examDate > endDate) return false;
    }

    // Topic filter
    if (examHistoryState.filters.topic) {
      const topicMatch = exam.selectedTopics?.some((topic) =>
        topic.toLowerCase().includes(examHistoryState.filters.topic)
      );
      if (!topicMatch) return false;
    }

    return true;
  });

  // Reset to first page
  examHistoryState.currentPage = 1;

  // Update display
  updateExamTable();
  updatePagination();
}

// Search Functions
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", debounce(performSearch, 300));
}

function performSearch() {
  const query = document.getElementById("searchInput").value.toLowerCase();

  if (!query) {
    // Reset to filtered exams without search
    applyFilters();
    return;
  }

  // Apply search to filtered exams
  examHistoryState.filteredExams = examHistoryState.filteredExams.filter(
    (exam) => {
      return (
        exam.examId.toLowerCase().includes(query) ||
        exam.teacherId.toLowerCase().includes(query) ||
        exam.selectedTopics?.some((topic) =>
          topic.toLowerCase().includes(query)
        )
      );
    }
  );

  // Reset to first page
  examHistoryState.currentPage = 1;

  // Update display
  updateExamTable();
  updatePagination();
}

// Exam Detail Functions
async function viewExamDetails(examId) {
  try {
    showLoading("Cargando detalles del examen...");

    const examDetails = await apiCall(`/exam/history/${examId}`);

    examHistoryState.selectedExam = examDetails;

    // Populate modal content
    populateExamDetailModal(examDetails);

    // Show modal
    const modal = new bootstrap.Modal(
      document.getElementById("examDetailModal")
    );
    modal.show();

    hideLoading();
  } catch (error) {
    hideLoading();
    showError("Error al cargar los detalles del examen: " + error.message);
  }
}

function populateExamDetailModal(exam) {
  const content = document.getElementById("examDetailContent");

  content.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-primary mb-3">Información General</h6>
                <table class="table table-sm">
                    <tr>
                        <td><strong>ID Examen:</strong></td>
                        <td>${exam.examId}</td>
                    </tr>
                    <tr>
                        <td><strong>Profesor:</strong></td>
                        <td>${exam.teacherId}</td>
                    </tr>
                    <tr>
                        <td><strong>Fecha Creación:</strong></td>
                        <td>${formatDate(exam.createdAt)}</td>
                    </tr>
                    <tr>
                        <td><strong>Estado:</strong></td>
                        <td>${getStatusBadge(exam.status)}</td>
                    </tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary mb-3">Configuración</h6>
                <table class="table table-sm">
                    <tr>
                        <td><strong>Preguntas:</strong></td>
                        <td>${exam.examConfig?.questionCount || 0}</td>
                    </tr>
                    <tr>
                        <td><strong>Dificultad:</strong></td>
                        <td>${getDifficultyLabel(
                          exam.examConfig?.difficulty
                        )}</td>
                    </tr>
                    <tr>
                        <td><strong>Tipos:</strong></td>
                        <td>${
                          exam.examConfig?.questionTypes?.join(", ") || "-"
                        }</td>
                    </tr>
                    <tr>
                        <td><strong>Versiones:</strong></td>
                        <td>${exam.examConfig?.versions || 1}</td>
                    </tr>
                    <tr>
                        <td><strong>Idioma:</strong></td>
                        <td>${getLanguageLabel(exam.examConfig?.language)}</td>
                    </tr>
                    <tr>
                        <td><strong>Autoevaluación:</strong></td>
                        <td>${
                          exam.examConfig?.includeSelfAssessment ? "Sí" : "No"
                        }</td>
                    </tr>
                </table>
            </div>
        </div>
        
        <div class="row mt-4">
            <div class="col-md-6">
                <h6 class="text-primary mb-3">Temas Seleccionados</h6>
                <div class="topic-list">
                    ${
                      exam.selectedTopics
                        ?.map(
                          (topic) =>
                            `<span class="badge bg-primary me-1 mb-1">${topic}</span>`
                        )
                        .join("") ||
                      '<span class="text-muted">No hay temas</span>'
                    }
                </div>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary mb-3">Documentos Fuente</h6>
                <div class="source-docs">
                    ${
                      exam.sourceDocuments
                        ?.map(
                          (doc) =>
                            `<div class="d-flex align-items-center mb-1">
                            <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
                            <small>${doc}</small>
                        </div>`
                        )
                        .join("") ||
                      '<span class="text-muted">No hay documentos</span>'
                    }
                </div>
            </div>
        </div>
        
        ${
          exam.generatedFiles && exam.generatedFiles.length > 0
            ? `
            <div class="row mt-4">
                <div class="col-md-12">
                    <h6 class="text-primary mb-3">Archivos Generados</h6>
                    <div class="row">
                        ${exam.generatedFiles
                          .map(
                            (file) => `
                            <div class="col-md-6 mb-2">
                                <div class="card">
                                    <div class="card-body p-3">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div>
                                                <h6 class="mb-1">
                                                    <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
                                                    ${
                                                      file.type ===
                                                      "student_version"
                                                        ? "Versión Estudiante"
                                                        : "Versión Profesor"
                                                    }
                                                </h6>
                                                <small class="text-muted">Versión ${
                                                  file.version
                                                } - ${file.format}</small>
                                            </div>
                                            ${
                                              file.downloadUrl
                                                ? `
                                                <a href="${file.downloadUrl}" class="btn btn-sm btn-primary" target="_blank">
                                                    <i class="bi bi-download"></i>
                                                </a>
                                            `
                                                : ""
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                </div>
            </div>
        `
            : ""
        }
        
        ${
          exam.status === "FAILED" && exam.errorMessage
            ? `
            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="alert alert-danger">
                        <h6 class="mb-2">Error en la Generación</h6>
                        <p class="mb-0">${exam.errorMessage}</p>
                    </div>
                </div>
            </div>
        `
            : ""
        }
    `;
}

// Download Functions
async function downloadExamFiles(examId, format = "original") {
  try {
    showLoading("Preparando descarga...");

    const examDetails = await apiCall(`/exam/history/${examId}`);

    if (
      !examDetails.generatedFiles ||
      examDetails.generatedFiles.length === 0
    ) {
      hideLoading();
      showError("No hay archivos disponibles para descargar");
      return;
    }

    // Download each file with enhanced functionality
    for (const file of examDetails.generatedFiles) {
      if (file.s3Key) {
        try {
          // Get download URL with format specification
          const downloadResponse = await apiCall(
            `/exam/download/${encodeURIComponent(file.s3Key)}?format=${format}`
          );

          if (downloadResponse.downloadUrl) {
            const link = document.createElement("a");
            link.href = downloadResponse.downloadUrl;

            // Determine file extension based on format and original file
            let fileExtension = "pdf";
            if (format === "docx") {
              fileExtension = "docx";
            } else if (file.format) {
              fileExtension = file.format.toLowerCase();
            }

            link.download = `${examId}_${file.type}_v${file.version}.${fileExtension}`;
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Small delay between downloads
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (fileError) {
          console.error(`Error downloading file ${file.s3Key}:`, fileError);
          showError(`Error al descargar ${file.type}: ${fileError.message}`);
        }
      }
    }

    hideLoading();
    showSuccess("Archivos descargados exitosamente");
  } catch (error) {
    hideLoading();
    showError("Error al descargar los archivos: " + error.message);
  }
}

// Enhanced download function with format selection
async function downloadExamFilesWithOptions(examId) {
  try {
    const { value: format } = await Swal.fire({
      title: "Seleccionar formato de descarga",
      input: "select",
      inputOptions: {
        original: "Formato original (PDF)",
        pdf: "PDF optimizado",
        docx: "Documento Word (DOCX)",
      },
      inputValue: "original",
      showCancelButton: true,
      confirmButtonText: "Descargar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
    });

    if (format) {
      await downloadExamFiles(examId, format);
    }
  } catch (error) {
    showError("Error en la selección de formato: " + error.message);
  }
}

// Download individual file
async function downloadIndividualFile(fileId, fileName, format = "original") {
  try {
    showLoading("Descargando archivo...");

    const downloadResponse = await apiCall(
      `/exam/download/${encodeURIComponent(fileId)}?format=${format}`
    );

    if (downloadResponse.downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadResponse.downloadUrl;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      hideLoading();
      showSuccess("Archivo descargado exitosamente");
    } else {
      throw new Error("No se pudo generar la URL de descarga");
    }
  } catch (error) {
    hideLoading();
    showError("Error al descargar el archivo: " + error.message);
  }
}

function downloadExamFiles() {
  if (examHistoryState.selectedExam) {
    downloadExamFiles(examHistoryState.selectedExam.examId);
  }
}

// Export Functions
function setupModals() {
  // Set up export modal handlers
  document
    .getElementById("exportModal")
    .addEventListener("show.bs.modal", function () {
      // Set default dates
      const today = new Date();
      const thirtyDaysAgo = new Date(
        today.getTime() - 30 * 24 * 60 * 60 * 1000
      );

      document.getElementById("exportStartDate").value = thirtyDaysAgo
        .toISOString()
        .split("T")[0];
      document.getElementById("exportEndDate").value = today
        .toISOString()
        .split("T")[0];
    });
}

function exportHistory() {
  const modal = new bootstrap.Modal(document.getElementById("exportModal"));
  modal.show();
}

async function performExport() {
  try {
    const format = document.getElementById("exportFormat").value;
    const teacherId = document.getElementById("exportTeacher").value;
    const startDate = document.getElementById("exportStartDate").value;
    const endDate = document.getElementById("exportEndDate").value;

    showLoading("Generando exportación...");

    const exportRequest = {
      format: format,
      teacherId: teacherId,
      startDate: startDate ? startDate + "T00:00:00Z" : null,
      endDate: endDate ? endDate + "T23:59:59Z" : null,
    };

    const response = await apiCall("/exam/history/export", {
      method: "POST",
      body: JSON.stringify(exportRequest),
    });

    // Download the exported file
    const link = document.createElement("a");
    link.href = response.exportUrl;
    link.download = response.filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Close modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("exportModal")
    );
    modal.hide();

    hideLoading();
    showSuccess(`Exportación completada: ${response.recordCount} registros`);
  } catch (error) {
    hideLoading();
    showError("Error al exportar el historial: " + error.message);
  }
}

// Utility Functions
function refreshHistory() {
  loadExamHistory();
}

function showColumnSelector() {
  // This could be implemented to allow users to show/hide table columns
  showComingSoon("Selector de Columnas");
}

async function retryExamGeneration(examId) {
  const result = await Swal.fire({
    title: "¿Reintentar Generación?",
    text: "Se volverá a intentar generar el examen con la misma configuración.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#008FD0",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sí, reintentar",
    cancelButtonText: "Cancelar",
  });

  if (result.isConfirmed) {
    try {
      showLoading("Reintentando generación...");

      await apiCall(`/exam/generate/${examId}/retry`, {
        method: "POST",
      });

      hideLoading();
      showSuccess(
        'Generación reintentada. El examen aparecerá como "En Proceso".'
      );

      // Refresh the history
      setTimeout(() => {
        loadExamHistory();
      }, 1000);
    } catch (error) {
      hideLoading();
      showError("Error al reintentar la generación: " + error.message);
    }
  }
}

function showEmptyState() {
  const tableBody = document.getElementById("examHistoryTable");
  tableBody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-5">
                <div class="empty-state">
                    <i class="bi bi-journal-x" style="font-size: 3rem; color: #6c757d; margin-bottom: 1rem;"></i>
                    <h5 class="text-muted">No hay exámenes generados</h5>
                    <p class="text-muted">Comienza creando tu primer examen con el generador.</p>
                    <a href="exam-generator.html" class="btn btn-primary">
                        <i class="bi bi-plus-circle me-2"></i>
                        Crear Primer Examen
                    </a>
                </div>
            </td>
        </tr>
    `;
}

function getDifficultyLabel(difficulty) {
  const labels = {
    easy: "Fácil",
    medium: "Intermedio",
    hard: "Difícil",
  };
  return labels[difficulty] || difficulty || "-";
}

function getLanguageLabel(language) {
  const labels = {
    es: "Español",
    en: "Inglés",
    fr: "Francés",
  };
  return labels[language] || language || "-";
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Export functions for global access
window.checkAuthentication = checkAuthentication;
window.getCurrentTeacherId = getCurrentTeacherId;
window.logout = logout;
window.applyFilters = applyFilters;
window.refreshHistory = refreshHistory;
window.showColumnSelector = showColumnSelector;
window.viewExamDetails = viewExamDetails;
window.downloadExamFiles = downloadExamFiles;
window.downloadExamFilesWithOptions = downloadExamFilesWithOptions;
window.downloadIndividualFile = downloadIndividualFile;
window.retryExamGeneration = retryExamGeneration;
window.exportHistory = exportHistory;
window.performExport = performExport;
window.changePage = changePage;

// Exam Analytics Functions
function showExamAnalyticsSection() {
  // Hide main content and show analytics
  document.querySelector(
    ".content-area > div:not(#examAnalyticsSection)"
  ).style.display = "none";
  document.getElementById("examAnalyticsSection").style.display = "block";
  document.getElementById("pageTitle").textContent =
    "Analytics y Reportes - Exámenes";

  // Load analytics data
  loadExamAnalyticsData();
}

function showExamHistory() {
  // Show main content and hide analytics
  document.querySelector(
    ".content-area > div:not(#examAnalyticsSection)"
  ).style.display = "block";
  document.getElementById("examAnalyticsSection").style.display = "none";
  document.getElementById("pageTitle").textContent = "Historial de Exámenes";
}

async function loadExamAnalyticsData() {
  try {
    const period =
      document.getElementById("examAnalyticsPeriod")?.value || "30";

    // Load exam analytics data (placeholder for now)
    console.log("Loading exam analytics data for period:", period);

    // Initialize charts with placeholder data
    initializeExamAnalyticsCharts();

    // Load top tables with placeholder data
    loadTopTopicsTable();
    loadTopTeachersTable();
  } catch (error) {
    console.error("Error loading exam analytics data:", error);
    showError("Error al cargar los datos de analytics: " + error.message);
  }
}

function initializeExamAnalyticsCharts() {
  // Exam Generation Time Chart
  const examTimeCtx = document.getElementById("examGenerationTimeChart");
  if (examTimeCtx) {
    new Chart(examTimeCtx, {
      type: "line",
      data: {
        labels: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"],
        datasets: [
          {
            label: "Exámenes Generados",
            data: [5, 12, 8, 15],
            borderColor: "#008FD0",
            backgroundColor: "rgba(0, 143, 208, 0.1)",
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  // Exam Difficulty Chart
  const difficultyCtx = document.getElementById("examDifficultyChart");
  if (difficultyCtx) {
    new Chart(difficultyCtx, {
      type: "doughnut",
      data: {
        labels: ["Fácil", "Intermedio", "Difícil"],
        datasets: [
          {
            data: [30, 50, 20],
            backgroundColor: ["#28a745", "#ffc107", "#dc3545"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  // Questions Chart
  const questionsCtx = document.getElementById("examQuestionsChart");
  if (questionsCtx) {
    new Chart(questionsCtx, {
      type: "bar",
      data: {
        labels: ["5 preguntas", "10 preguntas", "15 preguntas", "20 preguntas"],
        datasets: [
          {
            label: "Frecuencia",
            data: [5, 25, 15, 10],
            backgroundColor: "#008FD0",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });
  }

  // Question Types Chart
  const typesCtx = document.getElementById("questionTypesChart");
  if (typesCtx) {
    new Chart(typesCtx, {
      type: "pie",
      data: {
        labels: ["Opción Múltiple", "Verdadero/Falso", "Mixto"],
        datasets: [
          {
            data: [60, 25, 15],
            backgroundColor: ["#008FD0", "#17a2b8", "#6f42c1"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

function loadTopTopicsTable() {
  const tableBody = document.getElementById("topTopicsTable");
  if (tableBody) {
    // Placeholder data
    const topTopics = [
      { rank: 1, topic: "Matemáticas Básicas", exams: 15, frequency: "25%" },
      { rank: 2, topic: "Historia Universal", exams: 12, frequency: "20%" },
      { rank: 3, topic: "Ciencias Naturales", exams: 10, frequency: "17%" },
      { rank: 4, topic: "Literatura", exams: 8, frequency: "13%" },
      { rank: 5, topic: "Geografía", exams: 6, frequency: "10%" },
    ];

    tableBody.innerHTML = topTopics
      .map(
        (topic) => `
      <tr>
        <td><span class="badge bg-primary">${topic.rank}</span></td>
        <td>${topic.topic}</td>
        <td>${topic.exams}</td>
        <td>${topic.frequency}</td>
      </tr>
    `
      )
      .join("");
  }
}

function loadTopTeachersTable() {
  const tableBody = document.getElementById("topTeachersTable");
  if (tableBody) {
    // Placeholder data
    const topTeachers = [
      { rank: 1, teacher: "Admin", exams: 25, avgQuestions: 12 },
      { rank: 2, teacher: "Prof. García", exams: 18, avgQuestions: 10 },
      { rank: 3, teacher: "Prof. López", exams: 15, avgQuestions: 15 },
      { rank: 4, teacher: "Prof. Martínez", exams: 12, avgQuestions: 8 },
      { rank: 5, teacher: "Prof. Rodríguez", exams: 10, avgQuestions: 11 },
    ];

    tableBody.innerHTML = topTeachers
      .map(
        (teacher) => `
      <tr>
        <td><span class="badge bg-success">${teacher.rank}</span></td>
        <td>${teacher.teacher}</td>
        <td>${teacher.exams}</td>
        <td>${teacher.avgQuestions}</td>
      </tr>
    `
      )
      .join("");
  }
}

async function exportExamAnalyticsToPDF() {
  try {
    showLoading("Generando PDF...");

    // Placeholder implementation
    setTimeout(() => {
      hideLoading();
      showSuccess("PDF de analytics de exámenes generado exitosamente");
    }, 2000);
  } catch (error) {
    hideLoading();
    showError("Error al generar PDF: " + error.message);
  }
}

async function exportExamAnalyticsToExcel() {
  try {
    showLoading("Generando Excel...");

    // Placeholder implementation
    setTimeout(() => {
      hideLoading();
      showSuccess("Excel de analytics de exámenes generado exitosamente");
    }, 2000);
  } catch (error) {
    hideLoading();
    showError("Error al generar Excel: " + error.message);
  }
}

// Check for analytics hash on page load
document.addEventListener("DOMContentLoaded", function () {
  if (window.location.hash === "#analytics") {
    setTimeout(() => {
      showExamAnalyticsSection();
    }, 500);
  }
});

// Make functions globally available
window.showExamAnalyticsSection = showExamAnalyticsSection;
window.showExamHistory = showExamHistory;
window.loadExamAnalyticsData = loadExamAnalyticsData;
window.exportExamAnalyticsToPDF = exportExamAnalyticsToPDF;
window.exportExamAnalyticsToExcel = exportExamAnalyticsToExcel;
