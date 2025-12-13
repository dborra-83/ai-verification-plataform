// Topic Selection - JavaScript Module
// Handles interactive topic management and selection

// Topic selection state
let topicSelectionState = {
  allTopics: [],
  selectedTopics: [],
  expandedGroups: new Set(),
  searchQuery: "",
};

// Topic Selection Functions
function initializeTopicSelection(extractedTopics) {
  topicSelectionState.allTopics = extractedTopics;
  topicSelectionState.selectedTopics = [];
  topicSelectionState.expandedGroups.clear();

  renderTopicTree();
  setupTopicSearchHandlers();
}

function renderTopicTree() {
  const container = document.getElementById("topicsContainer");

  if (
    !topicSelectionState.allTopics ||
    topicSelectionState.allTopics.length === 0
  ) {
    container.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                No se encontraron temas en los documentos. Verifique que los PDFs contengan texto extraíble.
            </div>
        `;
    return;
  }

  // Build hierarchical structure
  const hierarchy = buildTopicHierarchy(topicSelectionState.allTopics);

  // Render the tree
  container.innerHTML = `
        <div class="topic-search mb-3">
            <div class="input-group">
                <span class="input-group-text">
                    <i class="bi bi-search"></i>
                </span>
                <input type="text" class="form-control" id="topicSearchInput" 
                       placeholder="Buscar temas..." onkeyup="filterTopics(this.value)">
            </div>
        </div>
        <div class="topic-tree" id="topicTree">
            ${renderHierarchyLevel(hierarchy, 0)}
        </div>
    `;

  // Set up event handlers
  setupTopicEventHandlers();
}

function buildTopicHierarchy(topics) {
  const hierarchy = {};

  topics.forEach((topic) => {
    // Parse topic path or create simple structure
    const path = topic.path || topic.category || "General";
    const parts = path.split(" > ").map((p) => p.trim());

    let current = hierarchy;

    // Build nested structure
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          title: part,
          level: index,
          children: {},
          topics: [],
          isExpanded: false,
        };
      }

      // If this is the last part, add the topic
      if (index === parts.length - 1) {
        current[part].topics.push(topic);
      }

      current = current[part].children;
    });
  });

  return hierarchy;
}

function renderHierarchyLevel(hierarchy, level) {
  let html = "";

  Object.entries(hierarchy).forEach(([key, node]) => {
    const hasChildren = Object.keys(node.children).length > 0;
    const hasTopics = node.topics.length > 0;
    const nodeId = `node_${key.replace(/\s+/g, "_")}_${level}`;
    const isExpanded = topicSelectionState.expandedGroups.has(nodeId);

    html += `
            <div class="topic-node" data-level="${level}">
                <div class="topic-node-header d-flex align-items-center py-2" 
                     style="padding-left: ${level * 20}px;">
                    
                    ${
                      hasChildren || hasTopics
                        ? `
                        <button class="btn btn-sm btn-link p-0 me-2 topic-toggle" 
                                onclick="toggleTopicNode('${nodeId}')" 
                                data-node-id="${nodeId}">
                            <i class="bi ${
                              isExpanded
                                ? "bi-chevron-down"
                                : "bi-chevron-right"
                            }"></i>
                        </button>
                    `
                        : '<span class="me-4"></span>'
                    }
                    
                    ${
                      hasChildren
                        ? `
                        <div class="form-check me-2">
                            <input class="form-check-input group-checkbox" type="checkbox" 
                                   id="group_${nodeId}" onchange="toggleGroupSelection('${nodeId}')">
                        </div>
                    `
                        : ""
                    }
                    
                    <div class="topic-node-content flex-grow-1">
                        <div class="d-flex align-items-center">
                            <i class="bi ${
                              hasChildren ? "bi-folder" : "bi-file-text"
                            } me-2 
                               text-${hasChildren ? "primary" : "info"}"></i>
                            <span class="fw-${
                              hasChildren ? "medium" : "normal"
                            }">${node.title}</span>
                            ${
                              hasTopics
                                ? `
                                <span class="badge bg-secondary ms-2">${node.topics.length}</span>
                            `
                                : ""
                            }
                        </div>
                    </div>
                </div>
                
                <div class="topic-node-children ${
                  isExpanded ? "" : "d-none"
                }" id="children_${nodeId}">
                    ${
                      hasChildren
                        ? renderHierarchyLevel(node.children, level + 1)
                        : ""
                    }
                    ${hasTopics ? renderTopicList(node.topics, level + 1) : ""}
                </div>
            </div>
        `;
  });

  return html;
}

function renderTopicList(topics, level) {
  return topics
    .map((topic) => {
      const topicId = `topic_${topic.id || topic.title.replace(/\s+/g, "_")}`;
      const isSelected = topicSelectionState.selectedTopics.some(
        (t) => t.id === topic.id
      );

      return `
            <div class="topic-item d-flex align-items-center py-1" 
                 style="padding-left: ${(level + 1) * 20}px;" 
                 data-topic-id="${topic.id}">
                <div class="form-check me-2">
                    <input class="form-check-input topic-checkbox" type="checkbox" 
                           id="${topicId}" 
                           data-topic-id="${topic.id}"
                           ${isSelected ? "checked" : ""}
                           onchange="toggleTopicSelection('${topic.id}')">
                </div>
                <label class="form-check-label flex-grow-1" for="${topicId}">
                    <div class="topic-content">
                        <div class="topic-title">${topic.title}</div>
                        ${
                          topic.description
                            ? `
                            <small class="text-muted topic-description">${topic.description}</small>
                        `
                            : ""
                        }
                        ${
                          topic.keywords && topic.keywords.length > 0
                            ? `
                            <div class="topic-keywords mt-1">
                                ${topic.keywords
                                  .slice(0, 3)
                                  .map(
                                    (keyword) =>
                                      `<span class="badge bg-light text-dark me-1">${keyword}</span>`
                                  )
                                  .join("")}
                                ${
                                  topic.keywords.length > 3
                                    ? `<span class="badge bg-secondary">+${
                                        topic.keywords.length - 3
                                      }</span>`
                                    : ""
                                }
                            </div>
                        `
                            : ""
                        }
                    </div>
                </label>
            </div>
        `;
    })
    .join("");
}

function setupTopicEventHandlers() {
  // Update selection count
  updateTopicSelectionCount();

  // Set up search
  const searchInput = document.getElementById("topicSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      filterTopics(e.target.value);
    });
  }
}

function toggleTopicNode(nodeId) {
  const childrenContainer = document.getElementById(`children_${nodeId}`);
  const toggleButton = document.querySelector(`[data-node-id="${nodeId}"] i`);

  if (childrenContainer.classList.contains("d-none")) {
    childrenContainer.classList.remove("d-none");
    toggleButton.className = "bi bi-chevron-down";
    topicSelectionState.expandedGroups.add(nodeId);
  } else {
    childrenContainer.classList.add("d-none");
    toggleButton.className = "bi bi-chevron-right";
    topicSelectionState.expandedGroups.delete(nodeId);
  }
}

function toggleGroupSelection(nodeId) {
  const groupCheckbox = document.getElementById(`group_${nodeId}`);
  const childCheckboxes = document.querySelectorAll(
    `#children_${nodeId} .topic-checkbox`
  );

  childCheckboxes.forEach((checkbox) => {
    checkbox.checked = groupCheckbox.checked;
    toggleTopicSelection(checkbox.dataset.topicId);
  });
}

