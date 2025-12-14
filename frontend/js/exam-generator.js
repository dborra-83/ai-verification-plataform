// Exam Generator - Main JavaScript Module
// Handles the multi-step exam generation workflow

// API utility function
async function apiCall(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const finalOptions = { ...defaultOptions, ...options };

  // Ensure endpoint starts with / and remove any double slashes
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${CONFIG.API_BASE_URL}${cleanEndpoint}`;

  try {
    console.log(`Making API call to: ${url}`);
    console.log(`Options:`, finalOptions);
    console.log(`CONFIG:`, CONFIG);

    const response = await fetch(url, finalOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`API Error:`, errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log(`API Response:`, result);
    return result;
  } catch (error) {
    console.error("API call failed:", error);
    throw error;
  }
}

// Utility functions for UI feedback
function showError(message, title = "Error") {
  Swal.fire({
    title: title,
    text: message,
    icon: "error",
    confirmButtonColor: "#008FD0",
  });
}

function showSuccess(message, title = "Éxito") {
  Swal.fire({
    title: title,
    text: message,
    icon: "success",
    confirmButtonColor: "#008FD0",
  });
}

function showLoading(message) {
  Swal.fire({
    title: "Procesando...",
    text: message,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

function hideLoading() {
  Swal.close();
}

// Authentication functions
function checkAuthentication() {
  const isAuthed = window.SessionManager
    ? window.SessionManager.isAuthenticated()
    : localStorage.getItem("isAuthed") === "true";

  if (!isAuthed) {
    window.location.href = "login.html";
    return false;
  }

  // Update user display
  const user = window.SessionManager
    ? window.SessionManager.getCurrentUser()
    : { username: localStorage.getItem("username") || "Admin" };

  const userAvatar = document.querySelector(".user-avatar");
  if (userAvatar) {
    userAvatar.textContent = user.username.charAt(0).toUpperCase();
    userAvatar.title = user.username;
  }

  return true;
}

function getCurrentTeacherId() {
  // Use SessionManager if available, otherwise fallback to localStorage
  if (window.SessionManager) {
    return window.SessionManager.getCurrentUser().teacherId;
  }
  return localStorage.getItem("username") || "admin";
}

function logout() {
  Swal.fire({
    title: "¿Cerrar sesión?",
    text: "Se cerrará tu sesión actual",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#008FD0",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sí, cerrar sesión",
    cancelButtonText: "Cancelar",
  }).then((result) => {
    if (result.isConfirmed) {
      if (window.SessionManager) {
        window.SessionManager.clearSession();
      } else {
        localStorage.removeItem("isAuthed");
        localStorage.removeItem("username");
      }
      window.location.href = "login.html";
    }
  });
}

// Global state management
let examGeneratorState = {
  currentStep: 1,
  uploadedFiles: [],
  extractedTopics: [],
  selectedTopics: [],
  examConfig: {},
  generationId: null,
};

// Initialize exam generator on page load
document.addEventListener("DOMContentLoaded", function () {
  // Check authentication first
  checkAuthentication();
  initializeExamGenerator();
});

function initializeExamGenerator() {
  // Set up file upload handlers
  setupFileUpload();

  // Set up form validation
  setupFormValidation();

  // Set up step navigation
  setupStepNavigation();

  // Initialize step 1
  showStep(1);

  console.log("Exam Generator initialized");
}

// File Upload Functionality
function setupFileUpload() {
  const uploadZone = document.getElementById("multiUploadZone");
  const fileInput = document.getElementById("multiFileInput");

  // Click to upload
  uploadZone.addEventListener("click", () => {
    fileInput.click();
  });

  // File selection handler
  fileInput.addEventListener("change", handleFileSelection);

  // Drag and drop handlers
  uploadZone.addEventListener("dragover", handleDragOver);
  uploadZone.addEventListener("dragleave", handleDragLeave);
  uploadZone.addEventListener("drop", handleFileDrop);
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.add("dragover");
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove("dragover");
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove("dragover");

  const files = Array.from(e.dataTransfer.files);
  processSelectedFiles(files);
}

function handleFileSelection(e) {
  const files = Array.from(e.target.files);
  processSelectedFiles(files);
}

function processSelectedFiles(files) {
  // Validate file count
  if (files.length > 5) {
    showError("Máximo 5 archivos permitidos", "Límite de Archivos");
    return;
  }

  // Validate file types and sizes
  const validFiles = [];
  for (const file of files) {
    if (!file.type.includes("pdf")) {
      showError(
        `El archivo "${file.name}" no es un PDF válido`,
        "Formato Inválido"
      );
      continue;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit to avoid 413 errors
      showError(
        `El archivo "${file.name}" excede el límite de 5MB`,
        "Archivo Muy Grande"
      );
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) {
    return;
  }

  // Add to uploaded files
  examGeneratorState.uploadedFiles = [
    ...examGeneratorState.uploadedFiles,
    ...validFiles,
  ];

  // Update UI
  updateUploadedFilesList();
  updateNextButton();
}

function updateUploadedFilesList() {
  const filesList = document.getElementById("filesList");
  const uploadedFilesContainer = document.getElementById("uploadedFilesList");

  if (examGeneratorState.uploadedFiles.length === 0) {
    uploadedFilesContainer.style.display = "none";
    return;
  }

  uploadedFilesContainer.style.display = "block";

  filesList.innerHTML = examGeneratorState.uploadedFiles
    .map(
      (file, index) => `
        <div class="d-flex align-items-center justify-content-between p-3 mb-2 border rounded">
            <div class="d-flex align-items-center">
                <i class="bi bi-file-earmark-pdf text-danger me-3" style="font-size: 1.5rem;"></i>
                <div>
                    <div class="fw-medium">${file.name}</div>
                    <small class="text-muted">${formatFileSize(
                      file.size
                    )}</small>
                </div>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeFile(${index})" title="Eliminar archivo">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `
    )
    .join("");
}

function removeFile(index) {
  examGeneratorState.uploadedFiles.splice(index, 1);
  updateUploadedFilesList();
  updateNextButton();
}

function clearAllFiles() {
  examGeneratorState.uploadedFiles = [];
  updateUploadedFilesList();
  updateNextButton();

  // Reset file input
  document.getElementById("multiFileInput").value = "";
}

function updateNextButton() {
  const nextBtn = document.getElementById("nextToTopicsBtn");
  nextBtn.disabled = examGeneratorState.uploadedFiles.length === 0;
}

// Topic Extraction Process
async function proceedToTopicExtraction() {
  if (examGeneratorState.uploadedFiles.length === 0) {
    showError("Debe subir al menos un documento PDF", "Documentos Requeridos");
    return;
  }

  // Show step 2
  showStep(2);

  // Start topic extraction
  await extractTopicsFromDocuments();
}

