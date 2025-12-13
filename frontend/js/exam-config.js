// Exam Configuration - JavaScript Module
// Handles exam configuration form and validation

// Configuration state
let examConfigState = {
  config: {
    questionCount: 10,
    difficulty: "medium",
    questionTypes: ["multiple_choice"],
    versions: 2,
    language: "es",
    includeSelfAssessment: true,
  },
  validation: {
    isValid: false,
    errors: [],
  },
};

// Configuration Management Functions
function initializeExamConfiguration() {
  setupConfigurationForm();
  setupConfigurationValidation();
  setupLivePreview();
  loadDefaultConfiguration();
}

function setupConfigurationForm() {
  const form = document.getElementById("examConfigForm");
  if (!form) return;

  // Set up form change handlers
  const inputs = form.querySelectorAll("input, select");
  inputs.forEach((input) => {
    input.addEventListener("change", handleConfigurationChange);
    input.addEventListener("input", handleConfigurationChange);
  });

  // Set up question type validation
  const questionTypeCheckboxes = form.querySelectorAll(
    'input[type="checkbox"][value]'
  );
  questionTypeCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", validateQuestionTypes);
  });
}

function loadDefaultConfiguration() {
  // Set default values
  document.getElementById("questionCount").value =
    examConfigState.config.questionCount;
  document.getElementById("difficulty").value =
    examConfigState.config.difficulty;
  document.getElementById("versions").value = examConfigState.config.versions;
  document.getElementById("language").value = examConfigState.config.language;
  document.getElementById("includeSelfAssessment").checked =
    examConfigState.config.includeSelfAssessment;

  // Set default question types
  document.getElementById("multipleChoice").checked = true;

  // Update preview
  updateConfigurationPreview();
}

function handleConfigurationChange(event) {
  const input = event.target;
  const value = input.type === "checkbox" ? input.checked : input.value;

  // Update configuration state
  switch (input.id) {
    case "questionCount":
      examConfigState.config.questionCount = parseInt(value) || 10;
      break;
    case "difficulty":
      examConfigState.config.difficulty = value;
      break;
    case "versions":
      examConfigState.config.versions = parseInt(value) || 1;
      break;
    case "language":
      examConfigState.config.language = value;
      break;
    case "includeSelfAssessment":
      examConfigState.config.includeSelfAssessment = value;
      break;
  }

  // Update question types
  updateQuestionTypes();

  // Validate configuration
  validateConfiguration();

  // Update preview
  updateConfigurationPreview();
}

function updateQuestionTypes() {
  const questionTypes = [];

  if (document.getElementById("multipleChoice").checked) {
    questionTypes.push("multiple_choice");
  }
  if (document.getElementById("trueFalse").checked) {
    questionTypes.push("true_false");
  }
  if (document.getElementById("mixed").checked) {
    questionTypes.push("mixed");
  }

  examConfigState.config.questionTypes = questionTypes;
}

function validateQuestionTypes() {
  const questionTypes = ["multipleChoice", "trueFalse", "mixed"];
  const checkedTypes = questionTypes.filter(
    (type) => document.getElementById(type).checked
  );

  if (checkedTypes.length === 0) {
    // Auto-select multiple choice if none selected
    document.getElementById("multipleChoice").checked = true;
    showWarning(
      'Se debe seleccionar al menos un tipo de pregunta. Se seleccionó "Opción Múltiple" automáticamente.'
    );
  }

  updateQuestionTypes();
  validateConfiguration();
}

function setupConfigurationValidation() {
  // Real-time validation setup
  const requiredFields = ["questionCount", "difficulty"];

  requiredFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener("blur", validateField);
      field.addEventListener("change", validateField);
    }
  });
}

function validateField(event) {
  const field = event.target;
  const fieldContainer = field.closest(".mb-3");
  const existingFeedback = fieldContainer.querySelector(".invalid-feedback");

  // Remove existing feedback
  if (existingFeedback) {
    existingFeedback.remove();
  }

  field.classList.remove("is-invalid", "is-valid");

  let isValid = true;
  let errorMessage = "";

  // Validate based on field type
  switch (field.id) {
    case "questionCount":
      const count = parseInt(field.value);
      if (!count || count < 1 || count > 20) {
        isValid = false;
        errorMessage = "El número de preguntas debe estar entre 1 y 20";
      }
      break;

    case "difficulty":
      if (!field.value) {
        isValid = false;
        errorMessage = "Debe seleccionar un nivel de dificultad";
      }
      break;
  }

  // Apply validation styling
  if (isValid) {
    field.classList.add("is-valid");
  } else {
    field.classList.add("is-invalid");

    const feedback = document.createElement("div");
    feedback.className = "invalid-feedback";
    feedback.textContent = errorMessage;
    fieldContainer.appendChild(feedback);
  }

  return isValid;
}