function toggleTopicSelection(topicId) {
  const topic = findTopicById(topicId);
  if (!topic) return;

  const existingIndex = topicSelectionState.selectedTopics.findIndex(
    (t) => t.id === topicId
  );

  if (existingIndex >= 0) {
    // Remove from selection
    topicSelectionState.selectedTopics.splice(existingIndex, 1);
  } else {
    // Add to selection
    topicSelectionState.selectedTopics.push(topic);
  }

  updateTopicSelectionCount();
  updateGroupCheckboxes();
}

function findTopicById(topicId) {
  return topicSelectionState.allTopics.find((topic) => topic.id === topicId);
}

function updateTopicSelectionCount() {
  const count = topicSelectionState.selectedTopics.length;

  // Update count display
  const countElement = document.getElementById("selectedTopicsCount");
  if (countElement) {
    countElement.textContent = count;
  }

  // Update summary visibility
  const summaryContainer = document.getElementById("selectedTopicsSummary");
  if (summaryContainer) {
    summaryContainer.style.display = count > 0 ? "block" : "none";
  }

  // Update next button
  const nextBtn = document.getElementById("nextToConfigBtn");
  if (nextBtn) {
    nextBtn.disabled = count === 0;
  }

  // Update global state
  if (window.examGeneratorState) {
    window.examGeneratorState.selectedTopics =
      topicSelectionState.selectedTopics.map((topic) => ({
        id: topic.id,
        title: topic.title,
      }));
  }
}