async function extractTopicsFromDocuments() {
  const progressContainer = document.getElementById("topicExtractionProgress");
  const progressBar = document.getElementById("extractionProgressBar");
  const progressText = document.getElementById("extractionPercentage");
  const topicsContainer = document.getElementById("topicsContainer");

  // Show progress
  progressContainer.style.display = "block";
  topicsContainer.innerHTML = `
        <div class="text-center text-muted py-4">
            <i class="bi bi-hourglass-split me-2"></i>
            Extrayendo temas con Claude 3.5 Sonnet...
        </div>
    `;

  try {
    // Process files and prepare for topic extraction
    const fileContents = [];

    for (let i = 0; i < examGeneratorState.uploadedFiles.length; i++) {
      const file = examGeneratorState.uploadedFiles[i];
      const progress = ((i + 1) / examGeneratorState.uploadedFiles.length) * 50; // First 50% for processing

      updateProgress(
        progressBar,
        progressText,
        progress,
        "Procesando documentos..."
      );

      // Process file
      const fileInfo = await uploadFileForProcessing(file);
      fileContents.push(fileInfo);
    }

    // Extract topics
    updateProgress(progressBar, progressText, 60, "Analizando contenido...");

    const extractionResult = await apiCall("/exam/topics/extract", {
      method: "POST",
      body: JSON.stringify({
        files: fileContents,
        teacherId: getCurrentTeacherId(),
      }),
    });

    updateProgress(progressBar, progressText, 100, "Extracción completada");

    // Store extracted topics and extraction ID
    examGeneratorState.extractedTopics = extractionResult.topicOutline || [];
    examGeneratorState.extractionId = extractionResult.extractionId;

    // Hide progress and show topics
    setTimeout(() => {
      progressContainer.style.display = "none";
      displayExtractedTopics();
    }, 1000);
  } catch (error) {
    console.error("Error extracting topics:", error);
    progressContainer.style.display = "none";
    topicsContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                Error al extraer temas: ${error.message}
                <button class="btn btn-sm btn-outline-danger ms-2" onclick="extractTopicsFromDocuments()">
                    Reintentar
                </button>
            </div>
        `;
  }
}

async function uploadFileForProcessing(file) {
  // For exam generation, we'll upload the file content directly to topic extraction
  const fileContent = await file.arrayBuffer();

  // Convert to base64 safely for large files
  const uint8Array = new Uint8Array(fileContent);
  let binaryString = "";
  const chunkSize = 8192; // Process in chunks to avoid stack overflow

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, chunk);
  }

  const base64Content = btoa(binaryString);

  // Store file info for later use
  const fileInfo = {
    name: file.name,
    size: file.size,
    type: file.type,
    content: base64Content,
  };

  return fileInfo;
}

function displayExtractedTopics() {
  console.log("Displaying extracted topics...");
  console.log(
    "Extracted topics count:",
    examGeneratorState.extractedTopics?.length || 0
  );

  const topicsContainer = document.getElementById("topicsContainer");
  console.log("🎯 Topics container element:", topicsContainer);

  if (!topicsContainer) {
    console.error("❌ CRITICAL: topicsContainer element not found in DOM!");
    return;
  }

  if (
    !examGeneratorState.extractedTopics ||
    examGeneratorState.extractedTopics.length === 0
  ) {
    topicsContainer.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                No se pudieron extraer temas de los documentos. Verifique que los PDFs contengan texto extraíble.
                <div class="mt-2">
                    <button class="btn btn-sm btn-outline-primary" onclick="extractTopicsFromDocuments()">
                        <i class="bi bi-arrow-clockwise me-1"></i>Reintentar
                    </button>
                </div>
            </div>
        `;
    return;
  }

  try {
    console.log("Processing topics for display...");

    // Validate topic structure before processing
    console.log("🔍 Starting comprehensive topic validation");
    const validation = validateTopicData(examGeneratorState.extractedTopics);

    console.log("📊 Validation results:", validation);

    if (!validation.isValid) {
      console.error("❌ Topic validation failed:", validation.errors);
      throw new Error(
        `Validación de temas falló: ${validation.errors.join(", ")}`
      );
    }

    if (validation.warnings.length > 0) {
      console.warn("⚠️ Topic validation warnings:", validation.warnings);
    }

    const validTopics = validation.validTopics;
    console.log(`✅ Using ${validTopics.length} validated topics`);

    if (validTopics.length === 0) {
      throw new Error(
        "No hay temas válidos para mostrar después de la validación"
      );
    }

    // Build hierarchical topic tree
    const topicTree = buildTopicTree(validTopics);
    console.log("Topic tree built successfully:", topicTree);
    console.log("Topic tree type:", typeof topicTree);
    console.log("Topic tree keys:", Object.keys(topicTree));

    // Check if tree has any valid nodes
    const treeKeys = Object.keys(topicTree);
    if (treeKeys.length === 0) {
      console.warn("Topic tree is empty, using fallback");
      throw new Error("Árbol de temas vacío");
    }

    const renderedTree = renderTopicTree(topicTree);
    console.log("Rendered tree type:", typeof renderedTree);
    console.log(
      "Rendered tree length:",
      renderedTree ? renderedTree.length : 0
    );
    console.log(
      "Rendered tree preview:",
      renderedTree ? renderedTree.substring(0, 200) : "null/undefined"
    );

    // Skip complex rendering and use simple approach
    console.log("🔄 Using simplified topic rendering approach");
    console.log(
      "📊 Topic data for simple rendering:",
      JSON.stringify(validTopics, null, 2)
    );

    let simpleHtml = null;
    try {
      const startTime = performance.now();
      simpleHtml = createSimpleTopicDisplay(validTopics);
      const endTime = performance.now();
      console.log(
        `⏱️ Simple rendering took ${endTime - startTime} milliseconds`
      );

      console.log(
        "📝 Generated HTML length:",
        simpleHtml ? simpleHtml.length : 0
      );
      console.log(
        "📝 HTML preview:",
        simpleHtml ? simpleHtml.substring(0, 300) + "..." : "null/undefined"
      );
    } catch (simpleError) {
      console.error("❌ Error in createSimpleTopicDisplay:", simpleError);
      console.error("❌ Error stack:", simpleError.stack);
      simpleHtml = null;
    }

    if (simpleHtml && simpleHtml.trim() !== "") {
      console.log("✅ Simple topic display created successfully");
      try {
        topicsContainer.innerHTML = simpleHtml;
        console.log("✅ HTML successfully inserted into DOM");

        // Update source documents list
        updateSourceDocumentsList();
        console.log("✅ Source documents list updated");

        // Set up topic selection handlers
        setupTopicSelectionHandlers();
        console.log("✅ Topic selection handlers set up");

        console.log("=== TOPIC DISPLAY SUCCESS ===");
        return;
      } catch (domError) {
        console.error("❌ Error inserting HTML into DOM:", domError);
        console.error("❌ DOM Error stack:", domError.stack);
        // Continue to emergency fallback
      }
    } else {
      console.error("❌ Simple topic display failed - empty or null HTML");
      console.error("❌ simpleHtml value:", simpleHtml);
      console.error("❌ simpleHtml type:", typeof simpleHtml);
    }

    // Emergency fallback - try the ultra-robust emergency renderer
    console.log("🚨 Attempting emergency fallback rendering");
    let emergencyHtml = null;
    try {
      emergencyHtml = createEmergencyTopicDisplay(validTopics);
      console.log("✅ Emergency rendering successful");
    } catch (emergencyError) {
      console.error("❌ Emergency rendering failed:", emergencyError);
      console.error("❌ Emergency error stack:", emergencyError.stack);
    }

    if (emergencyHtml && emergencyHtml.trim() !== "") {
      try {
        topicsContainer.innerHTML = emergencyHtml;
        console.log("✅ Emergency HTML successfully inserted into DOM");

        // Update source documents list
        updateSourceDocumentsList();
        console.log("✅ Source documents list updated (emergency mode)");

        // Set up topic selection handlers
        setupTopicSelectionHandlers();
        console.log("✅ Topic selection handlers set up (emergency mode)");

        console.log("=== TOPIC DISPLAY SUCCESS (EMERGENCY MODE) ===");
        return;
      } catch (emergencyDomError) {
        console.error(
          "❌ Error inserting emergency HTML into DOM:",
          emergencyDomError
        );
        console.error("❌ Emergency DOM Error stack:", emergencyDomError.stack);
      }
    }

    if (!renderedTree || renderedTree.trim() === "") {
      console.error("renderTopicTree returned empty result");
      console.error("Topic tree keys:", Object.keys(topicTree));
      console.error("Topic tree values:", Object.values(topicTree));

      // Fallback: create a simple list from the original topics
      console.log("Attempting fallback rendering...");
      const fallbackHtml = createFallbackTopicList(validTopics);
      console.log(
        "Fallback HTML length:",
        fallbackHtml ? fallbackHtml.length : 0
      );
      console.log(
        "Fallback HTML preview:",
        fallbackHtml ? fallbackHtml.substring(0, 200) : "null/undefined"
      );

      if (fallbackHtml && fallbackHtml.trim() !== "") {
        console.log("Using fallback topic rendering");
        topicsContainer.innerHTML = fallbackHtml;
      } else {
        console.error(
          "Fallback rendering also failed, using emergency fallback"
        );

        // Emergency fallback - create a very simple list
        const emergencyHtml = validTopics
          .map((topic, index) => {
            const title =
              typeof topic === "string"
                ? topic
                : topic.topic ||
                  topic.title ||
                  topic.name ||
                  `Tema ${index + 1}`;
            const safeTitle = escapeHtml(title);
            const topicId = `emergency_topic_${index}_${Date.now()}`;

            return `
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" 
                     id="${topicId}"
                     data-topic-id="${encodeURIComponent(title)}"
                     onchange="handleTopicSelection(this)">
              <label class="form-check-label" for="${topicId}">
                <i class="bi bi-file-text me-2 text-info"></i>
                ${safeTitle}
              </label>
            </div>
          `;
          })
          .join("");

        if (emergencyHtml) {
          console.log("Using emergency fallback rendering");
          topicsContainer.innerHTML = `
            <div class="alert alert-info mb-3">
              <i class="bi bi-info-circle me-2"></i>
              Mostrando vista simplificada de temas
            </div>
            ${emergencyHtml}
          `;
        } else {
          console.error(
            "❌ All rendering methods failed - showing final error message"
          );
          topicsContainer.innerHTML = `
            <div class="alert alert-danger">
              <i class="bi bi-exclamation-triangle-fill me-2"></i>
              <strong>Error crítico en el renderizado de temas</strong>
              <p>No se pudieron mostrar los temas extraídos a pesar de múltiples intentos.</p>
              <div class="mt-3">
                <button class="btn btn-outline-danger me-2" onclick="extractTopicsFromDocuments()">
                  <i class="bi bi-arrow-clockwise me-1"></i>Reintentar Extracción
                </button>
                <button class="btn btn-outline-secondary" onclick="location.reload()">
                  <i class="bi bi-bootstrap-reboot me-1"></i>Recargar Página
                </button>
              </div>
              <details class="mt-3">
                <summary class="text-muted small">Información técnica</summary>
                <pre class="small mt-2">${JSON.stringify(
                  {
                    topicsCount: validTopics?.length || 0,
                    topicsType: typeof validTopics,
                    sampleTopic: validTopics?.[0] || null,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                )}</pre>
              </details>
            </div>
          `;
          return; // Don't throw error, just show the error message
        }
      }
    } else {
      console.log("Using main topic tree rendering");
      topicsContainer.innerHTML = renderedTree;
    }

    // Update source documents list
    updateSourceDocumentsList();

    // Set up topic selection handlers
    setupTopicSelectionHandlers();

    console.log("=== TOPIC DISPLAY SUCCESS ===");
  } catch (error) {
    console.error("=== TOPIC DISPLAY ERROR ===", error);
    console.error("Error stack:", error.stack);

    // Simplified error display - try to show topics anyway
    try {
      // Last resort: show raw topics if available
      if (
        examGeneratorState.extractedTopics &&
        examGeneratorState.extractedTopics.length > 0
      ) {
        console.log("🚨 Attempting last resort topic display");

        const emergencyTopics = examGeneratorState.extractedTopics
          .map((topic, index) => {
            const topicName =
              topic?.topic ||
              topic?.title ||
              topic?.name ||
              `Tema ${index + 1}`;
            const subtopics = topic?.subtopics || [];

            return `
            <div class="card mb-2">
              <div class="card-body">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" 
                         id="emergency_topic_${index}"
                         data-topic-name="${topicName}"
                         onchange="handleTopicSelection(this)">
                  <label class="form-check-label fw-bold" for="emergency_topic_${index}">
                    ${topicName}
                  </label>
                </div>
                ${
                  subtopics.length > 0
                    ? `
                  <div class="ms-4 mt-2">
                    ${subtopics
                      .map(
                        (sub, subIndex) => `
                      <div class="form-check">
                        <input class="form-check-input" type="checkbox" 
                               id="emergency_subtopic_${index}_${subIndex}"
                               data-parent-topic="${topicName}"
                               data-subtopic-name="${sub}"
                               onchange="handleSubtopicSelection(this)">
                        <label class="form-check-label" for="emergency_subtopic_${index}_${subIndex}">
                          ${sub}
                        </label>
                      </div>
                    `
                      )
                      .join("")}
                  </div>
                `
                    : ""
                }
              </div>
            </div>
          `;
          })
          .join("");

        topicsContainer.innerHTML = `
          <div class="alert alert-warning mb-3">
            <i class="bi bi-exclamation-triangle me-2"></i>
            Mostrando temas en modo de recuperación. Algunos elementos visuales pueden no funcionar correctamente.
          </div>
          ${emergencyTopics}
        `;

        // Set up basic handlers
        setupTopicSelectionHandlers();
        return;
      }
    } catch (emergencyError) {
      console.error("Emergency display also failed:", emergencyError);
    }

    // Final fallback - simple error message
    topicsContainer.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong>Error al mostrar los temas extraídos:</strong> No se pudo renderizar el árbol de temas
        <div class="mt-2">
          <button class="btn btn-sm btn-outline-danger" onclick="extractTopicsFromDocuments()">
            <i class="bi bi-arrow-clockwise me-1"></i>Reintentar Extracción
          </button>
        </div>
      </div>
    `;
  }
}

function buildTopicTree(topics) {
  // Group topics by hierarchy level
  const tree = {};

  console.log("=== BUILDING TOPIC TREE ===");
  console.log("Input topics:", topics);
  console.log("Topics type:", typeof topics);
  console.log("Topics is array:", Array.isArray(topics));

  if (!topics || !Array.isArray(topics)) {
    console.warn("Invalid topics data - not an array:", topics);
    return tree;
  }

  if (topics.length === 0) {
    console.warn("Empty topics array");
    return tree;
  }

  topics.forEach((topic, topicIndex) => {
    try {
      console.log(
        `Processing topic ${topicIndex + 1}/${topics.length}:`,
        topic
      );

      // Handle different topic structure formats with better validation
      let topicTitle;
      let subtopics = [];

      // More robust topic title extraction
      if (typeof topic === "string") {
        topicTitle = topic.trim();
      } else if (topic && typeof topic === "object") {
        topicTitle = (topic.topic || topic.title || topic.name || "").trim();
        subtopics = topic.subtopics || topic.children || topic.items || [];

        // Ensure subtopics is an array
        if (!Array.isArray(subtopics)) {
          console.warn("Subtopics is not an array:", subtopics);
          subtopics = [];
        }
      } else {
        console.warn("Invalid topic format:", topic);
        return; // Skip this topic
      }

      // Ensure topicTitle is a valid string
      if (!topicTitle || typeof topicTitle !== "string" || topicTitle === "") {
        console.warn("Invalid topic title:", topicTitle, "for topic:", topic);
        return; // Skip this topic
      }

      console.log(
        "Processing topic:",
        topicTitle,
        "with subtopics:",
        subtopics
      );

      // Create main topic if it doesn't exist
      if (!tree[topicTitle]) {
        tree[topicTitle] = {
          title: topicTitle,
          level: 0,
          children: {},
          isLeaf: !subtopics || subtopics.length === 0,
          topicData: topic,
        };
      }

      // Add subtopics if they exist
      if (subtopics && Array.isArray(subtopics) && subtopics.length > 0) {
        subtopics.forEach((subtopic, subtopicIndex) => {
          try {
            let subtopicTitle;

            // Handle different subtopic formats
            if (typeof subtopic === "string") {
              subtopicTitle = subtopic.trim();
            } else if (subtopic && typeof subtopic === "object") {
              subtopicTitle = (
                subtopic.topic ||
                subtopic.title ||
                subtopic.name ||
                ""
              ).trim();
            }

            // Only add valid subtopics
            if (
              subtopicTitle &&
              typeof subtopicTitle === "string" &&
              subtopicTitle !== "" &&
              !tree[topicTitle].children[subtopicTitle]
            ) {
              tree[topicTitle].children[subtopicTitle] = {
                title: subtopicTitle,
                level: 1,
                children: {},
                isLeaf: true,
                topicData: {
                  topic: subtopicTitle,
                  parentTopic: topicTitle,
                  originalData: subtopic,
                },
              };
              console.log(`Added subtopic: ${subtopicTitle} to ${topicTitle}`);
            } else {
              console.warn(
                `Skipping invalid subtopic ${subtopicIndex}:`,
                subtopic
              );
            }
          } catch (subtopicError) {
            console.error(
              `Error processing subtopic ${subtopicIndex}:`,
              subtopicError,
              subtopic
            );
          }
        });

        // Update isLeaf status based on actual children
        tree[topicTitle].isLeaf =
          Object.keys(tree[topicTitle].children).length === 0;
      }
    } catch (topicError) {
      console.error(`Error processing topic ${topicIndex}:`, topicError, topic);
    }
  });

  console.log("=== BUILT TOPIC TREE ===");
  console.log("Tree keys:", Object.keys(tree));
  console.log("Tree structure:", tree);

  // Validate tree has content
  const treeKeys = Object.keys(tree);
  if (treeKeys.length === 0) {
    console.error("Built tree is empty!");
  } else {
    console.log(`Successfully built tree with ${treeKeys.length} main topics`);
    treeKeys.forEach((key) => {
      const childCount = Object.keys(tree[key].children || {}).length;
      console.log(`- ${key}: ${childCount} subtopics`);
    });
  }

  return tree;
}

function renderTopicTree(tree, level = 0) {
  let html = "";

  if (!tree || typeof tree !== "object") {
    console.warn("Invalid tree data:", tree);
    return "";
  }

  const treeKeys = Object.keys(tree);
  console.log(
    `Rendering tree at level ${level} with ${treeKeys.length} nodes:`,
    treeKeys
  );

  if (treeKeys.length === 0) {
    console.warn("No keys found in tree at level", level);
    return "";
  }

  try {
    // Use for...of instead of forEach to avoid issues with return statements
    const nodes = Object.values(tree);
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];

      try {
        // Enhanced node validation
        if (!node || typeof node !== "object") {
          console.warn("Invalid node (not object):", node);
          continue; // Skip this node
        }

        if (
          !node.title ||
          typeof node.title !== "string" ||
          node.title.trim() === ""
        ) {
          console.warn("Invalid node title:", node);
          continue; // Skip this node
        }

        console.log(
          `Processing node ${index + 1}/${treeKeys.length}: "${node.title}"`
        );

        const hasChildren =
          node.children &&
          typeof node.children === "object" &&
          Object.keys(node.children).length > 0;
        const indent = level * 20;

        // Create a safe topic ID with better fallback
        let topicId = node.title
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_áéíóúñÁÉÍÓÚÑüÜ]/g, "") // Allow more Spanish characters
          .substring(0, 50); // Limit length

        // Fallback if ID is empty
        if (!topicId || topicId.trim() === "") {
          topicId = `topic_${level}_${index}_${Date.now()}`;
          console.warn(
            "Using fallback ID for topic:",
            node.title,
            "->",
            topicId
          );
        }

        // Ensure unique ID
        const finalTopicId = `topic_${topicId}_${level}_${index}`;

        // Build the HTML for this node
        const nodeHtml = `
                <div class="topic-item" style="margin-left: ${indent}px;">
                    <div class="form-check d-flex align-items-center">
                        ${
                          hasChildren
                            ? `<button class="btn btn-sm btn-link p-0 me-2" onclick="toggleTopicGroup(this)" type="button">
                                <i class="bi bi-chevron-right"></i>
                            </button>`
                            : '<span class="me-4"></span>'
                        }
                        <input class="form-check-input me-2" type="checkbox" 
                               id="${finalTopicId}"
                               ${
                                 node.isLeaf || !hasChildren
                                   ? 'data-topic-id="' +
                                     encodeURIComponent(node.title) +
                                     '"'
                                   : ""
                               }
                               onchange="handleTopicSelection(this)">
                        <label class="form-check-label flex-grow-1" 
                               for="${finalTopicId}">
                            <div class="d-flex align-items-center">
                                <i class="bi ${
                                  hasChildren ? "bi-folder" : "bi-file-text"
                                } me-2 text-${
          hasChildren ? "primary" : "info"
        }"></i>
                                <span class="fw-${
                                  hasChildren ? "medium" : "normal"
                                }">${escapeHtml(node.title)}</span>
                                ${
                                  node.topicData?.description &&
                                  typeof node.topicData.description === "string"
                                    ? `<small class="text-muted ms-2">(${escapeHtml(
                                        node.topicData.description
                                      )})</small>`
                                    : ""
                                }
                            </div>
                        </label>
                    </div>
                    ${
                      hasChildren
                        ? `<div class="topic-children" style="display: none;">
                            ${renderTopicTree(node.children, level + 1)}
                        </div>`
                        : ""
                    }
                </div>
            `;

        html += nodeHtml;
        console.log(
          `Added HTML for node "${node.title}", current HTML length: ${html.length}`
        );
      } catch (nodeError) {
        console.error(`Error processing node ${index}:`, nodeError, node);
        // Continue with other nodes
      }
    }
  } catch (treeError) {
    console.error("Error in renderTopicTree:", treeError);
    return "";
  }

  console.log(
    `Finished rendering tree at level ${level}, HTML length: ${html.length}`
  );

  if (html.length === 0) {
    console.warn("Generated HTML is empty at level", level, "for tree:", tree);
  }

  return html;
}

// Enhanced HTML sanitization function
function escapeHtml(text) {
  if (!text) return "";

  // Convert to string if not already
  const str = typeof text === "string" ? text : String(text);

  // Basic HTML escape using DOM method (most reliable)
  try {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  } catch (error) {
    console.warn(
      "⚠️ DOM-based HTML escape failed, using manual method:",
      error
    );

    // Fallback manual escape
    return str.replace(/[<>&"']/g, function (match) {
      const escapeMap = {
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#x27;",
      };
      return escapeMap[match] || match;
    });
  }
}

// Additional sanitization for topic titles
function sanitizeTopicTitle(title) {
  if (!title) return "";

  let sanitized = String(title).trim();

  // Remove or replace potentially problematic characters
  sanitized = sanitized
    .replace(/[\x00-\x1F\x7F]/g, "") // Remove control characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .substring(0, 200); // Limit length

  return escapeHtml(sanitized);
}

// Safe ID generation for HTML elements
function generateSafeId(prefix, index, title) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 5);

  // Create base ID
  let baseId = `${prefix}_${index}_${timestamp}_${random}`;

  // Add title-based component if available
  if (title && typeof title === "string") {
    const titlePart = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 20);

    if (titlePart) {
      baseId = `${prefix}_${titlePart}_${index}_${random}`;
    }
  }

  return baseId;
}

// Fallback function to create a simple topic list
function createFallbackTopicList(topics) {
  console.log("=== FALLBACK RENDERING ===");
  console.log("Input topics:", topics);
  console.log("Topics type:", typeof topics);
  console.log("Topics is array:", Array.isArray(topics));

  if (!topics || !Array.isArray(topics)) {
    console.log("Invalid topics input for fallback, returning empty string");
    return "";
  }

  if (topics.length === 0) {
    console.log("Empty topics array for fallback");
    return "";
  }

  let html = "";
  let validTopicCount = 0;

  try {
    topics.forEach((topic, index) => {
      try {
        console.log(`Processing fallback topic ${index}:`, topic);
        let topicTitle = "";
        let subtopics = [];

        // Extract topic data with better validation
        if (typeof topic === "string") {
          topicTitle = topic.trim();
        } else if (topic && typeof topic === "object") {
          topicTitle = (topic.topic || topic.title || topic.name || "").trim();
          subtopics = topic.subtopics || topic.children || topic.items || [];

          // Ensure subtopics is an array
          if (!Array.isArray(subtopics)) {
            subtopics = [];
          }
        }

        // Skip if no valid title
        if (!topicTitle || topicTitle === "") {
          console.warn(`Skipping topic ${index} - no valid title`);
          return;
        }

        const topicId = `fallback_topic_${index}_${Date.now()}`;
        validTopicCount++;

        html += `
          <div class="topic-item mb-3">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" 
                     id="${topicId}"
                     data-topic-id="${encodeURIComponent(topicTitle)}"
                     onchange="handleTopicSelection(this)">
              <label class="form-check-label fw-medium" for="${topicId}">
                <i class="bi bi-folder me-2 text-primary"></i>
                ${escapeHtml(topicTitle)}
              </label>
            </div>
        `;

        // Add subtopics if they exist
        if (subtopics && Array.isArray(subtopics) && subtopics.length > 0) {
          html += '<div class="ms-4 mt-2">';

          subtopics.forEach((subtopic, subIndex) => {
            try {
              let subtopicTitle = "";

              if (typeof subtopic === "string") {
                subtopicTitle = subtopic.trim();
              } else if (subtopic && typeof subtopic === "object") {
                subtopicTitle = (
                  subtopic.topic ||
                  subtopic.title ||
                  subtopic.name ||
                  ""
                ).trim();
              }

              if (subtopicTitle && subtopicTitle !== "") {
                const subtopicId = `fallback_subtopic_${index}_${subIndex}_${Date.now()}`;
                html += `
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" 
                           id="${subtopicId}"
                           data-topic-id="${encodeURIComponent(subtopicTitle)}"
                           onchange="handleTopicSelection(this)">
                    <label class="form-check-label" for="${subtopicId}">
                      <i class="bi bi-file-text me-2 text-info"></i>
                      ${escapeHtml(subtopicTitle)}
                    </label>
                  </div>
                `;
              }
            } catch (subtopicError) {
              console.error(
                `Error processing subtopic ${subIndex}:`,
                subtopicError
              );
            }
          });

          html += "</div>";
        }

        html += "</div>";
      } catch (topicError) {
        console.error(`Error processing fallback topic ${index}:`, topicError);
      }
    });

    console.log(
      `Fallback rendering completed: ${validTopicCount} valid topics, HTML length: ${html.length}`
    );

    if (validTopicCount === 0) {
      console.error("No valid topics found in fallback rendering");
      return `
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle me-2"></i>
          No se encontraron temas válidos para mostrar.
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-primary" onclick="extractTopicsFromDocuments()">
              <i class="bi bi-arrow-clockwise me-1"></i>Reintentar Extracción
            </button>
          </div>
        </div>
      `;
    }

    return html;
  } catch (error) {
    console.error("Error in createFallbackTopicList:", error);
    return "";
  }
}

function toggleTopicGroup(button) {
  const icon = button.querySelector("i");
  const children = button
    .closest(".topic-item")
    .querySelector(".topic-children");

  if (children.style.display === "none") {
    children.style.display = "block";
    icon.className = "bi bi-chevron-down";
  } else {
    children.style.display = "none";
    icon.className = "bi bi-chevron-right";
  }
}

function setupTopicSelectionHandlers() {
  // Set up individual topic selection
  document.querySelectorAll("input[data-topic-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", updateSelectedTopicsCount);
  });

  // Initial count update
  updateSelectedTopicsCount();
}

function handleTopicSelection(checkbox) {
  console.log(
    "🎯 Topic selection changed:",
    checkbox.id,
    "checked:",
    checkbox.checked
  );
  try {
    updateSelectedTopicsCount();
  } catch (error) {
    console.error("❌ Error in handleTopicSelection:", error);
  }
}

function updateSelectedTopicsCount() {
  try {
    console.log("📊 Updating selected topics count");

    const selectedCheckboxes = document.querySelectorAll(
      "input[data-topic-id]:checked"
    );
    const count = selectedCheckboxes.length;

    console.log(`📊 Found ${count} selected topics`);

    // Update selected topics array with better error handling
    examGeneratorState.selectedTopics = Array.from(selectedCheckboxes).map(
      (cb) => {
        try {
          const topicId = cb.dataset.topicId || cb.id;
          let title = topicId; // fallback to ID

          // Try to get title from label
          const label = cb.nextElementSibling;
          if (label && label.textContent) {
            title = label.textContent.trim();
            // Remove icon text if present
            title = title.replace(/^[^\w\s]*\s*/, "").trim();
          }

          return {
            id: topicId,
            title: title || `Tema ${topicId}`,
          };
        } catch (topicError) {
          console.error("❌ Error processing selected topic:", topicError, cb);
          return {
            id: cb.id || "unknown",
            title: "Tema desconocido",
          };
        }
      }
    );

    console.log("📊 Selected topics:", examGeneratorState.selectedTopics);

    // Update UI elements with error handling
    const countElement = document.getElementById("selectedTopicsCount");
    if (countElement) {
      countElement.textContent = count;
    } else {
      console.warn("⚠️ selectedTopicsCount element not found");
    }

    const summaryContainer = document.getElementById("selectedTopicsSummary");
    const nextBtn = document.getElementById("nextToConfigBtn");

    if (count > 0) {
      if (summaryContainer) summaryContainer.style.display = "block";
      if (nextBtn) nextBtn.disabled = false;
      console.log("✅ Next button enabled");
    } else {
      if (summaryContainer) summaryContainer.style.display = "none";
      if (nextBtn) nextBtn.disabled = true;
      console.log("⚠️ Next button disabled - no topics selected");
    }
  } catch (error) {
    console.error("❌ Error in updateSelectedTopicsCount:", error);
    console.error("❌ Error stack:", error.stack);
  }
}

function selectAllTopics() {
  console.log("✅ Selecting all topics");
  try {
    const checkboxes = document.querySelectorAll("input[data-topic-id]");
    console.log(`✅ Found ${checkboxes.length} topic checkboxes to select`);

    checkboxes.forEach((checkbox, index) => {
      try {
        checkbox.checked = true;
      } catch (checkboxError) {
        console.error(`❌ Error selecting checkbox ${index}:`, checkboxError);
      }
    });

    updateSelectedTopicsCount();
    console.log("✅ All topics selected successfully");
  } catch (error) {
    console.error("❌ Error in selectAllTopics:", error);
  }
}

function clearAllTopics() {
  console.log("🧹 Clearing all topic selections");
  try {
    const checkboxes = document.querySelectorAll("input[data-topic-id]");
    console.log(`🧹 Found ${checkboxes.length} topic checkboxes to clear`);

    checkboxes.forEach((checkbox, index) => {
      try {
        checkbox.checked = false;
      } catch (checkboxError) {
        console.error(`❌ Error clearing checkbox ${index}:`, checkboxError);
      }
    });

    updateSelectedTopicsCount();
    console.log("✅ All topics cleared successfully");
  } catch (error) {
    console.error("❌ Error in clearAllTopics:", error);
  }
}

function showSelectedTopics() {
  const selectedList = examGeneratorState.selectedTopics
    .map(
      (topic) =>
        `<li><i class="bi bi-check-circle text-success me-2"></i>${topic.title}</li>`
    )
    .join("");

  Swal.fire({
    title: "Temas Seleccionados",
    html: `
            <div class="text-start">
                <ul class="list-unstyled">
                    ${selectedList}
                </ul>
            </div>
        `,
    icon: "info",
    confirmButtonColor: "#008FD0",
  });
}

function updateSourceDocumentsList() {
  const container = document.getElementById("sourceDocumentsList");

  container.innerHTML = examGeneratorState.uploadedFiles
    .map(
      (file) => `
        <div class="d-flex align-items-center mb-2">
            <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
            <span class="small">${file.name}</span>
        </div>
    `
    )
    .join("");
}

// Configuration Step
function proceedToConfiguration() {
  if (examGeneratorState.selectedTopics.length === 0) {
    showError("Debe seleccionar al menos un tema", "Temas Requeridos");
    return;
  }

  showStep(3);
  updateConfigurationPreview();
  setupConfigurationHandlers();
}

function setupConfigurationHandlers() {
  // Set up form change handlers for live preview
  const form = document.getElementById("examConfigForm");
  const inputs = form.querySelectorAll("input, select");

  inputs.forEach((input) => {
    input.addEventListener("change", updateConfigurationPreview);
  });
}

function updateConfigurationPreview() {
  // Update preview panel
  const questionCount = document.getElementById("questionCount").value || "10";
  const difficulty = document.getElementById("difficulty").value || "medium";
  const versions = document.getElementById("versions").value || "2";
  const language = document.getElementById("language").value || "es";
  const selfAssessment = document.getElementById(
    "includeSelfAssessment"
  ).checked;

  // Get selected question types
  const questionTypes = [];
  if (document.getElementById("multipleChoice").checked)
    questionTypes.push("Opción Múltiple");
  if (document.getElementById("trueFalse").checked)
    questionTypes.push("Verdadero/Falso");
  if (document.getElementById("mixed").checked) questionTypes.push("Mixto");

  // Update preview
  document.getElementById("previewQuestionCount").textContent = questionCount;
  document.getElementById("previewDifficulty").textContent =
    getDifficultyLabel(difficulty);
  document.getElementById("previewQuestionTypes").textContent =
    questionTypes.join(", ") || "Opción Múltiple";
  document.getElementById("previewVersions").textContent = versions;
  document.getElementById("previewLanguage").textContent =
    getLanguageLabel(language);
  document.getElementById("previewSelfAssessment").textContent = selfAssessment
    ? "Sí"
    : "No";

  // Update selected topics preview
  const topicsPreview = document.getElementById("selectedTopicsPreview");
  topicsPreview.innerHTML =
    examGeneratorState.selectedTopics
      .slice(0, 5)
      .map(
        (topic) => `
        <span class="badge bg-primary me-1 mb-1">${topic.title}</span>
    `
      )
      .join("") +
    (examGeneratorState.selectedTopics.length > 5
      ? `<span class="badge bg-secondary">+${
          examGeneratorState.selectedTopics.length - 5
        } más</span>`
      : "");
}

function getDifficultyLabel(difficulty) {
  const labels = {
    easy: "Fácil",
    medium: "Intermedio",
    hard: "Difícil",
  };
  return labels[difficulty] || difficulty;
}

function getLanguageLabel(language) {
  const labels = {
    es: "Español",
    en: "Inglés",
    fr: "Francés",
  };
  return labels[language] || language;
}

// Generation Step
function proceedToGeneration() {
  // Validate configuration
  if (!validateExamConfiguration()) {
    return;
  }

  // Store configuration
  examGeneratorState.examConfig = getExamConfiguration();

  // Show step 4
  showStep(4);

  // Update generation summary
  updateGenerationSummary();
}

function validateExamConfiguration() {
  const questionCount = document.getElementById("questionCount").value;
  const difficulty = document.getElementById("difficulty").value;

  if (!questionCount) {
    showError(
      "Debe seleccionar el número de preguntas",
      "Configuración Incompleta"
    );
    return false;
  }

  if (!difficulty) {
    showError(
      "Debe seleccionar el nivel de dificultad",
      "Configuración Incompleta"
    );
    return false;
  }

  // Check at least one question type is selected
  const hasQuestionType =
    document.getElementById("multipleChoice").checked ||
    document.getElementById("trueFalse").checked ||
    document.getElementById("mixed").checked;

  if (!hasQuestionType) {
    showError(
      "Debe seleccionar al menos un tipo de pregunta",
      "Configuración Incompleta"
    );
    return false;
  }

  return true;
}

function getExamConfiguration() {
  const questionTypes = [];
  if (document.getElementById("multipleChoice").checked)
    questionTypes.push("multiple_choice");
  if (document.getElementById("trueFalse").checked)
    questionTypes.push("true_false");
  if (document.getElementById("mixed").checked) questionTypes.push("mixed");

  return {
    questionCount: parseInt(document.getElementById("questionCount").value),
    difficulty: document.getElementById("difficulty").value,
    questionTypes: questionTypes,
    versions: parseInt(document.getElementById("versions").value),
    language: document.getElementById("language").value,
    includeSelfAssessment: document.getElementById("includeSelfAssessment")
      .checked,
  };
}

function updateGenerationSummary() {
  document.getElementById("summaryDocCount").textContent =
    examGeneratorState.uploadedFiles.length;
  document.getElementById("summaryTopicCount").textContent =
    examGeneratorState.selectedTopics.length;
  document.getElementById("summaryQuestionCount").textContent =
    examGeneratorState.examConfig.questionCount;
  document.getElementById("summaryDifficulty").textContent = getDifficultyLabel(
    examGeneratorState.examConfig.difficulty
  );
  document.getElementById("summaryVersions").textContent =
    examGeneratorState.examConfig.versions;
  document.getElementById("summaryLanguage").textContent = getLanguageLabel(
    examGeneratorState.examConfig.language
  );
}

// Exam Generation Process
async function startGeneration() {
  const progressContainer = document.getElementById("generationProgress");
  const resultsContainer = document.getElementById("generationResults");
  const startBtn = document.getElementById("startGenerationBtn");
  const backBtn = document.getElementById("backToConfigBtn");

  // Show progress, hide results
  progressContainer.style.display = "block";
  resultsContainer.style.display = "none";
  startBtn.style.display = "none";
  backBtn.disabled = true;

  try {
    console.log("🚀 Starting exam generation with async pattern");

    // Start generation
    updateGenerationProgress(
      5,
      "Iniciando generación...",
      "Preparando documentos y configuración..."
    );

    const generationRequest = {
      teacherId: getCurrentTeacherId(),
      selectedTopics: examGeneratorState.selectedTopics.map((t) => t.title),
      sourceDocuments: examGeneratorState.uploadedFiles.map((f) => f.name),
      examConfig: examGeneratorState.examConfig,
    };

    console.log("📤 Sending generation request:", generationRequest);

    updateGenerationProgress(
      10,
      "Enviando solicitud...",
      "Iniciando procesamiento asíncrono..."
    );

    const response = await apiCall("/exam/generate/start", {
      method: "POST",
      body: JSON.stringify(generationRequest),
    });

    console.log("✅ Generation started successfully:", response);

    // Store generation ID and start polling
    examGeneratorState.generationId = response.examId;

    // Update progress with initial response data
    if (response.progress) {
      updateGenerationProgressFromBackend(response.progress, response.status);
    } else {
      updateGenerationProgress(
        15,
        "Generación iniciada",
        "Comenzando procesamiento en segundo plano..."
      );
    }

    // Start polling for status updates
    await pollGenerationStatus();
  } catch (error) {
    console.error("❌ Generation error:", error);
    showGenerationError(error.message);
  }
}

async function pollGenerationStatus() {
  const maxAttempts = 120; // 10 minutes max (increased for longer processing)
  let attempts = 0;
  let lastProgress = 0;

  console.log(
    "🔄 Starting status polling for exam:",
    examGeneratorState.generationId
  );

  const poll = async () => {
    attempts++;

    try {
      console.log(`📊 Polling attempt ${attempts}/${maxAttempts}`);

      const status = await apiCall(
        `/exam/generate/${examGeneratorState.generationId}`
      );

      console.log("📈 Status update received:", status);

      switch (status.status) {
        case "PROCESSING":
          // Use backend progress information if available
          if (status.progress) {
            updateGenerationProgressFromBackend(status.progress, status.status);
            lastProgress = status.progress.percentage || lastProgress;
          } else {
            // Fallback to time-based progress estimation
            const timeProgress = Math.min(20 + attempts * 1, 85);
            updateGenerationProgress(
              timeProgress,
              "Generando examen...",
              "Este proceso puede tomar varios minutos..."
            );
            lastProgress = timeProgress;
          }

          if (attempts < maxAttempts) {
            // Dynamic polling interval based on progress
            const pollInterval = lastProgress > 50 ? 3000 : 5000; // Poll faster when closer to completion
            setTimeout(poll, pollInterval);
          } else {
            throw new Error(
              "Tiempo de espera agotado. La generación puede continuar en segundo plano."
            );
          }
          break;

        case "COMPLETED":
          console.log("✅ Generation completed successfully");
          updateGenerationProgress(
            100,
            "Generación completada",
            "Examen generado exitosamente"
          );
          setTimeout(() => showGenerationResults(status), 1000);
          break;

        case "FAILED":
          console.error("❌ Generation failed:", status.errorMessage);
          throw new Error(status.errorMessage || "Error en la generación");

        default:
          console.warn("⚠️ Unknown status:", status.status);
          throw new Error("Estado desconocido: " + status.status);
      }
    } catch (error) {
      console.error("❌ Polling error:", error);
      throw error;
    }
  };

  await poll();
}

function updateGenerationProgress(percentage, statusText, subtext) {
  document.getElementById("generationProgressBar").style.width =
    percentage + "%";
  document.getElementById("generationPercentage").textContent =
    percentage + "%";
  document.getElementById("generationStatusText").textContent = statusText;
  document.getElementById("generationSubtext").textContent = subtext;
}

function updateGenerationProgressFromBackend(progressInfo, status) {
  console.log("📊 Updating progress from backend:", progressInfo);

  try {
    const percentage = Math.min(progressInfo.percentage || 0, 100);
    const currentStep = progressInfo.currentStep || "processing";
    const completedVersions = progressInfo.completedVersions || 0;
    const totalVersions = progressInfo.totalVersions || 1;
    const message = progressInfo.message || "Procesando...";

    // Update progress bar
    document.getElementById("generationProgressBar").style.width =
      percentage + "%";
    document.getElementById("generationPercentage").textContent =
      percentage + "%";

    // Create detailed status text
    let statusText = "Generando examen...";
    if (currentStep.includes("version")) {
      statusText = `Generando versión ${
        completedVersions + 1
      } de ${totalVersions}`;
    } else if (currentStep === "generating_self_assessment") {
      statusText = "Generando autoevaluación...";
    } else if (currentStep === "completed") {
      statusText = "Generación completada";
    } else if (currentStep === "failed") {
      statusText = "Error en la generación";
    }

    document.getElementById("generationStatusText").textContent = statusText;

    // Create detailed subtext with progress info
    let subtext = message;
    if (totalVersions > 1 && status === "PROCESSING") {
      subtext += ` (${completedVersions}/${totalVersions} versiones completadas)`;
    }

    // Add estimated completion time if available
    if (progressInfo.estimatedCompletion && status === "PROCESSING") {
      const estimatedTime = new Date(progressInfo.estimatedCompletion);
      const now = new Date();
      const remainingMinutes = Math.max(
        0,
        Math.ceil((estimatedTime - now) / (1000 * 60))
      );

      if (remainingMinutes > 0) {
        subtext += ` - Tiempo estimado restante: ${remainingMinutes} minuto${
          remainingMinutes !== 1 ? "s" : ""
        }`;
      }
    }

    document.getElementById("generationSubtext").textContent = subtext;

    console.log(`✅ Progress updated: ${percentage}% - ${statusText}`);
  } catch (error) {
    console.error("❌ Error updating progress from backend:", error);
    // Fallback to basic progress update
    updateGenerationProgress(
      progressInfo.percentage || 0,
      "Generando examen...",
      progressInfo.message || "Procesando..."
    );
  }
}

function showGenerationResults(statusData) {
  const progressContainer = document.getElementById("generationProgress");
  const resultsContainer = document.getElementById("generationResults");
  const filesList = document.getElementById("generatedFilesList");

  // Hide progress, show results
  progressContainer.style.display = "none";
  resultsContainer.style.display = "block";

  // Show action buttons
  document.getElementById("viewHistoryBtn").style.display = "inline-block";
  document.getElementById("newExamBtn").style.display = "inline-block";

  // Display generated files
  if (statusData.generatedFiles && statusData.generatedFiles.length > 0) {
    filesList.innerHTML = `
            <h6 class="mb-3">Archivos Generados:</h6>
            <div class="row">
                ${statusData.generatedFiles
                  .map(
                    (file) => `
                    <div class="col-md-6 mb-3">
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between">
                                    <div>
                                        <h6 class="mb-1">
                                            <i class="bi bi-file-earmark-pdf text-danger me-2"></i>
                                            ${
                                              file.type === "student_version"
                                                ? "Versión Estudiante"
                                                : "Versión Profesor"
                                            }
                                        </h6>
                                        <small class="text-muted">Versión ${
                                          file.version
                                        } - ${file.format}</small>
                                    </div>
                                    <div class="btn-group">
                                        <button class="btn btn-sm btn-primary" onclick="downloadFile('${
                                          file.s3Key
                                        }', '${file.type}_v${
                      file.version
                    }.pdf')" title="Descargar PDF">
                                            <i class="bi bi-download"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-primary dropdown-toggle dropdown-toggle-split" 
                                                data-bs-toggle="dropdown" aria-expanded="false" title="Más formatos">
                                            <span class="visually-hidden">Toggle Dropdown</span>
                                        </button>
                                        <ul class="dropdown-menu">
                                            <li><a class="dropdown-item" href="#" onclick="downloadFile('${
                                              file.s3Key
                                            }', '${file.type}_v${
                      file.version
                    }.pdf', 'original')">
                                                <i class="bi bi-file-pdf me-2"></i>PDF Original
                                            </a></li>
                                            <li><a class="dropdown-item" href="#" onclick="downloadFile('${
                                              file.s3Key
                                            }', '${file.type}_v${
                      file.version
                    }.docx', 'docx')">
                                                <i class="bi bi-file-word me-2"></i>Documento Word
                                            </a></li>
                                            <li><hr class="dropdown-divider"></li>
                                            <li><a class="dropdown-item" href="#" onclick="downloadFileWithOptions('${
                                              file.s3Key
                                            }', '${file.type}_v${
                      file.version
                    }')">
                                                <i class="bi bi-gear me-2"></i>Opciones avanzadas
                                            </a></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `;
  }
}

