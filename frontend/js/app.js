// Main application JavaScript
// Authentication and common utilities

// Polyfills and error handling
(function () {
  // Polyfill for crypto.randomUUID if not available
  if (!window.crypto || !window.crypto.randomUUID) {
    if (!window.crypto) window.crypto = {};
    window.crypto.randomUUID = function () {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
          var r = (Math.random() * 16) | 0;
          var v = c == "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );
    };
  }

  // Suppress third-party extension errors
  window.addEventListener("error", function (e) {
    // Ignore errors from browser extensions
    if (
      e.filename &&
      (e.filename.includes("extension://") ||
        e.filename.includes("passkeys.entry.js") ||
        e.filename.includes("script_injector") ||
        e.filename.includes("chrome-extension://"))
    ) {
      e.preventDefault();
      return false;
    }
  });

  // Suppress unhandled promise rejections from extensions
  window.addEventListener("unhandledrejection", function (e) {
    if (
      e.reason &&
      e.reason.stack &&
      (e.reason.stack.includes("extension://") ||
        e.reason.stack.includes("passkeys.entry.js") ||
        e.reason.stack.includes("script_injector") ||
        e.reason.stack.includes("chrome-extension://"))
    ) {
      e.preventDefault();
      return false;
    }
  });
})();

// Session management utilities - Updated to use Cognito auth
const SessionManager = {
  // Check if user is authenticated using Cognito tokens
  isAuthenticated() {
    // First check if authModule is available and use it
    if (
      window.authModule &&
      typeof window.authModule.isAuthenticated === "function"
    ) {
      return window.authModule.isAuthenticated();
    }
    // Fallback: check localStorage directly for Cognito tokens
    try {
      const authData = localStorage.getItem("ai_verification_auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed && parsed.accessToken !== undefined;
      }
    } catch (e) {
      console.error("Error checking auth:", e);
    }
    return false;
  },

  // Get current user info from Cognito
  getCurrentUser() {
    if (
      window.authModule &&
      typeof window.authModule.getCurrentUserEmail === "function"
    ) {
      const email = window.authModule.getCurrentUserEmail();
      return {
        username: email || "usuario",
        email: email,
        isAdmin: false,
        teacherId: email || "usuario",
      };
    }
    // Fallback: check localStorage directly
    try {
      const authData = localStorage.getItem("ai_verification_auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        return {
          username: parsed.email || "usuario",
          email: parsed.email,
          isAdmin: false,
          teacherId: parsed.email || "usuario",
        };
      }
    } catch (e) {
      console.error("Error getting user:", e);
    }
    return {
      username: "usuario",
      email: null,
      isAdmin: false,
      teacherId: "usuario",
    };
  },

  // Set user session (for compatibility - Cognito handles this)
  setSession(username) {
    // Cognito handles session storage, this is for compatibility
    console.log("Session set for:", username);
  },

  // Clear user session
  clearSession() {
    if (window.authModule && typeof window.authModule.signOut === "function") {
      window.authModule.signOut();
    }
    localStorage.removeItem("ai_verification_auth");
  },

  // Check if session is expired
  isSessionExpired() {
    try {
      const authData = localStorage.getItem("ai_verification_auth");
      if (!authData) return true;
      const parsed = JSON.parse(authData);
      if (!parsed.expiresAt) return true;
      return Date.now() > parsed.expiresAt;
    } catch (e) {
      return true;
    }
  },
};

// Make SessionManager globally available
window.SessionManager = SessionManager;

// Initialize auth module globally
let authModule = null;

