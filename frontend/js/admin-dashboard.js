// Admin Dashboard - JavaScript Module
// Handles administrative reporting, metrics, and system monitoring

// Global state
let dashboardState = {
  metrics: {},
  charts: {},
  refreshInterval: null,
  auditLog: [],
  systemAlerts: [],
};

// Authentication and initialization
function checkAuthentication() {
  const isAuthed = window.SessionManager
    ? window.SessionManager.isAuthenticated()
    : localStorage.getItem("isAuthed") === "true";

  if (!isAuthed) {
    window.location.href = "login.html";
    return false;
  }

  // Check if user is admin
  const user = window.SessionManager
    ? window.SessionManager.getCurrentUser()
    : { username: localStorage.getItem("username") || "admin" };

  if (user.username !== "admin") {
    Swal.fire({
      title: "Acceso Denegado",
      text: "Solo los administradores pueden acceder a este panel",
      icon: "error",
      confirmButtonColor: "#008FD0",
    }).then(() => {
      window.location.href = "index.html";
    });
    return false;
  }

  // Update user display
  const userAvatar = document.querySelector(".user-avatar");
  if (userAvatar) {
    userAvatar.textContent = user.username.charAt(0).toUpperCase();
    userAvatar.title = user.username;
  }

  return true;
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

// Dashboard initialization
document.addEventListener("DOMContentLoaded", function () {
  if (checkAuthentication()) {
    initializeDashboard();
  }
});

async function initializeDashboard() {
  try {
    showLoading("Cargando panel de administración...");

    // Load initial data
    await Promise.all([
      loadMetrics(),
      loadAuditTrail(),
      loadRecentActivity(),
      loadSystemAlerts(),
      initializeCharts(),
    ]);

    // Start auto-refresh
    startAutoRefresh();

    hideLoading();
  } catch (error) {
    hideLoading();
    showError("Error al cargar el panel de administración: " + error.message);
  }
}

// Metrics and Statistics
async function loadMetrics() {
  try {
    // Get exam statistics
    const examStats = await apiCall("/admin/metrics/exams");

    // Get user statistics
    const userStats = await apiCall("/admin/metrics/users");

    // Get system performance
    const systemStats = await apiCall("/admin/metrics/system");

    // Update metric cards
    updateMetricCards(examStats, userStats, systemStats);

    // Store in state
    dashboardState.metrics = {
      exams: examStats,
      users: userStats,
      system: systemStats,
    };
  } catch (error) {
    console.error("Error loading metrics:", error);
    // Use mock data for demonstration
    const mockData = generateMockMetrics();
    updateMetricCards(mockData.exams, mockData.users, mockData.system);
  }
}

function generateMockMetrics() {
  return {
    exams: {
      totalExams: 1247,
      successRate: 94.2,
      avgProcessingTime: "2.3 min",
      last30Days: 156,
      statusBreakdown: {
        completed: 1175,
        failed: 42,
        processing: 30,
      },
      dailyTrend: [
        { date: "2024-01-01", count: 12 },
        { date: "2024-01-02", count: 15 },
        { date: "2024-01-03", count: 8 },
        { date: "2024-01-04", count: 18 },
        { date: "2024-01-05", count: 22 },
        { date: "2024-01-06", count: 14 },
        { date: "2024-01-07", count: 19 },
      ],
    },
    users: {
      activeUsers: 23,
      totalUsers: 45,
      newUsersThisMonth: 5,
    },
    system: {
      cpuUsage: 45,
      memoryUsage: 62,
      apiResponseTime: "145ms",
      uptime: "99.8%",
      errorRate: "0.2%",
    },
  };
}

function updateMetricCards(examStats, userStats, systemStats) {
  // Update exam metrics
  document.getElementById("totalExams").textContent =
    examStats.last30Days || examStats.totalExams || "-";
  document.getElementById("successRate").textContent =
    (examStats.successRate || 0) + "%";
  document.getElementById("activeUsers").textContent =
    userStats.activeUsers || "-";
  document.getElementById("avgProcessingTime").textContent =
    examStats.avgProcessingTime || "-";

  // Update system performance
  if (systemStats) {
    updateSystemPerformance(systemStats);
  }
}

function updateSystemPerformance(systemStats) {
  // CPU Usage
  const cpuUsage = document.getElementById("cpuUsage");
  const cpuPercentage = document.getElementById("cpuPercentage");
  if (cpuUsage && cpuPercentage) {
    cpuUsage.style.width = systemStats.cpuUsage + "%";
    cpuPercentage.textContent = systemStats.cpuUsage + "%";

    // Update color based on usage
    cpuUsage.className = "progress-bar " + getUsageColor(systemStats.cpuUsage);
  }

  // Memory Usage
  const memoryUsage = document.getElementById("memoryUsage");
  const memoryPercentage = document.getElementById("memoryPercentage");
  if (memoryUsage && memoryPercentage) {
    memoryUsage.style.width = systemStats.memoryUsage + "%";
    memoryPercentage.textContent = systemStats.memoryUsage + "%";

    // Update color based on usage
    memoryUsage.className =
      "progress-bar " + getUsageColor(systemStats.memoryUsage);
  }

  // Other metrics
  if (document.getElementById("apiResponseTime")) {
    document.getElementById("apiResponseTime").textContent =
      systemStats.apiResponseTime || "-";
  }
  if (document.getElementById("uptime")) {
    document.getElementById("uptime").textContent = systemStats.uptime || "-";
  }
  if (document.getElementById("errorRate")) {
    document.getElementById("errorRate").textContent =
      systemStats.errorRate || "-";
  }
}

function getUsageColor(percentage) {
  if (percentage < 50) return "bg-success";
  if (percentage < 80) return "bg-warning";
  return "bg-danger";
}

// Charts
async function initializeCharts() {
  try {
    // Initialize exam trend chart
    initializeExamTrendChart();

    // Initialize exam status chart
    initializeExamStatusChart();
  } catch (error) {
    console.error("Error initializing charts:", error);
  }
}

function initializeExamTrendChart() {
  const ctx = document.getElementById("examTrendChart");
  if (!ctx) return;

  // Mock data for demonstration
  const mockData = generateMockMetrics();
  const trendData = mockData.exams.dailyTrend;

  dashboardState.charts.examTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels: trendData.map((d) => new Date(d.date).toLocaleDateString()),
      datasets: [
        {
          label: "Exámenes Generados",
          data: trendData.map((d) => d.count),
          borderColor: "#008FD0",
          backgroundColor: "rgba(0, 143, 208, 0.1)",
          tension: 0.4,
          fill: true,
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
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
          },
        },
      },
    },
  });
}