function showGenerationError(errorMessage) {
  console.error("🚨 Showing generation error:", errorMessage);

  const progressContainer = document.getElementById("generationProgress");
  const resultsContainer = document.getElementById("generationResults");

  progressContainer.style.display = "none";
  resultsContainer.style.display = "block";

  // Enhanced error display with more context and options
  resultsContainer.innerHTML = `
        <div class="alert alert-danger">
            <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill me-3" style="font-size: 1.5rem;"></i>
                <div class="flex-grow-1">
                    <h6 class="mb-1">Error en la Generación</h6>
                    <p class="mb-2">${errorMessage}</p>
                    <small class="text-muted">
                        Si el problema persiste, intente con menos versiones o contacte al soporte técnico.
                    </small>
                </div>
            </div>
            <div class="mt-3 d-flex gap-2 flex-wrap">
                <button class="btn btn-outline-danger" onclick="startGeneration()">
                    <i class="bi bi-arrow-clockwise me-2"></i>
                    Reintentar Generación
                </button>
                <button class="btn btn-outline-secondary" onclick="checkGenerationStatus()">
                    <i class="bi bi-search me-2"></i>
                    Verificar Estado
                </button>
                <button class="btn btn-outline-info" onclick="showStep(3)">
                    <i class="bi bi-arrow-left me-2"></i>
                    Modificar Configuración
                </button>
            </div>
        </div>
    `;

  // Re-enable back button
  document.getElementById("backToConfigBtn").disabled = false;
  document.getElementById("startGenerationBtn").style.display = "inline-block";
}