// Initialize authentication module
async function initAuthModule() {
  if (window.COGNITO_CONFIG && window.AuthModule) {
    try {
      authModule = new window.AuthModule(
        window.COGNITO_CONFIG.USER_POOL_ID,
        window.COGNITO_CONFIG.APP_CLIENT_ID,
        window.COGNITO_CONFIG.REGION,
      );
      window.authModule = authModule;
      console.log("Auth module initialized");
      console.log("Is authenticated:", authModule.isAuthenticated());
      console.log("Current user:", authModule.getCurrentUserEmail());
      return true;
    } catch (error) {
      console.error("Failed to initialize auth module:", error);
      return false;
    }
  } else {
    console.warn("COGNITO_CONFIG or AuthModule not available");
  }
  return false;
}

// Check authentication on page load
document.addEventListener("DOMContentLoaded", async function () {
  // Initialize auth module first
  await initAuthModule();

  checkAuthentication();
  initializeApp();
});

// Authentication functions
function checkAuthentication() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // Skip auth check for login, signup, verify pages
  if (
    currentPage === "login.html" ||
    currentPage === "signup.html" ||
    currentPage === "verify.html"
  ) {
    return; // Let those pages handle their own auth logic
  }

  // For protected pages, check if authenticated
  const isAuthed = window.SessionManager
    ? window.SessionManager.isAuthenticated()
    : false;

  console.log(
    "checkAuthentication - page:",
    currentPage,
    "isAuthed:",
    isAuthed,
  );

  if (!isAuthed) {
    console.log("Not authenticated, redirecting to login...");
    window.location.href = "login.html";
  }
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
      // Clear Cognito session
      if (
        window.authModule &&
        typeof window.authModule.signOut === "function"
      ) {
        window.authModule.signOut();
      }
      // Also clear using SessionManager for compatibility
      if (window.SessionManager) {
        window.SessionManager.clearSession();
      }
      // Clear any legacy auth data
      localStorage.removeItem("ai_verification_auth");
      localStorage.removeItem("isAuthed");
      localStorage.removeItem("username");
      localStorage.removeItem("userRole");
      window.location.href = "login.html";
    }
  });
}

// Initialize application
function initializeApp() {
  // Set up mobile sidebar toggle
  setupMobileSidebar();

  // Set up search functionality
  setupSearch();

  // Handle hash URLs for navigation
  handleHashNavigation();

  // Load initial data if on dashboard
  if (
    window.location.pathname.includes("index.html") ||
    window.location.pathname === "/"
  ) {
    // Use the proper dashboard loading function
    if (typeof loadDashboardKPIs === "function") {
      loadDashboardKPIs();
    } else {
      loadDashboardData();
    }
  }
}

// Handle hash-based navigation
function handleHashNavigation() {
  const hash = window.location.hash.substring(1); // Remove the #

  // Only handle hashes on index.html
  if (
    !window.location.pathname.includes("index.html") &&
    window.location.pathname !== "/"
  ) {
    return;
  }

  switch (hash) {
    case "upload":
      setTimeout(() => showUploadSection(), 100);
      break;
    case "history":
      setTimeout(() => showHistorySection(), 100);
      break;
    case "analytics":
      setTimeout(() => showAnalyticsSection(), 100);
      break;
    case "settings":
      setTimeout(() => showSettingsSection(), 100);
      break;
    default:
      // Show dashboard by default
      setTimeout(() => showDashboard(), 100);
      break;
  }
}

// Mobile sidebar functionality
function setupMobileSidebar() {
  const sidebar = document.getElementById("sidebar");

  // Add mobile toggle button if not exists
  if (window.innerWidth <= 768 && !document.getElementById("sidebarToggle")) {
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "sidebarToggle";
    toggleBtn.className = "btn btn-primary d-md-none position-fixed";
    toggleBtn.style.cssText = "top: 1rem; left: 1rem; z-index: 1001;";
    toggleBtn.innerHTML = '<i class="bi bi-list"></i>';
    toggleBtn.onclick = toggleSidebar;
    document.body.appendChild(toggleBtn);
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("show");
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      const query = e.target.value.toLowerCase();
      // Implement search logic here
      console.log("Searching for:", query);
    });
  }
}

