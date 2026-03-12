// Platform Configuration Manager
// Handles dynamic platform name updates across all pages
// Also provides Cognito authentication configuration

(function () {
  "use strict";

  // Cognito Configuration
  // These values are populated automatically by the deployment script
  // from CDK CloudFormation outputs
  window.COGNITO_CONFIG = {
    USER_POOL_ID: "us-east-1_VKapStaTX",
    APP_CLIENT_ID: "4e7s433tn59uaigp7lh0imhrjp",
    REGION: "us-east-1",
  };

  // Initialize platform configuration on page load
  document.addEventListener("DOMContentLoaded", function () {
    initializePlatformConfig();
  });

  function initializePlatformConfig() {
    // Get saved platform name — check platformConfig first (set by admin), then aiVerificationSettings
    const platformConfig = getPlatformConfig();
    const settings = getSettings();
    const platformName =
      platformConfig.platformName || settings.platformName || "EduTech AI";

    // Update platform name elements
    updatePlatformName(platformName);

    // Update page title
    updatePageTitle(platformName);

    // Apply logo if set
    if (platformConfig.logoUrl) {
      const logoIcon = document.querySelector(".sidebar-logo-icon i");
      const logoImg = document.querySelector(".sidebar-logo-icon img");
      if (logoIcon && !logoImg) {
        const img = document.createElement("img");
        img.src = platformConfig.logoUrl;
        img.alt = "Logo";
        img.style.cssText = "max-height:36px;max-width:36px;border-radius:6px;";
        logoIcon.parentElement.innerHTML = "";
        logoIcon.parentElement.appendChild(img);
      }
    }
  }

  function getPlatformConfig() {
    try {
      return JSON.parse(localStorage.getItem("platformConfig") || "{}");
    } catch (e) {
      return {};
    }
  }

  function updatePlatformName(platformName) {
    // Update sidebar platform name
    const platformNameElement = document.getElementById("platformName");
    if (platformNameElement) {
      platformNameElement.textContent = platformName;
    }

    // Update any other platform name references
    const platformElements = document.querySelectorAll("[data-platform-name]");
    platformElements.forEach((element) => {
      element.textContent = platformName;
    });
  }

  function updatePageTitle(platformName) {
    // Update page title while preserving the page-specific part
    const currentTitle = document.title;
    const titleParts = currentTitle.split(" - ");

    if (titleParts.length > 1) {
      // Replace the first part (platform name) with the new name
      document.title = `${platformName} - ${titleParts.slice(1).join(" - ")}`;
    } else {
      // If no separator found, just use the platform name
      document.title = platformName;
    }
  }

  // Make functions globally available
  window.updatePlatformName = updatePlatformName;
  window.updatePageTitle = updatePageTitle;
  window.PlatformConfig = { applyConfig: initializePlatformConfig };

  // Helper function to get settings (fallback if app.js not loaded)
  function getSettings() {
    try {
      // Try to use the global getSettings function if available
      if (typeof window.getSettings === "function") {
        return window.getSettings();
      }

      // Fallback to direct localStorage access
      const savedSettings = localStorage.getItem("aiVerificationSettings");
      if (savedSettings) {
        return JSON.parse(savedSettings);
      }

      // Default settings
      return {
        platformName: "EduTech AI",
      };
    } catch (error) {
      console.warn("Error loading platform settings:", error);
      return {
        platformName: "EduTech AI",
      };
    }
  }
})();