async function checkGenerationStatus() {
  if (!examGeneratorState.generationId) {
    showError(
      "No hay una generación en curso para verificar",
      "Sin Generación Activa"
    );
    return;
  }

  try {
    console.log(
      "🔍 Checking generation status for:",
      examGeneratorState.generationId
    );
    showLoading("Verificando estado de generación...");

    const status = await apiCall(
      `/exam/generate/${examGeneratorState.generationId}`
    );

    hideLoading();

    if (status.status === "COMPLETED") {
      showSuccess(
        "¡La generación se completó exitosamente!",
        "Generación Completada"
      );
      showGenerationResults(status);
    } else if (status.status === "PROCESSING") {
      showSuccess(
        "La generación aún está en proceso. Continuando con el seguimiento...",
        "Generación en Proceso"
      );
      // Restart polling
      document.getElementById("generationProgress").style.display = "block";
      document.getElementById("generationResults").style.display = "none";
      await pollGenerationStatus();
    } else if (status.status === "FAILED") {
      showError(
        `La generación falló: ${status.errorMessage || "Error desconocido"}`,
        "Generación Fallida"
      );
    } else {
      showError(`Estado desconocido: ${status.status}`, "Estado Desconocido");
    }
  } catch (error) {
    hideLoading();
    console.error("❌ Error checking generation status:", error);
    showError(
      `Error al verificar el estado: ${error.message}`,
      "Error de Verificación"
    );
  }
}