function initializeExamStatusChart() {
  const ctx = document.getElementById("examStatusChart");
  if (!ctx) return;

  // Mock data for demonstration
  const mockData = generateMockMetrics();
  const statusData = mockData.exams.statusBreakdown;

  dashboardState.charts.examStatus = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Completados", "Fallidos", "Procesando"],
      datasets: [
        {
          data: [
            statusData.completed,
            statusData.failed,
            statusData.processing,
          ],
          backgroundColor: ["#28a745", "#dc3545", "#ffc107"],
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

// Audit Trail
async function loadAuditTrail() {
  try {
    const auditData = await apiCall("/admin/audit-trail?limit=10");
    displayAuditTrail(auditData.entries || []);
    dashboardState.auditLog = auditData.entries || [];
  } catch (error) {
    console.error("Error loading audit trail:", error);
    // Use mock data
    const mockAuditData = generateMockAuditData();
    displayAuditTrail(mockAuditData);
    dashboardState.auditLog = mockAuditData;
  }
}

function generateMockAuditData() {
  return [
    {
      timestamp: new Date().toISOString(),
      userId: "teacher1",
      action: "EXAM_GENERATION",
      resource: "exam-12345",
      status: "SUCCESS",
      ipAddress: "192.168.1.100",
      details: "Generated exam with 10 questions",
    },
    {
      timestamp: new Date(Date.now() - 300000).toISOString(),
      userId: "admin",
      action: "USER_LOGIN",
      resource: "admin-panel",
      status: "SUCCESS",
      ipAddress: "192.168.1.1",
      details: "Admin login successful",
    },
    {
      timestamp: new Date(Date.now() - 600000).toISOString(),
      userId: "teacher2",
      action: "FILE_UPLOAD",
      resource: "document.pdf",
      status: "SUCCESS",
      ipAddress: "192.168.1.101",
      details: "Uploaded PDF document (2.3MB)",
    },
  ];
}

function displayAuditTrail(auditEntries) {
  const auditTrail = document.getElementById("auditTrail");
  if (!auditTrail) return;

  if (!auditEntries || auditEntries.length === 0) {
    auditTrail.innerHTML = `
      <div class="text-center text-muted">
        <i class="bi bi-journal-x me-2"></i>
        No hay entradas de auditoría disponibles
      </div>
    `;
    return;
  }

  auditTrail.innerHTML = auditEntries
    .map(
      (entry) => `
    <div class="d-flex justify-content-between align-items-start mb-2 p-2 border-bottom">
      <div class="flex-grow-1">
        <div class="fw-bold">${entry.action}</div>
        <small class="text-muted">
          ${entry.userId} - ${new Date(entry.timestamp).toLocaleString()}
        </small>
        <div class="small">${entry.details}</div>
      </div>
      <span class="badge ${
        entry.status === "SUCCESS" ? "bg-success" : "bg-danger"
      }">
        ${entry.status}
      </span>
    </div>
  `
    )
    .join("");
}

// Recent Activity
async function loadRecentActivity() {
  try {
    const activityData = await apiCall("/admin/recent-activity?limit=20");
    displayRecentActivity(activityData.activities || []);
  } catch (error) {
    console.error("Error loading recent activity:", error);
    // Use mock data
    const mockActivity = generateMockActivityData();
    displayRecentActivity(mockActivity);
  }
}

function generateMockActivityData() {
  return [
    {
      timestamp: new Date().toISOString(),
      userId: "teacher1",
      action: "Generación de Examen",
      status: "Completado",
      details: "Examen de Matemáticas - 15 preguntas",
    },
    {
      timestamp: new Date(Date.now() - 180000).toISOString(),
      userId: "teacher2",
      action: "Subida de Archivo",
      status: "Completado",
      details: "documento_fisica.pdf (3.2MB)",
    },
    {
      timestamp: new Date(Date.now() - 420000).toISOString(),
      userId: "teacher3",
      action: "Exportación de Datos",
      status: "Completado",
      details: "Historial de exámenes (CSV)",
    },
  ];
}

function displayRecentActivity(activities) {
  const activityTable = document.getElementById("recentActivityTable");
  if (!activityTable) return;

  if (!activities || activities.length === 0) {
    activityTable.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          <i class="bi bi-activity me-2"></i>
          No hay actividad reciente
        </td>
      </tr>
    `;
    return;
  }

  activityTable.innerHTML = activities
    .map(
      (activity) => `
    <tr>
      <td>${new Date(activity.timestamp).toLocaleTimeString()}</td>
      <td>${activity.userId}</td>
      <td>${activity.action}</td>
      <td>
        <span class="badge ${
          activity.status === "Completado" ? "bg-success" : "bg-warning"
        }">
          ${activity.status}
        </span>
      </td>
      <td>${activity.details}</td>
    </tr>
  `
    )
    .join("");
}

// System Alerts
async function loadSystemAlerts() {
  try {
    const alertsData = await apiCall("/admin/system-alerts");
    displaySystemAlerts(alertsData.alerts || []);
    dashboardState.systemAlerts = alertsData.alerts || [];
  } catch (error) {
    console.error("Error loading system alerts:", error);
    // Use mock data
    const mockAlerts = generateMockAlerts();
    displaySystemAlerts(mockAlerts);
    dashboardState.systemAlerts = mockAlerts;
  }
}

function generateMockAlerts() {
  return [
    // No alerts for demo - system is healthy
  ];
}

function displaySystemAlerts(alerts) {
  const alertsContainer = document.getElementById("systemAlerts");
  if (!alertsContainer) return;

  if (!alerts || alerts.length === 0) {
    alertsContainer.innerHTML = `
      <div class="text-center text-muted">
        <i class="bi bi-check-circle me-2"></i>
        No hay alertas activas
      </div>
    `;
    return;
  }

  alertsContainer.innerHTML = alerts
    .map(
      (alert) => `
    <div class="alert alert-${
      alert.severity
    } alert-dismissible fade show" role="alert">
      <i class="bi bi-${
        alert.severity === "danger" ? "exclamation-triangle" : "info-circle"
      } me-2"></i>
      <strong>${alert.title}</strong>
      <div class="small">${alert.message}</div>
      <div class="small text-muted">${new Date(
        alert.timestamp
      ).toLocaleString()}</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `
    )
    .join("");
}

// Auto-refresh functionality
function startAutoRefresh() {
  // Refresh every 30 seconds
  dashboardState.refreshInterval = setInterval(async () => {
    try {
      await Promise.all([
        loadMetrics(),
        loadAuditTrail(),
        loadRecentActivity(),
        loadSystemAlerts(),
      ]);
    } catch (error) {
      console.error("Error during auto-refresh:", error);
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (dashboardState.refreshInterval) {
    clearInterval(dashboardState.refreshInterval);
    dashboardState.refreshInterval = null;
  }
}

// Manual refresh
async function refreshDashboard() {
  try {
    showLoading("Actualizando panel...");

    await Promise.all([
      loadMetrics(),
      loadAuditTrail(),
      loadRecentActivity(),
      loadSystemAlerts(),
    ]);

    // Update charts
    if (dashboardState.charts.examTrend) {
      dashboardState.charts.examTrend.update();
    }
    if (dashboardState.charts.examStatus) {
      dashboardState.charts.examStatus.update();
    }

    hideLoading();
    showSuccess("Panel actualizado correctamente");
  } catch (error) {
    hideLoading();
    showError("Error al actualizar el panel: " + error.message);
  }
}

// Export functionality
async function exportReport() {
  try {
    const { value: format } = await Swal.fire({
      title: "Exportar Reporte Administrativo",
      input: "select",
      inputOptions: {
        pdf: "Reporte PDF Completo",
        excel: "Datos Excel (XLSX)",
        csv: "Datos CSV",
      },
      inputValue: "pdf",
      showCancelButton: true,
      confirmButtonText: "Exportar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
    });

    if (format) {
      showLoading("Generando reporte...");

      const exportRequest = {
        format: format,
        includeMetrics: true,
        includeAuditTrail: true,
        includeCharts: format === "pdf",
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        },
      };

      const response = await apiCall("/admin/export-report", {
        method: "POST",
        body: JSON.stringify(exportRequest),
      });

      // Download the report
      const link = document.createElement("a");
      link.href = response.downloadUrl;
      link.download = response.filename;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      hideLoading();
      showSuccess("Reporte exportado correctamente");
    }
  } catch (error) {
    hideLoading();
    showError("Error al exportar el reporte: " + error.message);
  }
}

// Audit Log Modal
function viewFullAuditLog() {
  const modal = new bootstrap.Modal(document.getElementById("auditLogModal"));
  modal.show();
  loadFullAuditLog();
}

async function loadFullAuditLog() {
  try {
    const auditData = await apiCall("/admin/audit-trail?limit=100");
    displayFullAuditLog(auditData.entries || dashboardState.auditLog);
  } catch (error) {
    console.error("Error loading full audit log:", error);
    displayFullAuditLog(dashboardState.auditLog);
  }
}

function displayFullAuditLog(auditEntries) {
  const auditTable = document.getElementById("fullAuditTable");
  if (!auditTable) return;

  if (!auditEntries || auditEntries.length === 0) {
    auditTable.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted">
          <i class="bi bi-journal-x me-2"></i>
          No hay entradas de auditoría disponibles
        </td>
      </tr>
    `;
    return;
  }

  auditTable.innerHTML = auditEntries
    .map(
      (entry) => `
    <tr>
      <td>${new Date(entry.timestamp).toLocaleString()}</td>
      <td>${entry.userId}</td>
      <td>${entry.action}</td>
      <td>${entry.resource}</td>
      <td>
        <span class="badge ${
          entry.status === "SUCCESS" ? "bg-success" : "bg-danger"
        }">
          ${entry.status}
        </span>
      </td>
      <td>${entry.ipAddress}</td>
      <td>${entry.details}</td>
    </tr>
  `
    )
    .join("");
}

