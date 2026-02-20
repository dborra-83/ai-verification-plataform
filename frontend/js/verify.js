/**
 * Verification Page Logic
 * Handles email verification with confirmation code
 */

// Initialize Auth Module with Cognito configuration
let auth = null;

// Wait for AuthModule to be available
function initAuth() {
  if (window.AuthModule && window.COGNITO_CONFIG) {
    auth = new window.AuthModule(
      window.COGNITO_CONFIG.USER_POOL_ID,
      window.COGNITO_CONFIG.APP_CLIENT_ID,
      window.COGNITO_CONFIG.REGION,
    );

    // Check if already authenticated
    if (auth.isAuthenticated()) {
      window.location.href = "index.html";
    }

    // Initialize email after auth is ready
    initializeEmail();
  } else {
    // Retry after a short delay
    setTimeout(initAuth, 100);
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", initAuth);

// DOM elements
const verifyForm = document.getElementById("verifyForm");
const verificationCodeInput = document.getElementById("verificationCode");
const emailDisplay = document.getElementById("emailDisplay");
const verifyBtn = document.getElementById("verifyBtn");
const resendBtn = document.getElementById("resendBtn");
const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");
const loadingIndicator = document.getElementById("loadingIndicator");

// Get email from URL parameter or sessionStorage
let userEmail = null;

function getEmail() {
  // Try URL parameter first
  const urlParams = new URLSearchParams(window.location.search);
  const emailFromUrl = urlParams.get("email");

  if (emailFromUrl) {
    return emailFromUrl;
  }

  // Fallback to sessionStorage
  const emailFromSession = sessionStorage.getItem("verificationEmail");
  if (emailFromSession) {
    return emailFromSession;
  }

  return null;
}

// Initialize email (called after auth is ready)
function initializeEmail() {
  userEmail = getEmail();

  if (!userEmail) {
    // No email found, redirect to signup
    showMessage(
      errorMessage,
      "No se encontró el correo electrónico. Redirigiendo...",
    );
    setTimeout(() => {
      window.location.href = "signup.html";
    }, 2000);
  } else {
    // Display email
    emailDisplay.textContent = userEmail;
  }
}

// Handle verify form submission
verifyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!userEmail) {
    showMessage(errorMessage, "No se encontró el correo electrónico");
    return;
  }

  // Clear previous messages
  hideMessage(errorMessage);
  hideMessage(successMessage);

  // Get verification code
  const code = verificationCodeInput.value.trim();

  // Validate code format
  if (!/^\d{6}$/.test(code)) {
    showMessage(errorMessage, "El código debe ser de 6 dígitos");
    return;
  }

  // Show loading indicator
  showLoading(true);

  try {
    // Call confirmSignUp method
    const result = await auth.confirmSignUp(userEmail, code);

    // Hide loading indicator
    showLoading(false);

    if (result.success) {
      // Show success message
      showMessage(successMessage, result.message);

      // Clear stored email
      sessionStorage.removeItem("verificationEmail");

      // Redirect to login page after 2 seconds
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000);
    } else {
      // Show error message
      showMessage(errorMessage, result.message);
    }
  } catch (error) {
    console.error("Verification error:", error);
    showLoading(false);
    showMessage(
      errorMessage,
      "Ocurrió un error inesperado. Por favor intenta de nuevo.",
    );
  }
});

// Handle resend button click
resendBtn.addEventListener("click", async () => {
  if (!userEmail) {
    showMessage(errorMessage, "No se encontró el correo electrónico");
    return;
  }

  // Clear previous messages
  hideMessage(errorMessage);
  hideMessage(successMessage);

  // Disable resend button temporarily
  resendBtn.disabled = true;

  try {
    // Call resendConfirmationCode method
    const result = await auth.resendConfirmationCode(userEmail);

    if (result.success) {
      // Show success message
      showMessage(successMessage, result.message);

      // Re-enable button after 30 seconds
      setTimeout(() => {
        resendBtn.disabled = false;
      }, 30000);
    } else {
      // Show error message
      showMessage(errorMessage, result.message);
      resendBtn.disabled = false;
    }
  } catch (error) {
    console.error("Resend error:", error);
    showMessage(
      errorMessage,
      "Ocurrió un error inesperado. Por favor intenta de nuevo.",
    );
    resendBtn.disabled = false;
  }
});

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
    verifyBtn.disabled = true;
    resendBtn.disabled = true;
  } else {
    loadingIndicator.classList.add("d-none");
    verifyBtn.disabled = false;
    resendBtn.disabled = false;
  }
}
