(function () {
  "use strict";

  const publicPages = [
    "login.html",
    "signup.html",
    "verify.html",
    "forgot-password.html",
  ];

  function isPublicPage() {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";
    return publicPages.includes(currentPage);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (isPublicPage()) return;

    await waitForAuthModule();

    const isAuthenticated = checkAuthentication();
    if (isAuthenticated) {
      initializeTopbar();
    }
  });

  async function waitForAuthModule() {
    const maxAttempts = 30;
    let attempts = 0;
    while (!window.authModule && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }
    return window.authModule !== null;
  }

  function checkAuthentication() {
    try {
      if (window.authModule && window.authModule.isAuthenticated()) {
        return true;
      }

      const authData = localStorage.getItem("ai_verification_auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed && parsed.accessToken) {
          return true;
        }
      }

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

  function initializeTopbar() {
    try {
      let email = null;

      if (
        window.authModule &&
        typeof window.authModule.getCurrentUserEmail === "function"
      ) {
        email = window.authModule.getCurrentUserEmail();
      }

      if (!email) {
        const authData = localStorage.getItem("ai_verification_auth");
        if (authData) {
          email = JSON.parse(authData).email;
        }
      }

      const userEmailElement = document.getElementById("user-email");
      if (userEmailElement && email) {
        userEmailElement.textContent = email;
      }

      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
      }
    } catch (error) {
      console.error("Topbar initialization error:", error);
    }
  }

  function handleLogout() {
    if (window.authModule && typeof window.authModule.signOut === "function") {
      window.authModule.signOut();
    }
    localStorage.removeItem("ai_verification_auth");
    window.location.href = "login.html";
  }

  window.RouteGuard = {
    checkAuthentication,
    initializeTopbar,
    handleLogout,
  };
})();
