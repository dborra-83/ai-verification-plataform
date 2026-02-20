/**
 * Route Guard Module
 * Protects routes by checking authentication status
 */

(function () {
  "use strict";

  console.log("Route guard loaded");

  // Pages that don't require authentication
  const publicPages = [
    "login.html",
    "signup.html",
    "verify.html",
    "forgot-password.html",
  ];

  // Check if current page is public
  function isPublicPage() {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";
    return publicPages.includes(currentPage);
  }

  // Initialize route guard
  document.addEventListener("DOMContentLoaded", async () => {
    // Skip auth check for public pages
    if (isPublicPage()) {
      console.log("Public page - skipping auth check");
      return;
    }

    // Wait for auth module to be ready
    await waitForAuthModule();

    // Check authentication
    const isAuthenticated = checkAuthentication();

    if (isAuthenticated) {
      // Initialize topbar with user info
      initializeTopbar();
    }
  });

  // Wait for auth module to be available
  async function waitForAuthModule() {
    const maxAttempts = 30;
    let attempts = 0;

    while (!window.authModule && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    return window.authModule !== null;
  }

  // Check if user is authenticated
  function checkAuthentication() {
    try {
      if (window.authModule && window.authModule.isAuthenticated()) {
        return true;
      }

      // Fallback: check localStorage directly
      const authData = localStorage.getItem("ai_verification_auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed && parsed.accessToken) {
          return true;
        }
      }

      // Not authenticated - redirect to login
      console.log("Not authenticated, redirecting to login...");

      // Store intended destination
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      sessionStorage.setItem("redirectAfterLogin", currentPath);

      window.location.href = "login.html";
      return false;
    } catch (error) {
      console.error("Auth check error:", error);
      window.location.href = "login.html";
      return false;
    }
  }

  // Initialize topbar with user info
  function initializeTopbar() {
    try {
      // Get user email
      let email = null;

      if (
        window.authModule &&
        typeof window.authModule.getCurrentUserEmail === "function"
      ) {
        email = window.authModule.getCurrentUserEmail();
      }

      if (!email) {
        // Fallback: get from localStorage
        const authData = localStorage.getItem("ai_verification_auth");
        if (authData) {
          const parsed = JSON.parse(authData);
          email = parsed.email;
        }
      }

      // Update user email display
      const userEmailElement = document.getElementById("user-email");
      if (userEmailElement && email) {
        userEmailElement.textContent = email;
      }

      // Setup logout button
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
      }

      // Also handle any element with onclick="logout()"
      // This is handled by app.js
    } catch (error) {
      console.error("Topbar initialization error:", error);
    }
  }

  // Handle logout
  function handleLogout() {
    if (window.authModule && typeof window.authModule.signOut === "function") {
      window.authModule.signOut();
    }
    localStorage.removeItem("ai_verification_auth");
    window.location.href = "login.html";
  }

  // Export for global access
  window.RouteGuard = {
    checkAuthentication,
    initializeTopbar,
    handleLogout,
  };
})();
