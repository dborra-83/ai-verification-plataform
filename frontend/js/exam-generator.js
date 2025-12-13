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
  const topicsContainer = document.getElementById("topicsContainer");

  console.log(
    "=== TOPIC DISPLAY START ===",
    examGeneratorState.extractedTopics
  );

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
    console.log("=== DEBUGGING TOPIC RENDERING ===");
    console.log("Raw extracted topics:", examGeneratorState.extractedTopics);
    console.log("Topics type:", typeof examGeneratorState.extractedTopics);
    console.log(
      "Topics is array:",
      Array.isArray(examGeneratorState.extractedTopics)
    );

    // Validate topic structure before processing
    const validTopics = examGeneratorState.extractedTopics.filter((topic) => {
      const isValid =
        topic &&
        (typeof topic === "string" ||
          (typeof topic === "object" &&
            (topic.topic || topic.title || topic.name)));

      if (!isValid) {
        console.warn("Invalid topic structure:", topic);
      }
      return isValid;
    });

    console.log("Valid topics after filtering:", validTopics);

    if (validTopics.length === 0) {
      throw new Error("No hay temas válidos para mostrar");
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
    const simpleHtml = createSimpleTopicDisplay(validTopics);

    if (simpleHtml && simpleHtml.trim() !== "") {
      console.log("✅ Simple topic display created successfully");
      topicsContainer.innerHTML = simpleHtml;

      // Update source documents list
      updateSourceDocumentsList();

      // Set up topic selection handlers
      setupTopicSelectionHandlers();

      console.log("=== TOPIC DISPLAY SUCCESS ===");
      return;
    } else {
      console.error("❌ Simple topic display failed");
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
          throw new Error("No se pudo renderizar el árbol de temas");
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

    // Enhanced error display with debugging info
    topicsContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                <strong>Error al mostrar los temas extraídos:</strong> ${
                  error.message
                }
                <div class="mt-2">
                    <button class="btn btn-sm btn-outline-danger" onclick="extractTopicsFromDocuments()">
                        <i class="bi bi-arrow-clockwise me-1"></i>Reintentar Extracción
                    </button>
                </div>
                <details class="mt-2">
                    <summary class="text-muted small">Información de depuración</summary>
                    <pre class="small text-muted mt-1">${JSON.stringify(
                      {
                        topicsCount:
                          examGeneratorState.extractedTopics?.length || 0,
                        topicsType: typeof examGeneratorState.extractedTopics,
                        sampleTopic:
                          examGeneratorState.extractedTopics?.[0] || null,
                        errorMessage: error.message,
                        errorStack: error.stack
                          ?.split("\n")
                          .slice(0, 3)
                          .join("\n"),
                      },
                      null,
                      2
                    )}</pre>
                </details>
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

// Helper function to escape HTML
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
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
  updateSelectedTopicsCount();
}

function updateSelectedTopicsCount() {
  const selectedCheckboxes = document.querySelectorAll(
    "input[data-topic-id]:checked"
  );
  const count = selectedCheckboxes.length;

  // Update selected topics array
  examGeneratorState.selectedTopics = Array.from(selectedCheckboxes).map(
    (cb) => ({
      id: cb.dataset.topicId,
      title: cb.nextElementSibling.textContent.trim(),
    })
  );

  // Update UI
  document.getElementById("selectedTopicsCount").textContent = count;

  const summaryContainer = document.getElementById("selectedTopicsSummary");
  const nextBtn = document.getElementById("nextToConfigBtn");

  if (count > 0) {
    summaryContainer.style.display = "block";
    nextBtn.disabled = false;
  } else {
    summaryContainer.style.display = "none";
    nextBtn.disabled = true;
  }
}

function selectAllTopics() {
  document.querySelectorAll("input[data-topic-id]").forEach((checkbox) => {
    checkbox.checked = true;
  });
  updateSelectedTopicsCount();
}

function clearAllTopics() {
  document.querySelectorAll("input[data-topic-id]").forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateSelectedTopicsCount();
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
    // Start generation
    updateGenerationProgress(
      10,
      "Iniciando generación...",
      "Preparando documentos y configuración..."
    );

    const generationRequest = {
      teacherId: getCurrentTeacherId(),
      selectedTopics: examGeneratorState.selectedTopics.map((t) => t.title),
      sourceDocuments: examGeneratorState.uploadedFiles.map((f) => f.name),
      examConfig: examGeneratorState.examConfig,
    };

    updateGenerationProgress(
      30,
      "Enviando solicitud...",
      "Procesando con Claude 3.5 Sonnet..."
    );

    const response = await apiCall("/exam/generate/start", {
      method: "POST",
      body: JSON.stringify(generationRequest),
    });

    examGeneratorState.generationId = response.examId;

    // Poll for completion
    await pollGenerationStatus();
  } catch (error) {
    console.error("Generation error:", error);
    showGenerationError(error.message);
  }
}