// File Download with enhanced format support
async function downloadFile(s3Key, fileName, format = "original") {
  try {
    showLoading("Preparando descarga...");

    const response = await apiCall(
      `/exam/download/${encodeURIComponent(s3Key)}?format=${format}`
    );

    // Create download link
    const link = document.createElement("a");
    link.href = response.downloadUrl;

    // Adjust filename based on format
    let finalFileName = fileName;
    if (format === "docx" && !fileName.endsWith(".docx")) {
      finalFileName = fileName.replace(/\.[^/.]+$/, ".docx");
    }

    link.download = finalFileName;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    hideLoading();
    showSuccess("Archivo descargado exitosamente");
  } catch (error) {
    hideLoading();
    showError("Error al descargar el archivo: " + error.message);
  }
}

// Enhanced download with format selection
async function downloadFileWithOptions(s3Key, fileName) {
  try {
    const { value: format } = await Swal.fire({
      title: "Seleccionar formato de descarga",
      input: "select",
      inputOptions: {
        original: "Formato original (PDF)",
        pdf: "PDF optimizado",
        docx: "Documento Word (DOCX)",
      },
      inputValue: "original",
      showCancelButton: true,
      confirmButtonText: "Descargar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#008FD0",
    });

    if (format) {
      await downloadFile(s3Key, fileName, format);
    }
  } catch (error) {
    showError("Error en la selección de formato: " + error.message);
  }
}

