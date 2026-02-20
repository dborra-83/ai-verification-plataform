/**
 * Login Page Logic
 * Handles user login with Cognito authentication
 */

// Initialize Auth Module
let auth = null;

// DOM elements
let loginForm, emailInput, passwordInput, loginBtn;
let errorMessage, loadingIndicator;

// Wait for AuthModule to be available
function initAuth() {
  if (window.AuthModule && window.COGNITO_CONFIG) {
    auth = new window.AuthModule(
      window.COGNITO_CONFIG.USER_POOL_ID,
      window.COGNITO_CONFIG.APP_CLIENT_ID,
      window.COGNITO_CONFIG.REGION,
    );

    // DON'T auto-redirect even if authenticated
    // This prevents the redirect loop
    // User can login again or navigate manually

    // Initialize form
    initializeForm();
  } else {
    // Retry after a short delay
    setTimeout(initAuth, 100);
  }
}

// Initialize form elements and event listeners
function initializeForm() {
  // Get DOM elements
  loginForm = document.getElementById("loginForm");
  emailInput = document.getElementById("username"); // Using username field for email
  passwordInput = document.getElementById("password");
  loginBtn = document.querySelector('button[type="submit"]');

  // Create error message element if it doesn't exist
  if (!document.getElementById("errorMessage")) {
    const errorDiv = document.createElement("div");
    errorDiv.id = "errorMessage";
    errorDiv.className = "alert alert-danger d-none mb-3";
    errorDiv.setAttribute("role", "alert");
    loginForm.insertBefore(errorDiv, loginBtn);
  }
  errorMessage = document.getElementById("errorMessage");

  // Create loading indicator if it doesn't exist
  if (!document.getElementById("loadingIndicator")) {
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "loadingIndicator";
    loadingDiv.className = "text-center mb-3 d-none";
    loadingDiv.innerHTML = `
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Cargando...</span>
      </div>
      <p class="mt-2 text-muted">Iniciando sesión...</p>
    `;
    loginForm.insertBefore(loadingDiv, loginBtn);
  }
  loadingIndicator = document.getElementById("loadingIndicator");

  // Register form submit handler
  if (loginForm) {
    loginForm.addEventListener("submit", handleFormSubmit);
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", initAuth);

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();

  console.log("Form submitted");

  // Clear previous messages
  hideMessage(errorMessage);

  // Get form values
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  console.log("Email:", email);

  // Validate inputs
  if (!email || !password) {
    showMessage(errorMessage, "Por favor ingrese email y contraseña");
    return;
  }

  // Check if auth is ready
  if (!auth) {
    console.error("Auth module not initialized");
    showMessage(
      errorMessage,
      "El módulo de autenticación no está listo. Recarga la página.",
    );
    return;
  }

  // Show loading indicator
  showLoading(true);

  try {
    console.log("Calling auth.signIn...");
    // Call signIn method
    const result = await auth.signIn(email, password);

    console.log("SignIn result:", result);

    // Hide loading indicator
    showLoading(false);

    if (result.success) {
      console.log("Login successful, extracting user role...");

      // Extract user role from ID token
      try {
        const idToken = result.tokens.IdToken;
        if (idToken) {
          // Decode JWT payload (base64)
          const payload = JSON.parse(atob(idToken.split(".")[1]));
          const userRole = payload["custom:role"] || "teacher";
          console.log("User role from token:", userRole);

          // Store user role
          localStorage.setItem("userRole", userRole);
        }
      } catch (tokenError) {
        console.error("Error extracting role from token:", tokenError);
        // Default to teacher role if extraction fails
        localStorage.setItem("userRole", "teacher");
      }

      console.log("Redirecting...");
      // Check for stored redirect destination
      const redirectUrl = sessionStorage.getItem("redirectAfterLogin");
      if (redirectUrl) {
        sessionStorage.removeItem("redirectAfterLogin");
        console.log("Redirecting to stored destination:", redirectUrl);
        window.location.href = redirectUrl;
      } else {
        // Default to dashboard
        window.location.href = "index.html";
      }
    } else {
      console.log("Login failed:", result.message);
      // Show error message
      showMessage(errorMessage, result.message);
    }
  } catch (error) {
    console.error("Login error:", error);
    showLoading(false);
    showMessage(
      errorMessage,
      "Ocurrió un error inesperado. Por favor intenta de nuevo.",
    );
  }
}

/**
 * Show message in alert element
 */
function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("d-none");
}

/**
 * Hide message alert element
 */
function hideMessage(element) {
  element.classList.add("d-none");
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
  if (show) {
    loadingIndicator.classList.remove("d-none");
    loginBtn.disabled = true;
  } else {
    loadingIndicator.classList.add("d-none");
    loginBtn.disabled = false;
  }
}