function validateConfiguration() {
  const errors = [];

  // Validate question count
  if (
    !examConfigState.config.questionCount ||
    examConfigState.config.questionCount < 1 ||
    examConfigState.config.questionCount > 20
  ) {
    errors.push("El número de preguntas debe estar entre 1 y 20");
  }

  // Validate difficulty
  if (!examConfigState.config.difficulty) {
    errors.push("Debe seleccionar un nivel de dificultad");
  }

  // Validate question types
  if (
    !examConfigState.config.questionTypes ||
    examConfigState.config.questionTypes.length === 0
  ) {
    errors.push("Debe seleccionar al menos un tipo de pregunta");
  }

  // Validate versions
  if (
    !examConfigState.config.versions ||
    examConfigState.config.versions < 1 ||
    examConfigState.config.versions > 4
  ) {
    errors.push("El número de versiones debe estar entre 1 y 4");
  }

  // Update validation state
  examConfigState.validation.errors = errors;
  examConfigState.validation.isValid = errors.length === 0;

  return examConfigState.validation.isValid;
}

function setupLivePreview() {
  // Preview updates are handled in handleConfigurationChange
  updateConfigurationPreview();
}

function updateConfigurationPreview() {
  // Update preview panel
  document.getElementById("previewQuestionCount").textContent =
    examConfigState.config.questionCount;
  document.getElementById("previewDifficulty").textContent = getDifficultyLabel(
    examConfigState.config.difficulty
  );
  document.getElementById("previewVersions").textContent =
    examConfigState.config.versions;
  document.getElementById("previewLanguage").textContent = getLanguageLabel(
    examConfigState.config.language
  );
  document.getElementById("previewSelfAssessment").textContent = examConfigState
    .config.includeSelfAssessment
    ? "Sí"
    : "No";

  // Update question types
  const questionTypeLabels = examConfigState.config.questionTypes.map(
    (type) => {
      switch (type) {
        case "multiple_choice":
          return "Opción Múltiple";
        case "true_false":
          return "Verdadero/Falso";
        case "mixed":
          return "Mixto";
        default:
          return type;
      }
    }
  );

  document.getElementById("previewQuestionTypes").textContent =
    questionTypeLabels.length > 0 ? questionTypeLabels.join(", ") : "Ninguno";

  // Update selected topics preview if available
  updateSelectedTopicsPreview();
}

function updateSelectedTopicsPreview() {
  const previewContainer = document.getElementById("selectedTopicsPreview");
  if (!previewContainer) return;

  // Get selected topics from global state or topic selection module
  let selectedTopics = [];

  if (window.examGeneratorState && window.examGeneratorState.selectedTopics) {
    selectedTopics = window.examGeneratorState.selectedTopics;
  } else if (window.getSelectedTopicsList) {
    selectedTopics = window.getSelectedTopicsList();
  }

  if (selectedTopics.length === 0) {
    previewContainer.innerHTML =
      '<span class="text-muted">No hay temas seleccionados</span>';
    return;
  }

  const maxVisible = 5;
  const visibleTopics = selectedTopics.slice(0, maxVisible);
  const remainingCount = selectedTopics.length - maxVisible;

  let html = visibleTopics
    .map(
      (topic) =>
        `<span class="badge bg-primary me-1 mb-1">${topic.title}</span>`
    )
    .join("");

  if (remainingCount > 0) {
    html += `<span class="badge bg-secondary mb-1">+${remainingCount} más</span>`;
  }

  previewContainer.innerHTML = html;
}

// Configuration Export/Import Functions
function getExamConfiguration() {
  return {
    ...examConfigState.config,
    questionTypes: [...examConfigState.config.questionTypes], // Clone array
  };
}

function setExamConfiguration(config) {
  examConfigState.config = { ...examConfigState.config, ...config };

  // Update form fields
  if (config.questionCount !== undefined) {
    document.getElementById("questionCount").value = config.questionCount;
  }
  if (config.difficulty !== undefined) {
    document.getElementById("difficulty").value = config.difficulty;
  }
  if (config.versions !== undefined) {
    document.getElementById("versions").value = config.versions;
  }
  if (config.language !== undefined) {
    document.getElementById("language").value = config.language;
  }
  if (config.includeSelfAssessment !== undefined) {
    document.getElementById("includeSelfAssessment").checked =
      config.includeSelfAssessment;
  }

  // Update question type checkboxes
  if (config.questionTypes !== undefined) {
    document.getElementById("multipleChoice").checked =
      config.questionTypes.includes("multiple_choice");
    document.getElementById("trueFalse").checked =
      config.questionTypes.includes("true_false");
    document.getElementById("mixed").checked =
      config.questionTypes.includes("mixed");
  }

  // Validate and update preview
  validateConfiguration();
  updateConfigurationPreview();
}