// Navigation functions
function showDashboard() {
  hideAllSections();
  document.getElementById("dashboardSection").style.display = "block";
  document.getElementById("pageTitle").textContent = "Dashboard";
  updateActiveNavItem("Dashboard");
  // Use the proper dashboard loading function
  if (typeof loadDashboardKPIs === "function") {
    loadDashboardKPIs();
  } else {
    loadDashboardData();
  }
}

function showUploadSection() {
  hideAllSections();
  document.getElementById("uploadSection").style.display = "block";
  document.getElementById("pageTitle").textContent = "Nuevo Análisis";
  updateActiveNavItem("Nuevo Análisis");
}

function showHistorySection() {
  hideAllSections();
  document.getElementById("historySection").style.display = "block";
  document.getElementById("pageTitle").textContent = "Historial";
  updateActiveNavItem("Historial");
  loadHistoryData();
}

function showAnalyticsSection() {
  hideAllSections();
  document.getElementById("analyticsSection").style.display = "block";
  document.getElementById("pageTitle").textContent = "Analytics y Reportes";
  updateActiveNavItem("Analytics y Reportes");
  // Load analytics data if function exists
  if (typeof loadAnalyticsData === "function") {
    loadAnalyticsData();
  }
}

function hideAllSections() {
  const sections = [
    "dashboardSection",
    "uploadSection",
    "historySection",
    "analyticsSection",
    "settingsSection",
  ];
  sections.forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = "none";
    }
  });
}

function updateActiveNavItem(activeText, section = null) {
  // Only update navigation for index.html (main dashboard page)
  // Other pages have their active states set in HTML
  const currentPage = window.location.pathname.split("/").pop();

  if (currentPage !== "index.html" && currentPage !== "") {
    return; // Don't update navigation for other pages
  }

  // Remove active class from all nav items in the AI Detection section only
  document.querySelectorAll(".nav-item").forEach((item) => {
    // Find the parent section by looking at previous siblings
    let parentSection = null;
    let currentElement = item.previousElementSibling;

    while (currentElement) {
      if (currentElement.classList.contains("nav-section-header")) {
        parentSection = currentElement.textContent.trim();
        break;
      }
      currentElement = currentElement.previousElementSibling;
    }

    // Only remove active class from AI Detection section items
    if (parentSection && parentSection.includes("Detección de IA")) {
      item.classList.remove("active");
    }
  });

  // Add active class to current item in AI Detection section only
  document.querySelectorAll(".nav-item").forEach((item) => {
    const itemText = item.textContent.trim();

    // Find the parent section
    let parentSection = null;
    let currentElement = item.previousElementSibling;

    while (currentElement) {
      if (currentElement.classList.contains("nav-section-header")) {
        parentSection = currentElement.textContent.trim();
        break;
      }
      currentElement = currentElement.previousElementSibling;
    }

    // Only activate items in the AI Detection section
    if (parentSection && parentSection.includes("Detección de IA")) {
      if (itemText === activeText || itemText.includes(activeText)) {
        item.classList.add("active");
      }
    }
  });
}

// Coming soon alert
function showComingSoon(featureName) {
  Swal.fire({
    title: `${featureName} - Próximamente`,
    html: `
            <div class="text-center">
                <i class="bi bi-tools" style="font-size: 3rem; color: var(--ch-blue); margin-bottom: 1rem;"></i>
                <p class="text-muted">Esta funcionalidad está en desarrollo y estará disponible en una futura actualización.</p>
                <p class="text-muted small">
                    <i class="bi bi-info-circle me-1"></i>
                    Mientras tanto, puedes usar todas las funciones de análisis de IA disponibles.
                </p>
            </div>
        `,
    icon: "info",
    confirmButtonColor: "#008FD0",
    confirmButtonText: "Entendido",
  });
}