async function exportAuditLog() {
  try {
    showLoading("Exportando registro de auditoría...");

    const dateFrom = document.getElementById("auditDateFrom").value;
    const dateTo = document.getElementById("auditDateTo").value;
    const action = document.getElementById("auditAction").value;

    const exportRequest = {
      format: "csv",
      filters: {
        dateFrom: dateFrom,
        dateTo: dateTo,
        action: action,
      },
    };

    const response = await apiCall("/admin/audit-trail/export", {
      method: "POST",
      body: JSON.stringify(exportRequest),
    });

    // Download the export
    const link = document.createElement("a");
    link.href = response.downloadUrl;
    link.download = response.filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    hideLoading();
    showSuccess("Registro de auditoría exportado correctamente");
  } catch (error) {
    hideLoading();
    showError("Error al exportar el registro: " + error.message);
  }
}

// Utility functions
async function apiCall(endpoint, options = {}) {
  const baseUrl = window.CONFIG?.API_BASE_URL || "";
  const url = baseUrl + endpoint;

  const defaultOptions = {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  };

  const response = await fetch(url, { ...defaultOptions, ...options });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

function showLoading(message = "Cargando...") {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

function hideLoading() {
  Swal.close();
}

function showSuccess(message) {
  Swal.fire({
    title: "Éxito",
    text: message,
    icon: "success",
    confirmButtonColor: "#008FD0",
  });
}

function showError(message) {
  Swal.fire({
    title: "Error",
    text: message,
    icon: "error",
    confirmButtonColor: "#008FD0",
  });
}

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  stopAutoRefresh();
});

// Export functions for global access
window.checkAuthentication = checkAuthentication;
window.logout = logout;
window.refreshDashboard = refreshDashboard;
window.exportReport = exportReport;
window.viewFullAuditLog = viewFullAuditLog;
window.exportAuditLog = exportAuditLog;
