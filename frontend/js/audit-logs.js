/**
 * Audit Logs Module for Admin Panel
 * Handles audit log viewing, filtering, and export
 */

window.AuditLogsModule = (function () {
  const API_BASE_URL = window.CONFIG?.API_URL || "";

  // State
  let currentLogs = [];
  let currentFilters = {
    dateFrom: "",
    dateTo: "",
    actionType: "",
    userId: "",
  };
  let currentPaginationToken = null;

  /**
   * Get authorization headers
   */
  function getAuthHeaders() {
    const token = sessionStorage.getItem("idToken");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  }

  /**
   * Handle API errors
   */
  function handleApiError(response) {
    if (response.status === 401 || response.status === 403) {
      Swal.fire({
        title: "Sesión Expirada",
        text: "Por favor, inicie sesión nuevamente",
        icon: "warning",
        confirmButtonColor: "#008FD0",
      }).then(() => {
        window.location.href = "login.html";
      });
      throw new Error("Unauthorized");
    }
    return response;
  }

  /**
   * Format date to Spanish locale (DD/MM/YYYY)
   */
  function formatDate(dateString) {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch (e) {
      return dateString;
    }
  }

  /**
   * Format datetime to Spanish locale
   */
  function formatDateTime(dateString) {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  }

  /**
   * Load audit logs with filters
   */
  async function loadAuditLogs(paginationToken = null) {
    try {
      showLoading("auditTableBody");

      const params = new URLSearchParams();
      params.append("limit", "50");

      if (paginationToken) {
        params.append("paginationToken", paginationToken);
      }
      if (currentFilters.dateFrom) {
        params.append("startDate", currentFilters.dateFrom);
      }
      if (currentFilters.dateTo) {
        params.append("endDate", currentFilters.dateTo);
      }
      if (currentFilters.actionType) {
        params.append("actionType", currentFilters.actionType);
      }
      if (currentFilters.userId) {
        params.append("userId", currentFilters.userId);
      }

      const response = await fetch(`${API_BASE_URL}/admin/audit?${params}`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar registros de auditoría");
      }

      const data = await response.json();
      currentLogs = data.entries || [];
      currentPaginationToken = data.paginationToken;

      renderAuditTable(currentLogs);
      renderPagination(data.paginationToken);

      return data;
    } catch (error) {
      console.error("Error loading audit logs:", error);
      showError("auditTableBody", "Error al cargar registros de auditoría");
      throw error;
    }
  }

  /**
   * Filter by action type
   */
  async function filterByActionType(actionType) {
    currentFilters.actionType = actionType;
    return loadAuditLogs();
  }

  /**
   * Filter by user
   */
  async function filterByUser(userId) {
    currentFilters.userId = userId;
    return loadAuditLogs();
  }

  /**
   * Filter by date range
   */
  async function filterByDateRange(dateFrom, dateTo) {
    currentFilters.dateFrom = dateFrom;
    currentFilters.dateTo = dateTo;
    return loadAuditLogs();
  }

  /**
   * Apply all filters
   */
  async function applyFilters(filters) {
    currentFilters = { ...currentFilters, ...filters };
    return loadAuditLogs();
  }

  /**
   * Export audit logs to CSV
   */
  async function exportAuditLogs(format = "csv") {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/audit/export`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ format, filters: currentFilters }),
      });

      handleApiError(response);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Error al exportar");
      }

      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }

      return data;
    } catch (error) {
      console.error("Error exporting audit logs:", error);
      throw error;
    }
  }

  /**
   * Load login history
   */
  async function loadLoginHistory(userId = null, days = 30) {
    try {
      const params = new URLSearchParams();
      params.append("days", days);
      if (userId) {
        params.append("userId", userId);
      }

      const response = await fetch(
        `${API_BASE_URL}/admin/audit/login-history?${params}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        },
      );

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar historial de accesos");
      }

      return await response.json();
    } catch (error) {
      console.error("Error loading login history:", error);
      throw error;
    }
  }

  /**
   * Load failed login attempts
   */
  async function loadFailedLogins(userId = null, days = 7) {
    try {
      const params = new URLSearchParams();
      params.append("days", days);
      if (userId) {
        params.append("userId", userId);
      }

      const response = await fetch(
        `${API_BASE_URL}/admin/audit/failed-logins?${params}`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        },
      );

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar intentos fallidos");
      }

      return await response.json();
    } catch (error) {
      console.error("Error loading failed logins:", error);
      throw error;
    }
  }

  /**
   * Load security alerts
   */
  async function loadSecurityAlerts() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/audit/security-alerts`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        },
      );

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar alertas de seguridad");
      }

      const data = await response.json();
      renderSecurityAlerts(data.alerts || []);
      return data;
    } catch (error) {
      console.error("Error loading security alerts:", error);
      throw error;
    }
  }

  /**
   * Render audit table
   */
  function renderAuditTable(logs) {
    const tbody = document.getElementById("auditTableBody");
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="bi bi-journal-x me-2"></i>
                        No se encontraron registros de auditoría
                    </td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = logs
      .map((log) => {
        const actionBadgeClass = getActionBadgeClass(log.actionType);
        const resultBadgeClass =
          log.result === "SUCCESS" ? "bg-success" : "bg-danger";

        return `
                <tr>
                    <td>${formatDateTime(log.timestamp)}</td>
                    <td>${log.adminEmail || log.adminId || "-"}</td>
                    <td><span class="badge ${actionBadgeClass}">${translateActionType(log.actionType)}</span></td>
                    <td>${log.targetUserEmail || log.targetUserId || "-"}</td>
                    <td>${log.details?.description || "-"}</td>
                    <td>${log.ipAddress || "-"}</td>
                    <td><span class="badge ${resultBadgeClass}">${log.result === "SUCCESS" ? "Exitoso" : "Fallido"}</span></td>
                </tr>
            `;
      })
      .join("");
  }

  /**
   * Get badge class for action type
   */
  function getActionBadgeClass(actionType) {
    const classes = {
      USER_CREATE: "bg-success",
      USER_DELETE: "bg-danger",
      USER_ENABLE: "bg-info",
      USER_DISABLE: "bg-warning",
      USER_ROLE_CHANGE: "bg-primary",
      PASSWORD_RESET: "bg-secondary",
      CONFIG_UPDATE: "bg-dark",
      USER_EXPORT: "bg-info",
      AUDIT_EXPORT: "bg-info",
    };
    return classes[actionType] || "bg-secondary";
  }

  /**
   * Translate action type to Spanish
   */
  function translateActionType(actionType) {
    const translations = {
      USER_CREATE: "Creación de Usuario",
      USER_DELETE: "Eliminación de Usuario",
      USER_ENABLE: "Habilitación",
      USER_DISABLE: "Deshabilitación",
      USER_ROLE_CHANGE: "Cambio de Rol",
      PASSWORD_RESET: "Reset de Contraseña",
      VERIFICATION_RESEND: "Reenvío de Verificación",
      CONFIG_UPDATE: "Cambio de Configuración",
      TEMPLATE_UPDATE: "Actualización de Plantilla",
      USER_EXPORT: "Exportación de Usuarios",
      AUDIT_EXPORT: "Exportación de Auditoría",
      BULK_ENABLE: "Habilitación Masiva",
      BULK_DISABLE: "Deshabilitación Masiva",
      EXAM_GENERATION: "Generación de Examen",
      FILE_UPLOAD: "Subida de Archivo",
      USER_LOGIN: "Inicio de Sesión",
    };
    return translations[actionType] || actionType;
  }

  /**
   * Render pagination
   */
  function renderPagination(nextToken) {
    const container = document.getElementById("auditPagination");
    if (!container) return;

    let html =
      '<nav aria-label="Navegación de auditoría"><ul class="pagination justify-content-center">';

    if (nextToken) {
      html += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="AuditLogsModule.loadAuditLogs('${nextToken}'); return false;">
                        Cargar más <i class="bi bi-chevron-right"></i>
                    </a>
                </li>
            `;
    }

    html += "</ul></nav>";
    container.innerHTML = html;
  }

  /**
   * Render security alerts
   */
  function renderSecurityAlerts(alerts) {
    const card = document.getElementById("securityAlertsCard");
    const container = document.getElementById("securityAlerts");

    if (!card || !container) return;

    if (!alerts || alerts.length === 0) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";
    container.innerHTML = alerts
      .map(
        (alert) => `
            <div class="alert alert-warning mb-2">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        <strong>${alert.userEmail}</strong>
                    </div>
                    <span class="badge bg-danger">${alert.failedAttempts} intentos fallidos</span>
                </div>
                <small class="text-muted">Últimos 15 minutos - IP: ${alert.lastIpAddress || "Desconocida"}</small>
            </div>
        `,
      )
      .join("");
  }

  /**
   * Show loading state
   */
  function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <p class="mt-2 text-muted">Cargando registros...</p>
                    </td>
                </tr>
            `;
    }
  }

  /**
   * Show error state
   */
  function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger py-4">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        ${message}
                    </td>
                </tr>
            `;
    }
  }

  // Public API
  return {
    loadAuditLogs,
    filterByActionType,
    filterByUser,
    filterByDateRange,
    applyFilters,
    exportAuditLogs,
    loadLoginHistory,
    loadFailedLogins,
    loadSecurityAlerts,
    formatDate,
    formatDateTime,
  };
})();
