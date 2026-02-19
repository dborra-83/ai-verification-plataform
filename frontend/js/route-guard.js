/**
 * Route Guard Module
 * Protects routes by checking authentication status
 * Note: This uses a global AuthModule instance created by auth.js
 */

(function () {
  "use strict";

  // Wait for auth.js to load and create global auth instance
  let authModule = null;

  /**
   * Initialize auth module
   */
  function initAuth() {
    if (window.AuthModule && window.COGNITO_CONFIG) {
      authModule = new window.AuthModule(
        window.COGNITO_CONFIG.USER_POOL_ID,
        window.COGNITO_CONFIG.APP_CLIENT_ID,
        window.COGNITO_CONFIG.REGION,
      );
      return true;
    }
    return false;
  }

  /**
   * Check if user is authenticated
   * Redirects to login if not authenticated
   */
  async function checkAuth() {
    // Initialize auth if not already done
    if (!authModule && !initAuth()) {
      console.error("Auth module not initialized");
      return false;
    }

    // Check if user has valid authentication
    if (!authModule.isAuthenticated()) {
      // Store intended destination
      sessionStorage.setItem("redirectAfterLogin", window.location.pathname);
      // Redirect to login
      window.location.href = "/login.html";
      return false;
    }

    // Verify token is still valid (triggers refresh if needed)
    const token = await authModule.getAccessToken();
    if (!token) {
      // Token refresh failed, redirect to login
      sessionStorage.setItem("redirectAfterLogin", window.location.pathname);
      window.location.href = "/login.html";
      return false;
    }

    return true;
  }

  /**
   * Initialize topbar with user email and logout button
   */
  function initializeTopbar() {
    if (!authModule && !initAuth()) {
      return;
    }

    const email = authModule.getCurrentUserEmail();

    // Update user email display
    const userEmailElement = document.getElementById("user-email");
    if (userEmailElement && email) {
      userEmailElement.textContent = email;
    }

    // Add logout functionality
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        authModule.signOut();
        window.location.href = "/login.html";
      });
    }

    // Also handle logout from sidebar
    const sidebarLogoutLinks = document.querySelectorAll(
      'a[onclick*="logout"]',
    );
    sidebarLogoutLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        authModule.signOut();
        window.location.href = "/login.html";
      });
    });
  }

  /**
   * Handle post-login redirect
   */
  function handlePostLoginRedirect() {
    const redirectPath = sessionStorage.getItem("redirectAfterLogin");
    if (redirectPath && redirectPath !== "/login.html") {
      sessionStorage.removeItem("redirectAfterLogin");
      window.location.href = redirectPath;
    }
  }

  // Make functions globally available
  window.checkAuth = checkAuth;
  window.initializeTopbar = initializeTopbar;
  window.handlePostLoginRedirect = handlePostLoginRedirect;

  // Auto-initialize on protected pages
  if (
    window.location.pathname !== "/login.html" &&
    window.location.pathname !== "/signup.html" &&
    window.location.pathname !== "/verify.html" &&
    window.location.pathname !== "/forgot-password.html"
  ) {
    document.addEventListener("DOMContentLoaded", async () => {
      const authenticated = await checkAuth();
      if (authenticated) {
        initializeTopbar();
      }
    });
  }
})();
