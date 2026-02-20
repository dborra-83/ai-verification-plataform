/**
 * User Management Module for Admin Panel
 * Handles Cognito user management operations
 */

// User Management Module
window.UserManagementModule = (function() {
    const getApiBaseUrl() = window.CONFIG?.API_URL || '';
    
    // State
    let currentUsers = [];
    let selectedUsers = new Set();
    let currentPaginationToken = null;
    let currentFilters = {
        email: '',
        status: '',
        role: ''
    };

    /**
     * Get authorization headers
     */
    async function getAuthHeaders() {
        let authHeaders = {
            'Content-Type': 'application/json'
        };
        
        // Try to get token from authModule first
        if (window.authModule && typeof window.authModule.getAuthHeader === 'function') {
            try {
                const authHeader = await window.authModule.getAuthHeader();
                if (authHeader) {
                    authHeaders = { ...authHeaders, ...authHeader };
                }
            } catch (error) {
                console.warn('Could not get auth header from authModule:', error);
            }
        }
        
        // Fallback: try to get from localStorage
        if (!authHeaders.Authorization) {
            try {
                const authData = localStorage.getItem('ai_verification_auth');
                if (authData) {
                    const parsed = JSON.parse(authData);
                    if (parsed && parsed.accessToken) {
                        authHeaders.Authorization = `Bearer ${parsed.accessToken}`;
                    }
                }
            } catch (error) {
                console.warn('Could not get auth from localStorage:', error);
            }
        }
        
        return authHeaders;
    }

    /**
     * Handle API errors
     */
    function handleApiError(response) {
        if (response.status === 401 || response.status === 403) {
            Swal.fire({
                title: 'Sesion Expirada',
                text: 'Por favor, inicie sesion nuevamente',
                icon: 'warning',
                confirmButtonColor: '#008FD0'
            }).then(() => {
                window.location.href = 'login.html';
            });
            throw new Error('Unauthorized');
        }
        return response;
    }

    /**
     * Format date to Spanish locale (DD/MM/YYYY)
     */
    function formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Format datetime to Spanish locale
     */
    function formatDateTime(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Load users with pagination and filters
     */
    async function loadUsers(paginationToken = null) {
        try {
            showLoading('userTableBody');
            
            const params = new URLSearchParams();
            params.append('limit', '20');
            
            if (paginationToken) {
                params.append('paginationToken', paginationToken);
            }
            if (currentFilters.email) {
                params.append('filter', currentFilters.email);
            }
            if (currentFilters.status) {
                params.append('status', currentFilters.status);
            }
            if (currentFilters.role) {
                params.append('role', currentFilters.role);
            }

            const response = await fetch(`${getApiBaseUrl()}/admin/users?${params}`, {
                method: 'GET',
                headers: await getAuthHeaders()
            });

            handleApiError(response);
            
            if (!response.ok) {
                throw new Error('Error al cargar usuarios');
            }

            const data = await response.json();
            currentUsers = data.users || [];
            currentPaginationToken = data.paginationToken;
            
            renderUserTable(currentUsers);
            renderPagination(data.paginationToken);
            updateBulkActionsVisibility();
            
            return data;
        } catch (error) {
            console.error('Error loading users:', error);
            showError('userTableBody', 'Error al cargar usuarios');
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
     * Get user details
     */
    async function getUserDetails(userId) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}`, {
                method: 'GET',
                headers: await getAuthHeaders()
            });

            handleApiError(response);
            
            if (!response.ok) {
                throw new Error('Error al obtener detalles del usuario');
            }

            return await response.json();
        } catch (error) {
            console.error('Error getting user details:', error);
            throw error;
        }
    }

    /**
     * Create a new user
     */
    async function createUser(email, role, sendWelcomeEmail = true) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users`, {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ email, role, sendWelcomeEmail })
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al crear usuario');
            }

            await loadUsers();
            return data;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    /**
     * Update user status (enable/disable)
     */
    async function updateUserStatus(userId, enabled) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}/status`, {
                method: 'PUT',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ enabled })
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al actualizar estado');
            }

            await loadUsers();
            return data;
        } catch (error) {
            console.error('Error updating user status:', error);
            throw error;
        }
    }

    /**
     * Delete a user
     */
    async function deleteUser(userId) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}`, {
                method: 'DELETE',
                headers: await getAuthHeaders()
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al eliminar usuario');
            }

            await loadUsers();
            return data;
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    /**
     * Update user role
     */
    async function updateUserRole(userId, role) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}/role`, {
                method: 'PUT',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ role })
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al actualizar rol');
            }

            await loadUsers();
            return data;
        } catch (error) {
            console.error('Error updating user role:', error);
            throw error;
        }
    }

    /**
     * Reset user password
     */
    async function resetPassword(userId) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}/reset-password`, {
                method: 'POST',
                headers: await getAuthHeaders()
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al restablecer contrasena');
            }

            return data;
        } catch (error) {
            console.error('Error resetting password:', error);
            throw error;
        }
    }

    /**
     * Resend verification email
     */
    async function resendVerification(userId) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(userId)}/resend-verification`, {
                method: 'POST',
                headers: await getAuthHeaders()
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al reenviar verificacion');
            }

            return data;
        } catch (error) {
            console.error('Error resending verification:', error);
            throw error;
        }
    }

    /**
     * Bulk update status for multiple users
     */
    async function bulkUpdateStatus(userIds, enabled) {
        try {
            const action = enabled ? 'enable' : 'disable';
            const response = await fetch(`${getApiBaseUrl()}/admin/users/bulk`, {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ userIds, action })
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error en operacion masiva');
            }

            selectedUsers.clear();
            await loadUsers();
            return data;
        } catch (error) {
            console.error('Error in bulk operation:', error);
            throw error;
        }
    }

    /**
     * Export users to CSV/Excel
     */
    async function exportUsers(format = 'csv') {
        try {
            const response = await fetch(`${getApiBaseUrl()}/admin/users/export`, {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({ format, filters: currentFilters })
            });

            handleApiError(response);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error?.message || 'Error al exportar usuarios');
            }

            if (data.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
            }

            return data;
        } catch (error) {
            console.error('Error exporting users:', error);
            throw error;
        }
    }

    /**
     * Render user table
     */
    function renderUserTable(users) {
        const tbody = document.getElementById('userTableBody');
        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-people me-2"></i>No se encontraron usuarios</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => {
            const isSelected = selectedUsers.has(user.username);
            const statusBadge = user.enabled 
                ? '<span class="badge bg-success">Habilitado</span>'
                : '<span class="badge bg-danger">Deshabilitado</span>';
            const roleBadge = user.role === 'admin'
                ? '<span class="badge bg-primary">Administrador</span>'
                : '<span class="badge bg-info">Profesor</span>';
            
            return `<tr data-user-id="${user.username}">
                <td><input type="checkbox" class="form-check-input user-checkbox" data-user-id="${user.username}" ${isSelected ? 'checked' : ''} onchange="UserManagementModule.toggleUserSelection('${user.username}')"></td>
                <td>${user.email || '-'}</td>
                <td>${statusBadge}</td>
                <td>${roleBadge}</td>
                <td>${formatDate(user.userCreateDate)}</td>
                <td>${formatDateTime(user.lastLogin) || '-'}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="UserManagementModule.showUserDetails('${user.username}')" title="Ver detalles"><i class="bi bi-eye"></i></button>
                        ${user.enabled 
                            ? `<button class="btn btn-outline-warning" onclick="UserManagementModule.confirmDisableUser('${user.username}')" title="Deshabilitar"><i class="bi bi-person-slash"></i></button>`
                            : `<button class="btn btn-outline-success" onclick="UserManagementModule.confirmEnableUser('${user.username}')" title="Habilitar"><i class="bi bi-person-check"></i></button>`
                        }
                        <button class="btn btn-outline-info" onclick="UserManagementModule.showRoleModal('${user.username}', '${user.role}')" title="Cambiar rol"><i class="bi bi-person-gear"></i></button>
                        <button class="btn btn-outline-secondary" onclick="UserManagementModule.confirmResetPassword('${user.username}')" title="Restablecer contrasena"><i class="bi bi-key"></i></button>
                        <button class="btn btn-outline-danger" onclick="UserManagementModule.confirmDeleteUser('${user.username}')" title="Eliminar"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    /**
     * Render pagination controls
     */
    function renderPagination(nextToken) {
        const paginationContainer = document.getElementById('userPagination');
        if (!paginationContainer) return;

        let html = '<nav aria-label="Navegacion de usuarios"><ul class="pagination justify-content-center">';
        
        if (currentPaginationToken) {
            html += '<li class="page-item"><a class="page-link" href="#" onclick="UserManagementModule.loadUsers(); return false;"><i class="bi bi-chevron-left"></i> Anterior</a></li>';
        }
        
        if (nextToken) {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="UserManagementModule.loadUsers('${nextToken}'); return false;">Siguiente <i class="bi bi-chevron-right"></i></a></li>`;
        }
        
        html += '</ul></nav>';
        paginationContainer.innerHTML = html;
    }

    function toggleUserSelection(userId) {
        if (selectedUsers.has(userId)) {
            selectedUsers.delete(userId);
        } else {
            selectedUsers.add(userId);
        }
        updateBulkActionsVisibility();
    }

    function toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.user-checkbox');
        
        if (selectAllCheckbox.checked) {
            currentUsers.forEach(user => selectedUsers.add(user.username));
            checkboxes.forEach(cb => cb.checked = true);
        } else {
            selectedUsers.clear();
            checkboxes.forEach(cb => cb.checked = false);
        }
        updateBulkActionsVisibility();
    }

    function updateBulkActionsVisibility() {
        const bulkActions = document.getElementById('bulkActions');
        const selectedCount = document.getElementById('selectedCount');
        
        if (bulkActions) {
            bulkActions.style.display = selectedUsers.size > 0 ? 'block' : 'none';
        }
        if (selectedCount) {
            selectedCount.textContent = `${selectedUsers.size} usuario(s) seleccionado(s)`;
        }
    }

    function showLoading(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div><p class="mt-2 text-muted">Cargando usuarios...</p></td></tr>';
        }
    }

    function showError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle me-2"></i>${message}</td></tr>`;
        }
    }

    async function showUserDetails(userId) {
        try {
            Swal.fire({ title: 'Cargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            const user = await getUserDetails(userId);
            
            let loginHistoryHtml = '';
            if (user.loginHistory && user.loginHistory.length > 0) {
                loginHistoryHtml = `<h6 class="mt-3">Historial de Accesos</h6><div class="table-responsive" style="max-height: 200px; overflow-y: auto;"><table class="table table-sm"><thead><tr><th>Fecha</th><th>IP</th><th>Estado</th></tr></thead><tbody>${user.loginHistory.map(login => `<tr><td>${formatDateTime(login.timestamp)}</td><td>${login.ipAddress || '-'}</td><td>${login.success ? '<span class="badge bg-success">Exitoso</span>' : '<span class="badge bg-danger">Fallido</span>'}</td></tr>`).join('')}</tbody></table></div>`;
            }

            Swal.fire({
                title: 'Detalles del Usuario',
                html: `<div class="text-start"><p><strong>Email:</strong> ${user.email}</p><p><strong>Estado:</strong> ${user.enabled ? '<span class="badge bg-success">Habilitado</span>' : '<span class="badge bg-danger">Deshabilitado</span>'}</p><p><strong>Email Verificado:</strong> ${user.emailVerified ? 'Si' : 'No'}</p><p><strong>Rol:</strong> ${user.role === 'admin' ? 'Administrador' : 'Profesor'}</p><p><strong>Fecha de Creacion:</strong> ${formatDate(user.userCreateDate)}</p><p><strong>Ultima Modificacion:</strong> ${formatDate(user.userLastModifiedDate)}</p><p><strong>Estado de Cuenta:</strong> ${user.userStatus}</p>${loginHistoryHtml}</div>`,
                width: '600px',
                confirmButtonColor: '#008FD0'
            });
        } catch (error) {
            Swal.fire({ title: 'Error', text: 'No se pudieron cargar los detalles del usuario', icon: 'error', confirmButtonColor: '#008FD0' });
        }
    }

    function showCreateUserModal() {
        Swal.fire({
            title: 'Nuevo Usuario',
            html: `<form id="createUserForm" class="text-start"><div class="mb-3"><label class="form-label">Correo Electronico</label><input type="email" class="form-control" id="newUserEmail" required></div><div class="mb-3"><label class="form-label">Rol</label><select class="form-select" id="newUserRole"><option value="teacher">Profesor</option><option value="admin">Administrador</option></select></div><div class="form-check"><input type="checkbox" class="form-check-input" id="sendWelcomeEmail" checked><label class="form-check-label" for="sendWelcomeEmail">Enviar correo de bienvenida con contrasena temporal</label></div></form>`,
            showCancelButton: true,
            confirmButtonText: 'Crear Usuario',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#008FD0',
            preConfirm: () => {
                const email = document.getElementById('newUserEmail').value;
                const role = document.getElementById('newUserRole').value;
                const sendWelcomeEmail = document.getElementById('sendWelcomeEmail').checked;
                if (!email) { Swal.showValidationMessage('El correo electronico es requerido'); return false; }
                return { email, role, sendWelcomeEmail };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'Creando usuario...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    await createUser(result.value.email, result.value.role, result.value.sendWelcomeEmail);
                    Swal.fire({ title: 'Usuario Creado', text: 'El usuario ha sido creado exitosamente', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message || 'No se pudo crear el usuario', icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function confirmDisableUser(userId) {
        Swal.fire({
            title: 'Deshabilitar Usuario?',
            text: 'El usuario no podra acceder a la plataforma',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Si, deshabilitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await updateUserStatus(userId, false);
                    Swal.fire({ title: 'Usuario Deshabilitado', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function confirmEnableUser(userId) {
        Swal.fire({
            title: 'Habilitar Usuario?',
            text: 'El usuario podra acceder a la plataforma',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Si, habilitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#28a745'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await updateUserStatus(userId, true);
                    Swal.fire({ title: 'Usuario Habilitado', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function confirmDeleteUser(userId) {
        Swal.fire({
            title: 'Eliminar Usuario?',
            text: 'Esta accion no se puede deshacer',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Si, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await deleteUser(userId);
                    Swal.fire({ title: 'Usuario Eliminado', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function confirmResetPassword(userId) {
        Swal.fire({
            title: 'Restablecer Contrasena?',
            text: 'Se enviara una contrasena temporal al correo del usuario',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Si, restablecer',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#008FD0'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await resetPassword(userId);
                    Swal.fire({ title: 'Contrasena Restablecida', text: 'Se ha enviado una contrasena temporal al usuario', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function showRoleModal(userId, currentRole) {
        Swal.fire({
            title: 'Cambiar Rol',
            html: `<div class="text-start"><label class="form-label">Seleccione el nuevo rol:</label><select class="form-select" id="newRole"><option value="teacher" ${currentRole === 'teacher' ? 'selected' : ''}>Profesor</option><option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Administrador</option></select></div>`,
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#008FD0',
            preConfirm: () => document.getElementById('newRole').value
        }).then(async (result) => {
            if (result.isConfirmed && result.value !== currentRole) {
                try {
                    await updateUserRole(userId, result.value);
                    Swal.fire({ title: 'Rol Actualizado', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    async function bulkEnable() {
        if (selectedUsers.size === 0) return;
        Swal.fire({
            title: 'Habilitar Usuarios?',
            text: `Se habilitaran ${selectedUsers.size} usuario(s)`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Si, habilitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#28a745'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const data = await bulkUpdateStatus(Array.from(selectedUsers), true);
                    Swal.fire({ title: 'Operacion Completada', html: `<p>Exitosos: ${data.summary?.successful || 0}</p><p>Fallidos: ${data.summary?.failed || 0}</p>`, icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    async function bulkDisable() {
        if (selectedUsers.size === 0) return;
        Swal.fire({
            title: 'Deshabilitar Usuarios?',
            text: `Se deshabilitaran ${selectedUsers.size} usuario(s)`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Si, deshabilitar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#dc3545'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const data = await bulkUpdateStatus(Array.from(selectedUsers), false);
                    Swal.fire({ title: 'Operacion Completada', html: `<p>Exitosos: ${data.summary?.successful || 0}</p><p>Fallidos: ${data.summary?.failed || 0}</p>`, icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message, icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function showExportModal() {
        Swal.fire({
            title: 'Exportar Usuarios',
            html: `<div class="text-start"><label class="form-label">Formato de exportacion:</label><select class="form-select" id="exportFormat"><option value="csv">CSV</option><option value="xlsx">Excel</option></select><small class="text-muted">Se exportaran los usuarios segun los filtros aplicados</small></div>`,
            showCancelButton: true,
            confirmButtonText: 'Exportar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#008FD0',
            preConfirm: () => document.getElementById('exportFormat').value
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    Swal.fire({ title: 'Generando exportacion...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    await exportUsers(result.value);
                    Swal.fire({ title: 'Exportacion Completada', text: 'El archivo se descargara automaticamente', icon: 'success', confirmButtonColor: '#008FD0' });
                } catch (error) {
                    Swal.fire({ title: 'Error', text: error.message || 'No se pudo exportar', icon: 'error', confirmButtonColor: '#008FD0' });
                }
            }
        });
    }

    function getSelectedUsers() {
        return Array.from(selectedUsers);
    }

    // Public API
    return {
        loadUsers,
        searchUsers,
        applyFilters,
        getUserDetails,
        createUser,
        updateUserStatus,
        deleteUser,
        updateUserRole,
        resetPassword,
        resendVerification,
        bulkUpdateStatus,
        exportUsers,
        toggleUserSelection,
        toggleSelectAll,
        showUserDetails,
        showCreateUserModal,
        confirmDisableUser,
        confirmEnableUser,
        confirmDeleteUser,
        confirmResetPassword,
        showRoleModal,
        bulkEnable,
        bulkDisable,
        showExportModal,
        getSelectedUsers,
        formatDate,
        formatDateTime
    };
})();
