// Tags and categorization system
// Created: 2025-12-12

// Available tags with their display info
const AVAILABLE_TAGS = {
    'sospechoso': { emoji: '🚨', label: 'Sospechoso', color: 'danger' },
    'revisado': { emoji: '✅', label: 'Revisado', color: 'success' },
    'aprobado': { emoji: '👍', label: 'Aprobado', color: 'primary' },
    'rechazado': { emoji: '❌', label: 'Rechazado', color: 'danger' },
    'pendiente': { emoji: '⏳', label: 'Pendiente', color: 'warning' },
    'favorito': { emoji: '⭐', label: 'Favorito', color: 'info' }
};

// Get tags for an analysis from localStorage
function getAnalysisTags(analysisId) {
    const tags = localStorage.getItem(`tags_${analysisId}`);
    return tags ? JSON.parse(tags) : [];
}

// Set tags for an analysis in localStorage
function setAnalysisTags(analysisId, tags) {
    localStorage.setItem(`tags_${analysisId}`, JSON.stringify(tags));
}

// Add tag to analysis
function addTagToAnalysis(analysisId, tagKey) {
    const currentTags = getAnalysisTags(analysisId);
    if (!currentTags.includes(tagKey)) {
        currentTags.push(tagKey);
        setAnalysisTags(analysisId, currentTags);
    }
}

// Remove tag from analysis
function removeTagFromAnalysis(analysisId, tagKey) {
    const currentTags = getAnalysisTags(analysisId);
    const updatedTags = currentTags.filter(tag => tag !== tagKey);
    setAnalysisTags(analysisId, updatedTags);
}

// Toggle tag for analysis
function toggleAnalysisTag(analysisId, tagKey) {
    const currentTags = getAnalysisTags(analysisId);
    if (currentTags.includes(tagKey)) {
        removeTagFromAnalysis(analysisId, tagKey);
    } else {
        addTagToAnalysis(analysisId, tagKey);
    }
    
    // Refresh current view
    if (document.getElementById('historySection').style.display !== 'none') {
        loadHistoryData();
    } else if (document.getElementById('dashboardSection').style.display !== 'none') {
        loadDashboardKPIs();
    }
}

// Render tags for an analysis
function renderAnalysisTags(analysisId) {
    const tags = getAnalysisTags(analysisId);
    
    if (tags.length === 0) {
        return '<span class="text-muted small">Sin etiquetas</span>';
    }
    
    return tags.map(tagKey => {
        const tag = AVAILABLE_TAGS[tagKey];
        if (!tag) return '';
        
        return `
            <span class="badge bg-${tag.color} me-1" title="${tag.label}">
                ${tag.emoji} ${tag.label}
            </span>
        `;
    }).join('');
}