function updateGroupCheckboxes() {
  // Update group checkboxes based on their children's selection state
  document.querySelectorAll(".group-checkbox").forEach((groupCheckbox) => {
    const nodeId = groupCheckbox.id.replace("group_", "");
    const childCheckboxes = document.querySelectorAll(
      `#children_${nodeId} .topic-checkbox`
    );

    if (childCheckboxes.length === 0) return;

    const checkedCount = Array.from(childCheckboxes).filter(
      (cb) => cb.checked
    ).length;

    if (checkedCount === 0) {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = false;
    } else if (checkedCount === childCheckboxes.length) {
      groupCheckbox.checked = true;
      groupCheckbox.indeterminate = false;
    } else {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = true;
    }
  });
}

function filterTopics(query) {
  topicSelectionState.searchQuery = query.toLowerCase();

  if (!query) {
    // Show all topics
    document.querySelectorAll(".topic-node, .topic-item").forEach((element) => {
      element.style.display = "";
    });
    return;
  }

  // Hide all first
  document.querySelectorAll(".topic-node, .topic-item").forEach((element) => {
    element.style.display = "none";
  });

  // Show matching topics and their parents
  document.querySelectorAll(".topic-item").forEach((item) => {
    const topicTitle =
      item.querySelector(".topic-title")?.textContent.toLowerCase() || "";
    const topicDescription =
      item.querySelector(".topic-description")?.textContent.toLowerCase() || "";
    const topicKeywords = Array.from(
      item.querySelectorAll(".topic-keywords .badge")
    )
      .map((badge) => badge.textContent.toLowerCase())
      .join(" ");

    if (
      topicTitle.includes(query) ||
      topicDescription.includes(query) ||
      topicKeywords.includes(query)
    ) {
      // Show this topic
      item.style.display = "";

      // Show all parent nodes
      let parent = item.closest(".topic-node-children");
      while (parent) {
        parent.style.display = "";
        parent.classList.remove("d-none");

        const parentNode = parent.closest(".topic-node");
        if (parentNode) {
          parentNode.style.display = "";

          // Expand the parent
          const toggleButton = parentNode.querySelector(".topic-toggle i");
          if (toggleButton) {
            toggleButton.className = "bi bi-chevron-down";
          }
        }

        parent = parent.parentElement?.closest(".topic-node-children");
      }
    }
  });

  // Also show group nodes that have visible children
  document.querySelectorAll(".topic-node").forEach((node) => {
    const visibleChildren = node.querySelectorAll(
      '.topic-item[style=""], .topic-node[style=""]'
    );
    if (visibleChildren.length > 0) {
      node.style.display = "";
    }
  });
}

// Selection Management Functions
function selectAllVisibleTopics() {
  document.querySelectorAll(".topic-checkbox").forEach((checkbox) => {
    const topicItem = checkbox.closest(".topic-item");
    if (topicItem && topicItem.style.display !== "none") {
      checkbox.checked = true;
      toggleTopicSelection(checkbox.dataset.topicId);
    }
  });
}

function clearAllTopicSelections() {
  document.querySelectorAll(".topic-checkbox").forEach((checkbox) => {
    checkbox.checked = false;
  });

  topicSelectionState.selectedTopics = [];
  updateTopicSelectionCount();
  updateGroupCheckboxes();
}

function getSelectedTopicsList() {
  return topicSelectionState.selectedTopics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    category: topic.category,
  }));
}

