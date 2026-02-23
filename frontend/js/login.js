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
    initializeForm();
  } else {
    setTimeout(initAuth, 100);
  }
}

// Initialize form elements and event listeners
function initializeForm() {
  loginForm = document.getElementById("loginForm");
  emailInput = document.getElementById("username");
  passwordInput = document.getElementById("password");
  loginBtn = document.querySelector('button[type="submit"]');

  if (!document.getElementById("errorMessage")) {
    const errorDiv = document.createElement("div");
    errorDiv.id = "errorMessage";
    errorDiv.className = "alert alert-danger d-none mb-3";
    errorDiv.setAttribute("role", "alert");
    loginForm.insertBefore(errorDiv, loginBtn);
  }
  errorMessage = document.getElementById("errorMessage");

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

  if (loginForm) {
    loginForm.addEventListener("submit", handleFormSubmit);
  }
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", initAuth);

// Handle form submission
async function handleFormSubmit(e) {
  e.preventDefault();

  hideMessage(errorMessage);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage(errorMessage, "Por favor ingrese email y contraseña");
    return;
  }

  if (!auth) {
    showMessage(
      errorMessage,
      "El módulo de autenticación no está listo. Recarga la página.",
    );
    return;
  }

  showLoading(true);

  try {
    const result = await auth.signIn(email, password);

    showLoading(false);

    if (result.success) {
      // Extract user role from ID token
      try {
        const idToken = result.tokens.IdToken;
        if (idToken) {
          const payload = JSON.parse(atob(idToken.split(".")[1]));
          const userRole =
            payload["custom:role"] || payload["profile"] || "teacher";
          localStorage.setItem("userRole", userRole);
        }
      } catch (tokenError) {
        localStorage.setItem("userRole", "teacher");
      }

      const redirectUrl = sessionStorage.getItem("redirectAfterLogin");
      if (redirectUrl) {
        sessionStorage.removeItem("redirectAfterLogin");
        window.location.href = redirectUrl;
      } else {
        window.location.href = "index.html";
      }
    } else if (result.challenge === "NEW_PASSWORD_REQUIRED") {
      showNewPasswordForm(result.email);
    } else {
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
 * Show new password form for admin-created users (NEW_PASSWORD_REQUIRED challenge)
 */
async function showNewPasswordForm(email) {
  const { value: formValues } = await Swal.fire({
    title: "Establece tu nueva contraseña",
    html: `
      <p class="text-muted mb-3">Es tu primer inicio de sesión. Debes crear una contraseña personal.</p>
      <input id="swal-new-password" type="password" class="swal2-input" placeholder="Nueva contraseña">
      <input id="swal-confirm-password" type="password" class="swal2-input" placeholder="Confirmar contraseña">
      <div id="swal-pw-error" class="text-danger mt-2 small d-none"></div>
    `,
    confirmButtonText: "Guardar contraseña",
    confirmButtonColor: "#4361ee",
    showCancelButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    focusConfirm: false,
    preConfirm: () => {
      const newPw = document.getElementById("swal-new-password").value;
      const confirmPw = document.getElementById("swal-confirm-password").value;
      const errEl = document.getElementById("swal-pw-error");

      if (!newPw || !confirmPw) {
        errEl.textContent = "Por favor completa ambos campos.";
        errEl.classList.remove("d-none");
        return false;
      }
      if (newPw !== confirmPw) {
        errEl.textContent = "Las contraseñas no coinciden.";
        errEl.classList.remove("d-none");
        return false;
      }
      if (newPw.length < 8) {
        errEl.textContent = "La contraseña debe tener al menos 8 caracteres.";
        errEl.classList.remove("d-none");
        return false;
      }
      if (
        !/[A-Z]/.test(newPw) ||
        !/[a-z]/.test(newPw) ||
        !/[0-9]/.test(newPw)
      ) {
        errEl.textContent = "Debe incluir mayúsculas, minúsculas y números.";
        errEl.classList.remove("d-none");
        return false;
      }
      return { newPassword: newPw };
    },
  });

  if (!formValues) return;

  try {
    Swal.showLoading();
    const result = await auth.completeNewPasswordChallenge(
      email,
      formValues.newPassword,
    );
    if (result.success) {
      await Swal.fire({
        icon: "success",
        title: "¡Contraseña establecida!",
        text: "Tu contraseña fue actualizada. Bienvenido.",
        confirmButtonColor: "#4361ee",
        timer: 2000,
        showConfirmButton: false,
      });
      window.location.href = "index.html";
    } else {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: result.message || "No se pudo establecer la contraseña.",
        confirmButtonColor: "#4361ee",
      });
    }
  } catch (err) {
    console.error("completeNewPasswordChallenge error:", err);
    Swal.fire({
      icon: "error",
      title: "Error inesperado",
      text: "Ocurrió un error. Por favor intenta de nuevo.",
      confirmButtonColor: "#4361ee",
    });
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
