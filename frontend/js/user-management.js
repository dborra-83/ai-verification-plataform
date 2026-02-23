/**
 * User Management Module for Admin Panel
 * Handles Cognito user management operations
 */

window.UserManagementModule = (function () {
  // State
  let currentUsers = [];
  let selectedUsers = new Set();
  let currentPaginationToken = null;
  let currentFilters = {
    email: "",
    status: "",
    role: "",
  };

  /**
   * Get API URL from config
   */
  function getApiBaseUrl() {
    const url =
      window.CONFIG?.API_URL ||
      window.CONFIG?.API_BASE_URL ||
      "https://9o3urlbyuc.execute-api.us-east-1.amazonaws.com/prod";
    return url;
  }

  /**
   * Get authorization headers
   */
  async function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };

    try {
      const authData = localStorage.getItem("ai_verification_auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        const token = parsed.accessToken;
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          return headers;
        }
      }
    } catch (e) {
      console.warn("[UserMgmt] Error reading localStorage:", e);
    }

    if (
      window.authModule &&
      typeof window.authModule.getAuthHeader === "function"
    ) {
      try {
        const authHeader = await window.authModule.getAuthHeader();
        if (authHeader) {
          return { ...headers, ...authHeader };
        }
      } catch (e) {
        console.warn("[UserMgmt] Error from authModule:", e);
      }
    }

    return headers;
  }

  /**
   * Format date to Spanish locale (DD/MM/YYYY)
   */
  function formatDate(dateString) {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("es-ES", {
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
      return new Date(dateString).toLocaleDateString("es-ES", {
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
   * Show loading state in table
   */
  function showLoading() {
    const tbody = document.getElementById("userTableBody");
    if (tbody) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <p class="mt-2 text-muted mb-0">Cargando usuarios...</p>
                    </td>
                </tr>
            `;
    }
  }

  /**
   * Show error state in table
   */
  function showError(message) {
    const tbody = document.getElementById("userTableBody");
    if (tbody) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-danger py-4">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        ${message}
                    </td>
                </tr>
            `;
    }
  }

  /**
   * API call helper
   */
  async function apiCall(endpoint, method = "GET", body = null) {
    const url = `${getApiBaseUrl()}${endpoint}`;
    const headers = await getAuthHeaders();
    const options = { method, headers };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
      Swal.fire({
        title: "Sesión Expirada",
        text: "Por favor, inicie sesión nuevamente",
        icon: "warning",
        confirmButtonColor: "#008FD0",
      }).then(() => (window.location.href = "login.html"));
      throw new Error("No autorizado");
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("[UserMgmt] Non-JSON response:", text.substring(0, 200));
      throw new Error("Respuesta no válida del servidor");
    }
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `Error ${response.status}`);
    }

    return data;
  }

  /**
   * Load users with pagination and filters
   */
  async function loadUsers(paginationToken = null) {
    try {
      showLoading();

      const params = new URLSearchParams();
      params.append("limit", "20");

      if (paginationToken) params.append("paginationToken", paginationToken);
      if (currentFilters.email) params.append("filter", currentFilters.email);
      if (currentFilters.status) params.append("status", currentFilters.status);
      if (currentFilters.role) params.append("role", currentFilters.role);

      const data = await apiCall(`/admin/users?${params}`);

      currentUsers = data.users || [];
      currentPaginationToken = data.paginationToken;

      renderUserTable(currentUsers);
      renderPagination(data.paginationToken);
      updateBulkActionsVisibility();

      return data;
    } catch (error) {
      console.error("[UserMgmt] Error loading users:", error);
      showError("Error al cargar usuarios: " + error.message);
      throw error;
    }
  }

  /**
   * Search users by email
   */
  async function searchUsers(query) {
    currentFilters.email = query;
    selectedUsers.clear();
    return loadUsers();
  }

  /**
   * Apply filters
   */
  async function applyFilters(filters) {
    currentFilters = { ...currentFilters, ...filters };
    selectedUsers.clear();
    return loadUsers();
  }

  /**
   * Render user table
   */
  function renderUserTable(users) {
    const tbody = document.getElementById("userTableBody");
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="bi bi-people me-2"></i>
                        No se encontraron usuarios
                    </td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = users
      .map((user) => {
        const isSelected = selectedUsers.has(user.username);
        const statusBadge = user.enabled
          ? '<span class="badge bg-success">Habilitado</span>'
          : '<span class="badge bg-danger">Deshabilitado</span>';
        const roleBadge =
          user.role === "admin"
            ? '<span class="badge bg-primary">Administrador</span>'
            : '<span class="badge bg-info">Profesor</span>';

        return `
                <tr>
                    <td>
                        <input type="checkbox" class="form-check-input user-checkbox" 
                               data-user-id="${user.username}" 
                               ${isSelected ? "checked" : ""}
                               onchange="UserManagementModule.toggleUserSelection('${user.username}')">
                    </td>
                    <td>${user.email || "-"}</td>
                    <td>${statusBadge}</td>
                    <td>${roleBadge}</td>
                    <td>${formatDate(user.userCreateDate)}</td>
                    <td>${formatDateTime(user.lastLogin) || "-"}</td>
                    <td>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary" onclick="UserManagementModule.showUserDetails('${user.username}')" title="Ver detalles">
                                <i class="bi bi-eye"></i>
                            </button>
                            ${
                              user.enabled
                                ? `<button class="btn btn-outline-warning" onclick="UserManagementModule.confirmDisableUser('${user.username}')" title="Deshabilitar">
                                    <i class="bi bi-person-slash"></i>
                                   </button>`
                                : `<button class="btn btn-outline-success" onclick="UserManagementModule.confirmEnableUser('${user.username}')" title="Habilitar">
                                    <i class="bi bi-person-check"></i>
                                   </button>`
                            }
                            <button class="btn btn-outline-info" onclick="UserManagementModule.showRoleModal('${user.username}', '${user.role}')" title="Cambiar rol">
                                <i class="bi bi-person-gear"></i>
                            </button>
                            <button class="btn btn-outline-secondary" onclick="UserManagementModule.confirmResetPassword('${user.username}')" title="Restablecer contraseña">
                                <i class="bi bi-key"></i>
                            </button>
                            <button class="btn btn-outline-danger" onclick="UserManagementModule.confirmDeleteUser('${user.username}')" title="Eliminar">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
      })
      .join("");
  }

  /**
   * Render pagination controls
   */
  function renderPagination(nextToken) {
    const container = document.getElementById("userPagination");
    if (!container) return;

    let html = '<nav><ul class="pagination justify-content-center mb-0">';

    if (nextToken) {
      html += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="UserManagementModule.loadUsers('${nextToken}'); return false;">
                        Siguiente <i class="bi bi-chevron-right"></i>
                    </a>
                </li>
            `;
    }

    html += "</ul></nav>";
    container.innerHTML = html;
  }

  /**
   * Toggle user selection
   */
  function toggleUserSelection(userId) {
    if (selectedUsers.has(userId)) {
      selectedUsers.delete(userId);
    } else {
      selectedUsers.add(userId);
    }
    updateBulkActionsVisibility();
  }

  /**
   * Select/deselect all users
   */
  function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById("selectAll");
    const checkboxes = document.querySelectorAll(".user-checkbox");

    if (selectAllCheckbox && selectAllCheckbox.checked) {
      currentUsers.forEach((user) => selectedUsers.add(user.username));
      checkboxes.forEach((cb) => (cb.checked = true));
    } else {
      selectedUsers.clear();
      checkboxes.forEach((cb) => (cb.checked = false));
    }
    updateBulkActionsVisibility();
  }

  /**
   * Get selected users
   */
  function getSelectedUsers() {
    return selectedUsers;
  }

  /**
   * Update bulk actions visibility
   */
  function updateBulkActionsVisibility() {
    const bulkActions = document.getElementById("bulkActions");
    const selectedCount = document.getElementById("selectedCount");

    if (bulkActions) {
      bulkActions.style.display = selectedUsers.size > 0 ? "block" : "none";
    }
    if (selectedCount) {
      selectedCount.textContent = `${selectedUsers.size} usuario(s) seleccionado(s)`;
    }
  }

  /**
   * Show create user modal
   */
  function showCreateUserModal() {
    Swal.fire({
      title: "Crear Nuevo Usuario",
      html: `
                <div class="text-start">
                    <div class="mb-3">
                        <label class="form-label">Correo Electrónico *</label>
                        <input type="email" id="swalNewUserEmail" class="form-control" placeholder="usuario@ejemplo.com" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Rol *</label>
                        <select id="swalNewUserRole" class="form-select">
                            <option value="teacher">Profesor</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="swalSendWelcomeEmail" checked>
                        <label class="form-check-label" for="swalSendWelcomeEmail">
                            Enviar correo de bienvenida con contraseña temporal
                        </label>
                    </div>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "Crear Usuario",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
      preConfirm: () => {
        const email = document.getElementById("swalNewUserEmail").value.trim();
        const role = document.getElementById("swalNewUserRole").value;
        const sendWelcomeEmail = document.getElementById(
          "swalSendWelcomeEmail",
        ).checked;

        if (!email || !email.includes("@")) {
          Swal.showValidationMessage(
            "Por favor ingrese un correo electrónico válido",
          );
          return false;
        }

        return { email, role, sendWelcomeEmail };
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Creando usuario...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });

          const data = await apiCall("/admin/users", "POST", result.value);

          let message = "Usuario creado exitosamente.";
          if (data.temporaryPassword) {
            message += `\n\nContraseña temporal: ${data.temporaryPassword}`;
          } else {
            message +=
              "\n\nSe ha enviado un correo con la contraseña temporal.";
          }

          Swal.fire({
            title: "¡Usuario Creado!",
            text: message,
            icon: "success",
            confirmButtonColor: "#008FD0",
          });

          loadUsers();
        } catch (error) {
          Swal.fire({
            title: "Error",
            text: error.message,
            icon: "error",
            confirmButtonColor: "#008FD0",
          });
        }
      }
    });
  }

  /**
   * Show user details
   */
  async function showUserDetails(userId) {
    try {
      Swal.fire({
        title: "Cargando...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const data = await apiCall(`/admin/users/${encodeURIComponent(userId)}`);
      const user = data.user;

      Swal.fire({
        title: "Detalles del Usuario",
        html: `
                    <div class="text-start">
                        <table class="table table-sm">
                            <tr><th>Email:</th><td>${user.email || "-"}</td></tr>
                            <tr><th>Estado:</th><td>${user.enabled ? '<span class="badge bg-success">Habilitado</span>' : '<span class="badge bg-danger">Deshabilitado</span>'}</td></tr>
                            <tr><th>Rol:</th><td>${user.role === "admin" ? "Administrador" : "Profesor"}</td></tr>
                            <tr><th>Verificado:</th><td>${user.emailVerified ? "Sí" : "No"}</td></tr>
                            <tr><th>Estado Cognito:</th><td>${user.userStatus || "-"}</td></tr>
                            <tr><th>Creado:</th><td>${formatDateTime(user.userCreateDate)}</td></tr>
                            <tr><th>Modificado:</th><td>${formatDateTime(user.userLastModifiedDate)}</td></tr>
                        </table>
                    </div>
                `,
        confirmButtonText: "Cerrar",
        confirmButtonColor: "#008FD0",
        width: "500px",
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  /**
   * Confirm and disable user
   */
  function confirmDisableUser(userId) {
    Swal.fire({
      title: "¿Deshabilitar Usuario?",
      text: "El usuario no podrá iniciar sesión hasta que sea habilitado nuevamente.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, Deshabilitar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc3545",
    }).then(async (result) => {
      if (result.isConfirmed) {
        await updateUserStatus(userId, false);
      }
    });
  }

  /**
   * Confirm and enable user
   */
  function confirmEnableUser(userId) {
    Swal.fire({
      title: "¿Habilitar Usuario?",
      text: "El usuario podrá iniciar sesión nuevamente.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, Habilitar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#28a745",
    }).then(async (result) => {
      if (result.isConfirmed) {
        await updateUserStatus(userId, true);
      }
    });
  }

  /**
   * Update user status (enable/disable)
   */
  async function updateUserStatus(userId, enabled) {
    try {
      Swal.fire({
        title: enabled ? "Habilitando..." : "Deshabilitando...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      await apiCall(
        `/admin/users/${encodeURIComponent(userId)}/status`,
        "PUT",
        { enabled },
      );

      Swal.fire({
        title: "¡Éxito!",
        text: enabled
          ? "Usuario habilitado correctamente"
          : "Usuario deshabilitado correctamente",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      loadUsers();
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  /**
   * Show role change modal
   */
  function showRoleModal(userId, currentRole) {
    Swal.fire({
      title: "Cambiar Rol",
      html: `
                <div class="text-start">
                    <label class="form-label">Seleccione el nuevo rol:</label>
                    <select id="newRole" class="form-select">
                        <option value="teacher" ${currentRole === "teacher" ? "selected" : ""}>Profesor</option>
                        <option value="admin" ${currentRole === "admin" ? "selected" : ""}>Administrador</option>
                    </select>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
      preConfirm: () => {
        return document.getElementById("newRole").value;
      },
    }).then(async (result) => {
      if (result.isConfirmed && result.value !== currentRole) {
        await updateUserRole(userId, result.value);
      }
    });
  }

  /**
   * Update user role
   */
  async function updateUserRole(userId, newRole) {
    try {
      Swal.fire({
        title: "Actualizando rol...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      await apiCall(`/admin/users/${encodeURIComponent(userId)}/role`, "PUT", {
        role: newRole,
      });

      Swal.fire({
        title: "¡Éxito!",
        text: "Rol actualizado correctamente",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      loadUsers();
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  /**
   * Confirm password reset
   */
  function confirmResetPassword(userId) {
    Swal.fire({
      title: "¿Restablecer Contraseña?",
      text: "Se enviará un correo al usuario con una nueva contraseña temporal.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, Restablecer",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
    }).then(async (result) => {
      if (result.isConfirmed) {
        await resetPassword(userId);
      }
    });
  }

  /**
   * Reset user password
   */
  async function resetPassword(userId) {
    try {
      Swal.fire({
        title: "Restableciendo contraseña...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const data = await apiCall(
        `/admin/users/${encodeURIComponent(userId)}/reset-password`,
        "POST",
      );

      // If a temp password was generated (FORCE_CHANGE_PASSWORD users), show it
      const text = data.message || "Contraseña restablecida correctamente";

      Swal.fire({
        title: "¡Éxito!",
        text: text,
        icon: "success",
        confirmButtonColor: "#008FD0",
      });
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  /**
   * Confirm user deletion
   */
  function confirmDeleteUser(userId) {
    Swal.fire({
      title: "¿Eliminar Usuario?",
      html: `
                <p class="text-danger">Esta acción no se puede deshacer.</p>
                <p>El usuario será eliminado permanentemente del sistema.</p>
            `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#dc3545",
    }).then(async (result) => {
      if (result.isConfirmed) {
        await deleteUser(userId);
      }
    });
  }

  /**
   * Delete user
   */
  async function deleteUser(userId) {
    try {
      Swal.fire({
        title: "Eliminando usuario...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      await apiCall(`/admin/users/${encodeURIComponent(userId)}`, "DELETE");

      Swal.fire({
        title: "¡Eliminado!",
        text: "Usuario eliminado correctamente",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      loadUsers();
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  /**
   * Bulk update user status
   */
  async function bulkUpdateStatus(userIds, enabled) {
    if (!userIds || userIds.length === 0) {
      Swal.fire({
        title: "Atención",
        text: "No hay usuarios seleccionados",
        icon: "warning",
        confirmButtonColor: "#008FD0",
      });
      return;
    }

    const action = enabled ? "habilitar" : "deshabilitar";

    Swal.fire({
      title: `¿${enabled ? "Habilitar" : "Deshabilitar"} ${userIds.length} usuario(s)?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Sí, ${action}`,
      cancelButtonText: "Cancelar",
      confirmButtonColor: enabled ? "#28a745" : "#dc3545",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Procesando...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });

          const data = await apiCall("/admin/users/bulk", "POST", {
            userIds: userIds,
            action: enabled ? "enable" : "disable",
          });

          selectedUsers.clear();
          updateBulkActionsVisibility();

          Swal.fire({
            title: "¡Completado!",
            text: data.message,
            icon: "success",
            confirmButtonColor: "#008FD0",
          });

          loadUsers();
        } catch (error) {
          Swal.fire({
            title: "Error",
            text: error.message,
            icon: "error",
            confirmButtonColor: "#008FD0",
          });
        }
      }
    });
  }

  /**
   * Export users to CSV
   */
  async function exportUsers(format = "csv") {
    try {
      Swal.fire({
        title: "Exportando...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const data = await apiCall("/admin/users/export", "POST", {
        format: format,
        filters: currentFilters,
      });

      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      } else if (data.content) {
        // Create download from content
        const blob = new Blob([data.content], {
          type: "text/csv;charset=utf-8;",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `usuarios_${new Date().toISOString().split("T")[0]}.csv`;
        link.click();
      }

      Swal.close();
    } catch (error) {
      Swal.fire({
        title: "Error",
        text: "No se pudo exportar: " + error.message,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
    }
  }

  // Public API
  return {
    loadUsers,
    searchUsers,
    applyFilters,
    toggleUserSelection,
    toggleSelectAll,
    getSelectedUsers,
    showCreateUserModal,
    showUserDetails,
    confirmDisableUser,
    confirmEnableUser,
    showRoleModal,
    confirmResetPassword,
    confirmDeleteUser,
    bulkUpdateStatus,
    exportUsers,
  };
})();

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {});