// Configuration Templates
function getConfigurationTemplates() {
  return {
    basic: {
      name: "Básico",
      description: "Configuración simple para exámenes básicos",
      config: {
        questionCount: 10,
        difficulty: "easy",
        questionTypes: ["multiple_choice"],
        versions: 1,
        language: "es",
        includeSelfAssessment: false,
      },
    },
    standard: {
      name: "Estándar",
      description: "Configuración equilibrada para la mayoría de casos",
      config: {
        questionCount: 15,
        difficulty: "medium",
        questionTypes: ["multiple_choice", "true_false"],
        versions: 2,
        language: "es",
        includeSelfAssessment: true,
      },
    },
    advanced: {
      name: "Avanzado",
      description: "Configuración completa para exámenes complejos",
      config: {
        questionCount: 20,
        difficulty: "hard",
        questionTypes: ["multiple_choice", "true_false", "mixed"],
        versions: 3,
        language: "es",
        includeSelfAssessment: true,
      },
    },
  };
}

function applyConfigurationTemplate(templateName) {
  const templates = getConfigurationTemplates();
  const template = templates[templateName];

  if (!template) {
    showError("Plantilla no encontrada: " + templateName);
    return;
  }

  Swal.fire({
    title: `Aplicar Plantilla: ${template.name}`,
    text: template.description,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#008FD0",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Aplicar",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      setExamConfiguration(template.config);
      showSuccess(`Plantilla "${template.name}" aplicada correctamente`);
    }
  });
}

function showConfigurationTemplates() {
  const templates = getConfigurationTemplates();

  const templateButtons = Object.entries(templates)
    .map(
      ([key, template]) => `
        <div class="col-md-4 mb-3">
            <div class="card h-100">
                <div class="card-body text-center">
                    <h6 class="card-title">${template.name}</h6>
                    <p class="card-text small text-muted">${template.description}</p>
                    <button class="btn btn-outline-primary btn-sm" onclick="applyConfigurationTemplate('${key}')">
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    `
    )
    .join("");

  Swal.fire({
    title: "Plantillas de Configuración",
    html: `
            <div class="row">
                ${templateButtons}
            </div>
        `,
    width: "800px",
    showConfirmButton: false,
    showCloseButton: true,
  });
}

// Configuration Validation and Recommendations
function getConfigurationRecommendations() {
  const recommendations = [];
  const config = examConfigState.config;

  // Question count recommendations
  if (config.questionCount < 5) {
    recommendations.push({
      type: "warning",
      message:
        "Considere usar al menos 5 preguntas para una evaluación más completa",
    });
  } else if (config.questionCount > 15) {
    recommendations.push({
      type: "info",
      message:
        "Exámenes largos pueden ser más difíciles de completar para los estudiantes",
    });
  }

  // Difficulty and question type recommendations
  if (config.difficulty === "hard" && config.questionTypes.length === 1) {
    recommendations.push({
      type: "suggestion",
      message:
        "Para exámenes difíciles, considere usar múltiples tipos de preguntas",
    });
  }

  // Version recommendations
  if (config.versions === 1 && config.questionCount > 10) {
    recommendations.push({
      type: "suggestion",
      message: "Considere crear múltiples versiones para exámenes largos",
    });
  }

  // Self-assessment recommendations
  if (!config.includeSelfAssessment && config.difficulty !== "easy") {
    recommendations.push({
      type: "suggestion",
      message:
        "La autoevaluación puede ayudar a los estudiantes en exámenes de dificultad media o alta",
    });
  }

  return recommendations;
}

function showConfigurationRecommendations() {
  const recommendations = getConfigurationRecommendations();

  if (recommendations.length === 0) {
    Swal.fire({
      title: "Configuración Óptima",
      text: "Su configuración actual es adecuada para generar un buen examen.",
      icon: "success",
      confirmButtonColor: "#008FD0",
    });
    return;
  }

  const recommendationsList = recommendations
    .map((rec) => {
      const iconClass =
        {
          warning: "bi-exclamation-triangle text-warning",
          info: "bi-info-circle text-info",
          suggestion: "bi-lightbulb text-primary",
        }[rec.type] || "bi-info-circle";

      return `
            <div class="d-flex align-items-start mb-2">
                <i class="bi ${iconClass} me-2 mt-1"></i>
                <span>${rec.message}</span>
            </div>
        `;
    })
    .join("");

  Swal.fire({
    title: "Recomendaciones de Configuración",
    html: `
            <div class="text-start">
                ${recommendationsList}
            </div>
        `,
    icon: "info",
    confirmButtonColor: "#008FD0",
  });
}

// Utility Functions
function getDifficultyLabel(difficulty) {
  const labels = {
    easy: "Fácil",
    medium: "Intermedio",
    hard: "Difícil",
  };
  return labels[difficulty] || difficulty || "-";
}

