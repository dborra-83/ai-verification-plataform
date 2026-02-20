/**
 * Platform Configuration Admin Module
 * Handles platform-wide configuration settings and email templates
 */

window.PlatformConfigAdminModule = (function () {
  const API_BASE_URL = window.CONFIG?.API_URL || "";

  // State
  let currentConfig = {};
  let emailTemplates = [];

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
   * Load platform configuration
   */
  async function loadConfig() {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/config`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar configuración");
      }

      currentConfig = await response.json();
      renderConfigForm(currentConfig);
      return currentConfig;
    } catch (error) {
      console.error("Error loading config:", error);
      throw error;
    }
  }

  /**
   * Save platform configuration
   */
  async function saveConfig(config) {
    try {
      // Validate config
      const validationError = validateConfig(config);
      if (validationError) {
        throw new Error(validationError);
      }

      const response = await fetch(`${API_BASE_URL}/admin/config`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(config),
      });

      handleApiError(response);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || "Error al guardar configuración",
        );
      }

      currentConfig = data.config || config;
      return data;
    } catch (error) {
      console.error("Error saving config:", error);
      throw error;
    }
  }

  /**
   * Validate configuration
   */
  function validateConfig(config) {
    if (config.analysisThreshold !== undefined) {
      const threshold = parseFloat(config.analysisThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return "El umbral de análisis debe ser un número entre 0 y 100";
      }
    }

    if (config.supportEmail && !isValidEmail(config.supportEmail)) {
      return "El formato del correo de soporte es inválido";
    }

    if (config.logoUrl && !isValidUrl(config.logoUrl)) {
      return "El formato de la URL del logo es inválido";
    }

    return null;
  }

  /**
   * Validate email format
   */
  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load email templates
   */
  async function loadEmailTemplates() {
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/config/email-templates`,
        {
          method: "GET",
          headers: getAuthHeaders(),
        },
      );

      handleApiError(response);

      if (!response.ok) {
        throw new Error("Error al cargar plantillas de correo");
      }

      const data = await response.json();
      emailTemplates = data.templates || [];
      renderEmailTemplates(emailTemplates);
      return emailTemplates;
    } catch (error) {
      console.error("Error loading email templates:", error);
      throw error;
    }
  }

  /**
   * Save email template
   */
  async function saveEmailTemplate(templateId, template) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/config/email-templates/${templateId}`,
        {
          method: "PUT",
          headers: getAuthHeaders(),
          body: JSON.stringify(template),
        },
      );

      handleApiError(response);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Error al guardar plantilla");
      }

      // Update local state
      const index = emailTemplates.findIndex(
        (t) => t.templateId === templateId,
      );
      if (index >= 0) {
        emailTemplates[index] = { ...emailTemplates[index], ...template };
      }

      return data;
    } catch (error) {
      console.error("Error saving email template:", error);
      throw error;
    }
  }

  /**
   * Preview email template
   */
  async function previewEmailTemplate(templateId, sampleData = {}) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/config/email-templates/${templateId}/preview`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ sampleData }),
        },
      );

      handleApiError(response);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Error al generar vista previa");
      }

      showTemplatePreview(data);
      return data;
    } catch (error) {
      console.error("Error previewing template:", error);
      throw error;
    }
  }

  /**
   * Render configuration form
   */
  function renderConfigForm(config) {
    const platformNameEl = document.getElementById("configPlatformName");
    const logoUrlEl = document.getElementById("configLogoUrl");
    const thresholdEl = document.getElementById("configThreshold");
    const supportEmailEl = document.getElementById("configSupportEmail");

    if (platformNameEl) platformNameEl.value = config.platformName || "";
    if (logoUrlEl) logoUrlEl.value = config.logoUrl || "";
    if (thresholdEl) thresholdEl.value = config.analysisThreshold || 70;
    if (supportEmailEl) supportEmailEl.value = config.supportEmail || "";
  }

  /**
   * Render email templates
   */
  function renderEmailTemplates(templates) {
    const container = document.getElementById("emailTemplatesContainer");
    if (!container) return;

    if (!templates || templates.length === 0) {
      container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-envelope-x me-2"></i>
                    No hay plantillas de correo configuradas
                </div>
            `;
      return;
    }

    container.innerHTML = templates
      .map(
        (template) => `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">${translateTemplateId(template.templateId)}</h6>
                    <div>
                        <button class="btn btn-sm btn-outline-info me-1" onclick="PlatformConfigAdminModule.showPreviewModal('${template.templateId}')">
                            <i class="bi bi-eye"></i> Vista Previa
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="PlatformConfigAdminModule.showEditModal('${template.templateId}')">
                            <i class="bi bi-pencil"></i> Editar
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <p class="mb-1"><strong>Asunto:</strong> ${template.subject || "-"}</p>
                    <p class="mb-0 text-muted small">${truncateText(template.body, 150)}</p>
                </div>
            </div>
        `,
      )
      .join("");
  }

  /**
   * Translate template ID to Spanish
   */
  function translateTemplateId(templateId) {
    const translations = {
      welcome: "Correo de Bienvenida",
      password_reset: "Restablecimiento de Contraseña",
      verification: "Código de Verificación",
      account_disabled: "Cuenta Deshabilitada",
      role_change: "Cambio de Rol",
    };
    return translations[templateId] || templateId;
  }

  /**
   * Truncate text
   */
  function truncateText(text, maxLength) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  }

  /**
   * Show edit template modal
   */
  function showEditModal(templateId) {
    const template = emailTemplates.find((t) => t.templateId === templateId);
    if (!template) return;

    Swal.fire({
      title: `Editar: ${translateTemplateId(templateId)}`,
      html: `
                <form id="editTemplateForm" class="text-start">
                    <div class="mb-3">
                        <label class="form-label">Asunto</label>
                        <input type="text" class="form-control" id="templateSubject" value="${template.subject || ""}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Cuerpo del Mensaje</label>
                        <textarea class="form-control" id="templateBody" rows="8">${template.body || ""}</textarea>
                    </div>
                    <div class="alert alert-info small">
                        <strong>Placeholders disponibles:</strong><br>
                        {user_name}, {platform_name}, {verification_code}, {temporary_password}
                    </div>
                </form>
            `,
      width: "600px",
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
      preConfirm: () => {
        return {
          subject: document.getElementById("templateSubject").value,
          body: document.getElementById("templateBody").value,
        };
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          Swal.fire({
            title: "Guardando...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
          });

          await saveEmailTemplate(templateId, result.value);
          await loadEmailTemplates();

          Swal.fire({
            title: "Plantilla Guardada",
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
    });
  }

  /**
   * Show preview modal
   */
  function showPreviewModal(templateId) {
    const template = emailTemplates.find((t) => t.templateId === templateId);
    if (!template) return;

    // Replace placeholders with sample data
    const sampleData = {
      user_name: "Juan Pérez",
      platform_name: currentConfig.platformName || "EduTech AI",
      verification_code: "123456",
      temporary_password: "TempPass123!",
    };

    let previewSubject = template.subject || "";
    let previewBody = template.body || "";

    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, "g");
      previewSubject = previewSubject.replace(regex, value);
      previewBody = previewBody.replace(regex, value);
    });

    Swal.fire({
      title: "Vista Previa",
      html: `
                <div class="text-start">
                    <div class="mb-3">
                        <label class="form-label text-muted">Asunto:</label>
                        <div class="border rounded p-2 bg-light">${previewSubject}</div>
                    </div>
                    <div>
                        <label class="form-label text-muted">Mensaje:</label>
                        <div class="border rounded p-3 bg-light" style="white-space: pre-wrap;">${previewBody}</div>
                    </div>
                </div>
            `,
      width: "600px",
      confirmButtonText: "Cerrar",
      confirmButtonColor: "#008FD0",
    });
  }

  /**
   * Show template preview from API response
   */
  function showTemplatePreview(data) {
    Swal.fire({
      title: "Vista Previa",
      html: `
                <div class="text-start">
                    <div class="mb-3">
                        <label class="form-label text-muted">Asunto:</label>
                        <div class="border rounded p-2 bg-light">${data.subject}</div>
                    </div>
                    <div>
                        <label class="form-label text-muted">Mensaje:</label>
                        <div class="border rounded p-3 bg-light" style="white-space: pre-wrap;">${data.body}</div>
                    </div>
                </div>
            `,
      width: "600px",
      confirmButtonText: "Cerrar",
      confirmButtonColor: "#008FD0",
    });
  }

  /**
   * Show save config confirmation
   */
  async function showSaveConfigConfirmation() {
    const config = {
      platformName: document.getElementById("configPlatformName")?.value,
      logoUrl: document.getElementById("configLogoUrl")?.value,
      analysisThreshold: parseFloat(
        document.getElementById("configThreshold")?.value,
      ),
      supportEmail: document.getElementById("configSupportEmail")?.value,
    };

    const validationError = validateConfig(config);
    if (validationError) {
      Swal.fire({
        title: "Error de Validación",
        text: validationError,
        icon: "error",
        confirmButtonColor: "#008FD0",
      });
      return;
    }

    const result = await Swal.fire({
      title: "¿Guardar Configuración?",
      text: "Los cambios se aplicarán a toda la plataforma",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: "Guardando...",
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        await saveConfig(config);

        Swal.fire({
          title: "Configuración Guardada",
          text: "Los cambios se han aplicado correctamente",
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
  }

  // State for current template
  let currentTemplateId = "welcome";

  /**
   * Load a specific email template into the editor
   */
  function loadEmailTemplate(templateId) {
    currentTemplateId = templateId;
    const template = emailTemplates.find((t) => t.templateId === templateId);

    const subjectEl = document.getElementById("templateSubject");
    const contentEl = document.getElementById("templateContent");

    if (template) {
      if (subjectEl) subjectEl.value = template.subject || "";
      if (contentEl) contentEl.value = template.body || "";
    } else {
      // Default templates if not loaded from API
      const defaults = {
        welcome: {
          subject: "Bienvenido a {{plataforma}}",
          body: "Hola {{nombre}},\n\nBienvenido a {{plataforma}}. Tu cuenta ha sido creada exitosamente.\n\nSaludos,\nEl equipo de {{plataforma}}",
        },
        password_reset: {
          subject: "Restablecimiento de contraseña - {{plataforma}}",
          body: "Hola {{nombre}},\n\nHemos recibido una solicitud para restablecer tu contraseña.\n\nHaz clic en el siguiente enlace: {{enlace}}\n\nSi no solicitaste este cambio, ignora este correo.\n\nSaludos,\nEl equipo de {{plataforma}}",
        },
        verification: {
          subject: "Verifica tu cuenta - {{plataforma}}",
          body: "Hola {{nombre}},\n\nGracias por registrarte en {{plataforma}}.\n\nPor favor verifica tu cuenta haciendo clic en: {{enlace}}\n\nSaludos,\nEl equipo de {{plataforma}}",
        },
      };

      const defaultTemplate = defaults[templateId] || { subject: "", body: "" };
      if (subjectEl) subjectEl.value = defaultTemplate.subject;
      if (contentEl) contentEl.value = defaultTemplate.body;
    }
  }

  /**
   * Save current email template from editor
   */
  async function saveCurrentEmailTemplate() {
    const subject = document.getElementById("templateSubject")?.value || "";
    const body = document.getElementById("templateContent")?.value || "";

    try {
      Swal.fire({
        title: "Guardando plantilla...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      await saveEmailTemplate(currentTemplateId, { subject, body });

      Swal.fire({
        title: "Plantilla Guardada",
        text: "La plantilla se ha guardado correctamente",
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
   * Preview current email template
   */
  function previewCurrentEmailTemplate() {
    const subject = document.getElementById("templateSubject")?.value || "";
    const body = document.getElementById("templateContent")?.value || "";

    // Sample data for preview
    const sampleData = {
      nombre: "Juan Pérez",
      email: "juan@ejemplo.com",
      enlace: "https://plataforma.com/verificar/abc123",
      plataforma: currentConfig.platformName || "EduTech AI",
    };

    let previewSubject = subject;
    let previewBody = body;

    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      previewSubject = previewSubject.replace(regex, value);
      previewBody = previewBody.replace(regex, value);
    });

    Swal.fire({
      title: "Vista Previa",
      html: `
        <div class="text-start">
          <div class="mb-3">
            <label class="form-label text-muted">Asunto:</label>
            <div class="border rounded p-2 bg-light">${previewSubject}</div>
          </div>
          <div>
            <label class="form-label text-muted">Mensaje:</label>
            <div class="border rounded p-3 bg-light" style="white-space: pre-wrap;">${previewBody}</div>
          </div>
        </div>
      `,
      width: "600px",
      confirmButtonText: "Cerrar",
      confirmButtonColor: "#008FD0",
    });
  }

  // Public API
  return {
    loadConfig,
    saveConfig: showSaveConfigConfirmation,
    loadEmailTemplates,
    saveEmailTemplate: saveCurrentEmailTemplate,
    previewEmailTemplate: previewCurrentEmailTemplate,
    loadEmailTemplate,
    showEditModal,
    showPreviewModal,
    showSaveConfigConfirmation,
  };
})();