// API utility functions
async function apiCall(endpoint, options = {}) {
  // Get auth token if available
  let authHeaders = {};
  if (
    window.authModule &&
    typeof window.authModule.getAuthHeader === "function"
  ) {
    try {
      const authHeader = await window.authModule.getAuthHeader();
      if (authHeader) {
        authHeaders = authHeader;
        console.log("Auth header added to request");
      } else {
        console.warn("No auth header available - user may not be logged in");
      }
    } catch (error) {
      console.warn("Could not get auth header:", error);
    }
  } else {
    console.warn("Auth module not available for API call");
  }

  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
  };

  const finalOptions = { ...defaultOptions, ...options };

  // Ensure endpoint starts with / and remove any double slashes
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${CONFIG.API_BASE_URL}${cleanEndpoint}`;

  try {
    const response = await fetch(url, finalOptions);

    // Handle 401 Unauthorized - redirect to login
    if (response.status === 401) {
      console.warn("Received 401 Unauthorized - redirecting to login");
      // Clear auth data
      if (
        window.authModule &&
        typeof window.authModule.signOut === "function"
      ) {
        window.authModule.signOut();
      }
      localStorage.removeItem("ai_verification_auth");
      // Store current page for redirect after login
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      sessionStorage.setItem("redirectAfterLogin", currentPath);
      // Redirect to login
      window.location.href = "login.html";
      throw new Error("Unauthorized - redirecting to login");
    }

    // Handle 403 Forbidden
    if (response.status === 403) {
      console.warn("Received 403 Forbidden - access denied");
      throw new Error("No tienes permisos para realizar esta acción");
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
}

// Utility functions
function formatDate(dateString) {
  if (!dateString) return "-";

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return dateString;
  }
}

function getStatusBadge(status) {
  const statusMap = {
    COMPLETED: { class: "badge-success", text: "Completado" },
    STARTED: { class: "badge-warning", text: "En Proceso" },
    FAILED: { class: "badge-danger", text: "Fallido" },
  };

  const statusInfo = statusMap[status] || {
    class: "badge-secondary",
    text: status,
  };
  return `<span class="badge ${statusInfo.class}">${statusInfo.text}</span>`;
}

function getScoreColor(score) {
  if (score >= 70) return "danger";
  if (score >= 40) return "warning";
  return "success";
}

// Error handling
function showError(message, title = "Error") {
  Swal.fire({
    icon: "error",
    title: title,
    text: message,
    confirmButtonColor: "#008FD0",
  });
}

function showSuccess(message, title = "Éxito") {
  Swal.fire({
    icon: "success",
    title: title,
    text: message,
    timer: 3000,
    showConfirmButton: false,
  });
}

// Loading states
function showLoading(message = "Cargando...") {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

function hideLoading() {
  Swal.close();
}

// Dashboard data loading (placeholder)
async function loadDashboardData() {
  try {
    // This will be implemented when the API is ready
    console.log("Loading dashboard data...");

    // For now, show placeholder data
    document.getElementById("totalAnalyses").textContent = "0";
    document.getElementById("avgAiScore").textContent = "0.0";

    // Load recent analyses
    loadRecentAnalyses();
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

async function loadRecentAnalyses() {
  const tableBody = document.getElementById("recentAnalysesTable");

  try {
    const response = await apiCall("/analysis?pageSize=5");
    const analyses = response.items || [];

    if (analyses.length === 0) {
      tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">
                        <i class="bi bi-inbox me-2"></i>
                        No hay análisis recientes
                    </td>
                </tr>
            `;
      return;
    }

    tableBody.innerHTML = analyses
      .map(
        (analysis) => `
            <tr>
                <td>${analysis.studentName || "-"}</td>
                <td>${analysis.course || "-"}</td>
                <td>${formatDate(analysis.createdAt)}</td>
                <td>
                    <span class="badge badge-${getScoreColor(
                      analysis.aiLikelihoodScore || 0,
                    )}">
                        ${analysis.aiLikelihoodScore || 0}%
                    </span>
                </td>
                <td>${getStatusBadge(analysis.status)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewAnalysis('${
                      analysis.analysisId
                    }')">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");
  } catch (error) {
    console.error("Error loading recent analyses:", error);
    // Show empty state instead of error for better UX
    tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    No hay análisis recientes
                </td>
            </tr>
        `;
  }
}

