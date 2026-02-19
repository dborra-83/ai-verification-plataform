/**
 * Signup Page Logic
 * Handles user registration form submission and validation
 */

import AuthModule from "./auth.js";

// Initialize Auth Module with Cognito configuration
const auth = new AuthModule(
  window.COGNITO_CONFIG.USER_POOL_ID,
  window.COGNITO_CONFIG.APP_CLIENT_ID,
  window.COGNITO_CONFIG.REGION,
);

// DOM elements
const signupForm = document.getElementById("signupForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const signupBtn = document.getElementById("signupBtn");
const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");
const loadingIndicator = document.getElementById("loadingIndicator");

// Handle form submission
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Clear previous messages
  hideMessage(errorMessage);
  hideMessage(successMessage);

  // Get form values
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Validate password confirmation
  if (password !== confirmPassword) {
    showMessage(errorMessage, "Las contraseñas no coinciden");
    return;
  }

  // Validate password requirements
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    showMessage(errorMessage, passwordValidation.message);
    return;
  }

  // Show loading indicator
  showLoading(true);

  try {
    // Call signUp method
    const result = await auth.signUp(email, password);

    // Hide loading indicator
    showLoading(false);

    if (result.success) {
      // Show success message
      showMessage(successMessage, result.message);

      // Store email for verification page
      sessionStorage.setItem("verificationEmail", email);

      // Redirect to verification page after 2 seconds
      setTimeout(() => {
        window.location.href = `verify.html?email=${encodeURIComponent(email)}`;
      }, 2000);
    } else {
      // Show error message
      showMessage(errorMessage, result.message);
    }
  } catch (error) {
    console.error("Signup error:", error);
    showLoading(false);
    showMessage(
      errorMessage,
      "Ocurrió un error inesperado. Por favor intenta de nuevo.",
    );
  }
});

/**
 * Validate password meets requirements
 */
function validatePassword(password) {
  if (password.length < 8) {
    return {
      valid: false,
      message: "La contraseña debe tener al menos 8 caracteres",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "La contraseña debe contener al menos una letra mayúscula",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "La contraseña debe contener al menos una letra minúscula",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "La contraseña debe contener al menos un número",
    };
  }

  return { valid: true };
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
    signupBtn.disabled = true;
  } else {
    loadingIndicator.classList.add("d-none");
    signupBtn.disabled = false;
  }
}

// Check if already authenticated
if (auth.isAuthenticated()) {
  window.location.href = "index.html";
}