function getLanguageLabel(language) {
  const labels = {
    es: "Español",
    en: "Inglés",
    fr: "Francés",
  };
  return labels[language] || language || "-";
}

function showWarning(message) {
  Swal.fire({
    title: "Advertencia",
    text: message,
    icon: "warning",
    confirmButtonColor: "#008FD0",
    timer: 3000,
  });
}

// Configuration Summary
function getConfigurationSummary() {
  const config = examConfigState.config;

  return {
    questionCount: config.questionCount,
    difficulty: getDifficultyLabel(config.difficulty),
    questionTypes: config.questionTypes.map((type) => {
      switch (type) {
        case "multiple_choice":
          return "Opción Múltiple";
        case "true_false":
          return "Verdadero/Falso";
        case "mixed":
          return "Mixto";
        default:
          return type;
      }
    }),
    versions: config.versions,
    language: getLanguageLabel(config.language),
    selfAssessment: config.includeSelfAssessment ? "Incluida" : "No incluida",
    estimatedTime: calculateEstimatedTime(config),
    complexity: calculateComplexity(config),
  };
}

function calculateEstimatedTime(config) {
  // Estimate time based on question count and difficulty
  const baseTimePerQuestion =
    {
      easy: 1.5,
      medium: 2,
      hard: 3,
    }[config.difficulty] || 2;

  const totalMinutes = config.questionCount * baseTimePerQuestion;

  if (config.includeSelfAssessment) {
    return Math.round(totalMinutes * 1.2); // 20% more time for self-assessment
  }

  return Math.round(totalMinutes);
}

function calculateComplexity(config) {
  let complexity = 0;

  // Base complexity from question count
  complexity += config.questionCount * 0.1;

  // Difficulty multiplier
  const difficultyMultiplier =
    {
      easy: 1,
      medium: 1.5,
      hard: 2,
    }[config.difficulty] || 1;

  complexity *= difficultyMultiplier;

  // Question type variety
  complexity += config.questionTypes.length * 0.2;

  // Multiple versions
  complexity += (config.versions - 1) * 0.3;

  // Self-assessment
  if (config.includeSelfAssessment) {
    complexity += 0.5;
  }

  // Normalize to 1-5 scale
  const normalizedComplexity = Math.min(5, Math.max(1, Math.round(complexity)));

  const labels = {
    1: "Muy Baja",
    2: "Baja",
    3: "Media",
    4: "Alta",
    5: "Muy Alta",
  };

  return labels[normalizedComplexity];
}

function showConfigurationSummary() {
  const summary = getConfigurationSummary();

  Swal.fire({
    title: "Resumen de Configuración",
    html: `
            <div class="text-start">
                <div class="row">
                    <div class="col-md-6">
                        <table class="table table-sm">
                            <tr>
                                <td><strong>Preguntas:</strong></td>
                                <td>${summary.questionCount}</td>
                            </tr>
                            <tr>
                                <td><strong>Dificultad:</strong></td>
                                <td>${summary.difficulty}</td>
                            </tr>
                            <tr>
                                <td><strong>Tipos:</strong></td>
                                <td>${summary.questionTypes.join(", ")}</td>
                            </tr>
                            <tr>
                                <td><strong>Versiones:</strong></td>
                                <td>${summary.versions}</td>
                            </tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <table class="table table-sm">
                            <tr>
                                <td><strong>Idioma:</strong></td>
                                <td>${summary.language}</td>
                            </tr>
                            <tr>
                                <td><strong>Autoevaluación:</strong></td>
                                <td>${summary.selfAssessment}</td>
                            </tr>
                            <tr>
                                <td><strong>Tiempo Estimado:</strong></td>
                                <td>${summary.estimatedTime} minutos</td>
                            </tr>
                            <tr>
                                <td><strong>Complejidad:</strong></td>
                                <td>${summary.complexity}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `,
    width: "600px",
    confirmButtonColor: "#008FD0",
  });
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", function () {
  // Only initialize if we're on the exam generator page
  if (document.getElementById("examConfigForm")) {
    initializeExamConfiguration();
  }
});

// Export functions for global access
window.initializeExamConfiguration = initializeExamConfiguration;
window.getExamConfiguration = getExamConfiguration;
window.setExamConfiguration = setExamConfiguration;
window.validateConfiguration = validateConfiguration;
window.updateConfigurationPreview = updateConfigurationPreview;
window.showConfigurationTemplates = showConfigurationTemplates;
window.applyConfigurationTemplate = applyConfigurationTemplate;
window.showConfigurationRecommendations = showConfigurationRecommendations;
window.showConfigurationSummary = showConfigurationSummary;
window.getConfigurationSummary = getConfigurationSummary;