// Step Navigation
function showStep(stepNumber) {
  // Hide all steps
  document.querySelectorAll(".step-content").forEach((step) => {
    step.style.display = "none";
  });

  // Show current step
  document.getElementById(`step${stepNumber}`).style.display = "block";

  // Update step indicators
  updateStepIndicators(stepNumber);

  // Update state
  examGeneratorState.currentStep = stepNumber;
}

function updateStepIndicators(currentStep) {
  document.querySelectorAll(".step-indicator").forEach((indicator, index) => {
    const stepNum = index + 1;
    const circle = indicator.querySelector(".step-circle");

    circle.classList.remove("active", "completed");

    if (stepNum < currentStep) {
      circle.classList.add("completed");
      circle.innerHTML = '<i class="bi bi-check"></i>';
    } else if (stepNum === currentStep) {
      circle.classList.add("active");
    }
  });
}

function setupStepNavigation() {
  // Step navigation is handled by individual step functions
  // This function can be used for additional setup if needed
}

// Navigation Functions
function goBackToUpload() {
  showStep(1);
}

function goBackToTopics() {
  showStep(2);
}

function goBackToConfig() {
  showStep(3);
}

function goToExamHistory() {
  window.location.href = "exam-history.html";
}

function startNewExam() {
  if (
    confirm(
      "¿Está seguro de que desea iniciar un nuevo examen? Se perderá el progreso actual."
    )
  ) {
    // Reset state
    examGeneratorState = {
      currentStep: 1,
      uploadedFiles: [],
      extractedTopics: [],
      selectedTopics: [],
      examConfig: {},
      generationId: null,
    };

    // Reset UI
    clearAllFiles();
    showStep(1);

    // Reset forms
    document.getElementById("examConfigForm").reset();
    document.getElementById("multipleChoice").checked = true;
    document.getElementById("includeSelfAssessment").checked = true;
  }
}