function showSelectedTopicsList() {
  if (topicSelectionState.selectedTopics.length === 0) {
    Swal.fire({
      title: "No hay temas seleccionados",
      text: "Seleccione al menos un tema para continuar.",
      icon: "info",
      confirmButtonColor: "#008FD0",
    });
    return;
  }

  const topicsList = topicSelectionState.selectedTopics
    .map(
      (topic, index) => `
        <div class="d-flex align-items-center justify-content-between py-2 ${
          index > 0 ? "border-top" : ""
        }">
            <div>
                <div class="fw-medium">${topic.title}</div>
                ${
                  topic.description
                    ? `<small class="text-muted">${topic.description}</small>`
                    : ""
                }
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeTopicFromSelection('${
              topic.id
            }')">
                <i class="bi bi-x"></i>
            </button>
        </div>
    `
    )
    .join("");

  Swal.fire({
    title: `Temas Seleccionados (${topicSelectionState.selectedTopics.length})`,
    html: `
            <div class="text-start" style="max-height: 400px; overflow-y: auto;">
                ${topicsList}
            </div>
        `,
    width: "600px",
    confirmButtonColor: "#008FD0",
    confirmButtonText: "Cerrar",
  });
}

function removeTopicFromSelection(topicId) {
  // Uncheck the checkbox
  const checkbox = document.querySelector(`[data-topic-id="${topicId}"]`);
  if (checkbox) {
    checkbox.checked = false;
  }

  // Remove from selection
  toggleTopicSelection(topicId);

  // Close and reopen the modal with updated list
  Swal.close();
  setTimeout(() => showSelectedTopicsList(), 100);
}

// Topic Statistics and Analysis
function getTopicStatistics() {
  const stats = {
    totalTopics: topicSelectionState.allTopics.length,
    selectedTopics: topicSelectionState.selectedTopics.length,
    categories: {},
    difficulty: {},
  };

  // Analyze categories
  topicSelectionState.allTopics.forEach((topic) => {
    const category = topic.category || "General";
    if (!stats.categories[category]) {
      stats.categories[category] = { total: 0, selected: 0 };
    }
    stats.categories[category].total++;

    if (topicSelectionState.selectedTopics.some((t) => t.id === topic.id)) {
      stats.categories[category].selected++;
    }
  });

  return stats;
}

function showTopicStatistics() {
  const stats = getTopicStatistics();

  const categoryStats = Object.entries(stats.categories)
    .map(
      ([category, data]) => `
        <tr>
            <td>${category}</td>
            <td>${data.selected}/${data.total}</td>
            <td>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar" role="progressbar" 
                         style="width: ${(data.selected / data.total) * 100}%">
                        ${Math.round((data.selected / data.total) * 100)}%
                    </div>
                </div>
            </td>
        </tr>
    `
    )
    .join("");

  Swal.fire({
    title: "Estadísticas de Selección",
    html: `
            <div class="text-start">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body text-center">
                                <h3 class="text-primary">${stats.selectedTopics}</h3>
                                <small class="text-muted">Temas Seleccionados</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-body text-center">
                                <h3 class="text-info">${stats.totalTopics}</h3>
                                <small class="text-muted">Total Disponibles</small>
                            </div>
                        </div>
                    </div>
                </div>
                
                <h6>Selección por Categoría:</h6>
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Categoría</th>
                            <th>Seleccionados</th>
                            <th>Progreso</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${categoryStats}
                    </tbody>
                </table>
            </div>
        `,
    width: "600px",
    confirmButtonColor: "#008FD0",
  });
}

// Export functions for global access
window.initializeTopicSelection = initializeTopicSelection;
window.toggleTopicNode = toggleTopicNode;
window.toggleGroupSelection = toggleGroupSelection;
window.toggleTopicSelection = toggleTopicSelection;
window.filterTopics = filterTopics;
window.selectAllVisibleTopics = selectAllVisibleTopics;
window.clearAllTopicSelections = clearAllTopicSelections;
window.showSelectedTopicsList = showSelectedTopicsList;
window.removeTopicFromSelection = removeTopicFromSelection;
window.showTopicStatistics = showTopicStatistics;
window.getSelectedTopicsList = getSelectedTopicsList;