// History data loading (placeholder)
async function loadHistoryData() {
  console.log("Loading history data...");
  // This will be implemented when the API is ready
}

// Navigation to analysis detail
function viewAnalysis(analysisId) {
  window.location.href = `detail.html?id=${analysisId}`;
}

// Go back function for detail page
function goBack() {
  if (
    document.referrer &&
    document.referrer.includes(window.location.hostname)
  ) {
    window.history.back();
  } else {
    window.location.href = "index.html";
  }
}

// Settings functionality
function showSettingsSection() {
  hideAllSections();
  document.getElementById("settingsSection").style.display = "block";
  document.getElementById("pageTitle").textContent = "Configuración";
  updateActiveNavItem("Configuración");
  loadSettings();
}

function loadSettings() {
  const settings = getSettings();

  // Load platform settings
  const platformNameInput = document.getElementById("platformNameInput");
  if (platformNameInput) {
    platformNameInput.value = settings.platformName;
  }

  // Load dashboard settings
  document.getElementById("kpiPeriod").value = settings.kpiPeriod;
  document.getElementById("itemsPerPage").value = settings.itemsPerPage;
  document.getElementById("highRiskThreshold").value =
    settings.highRiskThreshold;
  document.getElementById("autoRefresh").checked = settings.autoRefresh;

  // Load interface settings
  document.getElementById("theme").value = settings.theme;
  document.getElementById("fontSize").value = settings.fontSize;
  document.getElementById("animations").checked = settings.animations;
  document.getElementById("sounds").checked = settings.sounds;

  // Update last saved time
  if (settings.lastSaved) {
    const lastSaved = new Date(settings.lastSaved);
    document.getElementById("lastSaved").innerHTML = `
            <i class="bi bi-clock me-1"></i>
            ${lastSaved.toLocaleDateString()} ${lastSaved.toLocaleTimeString()}
        `;
  }

  // Apply current settings
  applySettings(settings);
}

function getSettings() {
  const defaultSettings = {
    platformName: "EduTech AI",
    kpiPeriod: "30",
    itemsPerPage: "5",
    highRiskThreshold: "70",
    autoRefresh: true,
    theme: "light",
    fontSize: "normal",
    animations: true,
    sounds: false,
    lastSaved: null,
  };

  const savedSettings = localStorage.getItem("aiVerificationSettings");
  if (savedSettings) {
    return { ...defaultSettings, ...JSON.parse(savedSettings) };
  }

  return defaultSettings;
}

function saveSettings() {
  const platformNameInput = document.getElementById("platformNameInput");
  const settings = {
    platformName: platformNameInput ? platformNameInput.value : "EduTech AI",
    kpiPeriod: document.getElementById("kpiPeriod").value,
    itemsPerPage: document.getElementById("itemsPerPage").value,
    highRiskThreshold: document.getElementById("highRiskThreshold").value,
    autoRefresh: document.getElementById("autoRefresh").checked,
    theme: document.getElementById("theme").value,
    fontSize: document.getElementById("fontSize").value,
    animations: document.getElementById("animations").checked,
    sounds: document.getElementById("sounds").checked,
    lastSaved: new Date().toISOString(),
  };

  localStorage.setItem("aiVerificationSettings", JSON.stringify(settings));
  applySettings(settings);

  // Update last saved display
  const lastSaved = new Date(settings.lastSaved);
  document.getElementById("lastSaved").innerHTML = `
        <i class="bi bi-clock me-1"></i>
        ${lastSaved.toLocaleDateString()} ${lastSaved.toLocaleTimeString()}
    `;

  // Show success message
  Swal.fire({
    icon: "success",
    title: "¡Configuración guardada!",
    text: "Los cambios se han aplicado correctamente.",
    confirmButtonColor: "#008FD0",
    timer: 2000,
    showConfirmButton: false,
  });

  // Refresh dashboard if we're on it
  if (document.getElementById("dashboardSection").style.display !== "none") {
    setTimeout(() => {
      if (typeof loadDashboardKPIs === "function") {
        loadDashboardKPIs();
      }
    }, 500);
  }
}