// Form Validation
function setupFormValidation() {
  // Add any additional form validation setup here
}

// Utility Functions
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function updateProgress(progressBar, progressText, percentage, statusText) {
  progressBar.style.width = percentage + "%";
  progressText.textContent = Math.round(percentage) + "%";

  if (statusText) {
    const statusElement =
      progressText.parentElement.querySelector("span:first-child");
    if (statusElement) {
      statusElement.textContent = statusText;
    }
  }
}

// Export functions for global access
window.checkAuthentication = checkAuthentication;
window.getCurrentTeacherId = getCurrentTeacherId;
window.logout = logout;
window.proceedToTopicExtraction = proceedToTopicExtraction;
window.proceedToConfiguration = proceedToConfiguration;
window.proceedToGeneration = proceedToGeneration;
window.startGeneration = startGeneration;
window.goBackToUpload = goBackToUpload;
window.goBackToTopics = goBackToTopics;
window.goBackToConfig = goBackToConfig;
window.goToExamHistory = goToExamHistory;
window.startNewExam = startNewExam;
window.removeFile = removeFile;
window.clearAllFiles = clearAllFiles;
window.selectAllTopics = selectAllTopics;
window.clearAllTopics = clearAllTopics;
window.showSelectedTopics = showSelectedTopics;
window.toggleTopicGroup = toggleTopicGroup;
window.handleTopicSelection = handleTopicSelection;
window.downloadFile = downloadFile;
window.downloadFileWithOptions = downloadFileWithOptions;

// Simple topic display function - alternative to complex tree rendering
function createSimpleTopicDisplay(topics) {
  console.log("🎨 === SIMPLE TOPIC DISPLAY START ===");
  console.log("📊 Input topics:", topics);
  console.log("📊 Topics type:", typeof topics);
  console.log("📊 Topics is array:", Array.isArray(topics));
  console.log("📊 Topics length:", topics ? topics.length : 0);

  // Validate input
  if (!topics) {
    console.error("❌ Topics is null or undefined");
    return null;
  }

  if (!Array.isArray(topics)) {
    console.error("❌ Topics is not an array:", typeof topics);
    return null;
  }

  if (topics.length === 0) {
    console.warn("⚠️ Topics array is empty");
    return `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>
        No se encontraron temas para mostrar.
      </div>
    `;
  }

  console.log(`🎨 Creating simple topic display for ${topics.length} topics`);

  try {
    let html = `
      <div class="alert alert-success mb-3">
        <i class="bi bi-check-circle me-2"></i>
        Se extrajeron ${topics.length} temas principales. Selecciona los que deseas incluir en el examen.
      </div>
    `;

    topics.forEach((topic, topicIndex) => {
      try {
        console.log(
          `🔄 Processing topic ${topicIndex + 1}/${topics.length}:`,
          topic
        );

        // Extract topic title and subtopics
        let topicTitle = "";
        let subtopics = [];

        if (typeof topic === "string") {
          topicTitle = topic;
          console.log(`📝 Topic ${topicIndex} is string: "${topicTitle}"`);
        } else if (topic && typeof topic === "object") {
          topicTitle =
            topic.topic ||
            topic.title ||
            topic.name ||
            `Tema ${topicIndex + 1}`;
          subtopics = topic.subtopics || topic.children || topic.items || [];
          console.log(
            `📝 Topic ${topicIndex} is object - title: "${topicTitle}", subtopics: ${subtopics.length}`
          );
        } else {
          console.warn(
            `⚠️ Topic ${topicIndex} has invalid type:`,
            typeof topic,
            topic
          );
        }

        if (!topicTitle) {
          console.warn(`⚠️ Topic ${topicIndex} has no valid title, skipping`);
          return;
        }

        const mainTopicId = generateSafeId(
          "main_topic",
          topicIndex,
          topicTitle
        );
        const safeTitle = sanitizeTopicTitle(topicTitle);

        // Create main topic card
        html += `
          <div class="card mb-3">
            <div class="card-header bg-light">
              <div class="form-check">
                <input class="form-check-input main-topic-checkbox" type="checkbox" 
                       id="${mainTopicId}"
                       data-topic-id="${encodeURIComponent(topicTitle)}"
                       onchange="handleMainTopicSelection(this, ${topicIndex})">
                <label class="form-check-label fw-bold" for="${mainTopicId}">
                  <i class="bi bi-folder me-2 text-primary"></i>
                  ${safeTitle}
                </label>
              </div>
            </div>
        `;

        // Add subtopics if they exist
        if (subtopics && Array.isArray(subtopics) && subtopics.length > 0) {
          html += `
            <div class="card-body">
              <div class="row">
          `;

          subtopics.forEach((subtopic, subIndex) => {
            let subtopicTitle = "";
            if (typeof subtopic === "string") {
              subtopicTitle = subtopic;
            } else if (subtopic && typeof subtopic === "object") {
              subtopicTitle = subtopic.topic || subtopic.title || subtopic.name;
            }

            if (subtopicTitle) {
              const subtopicId = generateSafeId(
                "subtopic",
                `${topicIndex}_${subIndex}`,
                subtopicTitle
              );
              const safeSub = sanitizeTopicTitle(subtopicTitle);

              html += `
                <div class="col-md-6 mb-2">
                  <div class="form-check">
                    <input class="form-check-input subtopic-checkbox" type="checkbox" 
                           id="${subtopicId}"
                           data-topic-id="${encodeURIComponent(subtopicTitle)}"
                           data-parent-topic="${topicIndex}"
                           onchange="handleTopicSelection(this)">
                    <label class="form-check-label" for="${subtopicId}">
                      <i class="bi bi-file-text me-2 text-info"></i>
                      ${safeSub}
                    </label>
                  </div>
                </div>
              `;
            }
          });

          html += `
              </div>
            </div>
          `;
        }

        html += `</div>`;
      } catch (topicError) {
        console.error(`Error processing topic ${topicIndex}:`, topicError);
      }
    });

    // Add selection controls
    html += `
      <div class="d-flex justify-content-between align-items-center mt-3 p-3 bg-light rounded">
        <div>
          <button class="btn btn-sm btn-outline-primary me-2" onclick="selectAllTopics()">
            <i class="bi bi-check-all me-1"></i>Seleccionar Todos
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="clearAllTopics()">
            <i class="bi bi-x-square me-1"></i>Limpiar Selección
          </button>
        </div>
        <div>
          <span class="text-muted me-3">Temas seleccionados: <strong id="selectedTopicsCount">0</strong></span>
          <button class="btn btn-sm btn-info" onclick="showSelectedTopics()">
            <i class="bi bi-list-ul me-1"></i>Ver Seleccionados
          </button>
        </div>
      </div>
    `;

    console.log("✅ Simple topic display HTML generated successfully");
    console.log("📏 Final HTML length:", html.length);
    console.log("📝 Final HTML preview:", html.substring(0, 500) + "...");

    return html;
  } catch (error) {
    console.error("❌ Error in createSimpleTopicDisplay:", error);
    console.error("❌ Error stack:", error.stack);

    console.log("🚨 Using ultra-simple fallback rendering");

    // Ultra-simple fallback
    let fallbackHtml = `
      <div class="alert alert-warning mb-3">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Vista básica de temas (modo de emergencia)
      </div>
    `;

    try {
      topics.forEach((topic, index) => {
        try {
          const title =
            typeof topic === "string"
              ? topic
              : topic.topic || topic.title || topic.name || `Tema ${index + 1}`;
          const topicId = `basic_topic_${index}_${Date.now()}`;
          const safeTitle = title
            ? escapeHtml(title.toString())
            : `Tema ${index + 1}`;

          console.log(`🔧 Fallback processing topic ${index}: "${safeTitle}"`);

          fallbackHtml += `
            <div class="form-check mb-3 p-3 border rounded">
              <input class="form-check-input" type="checkbox" 
                     id="${topicId}"
                     data-topic-id="${encodeURIComponent(safeTitle)}"
                     onchange="handleTopicSelection(this)">
              <label class="form-check-label fw-medium" for="${topicId}">
                <i class="bi bi-bookmark me-2 text-primary"></i>
                ${safeTitle}
              </label>
            </div>
          `;
        } catch (topicError) {
          console.error(
            `❌ Error processing topic ${index} in fallback:`,
            topicError
          );
          // Continue with next topic
        }
      });

      fallbackHtml += `
        <div class="mt-3 p-2 bg-light rounded text-center">
          <small class="text-muted">Seleccionados: <span id="selectedTopicsCount">0</span></small>
          <div class="mt-2">
            <button class="btn btn-sm btn-outline-primary me-2" onclick="selectAllTopics()">
              Seleccionar Todos
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="clearAllTopics()">
              Limpiar Selección
            </button>
          </div>
        </div>
      `;

      console.log("✅ Fallback HTML generated successfully");
      return fallbackHtml;
    } catch (fallbackError) {
      console.error("❌ Critical error in fallback rendering:", fallbackError);

      // Absolute emergency fallback
      return `
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-2"></i>
          <strong>Error crítico en el renderizado de temas</strong>
          <p>No se pudieron mostrar los temas extraídos. Por favor, intenta recargar la página.</p>
          <button class="btn btn-sm btn-outline-danger" onclick="location.reload()">
            <i class="bi bi-arrow-clockwise me-1"></i>Recargar Página
          </button>
        </div>
      `;
    }
  }
}

