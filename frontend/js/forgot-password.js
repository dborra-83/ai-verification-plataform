/**
 * Forgot Password Page JavaScript
 * Handles password reset flow with Cognito
 */

let authModule = null;
let userEmail = "";

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", async function () {
  await initAuthModule();
  setupEventListeners();
});

// Initialize Auth Module
async function initAuthModule() {
  if (window.COGNITO_CONFIG && window.AuthModule) {
    try {
      authModule = new window.AuthModule(
        window.COGNITO_CONFIG.USER_POOL_ID,
        window.COGNITO_CONFIG.APP_CLIENT_ID,
        window.COGNITO_CONFIG.REGION,
      );
    } catch (error) {
      console.error("Failed to initialize auth module:", error);
      showAlert("Error al inicializar. Recarga la página.", "danger");
    }
  } else {
    showAlert("Error de configuración. Contacta al administrador.", "danger");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Request code form
  document
    .getElementById("requestCodeForm")
    .addEventListener("submit", handleRequestCode);

  // Reset password form
  document
    .getElementById("resetPasswordForm")
    .addEventListener("submit", handleResetPassword);

  // Back to step 1 button
  document
    .getElementById("backToStep1Btn")
    .addEventListener("click", goToStep1);
}

// Handle request code submission
async function handleRequestCode(e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();

  if (!email) {
    showAlert("Por favor ingresa tu correo electrónico", "warning");
    return;
  }

  // Store email for step 2
  userEmail = email;

  // Show loading state
  setButtonLoading("requestCodeBtn", true);

  try {
    const result = await authModule.forgotPassword(email);

    if (result.success) {
      showAlert("Código enviado a tu correo electrónico", "success");
      goToStep2();
    } else {
      showAlert(result.message, "danger");
    }
  } catch (error) {
    console.error("Request code error:", error);
    showAlert("Error al enviar el código. Intenta de nuevo.", "danger");
  } finally {
    setButtonLoading("requestCodeBtn", false);
  }
}

// Handle reset password submission
async function handleResetPassword(e) {
  e.preventDefault();

  const code = document.getElementById("verificationCode").value.trim();
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Validate inputs
  if (!code || code.length !== 6) {
    showAlert("El código debe tener 6 dígitos", "warning");
    return;
  }

  if (!newPassword) {
    showAlert("Por favor ingresa una nueva contraseña", "warning");
    return;
  }

  if (newPassword !== confirmPassword) {
    showAlert("Las contraseñas no coinciden", "warning");
    return;
  }

  // Validate password strength
  if (!validatePassword(newPassword)) {
    showAlert("La contraseña no cumple con los requisitos mínimos", "warning");
    return;
  }

  // Show loading state
  setButtonLoading("resetPasswordBtn", true);

  try {
    const result = await authModule.confirmPassword(
      userEmail,
      code,
      newPassword,
    );

    if (result.success) {
      showAlert(
        "¡Contraseña restablecida exitosamente! Redirigiendo...",
        "success",
      );

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = "login.html?message=password_reset";
      }, 2000);
    } else {
      showAlert(result.message, "danger");
    }
  } catch (error) {
    console.error("Reset password error:", error);
    showAlert(
      "Error al restablecer la contraseña. Intenta de nuevo.",
      "danger",
    );
  } finally {
    setButtonLoading("resetPasswordBtn", false);
  }
}

// Validate password strength
function validatePassword(password) {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return minLength && hasUppercase && hasLowercase && hasNumber;
}

// Go to step 2
function goToStep2() {
  document.getElementById("step1").style.display = "none";
  document.getElementById("step2").style.display = "block";

  // Update step indicators
  document.getElementById("step1Indicator").classList.remove("active");
  document.getElementById("step1Indicator").classList.add("completed");
  document.getElementById("step1Indicator").innerHTML =
    '<i class="bi bi-check"></i>';
  document.getElementById("stepLine").classList.add("completed");
  document.getElementById("step2Indicator").classList.remove("inactive");
  document.getElementById("step2Indicator").classList.add("active");

  // Update description
  document.getElementById("stepDescription").textContent =
    "Ingresa el código y tu nueva contraseña";

  // Focus on code input
  document.getElementById("verificationCode").focus();
}

// Go back to step 1
function goToStep1() {
  document.getElementById("step2").style.display = "none";
  document.getElementById("step1").style.display = "block";

  // Reset step indicators
  document.getElementById("step1Indicator").classList.add("active");
  document.getElementById("step1Indicator").classList.remove("completed");
  document.getElementById("step1Indicator").innerHTML = "1";
  document.getElementById("stepLine").classList.remove("completed");
  document.getElementById("step2Indicator").classList.add("inactive");
  document.getElementById("step2Indicator").classList.remove("active");

  // Update description
  document.getElementById("stepDescription").textContent =
    "Ingresa tu correo para recibir un código de verificación";

  // Clear step 2 form
  document.getElementById("verificationCode").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";

  // Clear alerts
  document.getElementById("alertContainer").innerHTML = "";
}

// Show alert message
function showAlert(message, type) {
  const alertContainer = document.getElementById("alertContainer");
  const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
  alertContainer.innerHTML = alertHtml;

  // Auto-dismiss after 5 seconds for non-error alerts
  if (type !== "danger") {
    setTimeout(() => {
      const alert = alertContainer.querySelector(".alert");
      if (alert) {
        alert.remove();
      }
    }, 5000);
  }
}

// Set button loading state
function setButtonLoading(buttonId, isLoading) {
  const button = document.getElementById(buttonId);
  const btnText = button.querySelector(".btn-text");
  const spinner = button.querySelector(".spinner-border");

  if (isLoading) {
    button.disabled = true;
    btnText.classList.add("d-none");
    spinner.classList.remove("d-none");
  } else {
    button.disabled = false;
    btnText.classList.remove("d-none");
    spinner.classList.add("d-none");
  }
}