function resetSettings() {
  Swal.fire({
    title: "¿Restaurar configuración?",
    text: "Se restaurarán todos los valores predeterminados.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#008FD0",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Restaurar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem("aiVerificationSettings");
      loadSettings();

      Swal.fire({
        icon: "success",
        title: "¡Configuración restaurada!",
        text: "Se han restaurado los valores predeterminados.",
        confirmButtonColor: "#008FD0",
        timer: 2000,
        showConfirmButton: false,
      });
    }
  });
}

function applySettings(settings) {
  // Apply platform name
  updatePlatformName(settings.platformName);

  // Apply theme
  document.body.setAttribute("data-theme", settings.theme);

  // Apply font size
  document.body.setAttribute("data-font-size", settings.fontSize);

  // Apply animations
  if (!settings.animations) {
    document.body.classList.add("no-animations");
  } else {
    document.body.classList.remove("no-animations");
  }

  // Store settings globally for other functions to use
  window.appSettings = settings;
}

function updatePlatformName(platformName) {
  // Update platform name in sidebar
  const platformNameElement = document.getElementById("platformName");
  if (platformNameElement) {
    platformNameElement.textContent = platformName;
  }

  // Update page title
  const currentTitle = document.title;
  const titleParts = currentTitle.split(" - ");
  if (titleParts.length > 1) {
    document.title = `${platformName} - ${titleParts.slice(1).join(" - ")}`;
  } else {
    document.title = platformName;
  }
}

// Initialize settings on page load
document.addEventListener("DOMContentLoaded", function () {
  const settings = getSettings();
  applySettings(settings);

  // Setup settings form handler
  setTimeout(() => {
    const settingsForm = document.getElementById("settingsForm");
    if (settingsForm) {
      settingsForm.addEventListener("submit", function (e) {
        e.preventDefault();
        saveSettings();
      });
    }
  }, 100);
});

// Export functions for global access
window.showSettingsSection = showSettingsSection;
window.resetSettings = resetSettings;

// Function to show exam analytics section
function showExamAnalyticsSection() {
  // Redirect to exam history page with analytics view
  window.location.href = "exam-history.html#analytics";
}

// Make function globally available
window.showExamAnalyticsSection = showExamAnalyticsSection;

// Show admin section in sidebar if user is admin
function showAdminSectionIfAdmin() {
  try {
    // For now, show admin section for all authenticated users
    // In production, this should check the user role from Cognito
    const isAuthenticated = window.SessionManager
      ? window.SessionManager.isAuthenticated()
      : false;

    console.log("Checking admin status - isAuthenticated:", isAuthenticated);

    // Show admin sections for all authenticated users (temporary for testing)
    if (isAuthenticated) {
      const adminSections = document.querySelectorAll(".admin-only-section");
      adminSections.forEach((section) => {
        section.style.display = "block";
      });
      console.log("Admin sections shown:", adminSections.length);
    }
  } catch (error) {
    console.error("Error checking admin status:", error);
  }
}

// Call on page load to show admin section
document.addEventListener("DOMContentLoaded", function () {
  // Small delay to ensure auth is loaded
  setTimeout(showAdminSectionIfAdmin, 500);
});

// Make function globally available
window.showAdminSectionIfAdmin = showAdminSectionIfAdmin;
