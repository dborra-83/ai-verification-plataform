/**
 * i18n — Internationalization module (ES / EN)
 * Usage: add data-i18n="key" to any element.
 * The module reads the current lang from localStorage('lang') and applies translations.
 */
(function () {
  "use strict";

  const translations = {
    es: {
      // Nav sections
      "nav.detection": "Detección de IA",
      "nav.about": "Acerca de",
      "nav.dashboard": "Dashboard",
      "nav.new_analysis": "Nuevo Análisis",
      "nav.history": "Historial",
      "nav.analytics": "Analytics y Reportes",
      "nav.exams": "Exámenes con IA",
      "nav.exam_generator": "Generador de Exámenes",
      "nav.exam_history": "Historial de Exámenes",
      "nav.doc_automation": "Automatización Documental",
      "nav.process_doc": "Procesar Documento",
      "nav.doc_history": "Historial de Análisis",
      "nav.doc_generator": "Generador de Ejemplos",
      "nav.admin": "Administración",
      "nav.config": "Configuración",
      "nav.other_demos": "Otras Demos",
      "nav.logout": "Cerrar Sesión",
      // Topbar
      "topbar.logout": "Cerrar Sesión",
      "topbar.search": "Buscar...",
      // Login
      "login.title": "Plataforma Demo — Educación",
      "login.subtitle":
        "Demo de diferentes plataformas para la vertical de educación",
      "login.email": "Correo Electrónico",
      "login.password": "Contraseña",
      "login.submit": "Iniciar Sesión",
      "login.no_account": "¿No tienes cuenta?",
      "login.register": "Regístrate aquí",
      "login.forgot": "¿Olvidaste tu contraseña?",
      // Common
      "common.save": "Guardar Cambios",
      "common.cancel": "Cancelar",
      "common.loading": "Cargando...",
    },
    en: {
      // Nav sections
      "nav.detection": "AI Detection",
      "nav.about": "About",
      "nav.dashboard": "Dashboard",
      "nav.new_analysis": "New Analysis",
      "nav.history": "History",
      "nav.analytics": "Analytics & Reports",
      "nav.exams": "AI Exams",
      "nav.exam_generator": "Exam Generator",
      "nav.exam_history": "Exam History",
      "nav.doc_automation": "Document Automation",
      "nav.process_doc": "Process Document",
      "nav.doc_history": "Analysis History",
      "nav.doc_generator": "Example Generator",
      "nav.admin": "Administration",
      "nav.config": "Settings",
      "nav.other_demos": "Other Demos",
      "nav.logout": "Sign Out",
      // Topbar
      "topbar.logout": "Sign Out",
      "topbar.search": "Search...",
      // Login
      "login.title": "Demo Platform — Education",
      "login.subtitle":
        "Demo of different platforms for the education vertical",
      "login.email": "Email Address",
      "login.password": "Password",
      "login.submit": "Sign In",
      "login.no_account": "Don't have an account?",
      "login.register": "Register here",
      "login.forgot": "Forgot your password?",
      // Common
      "common.save": "Save Changes",
      "common.cancel": "Cancel",
      "common.loading": "Loading...",
    },
  };

  function getLang() {
    return localStorage.getItem("lang") || "es";
  }

  function setLang(lang) {
    localStorage.setItem("lang", lang);
    applyTranslations();
    updateLangToggle();
    // Update html lang attribute
    document.documentElement.lang = lang;
  }

  function t(key) {
    const lang = getLang();
    return (
      (translations[lang] && translations[lang][key]) ||
      translations["es"][key] ||
      key
    );
  }

  function applyTranslations() {
    const lang = getLang();
    const dict = translations[lang] || translations["es"];

    // Build config overrides for login keys
    let configOverrides = {};
    try {
      const config = JSON.parse(localStorage.getItem("platformConfig") || "{}");
      if (config.loginTitleEs || config.loginTitleEn) {
        configOverrides["login.title"] =
          lang === "en"
            ? config.loginTitleEn || dict["login.title"]
            : config.loginTitleEs || dict["login.title"];
      }
      if (config.loginSubtitleEs || config.loginSubtitleEn) {
        configOverrides["login.subtitle"] =
          lang === "en"
            ? config.loginSubtitleEn || dict["login.subtitle"]
            : config.loginSubtitleEs || dict["login.subtitle"];
      }
    } catch (e) {}

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const value = configOverrides[key] || dict[key];
      if (value) {
        // For inputs, update placeholder; for others, update textContent
        if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
          el.placeholder = value;
        } else {
          el.textContent = value;
        }
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (dict[key]) el.placeholder = dict[key];
    });
  }

  function updateLangToggle() {
    const lang = getLang();
    document.querySelectorAll(".lang-toggle").forEach((btn) => {
      btn.textContent = lang === "es" ? "EN" : "ES";
      btn.title = lang === "es" ? "Switch to English" : "Cambiar a Español";
    });
  }

  function toggleLang() {
    setLang(getLang() === "es" ? "en" : "es");
  }

  // Apply on DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    applyTranslations();
    updateLangToggle();
  });

  // Public API
  window.i18n = { t, setLang, getLang, toggleLang, applyTranslations };
})();
