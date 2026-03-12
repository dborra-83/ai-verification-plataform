/**
 * Theme manager — light / dark mode
 * Reads from localStorage('theme'). Applies 'dark' class to <html>.
 */
(function () {
  "use strict";

  function getTheme() {
    return localStorage.getItem("theme") || "light";
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
    updateThemeToggle(theme);
  }

  function toggleTheme() {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
  }

  function updateThemeToggle(theme) {
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.innerHTML =
        theme === "dark"
          ? '<i class="bi bi-sun-fill"></i>'
          : '<i class="bi bi-moon-fill"></i>';
      btn.title =
        theme === "dark"
          ? "Modo claro / Light mode"
          : "Modo oscuro / Dark mode";
    });
  }

  // Apply immediately (before DOMContentLoaded) to avoid flash
  applyTheme(getTheme());

  document.addEventListener("DOMContentLoaded", function () {
    updateThemeToggle(getTheme());
  });

  window.ThemeManager = { getTheme, applyTheme, toggleTheme };
})();