async function pollGenerationStatus() {
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;

  const poll = async () => {
    attempts++;

    try {
      const status = await apiCall(
        `/exam/generate/${examGeneratorState.generationId}`
      );

      switch (status.status) {
        case "PROCESSING":
          const progress = Math.min(50 + attempts * 2, 90);
          updateGenerationProgress(
            progress,
            "Generando examen...",
            "Este proceso puede tomar varios minutos..."
          );

          if (attempts < maxAttempts) {
            setTimeout(poll, 5000); // Poll every 5 seconds
          } else {
            throw new Error("Tiempo de espera agotado");
          }
          break;

        case "COMPLETED":
          updateGenerationProgress(
            100,
            "Generación completada",
            "Examen generado exitosamente"
          );
          setTimeout(() => showGenerationResults(status), 1000);
          break;

        case "FAILED":
          throw new Error(status.errorMessage || "Error en la generación");

        default:
          throw new Error("Estado desconocido: " + status.status);
      }
    } catch (error) {
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
  const progressContainer = document.getElementById("generationProgress");
  const resultsContainer = document.getElementById("generationResults");

  progressContainer.style.display = "none";
  resultsContainer.style.display = "block";
  resultsContainer.innerHTML = `
        <div class="alert alert-danger">
            <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill me-3" style="font-size: 1.5rem;"></i>
                <div>
                    <h6 class="mb-1">Error en la Generación</h6>
                    <p class="mb-0">${errorMessage}</p>
                </div>
            </div>
            <button class="btn btn-outline-danger mt-3" onclick="startGeneration()">
                <i class="bi bi-arrow-clockwise me-2"></i>
                Reintentar Generación
            </button>
        </div>
    `;

  // Re-enable back button
  document.getElementById("backToConfigBtn").disabled = false;
  document.getElementById("startGenerationBtn").style.display = "inline-block";
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
  console.log("Creating simple topic display for", topics.length, "topics");

  try {
    let html = `
      <div class="alert alert-success mb-3">
        <i class="bi bi-check-circle me-2"></i>
        Se extrajeron ${topics.length} temas principales. Selecciona los que deseas incluir en el examen.
      </div>
    `;

    topics.forEach((topic, topicIndex) => {
      try {
        // Extract topic title and subtopics
        let topicTitle = "";
        let subtopics = [];

        if (typeof topic === "string") {
          topicTitle = topic;
        } else if (topic && typeof topic === "object") {
          topicTitle =
            topic.topic ||
            topic.title ||
            topic.name ||
            `Tema ${topicIndex + 1}`;
          subtopics = topic.subtopics || topic.children || topic.items || [];
        }

        if (!topicTitle) return;

        const mainTopicId = `main_topic_${topicIndex}`;
        const safeTitle = escapeHtml(topicTitle);

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
              const subtopicId = `subtopic_${topicIndex}_${subIndex}`;
              const safeSub = escapeHtml(subtopicTitle);

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

    return html;
  } catch (error) {
    console.error("Error in createSimpleTopicDisplay:", error);

    // Ultra-simple fallback
    let fallbackHtml = `
      <div class="alert alert-warning mb-3">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Vista básica de temas
      </div>
    `;

    topics.forEach((topic, index) => {
      const title =
        typeof topic === "string"
          ? topic
          : topic.topic || topic.title || topic.name || `Tema ${index + 1}`;
      const topicId = `basic_topic_${index}`;

      fallbackHtml += `
        <div class="form-check mb-3 p-3 border rounded">
          <input class="form-check-input" type="checkbox" 
                 id="${topicId}"
                 data-topic-id="${encodeURIComponent(title)}"
                 onchange="handleTopicSelection(this)">
          <label class="form-check-label fw-medium" for="${topicId}">
            <i class="bi bi-bookmark me-2 text-primary"></i>
            ${escapeHtml(title)}
          </label>
        </div>
      `;
    });

    fallbackHtml += `
      <div class="mt-3 p-2 bg-light rounded text-center">
        <small class="text-muted">Seleccionados: <span id="selectedTopicsCount">0</span></small>
      </div>
    `;

    return fallbackHtml;
  }
}

// Handler for main topic selection (selects/deselects all subtopics)
function handleMainTopicSelection(checkbox, topicIndex) {
  const isChecked = checkbox.checked;
  const subtopicCheckboxes = document.querySelectorAll(
    `input[data-parent-topic="${topicIndex}"]`
  );

  subtopicCheckboxes.forEach((subtopicCheckbox) => {
    subtopicCheckbox.checked = isChecked;
  });

  // Update the count
  updateSelectedTopicsCount();
}

// Export the new functions
window.createSimpleTopicDisplay = createSimpleTopicDisplay;
window.handleMainTopicSelection = handleMainTopicSelection;