// Show tag management modal
function showTagModal(analysisId, studentName) {
    const currentTags = getAnalysisTags(analysisId);
    
    const tagOptions = Object.entries(AVAILABLE_TAGS).map(([key, tag]) => {
        const isChecked = currentTags.includes(key) ? 'checked' : '';
        return `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${key}" id="tag_${key}" ${isChecked}>
                <label class="form-check-label" for="tag_${key}">
                    ${tag.emoji} ${tag.label}
                </label>
            </div>
        `;
    }).join('');
    
    Swal.fire({
        title: 'Gestionar Etiquetas',
        html: `
            <div class="text-start">
                <p class="mb-3"><strong>Estudiante:</strong> ${studentName}</p>
                <div class="mb-3">
                    <label class="form-label">Seleccionar etiquetas:</label>
                    ${tagOptions}
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#008FD0',
        preConfirm: () => {
            const selectedTags = [];
            Object.keys(AVAILABLE_TAGS).forEach(key => {
                const checkbox = document.getElementById(`tag_${key}`);
                if (checkbox && checkbox.checked) {
                    selectedTags.push(key);
                }
            });
            return selectedTags;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            setAnalysisTags(analysisId, result.value);
            
            // Show success message
            Swal.fire({
                icon: 'success',
                title: '¡Etiquetas actualizadas!',
                text: 'Las etiquetas se han guardado correctamente.',
                confirmButtonColor: '#008FD0',
                timer: 2000,
                showConfirmButton: false
            });
            
            // Refresh current view
            if (document.getElementById('historySection').style.display !== 'none') {
                loadHistoryData();
            } else if (document.getElementById('dashboardSection').style.display !== 'none') {
                loadDashboardKPIs();
            }
        }
    });
}

// Filter analyses by tags
function filterAnalysesByTag(analyses, tagFilter) {
    if (!tagFilter) return analyses;
    
    return analyses.filter(analysis => {
        const tags = getAnalysisTags(analysis.analysisId);
        return tags.includes(tagFilter);
    });
}

// Filter analyses by text search
function filterAnalysesByText(analyses, searchText) {
    if (!searchText) return analyses;
    
    const searchLower = searchText.toLowerCase();
    
    return analyses.filter(analysis => {
        const studentName = (analysis.studentName || '').toLowerCase();
        const course = (analysis.course || '').toLowerCase();
        const assignmentName = (analysis.assignmentName || '').toLowerCase();
        
        return studentName.includes(searchLower) || 
               course.includes(searchLower) || 
               assignmentName.includes(searchLower);
    });
}

// Get all unique tags used across analyses
function getAllUsedTags() {
    const usedTags = new Set();
    
    // Check localStorage for all tag entries
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tags_')) {
            const tags = JSON.parse(localStorage.getItem(key) || '[]');
            tags.forEach(tag => usedTags.add(tag));
        }
    }
    
    return Array.from(usedTags);
}

// Get tag statistics
function getTagStatistics() {
    const tagCounts = {};
    
    // Initialize counts
    Object.keys(AVAILABLE_TAGS).forEach(key => {
        tagCounts[key] = 0;
    });
    
    // Count tags
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tags_')) {
            const tags = JSON.parse(localStorage.getItem(key) || '[]');
            tags.forEach(tag => {
                if (tagCounts.hasOwnProperty(tag)) {
                    tagCounts[tag]++;
                }
            });
        }
    }
    
    return tagCounts;
}

// Show tag statistics modal
function showTagStatistics() {
    const stats = getTagStatistics();
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    const statsHtml = Object.entries(stats).map(([key, count]) => {
        const tag = AVAILABLE_TAGS[key];
        if (!tag) return '';
        
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
        
        return `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span>
                    <span class="badge bg-${tag.color} me-2">${tag.emoji} ${tag.label}</span>
                </span>
                <span>
                    <strong>${count}</strong> <small class="text-muted">(${percentage}%)</small>
                </span>
            </div>
        `;
    }).join('');
    
    Swal.fire({
        title: 'Estadísticas de Etiquetas',
        html: `
            <div class="text-start">
                <p class="mb-3">Total de etiquetas asignadas: <strong>${total}</strong></p>
                ${statsHtml}
            </div>
        `,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#008FD0'
    });
}

// Bulk tag operations
function showBulkTagModal(selectedAnalyses) {
    if (!selectedAnalyses || selectedAnalyses.length === 0) {
        showError('No hay análisis seleccionados');
        return;
    }
    
    const tagOptions = Object.entries(AVAILABLE_TAGS).map(([key, tag]) => {
        return `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${key}" id="bulk_tag_${key}">
                <label class="form-check-label" for="bulk_tag_${key}">
                    ${tag.emoji} ${tag.label}
                </label>
            </div>
        `;
    }).join('');
    
    Swal.fire({
        title: 'Etiquetas Masivas',
        html: `
            <div class="text-start">
                <p class="mb-3">Aplicar etiquetas a <strong>${selectedAnalyses.length}</strong> análisis seleccionados:</p>
                <div class="mb-3">
                    <label class="form-label">Seleccionar etiquetas:</label>
                    ${tagOptions}
                </div>
                <div class="mb-3">
                    <label class="form-label">Acción:</label>
                    <select class="form-select" id="bulkAction">
                        <option value="add">Agregar etiquetas</option>
                        <option value="remove">Quitar etiquetas</option>
                        <option value="replace">Reemplazar etiquetas</option>
                    </select>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Aplicar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#008FD0',
        preConfirm: () => {
            const selectedTags = [];
            Object.keys(AVAILABLE_TAGS).forEach(key => {
                const checkbox = document.getElementById(`bulk_tag_${key}`);
                if (checkbox && checkbox.checked) {
                    selectedTags.push(key);
                }
            });
            
            const action = document.getElementById('bulkAction').value;
            
            if (selectedTags.length === 0) {
                Swal.showValidationMessage('Selecciona al menos una etiqueta');
                return false;
            }
            
            return { tags: selectedTags, action };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            const { tags, action } = result.value;
            
            selectedAnalyses.forEach(analysisId => {
                const currentTags = getAnalysisTags(analysisId);
                let newTags = [...currentTags];
                
                if (action === 'add') {
                    tags.forEach(tag => {
                        if (!newTags.includes(tag)) {
                            newTags.push(tag);
                        }
                    });
                } else if (action === 'remove') {
                    newTags = newTags.filter(tag => !tags.includes(tag));
                } else if (action === 'replace') {
                    newTags = [...tags];
                }
                
                setAnalysisTags(analysisId, newTags);
            });
            
            // Show success message
            Swal.fire({
                icon: 'success',
                title: '¡Etiquetas aplicadas!',
                text: `Se han actualizado las etiquetas de ${selectedAnalyses.length} análisis.`,
                confirmButtonColor: '#008FD0',
                timer: 2000,
                showConfirmButton: false
            });
            
            // Refresh current view
            if (document.getElementById('historySection').style.display !== 'none') {
                loadHistoryData();
            } else if (document.getElementById('dashboardSection').style.display !== 'none') {
                loadDashboardKPIs();
            }
        }
    });
}

// Export functions for global access
window.getAnalysisTags = getAnalysisTags;
window.setAnalysisTags = setAnalysisTags;
window.toggleAnalysisTag = toggleAnalysisTag;
window.renderAnalysisTags = renderAnalysisTags;
window.showTagModal = showTagModal;
window.filterAnalysesByTag = filterAnalysesByTag;
window.filterAnalysesByText = filterAnalysesByText;
window.showTagStatistics = showTagStatistics;
window.showBulkTagModal = showBulkTagModal;

// Render tag icons (compact version for dashboard)
function renderTagIcons(analysisId) {
    const tags = getAnalysisTags(analysisId);
    
    if (tags.length === 0) {
        return '';
    }
    
    // Show only first 3 tags as icons, with a counter if more
    const visibleTags = tags.slice(0, 3);
    const remainingCount = tags.length - 3;
    
    let iconsHtml = visibleTags.map(tagKey => {
        const tag = AVAILABLE_TAGS[tagKey];
        if (!tag) return '';
        
        return `<span class="badge bg-${tag.color} me-1" style="font-size: 0.7rem;" title="${tag.label}">${tag.emoji}</span>`;
    }).join('');
    
    if (remainingCount > 0) {
        iconsHtml += `<span class="badge bg-secondary" style="font-size: 0.7rem;" title="${remainingCount} etiquetas más">+${remainingCount}</span>`;
    }
    
    return iconsHtml;
}

// Export the new function
window.renderTagIcons = renderTagIcons;