// Handler for main topic selection (selects/deselects all subtopics)
function handleMainTopicSelection(checkbox, topicIndex) {
  console.log(
    `🔗 Main topic selection changed: ${checkbox.id}, index: ${topicIndex}, checked: ${checkbox.checked}`
  );

  try {
    const isChecked = checkbox.checked;
    const subtopicCheckboxes = document.querySelectorAll(
      `input[data-parent-topic="${topicIndex}"]`
    );

    console.log(
      `🔗 Found ${subtopicCheckboxes.length} subtopics for topic ${topicIndex}`
    );

    subtopicCheckboxes.forEach((subtopicCheckbox, subIndex) => {
      try {
        console.log(`🔗 Setting subtopic ${subIndex} to ${isChecked}`);
        subtopicCheckbox.checked = isChecked;
      } catch (subError) {
        console.error(`❌ Error setting subtopic ${subIndex}:`, subError);
      }
    });

    // Update the count
    updateSelectedTopicsCount();

    console.log("✅ Hierarchical selection completed");
  } catch (error) {
    console.error("❌ Error in handleMainTopicSelection:", error);
    console.error("❌ Error stack:", error.stack);

    // Still try to update count even if there was an error
    try {
      updateSelectedTopicsCount();
    } catch (countError) {
      console.error(
        "❌ Error updating count after hierarchical selection error:",
        countError
      );
    }
  }
}

// Emergency fallback rendering function - ultra-simple and robust
function createEmergencyTopicDisplay(topics) {
  console.log("🚨 === EMERGENCY TOPIC DISPLAY ===");
  console.log("📊 Emergency rendering for topics:", topics);

  if (!topics || !Array.isArray(topics) || topics.length === 0) {
    console.log("⚠️ No valid topics for emergency rendering");
    return `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <strong>No se encontraron temas</strong>
        <p>No se pudieron extraer temas de los documentos. Verifica que los PDFs contengan texto legible.</p>
        <button class="btn btn-sm btn-outline-primary" onclick="extractTopicsFromDocuments()">
          <i class="bi bi-arrow-clockwise me-1"></i>Reintentar Extracción
        </button>
      </div>
    `;
  }

  let html = `
    <div class="alert alert-info mb-3">
      <i class="bi bi-info-circle me-2"></i>
      <strong>Modo de emergencia activado</strong> - Se encontraron ${topics.length} temas para seleccionar.
    </div>
  `;

  // Process each topic with maximum safety
  topics.forEach((topic, index) => {
    try {
      let title = "Tema sin título";

      // Extract title safely
      if (typeof topic === "string" && topic.trim()) {
        title = topic.trim();
      } else if (topic && typeof topic === "object") {
        title = (
          topic.topic ||
          topic.title ||
          topic.name ||
          `Tema ${index + 1}`
        )
          .toString()
          .trim();
      }

      // Ensure we have a valid title
      if (!title || title === "") {
        title = `Tema ${index + 1}`;
      }

      // Create safe ID
      const safeId = `emergency_topic_${index}_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Escape HTML safely
      const safeTitle = title.replace(/[<>&"']/g, function (match) {
        const escapeMap = {
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&#x27;",
        };
        return escapeMap[match];
      });

      console.log(`🔧 Emergency processing topic ${index}: "${safeTitle}"`);

      html += `
        <div class="card mb-2">
          <div class="card-body py-2">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" 
                     id="${safeId}"
                     data-topic-id="${encodeURIComponent(title)}"
                     onchange="handleTopicSelection(this)">
              <label class="form-check-label" for="${safeId}">
                <i class="bi bi-file-text me-2 text-primary"></i>
                <strong>${safeTitle}</strong>
              </label>
            </div>
          </div>
        </div>
      `;
    } catch (topicError) {
      console.error(
        `❌ Error in emergency rendering for topic ${index}:`,
        topicError
      );
      // Continue with a generic topic
      const fallbackId = `emergency_fallback_${index}_${Date.now()}`;
      html += `
        <div class="card mb-2">
          <div class="card-body py-2">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" 
                     id="${fallbackId}"
                     data-topic-id="Tema ${index + 1}"
                     onchange="handleTopicSelection(this)">
              <label class="form-check-label" for="${fallbackId}">
                <i class="bi bi-file-text me-2 text-muted"></i>
                Tema ${index + 1} (error en procesamiento)
              </label>
            </div>
          </div>
        </div>
      `;
    }
  });

  // Add controls
  html += `
    <div class="mt-3 p-3 bg-light rounded">
      <div class="row align-items-center">
        <div class="col-md-6">
          <button class="btn btn-sm btn-outline-primary me-2" onclick="selectAllTopics()">
            <i class="bi bi-check-all me-1"></i>Seleccionar Todos
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="clearAllTopics()">
            <i class="bi bi-x-square me-1"></i>Limpiar
          </button>
        </div>
        <div class="col-md-6 text-end">
          <small class="text-muted">
            Seleccionados: <strong id="selectedTopicsCount">0</strong>
          </small>
        </div>
      </div>
    </div>
  `;

  console.log("✅ Emergency topic display created successfully");
  return html;
}

// Topic data validation function
function validateTopicData(topics) {
  console.log("🔍 Validating topic data");

  const validation = {
    isValid: false,
    errors: [],
    warnings: [],
    validTopics: [],
    stats: {
      total: 0,
      valid: 0,
      invalid: 0,
      withSubtopics: 0,
    },
  };

  try {
    // Check if topics exists and is array
    if (!topics) {
      validation.errors.push("Topics data is null or undefined");
      return validation;
    }

    if (!Array.isArray(topics)) {
      validation.errors.push(`Topics is not an array (type: ${typeof topics})`);
      return validation;
    }

    validation.stats.total = topics.length;

    if (topics.length === 0) {
      validation.warnings.push("Topics array is empty");
      validation.isValid = true; // Empty is valid, just not useful
      return validation;
    }

    // Validate each topic
    topics.forEach((topic, index) => {
      try {
        const topicValidation = validateSingleTopic(topic, index);

        if (topicValidation.isValid) {
          validation.validTopics.push(topicValidation.topic);
          validation.stats.valid++;

          if (
            topicValidation.topic.subtopics &&
            topicValidation.topic.subtopics.length > 0
          ) {
            validation.stats.withSubtopics++;
          }
        } else {
          validation.stats.invalid++;
          validation.warnings.push(
            `Topic ${index}: ${topicValidation.errors.join(", ")}`
          );
        }
      } catch (topicError) {
        validation.stats.invalid++;
        validation.errors.push(
          `Error validating topic ${index}: ${topicError.message}`
        );
      }
    });

    // Determine overall validity
    validation.isValid = validation.validTopics.length > 0;

    if (validation.stats.invalid > 0) {
      validation.warnings.push(
        `${validation.stats.invalid} topics were invalid and will be skipped`
      );
    }

    console.log("✅ Topic validation completed:", validation.stats);
    return validation;
  } catch (error) {
    validation.errors.push(`Critical validation error: ${error.message}`);
    console.error("❌ Error in validateTopicData:", error);
    return validation;
  }
}

function validateSingleTopic(topic, index) {
  const result = {
    isValid: false,
    errors: [],
    topic: null,
  };

  try {
    let processedTopic = {
      title: "",
      subtopics: [],
      originalIndex: index,
      originalData: topic,
    };

    // Handle string topics
    if (typeof topic === "string") {
      const trimmed = topic.trim();
      if (trimmed.length === 0) {
        result.errors.push("String topic is empty");
        return result;
      }
      if (trimmed.length > 200) {
        result.errors.push("String topic is too long (>200 chars)");
        return result;
      }
      processedTopic.title = trimmed;
      processedTopic.subtopics = [];
      result.isValid = true;
      result.topic = processedTopic;
      return result;
    }

    // Handle object topics
    if (topic && typeof topic === "object") {
      // Extract title
      const title = topic.topic || topic.title || topic.name;
      if (!title || typeof title !== "string") {
        result.errors.push("Object topic missing valid title");
        return result;
      }

      const trimmedTitle = title.trim();
      if (trimmedTitle.length === 0) {
        result.errors.push("Object topic title is empty");
        return result;
      }
      if (trimmedTitle.length > 200) {
        result.errors.push("Object topic title is too long (>200 chars)");
        return result;
      }

      processedTopic.title = trimmedTitle;

      // Extract subtopics
      const subtopics = topic.subtopics || topic.children || topic.items || [];
      if (Array.isArray(subtopics)) {
        processedTopic.subtopics = subtopics
          .filter((sub) => {
            if (typeof sub === "string") return sub.trim().length > 0;
            if (sub && typeof sub === "object") {
              const subTitle = sub.topic || sub.title || sub.name;
              return (
                subTitle &&
                typeof subTitle === "string" &&
                subTitle.trim().length > 0
              );
            }
            return false;
          })
          .map((sub) => {
            if (typeof sub === "string") return sub.trim();
            const subTitle = sub.topic || sub.title || sub.name;
            return subTitle.trim();
          })
          .slice(0, 20); // Limit subtopics to prevent UI issues
      }

      result.isValid = true;
      result.topic = processedTopic;
      return result;
    }

    // Invalid type
    result.errors.push(`Invalid topic type: ${typeof topic}`);
    return result;
  } catch (error) {
    result.errors.push(`Validation error: ${error.message}`);
    return result;
  }
}

// Export the new functions
window.createSimpleTopicDisplay = createSimpleTopicDisplay;
window.createEmergencyTopicDisplay = createEmergencyTopicDisplay;
window.handleMainTopicSelection = handleMainTopicSelection;
window.validateTopicData = validateTopicData;
