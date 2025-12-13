// UX/UI Enhancements - Keyboard shortcuts, tooltips, drag & drop improvements
// Created: 2025-12-12

// Keyboard shortcuts configuration
const KEYBOARD_SHORTCUTS = {
    'ctrl+n': () => showUploadSection(),
    'ctrl+d': () => showDashboard(),
    'ctrl+h': () => showHistorySection(),
    'ctrl+a': () => showAnalyticsSection(),
    'ctrl+s': () => showSettingsSection(),
    'ctrl+e': () => exportDashboardToPDF(),
    'ctrl+shift+e': () => exportDashboardToExcel(),
    'escape': () => showDashboard(),
    'f1': () => showHelpModal()
};

// Initialize UX enhancements
function initializeUXEnhancements() {
    setupKeyboardShortcuts();
    setupTooltips();
    setupDragDropEnhancements();
    setupBreadcrumbs();
    setupOfflineMode();
    addHelpButton();
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Don't trigger shortcuts when typing in inputs
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
            return;
        }
        
        const key = [];
        if (event.ctrlKey) key.push('ctrl');
        if (event.shiftKey) key.push('shift');
        if (event.altKey) key.push('alt');
        key.push(event.key.toLowerCase());
        
        const shortcut = key.join('+');
        
        if (KEYBOARD_SHORTCUTS[shortcut]) {
            event.preventDefault();
            KEYBOARD_SHORTCUTS[shortcut]();
        }
    });
    
    // Show shortcuts hint on first visit - DISABLED
    // Users can access help with F1 or help button
    // if (!localStorage.getItem('shortcutsHintShown')) {
    //     setTimeout(() => {
    //         showShortcutsHint();
    //         localStorage.setItem('shortcutsHintShown', 'true');
    //     }, 3000);
    // }
}

// Show keyboard shortcuts hint
function showShortcutsHint() {
    Swal.fire({
        title: '💡 Atajos de Teclado',
        html: `
            <div class="text-start">
                <p class="mb-3">Usa estos atajos para navegar más rápido:</p>
                <div class="row">
                    <div class="col-6">
                        <small>
                            <kbd>Ctrl+N</kbd> Nuevo Análisis<br>
                            <kbd>Ctrl+D</kbd> Dashboard<br>
                            <kbd>Ctrl+H</kbd> Historial<br>
                            <kbd>Ctrl+A</kbd> Analytics
                        </small>
                    </div>
                    <div class="col-6">
                        <small>
                            <kbd>Ctrl+S</kbd> Configuración<br>
                            <kbd>Ctrl+E</kbd> Exportar PDF<br>
                            <kbd>F1</kbd> Ayuda<br>
                            <kbd>Esc</kbd> Volver al Dashboard
                        </small>
                    </div>
                </div>
            </div>
        `,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#008FD0',
        timer: 10000,
        timerProgressBar: true
    });
}

// Setup enhanced tooltips
function setupTooltips() {
    // Add tooltips to all elements with title attribute
    document.addEventListener('mouseover', (event) => {
        const element = event.target;
        if (element.hasAttribute('title') && !element.hasAttribute('data-tooltip-added')) {
            element.setAttribute('data-tooltip-added', 'true');
            
            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'custom-tooltip';
            tooltip.textContent = element.getAttribute('title');
            tooltip.style.cssText = `
                position: absolute;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.2s;
                max-width: 200px;
                word-wrap: break-word;
            `;
            
            document.body.appendChild(tooltip);
            
            // Position tooltip
            const rect = element.getBoundingClientRect();
            tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
            
            // Show tooltip
            setTimeout(() => {
                tooltip.style.opacity = '1';
            }, 100);
            
            // Remove tooltip on mouse leave
            element.addEventListener('mouseleave', () => {
                tooltip.remove();
            }, { once: true });
            
            // Remove original title to prevent default tooltip
            element.removeAttribute('title');
            element.setAttribute('data-original-title', tooltip.textContent);
        }
    });
}

// Setup enhanced drag & drop
function setupDragDropEnhancements() {
    const uploadZone = document.getElementById('uploadZone');
    if (!uploadZone) return;
    
    let dragCounter = 0;
    
    // Enhanced drag & drop with visual feedback
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, unhighlight, false);
    });
    
    uploadZone.addEventListener('drop', handleDrop, false);
    
    // Global drag enter/leave for body
    document.body.addEventListener('dragenter', (e) => {
        dragCounter++;
        if (dragCounter === 1) {
            showGlobalDropZone();
        }
    });
    
    document.body.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            hideGlobalDropZone();
        }
    });
    
    document.body.addEventListener('drop', (e) => {
        dragCounter = 0;
        hideGlobalDropZone();
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        uploadZone.classList.add('drag-over');
    }
    
    function unhighlight(e) {
        uploadZone.classList.remove('drag-over');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                handleFileSelect(file);
            } else {
                showError('Solo se permiten archivos PDF');
            }
        }
    }
    
    function showGlobalDropZone() {
        // Only show if we're on upload section or dashboard
        const currentSection = getCurrentSection();
        if (currentSection === 'uploadSection' || currentSection === 'dashboardSection') {
            document.body.classList.add('global-drag-active');
        }
    }
    
    function hideGlobalDropZone() {
        document.body.classList.remove('global-drag-active');
    }
}

// Setup breadcrumbs navigation
function setupBreadcrumbs() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    
    // Create breadcrumb container
    const breadcrumbContainer = document.createElement('div');
    breadcrumbContainer.className = 'breadcrumb-container';
    breadcrumbContainer.innerHTML = `
        <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0" id="breadcrumbNav">
                <li class="breadcrumb-item active">Dashboard</li>
            </ol>
        </nav>
    `;
    
    // Insert after page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.parentNode.insertBefore(breadcrumbContainer, pageTitle.nextSibling);
    }
}

// Update breadcrumbs
function updateBreadcrumbs(path) {
    const breadcrumbNav = document.getElementById('breadcrumbNav');
    if (!breadcrumbNav) return;
    
    const breadcrumbs = {
        'Dashboard': [{ text: 'Dashboard', active: true }],
        'Nuevo Análisis': [
            { text: 'Dashboard', link: 'showDashboard()' },
            { text: 'Nuevo Análisis', active: true }
        ],
        'Historial': [
            { text: 'Dashboard', link: 'showDashboard()' },
            { text: 'Historial', active: true }
        ],
        'Analytics Avanzados': [
            { text: 'Dashboard', link: 'showDashboard()' },
            { text: 'Analytics', active: true }
        ],
        'Configuración': [
            { text: 'Dashboard', link: 'showDashboard()' },
            { text: 'Configuración', active: true }
        ]
    };
    
    const pathBreadcrumbs = breadcrumbs[path] || [{ text: path, active: true }];
    
    breadcrumbNav.innerHTML = pathBreadcrumbs.map(crumb => {
        if (crumb.active) {
            return `<li class="breadcrumb-item active" aria-current="page">${crumb.text}</li>`;
        } else {
            return `<li class="breadcrumb-item"><a href="#" onclick="${crumb.link}">${crumb.text}</a></li>`;
        }
    }).join('');
}

// Setup offline mode with service worker
function setupOfflineMode() {
    if ('serviceWorker' in navigator) {
        // Register service worker for offline functionality
        navigator.serviceWorker.register('/sw.js').then((registration) => {
            console.log('Service Worker registered successfully');
        }).catch((error) => {
            console.log('Service Worker registration failed');
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            showOnlineStatus(true);
        });
        
        window.addEventListener('offline', () => {
            showOnlineStatus(false);
        });
    }
}

// Show online/offline status
function showOnlineStatus(isOnline) {
    const statusElement = document.getElementById('systemStatus');
    if (statusElement) {
        if (isOnline) {
            statusElement.textContent = 'Activo';
            statusElement.className = 'kpi-value text-success';
        } else {
            statusElement.textContent = 'Offline';
            statusElement.className = 'kpi-value text-warning';
        }
    }
    
    // Show toast notification
    const message = isOnline ? 'Conexión restaurada' : 'Modo offline activado';
    const icon = isOnline ? 'success' : 'warning';
    
    Swal.fire({
        icon: icon,
        title: message,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

// Add help button
function addHelpButton() {
    const topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions) return;
    
    const helpButton = document.createElement('button');
    helpButton.className = 'btn btn-outline-secondary btn-sm me-2';
    helpButton.innerHTML = '<i class="bi bi-question-circle"></i>';
    helpButton.title = 'Ayuda y Atajos (F1)';
    helpButton.onclick = showHelpModal;
    
    topbarActions.insertBefore(helpButton, topbarActions.firstChild);
}

// Show help modal
function showHelpModal() {
    Swal.fire({
        title: '🆘 Ayuda - AI Verification Platform',
        html: `
            <div class="text-start">
                <div class="mb-4">
                    <h6 class="text-primary">Atajos de Teclado</h6>
                    <div class="row">
                        <div class="col-6">
                            <small>
                                <kbd>Ctrl+N</kbd> Nuevo Análisis<br>
                                <kbd>Ctrl+D</kbd> Dashboard<br>
                                <kbd>Ctrl+H</kbd> Historial<br>
                                <kbd>Ctrl+A</kbd> Analytics
                            </small>
                        </div>
                        <div class="col-6">
                            <small>
                                <kbd>Ctrl+S</kbd> Configuración<br>
                                <kbd>Ctrl+E</kbd> Exportar PDF<br>
                                <kbd>F1</kbd> Ayuda<br>
                                <kbd>Esc</kbd> Volver al Dashboard
                            </small>
                        </div>
                    </div>
                </div>
                
                <div class="mb-4">
                    <h6 class="text-primary">Funciones Principales</h6>
                    <ul class="small">
                        <li><strong>Nuevo Análisis:</strong> Sube archivos PDF para análisis de IA</li>
                        <li><strong>Dashboard:</strong> Vista general con KPIs y análisis recientes</li>
                        <li><strong>Historial:</strong> Todos los análisis con filtros avanzados</li>
                        <li><strong>Analytics:</strong> Gráficos y reportes avanzados</li>
                        <li><strong>Etiquetas:</strong> Organiza análisis con etiquetas personalizadas</li>
                    </ul>
                </div>
                
                <div class="mb-4">
                    <h6 class="text-primary">Exportación</h6>
                    <ul class="small">
                        <li><strong>PDF:</strong> Reportes completos con gráficos</li>
                        <li><strong>Excel:</strong> Datos en formato CSV para análisis</li>
                        <li><strong>Descarga:</strong> Archivos PDF originales analizados</li>
                    </ul>
                </div>
                
                <div class="alert alert-info">
                    <small>
                        <i class="bi bi-info-circle me-1"></i>
                        <strong>Tip:</strong> Usa drag & drop para subir archivos desde cualquier sección.
                    </small>
                </div>
            </div>
        `,
        confirmButtonText: 'Cerrar',
        confirmButtonColor: '#008FD0',
        width: '600px'
    });
}

// Get current active section
function getCurrentSection() {
    const sections = ['dashboardSection', 'uploadSection', 'historySection', 'analyticsSection', 'settingsSection'];
    
    for (const sectionId of sections) {
        const section = document.getElementById(sectionId);
        if (section && section.style.display !== 'none') {
            return sectionId;
        }
    }
    
    return 'dashboardSection'; // default
}

// Enhanced file selection with preview
function handleFileSelect(file) {
    if (!file) return;
    
    // Update file input
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        // Create a new FileList with the selected file
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
    }
    
    // Show file info with enhanced preview
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    
    if (fileInfo && fileName) {
        const fileSize = (file.size / 1024 / 1024).toFixed(2);
        fileName.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi bi-file-earmark-pdf text-danger me-2" style="font-size: 1.2rem;"></i>
                <div>
                    <div class="fw-medium">${file.name}</div>
                    <small class="text-muted">${fileSize} MB • PDF</small>
                </div>
            </div>
        `;
        fileInfo.style.display = 'block';
    }
    
    // Enable analyze button
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.disabled = false;
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeUXEnhancements, 500);
});

// Override navigation functions to update breadcrumbs
const originalShowDashboard = window.showDashboard;
const originalShowUploadSection = window.showUploadSection;
const originalShowHistorySection = window.showHistorySection;
const originalShowSettingsSection = window.showSettingsSection;

if (originalShowDashboard) {
    window.showDashboard = function() {
        originalShowDashboard();
        updateBreadcrumbs('Dashboard');
    };
}

if (originalShowUploadSection) {
    window.showUploadSection = function() {
        originalShowUploadSection();
        updateBreadcrumbs('Nuevo Análisis');
    };
}

if (originalShowHistorySection) {
    window.showHistorySection = function() {
        originalShowHistorySection();
        updateBreadcrumbs('Historial');
    };
}

if (originalShowSettingsSection) {
    window.showSettingsSection = function() {
        originalShowSettingsSection();
        updateBreadcrumbs('Configuración');
    };
}

// Override analytics function
window.showAnalyticsSection = function() {
    if (window.showAnalyticsSection.original) {
        window.showAnalyticsSection.original();
    }
    updateBreadcrumbs('Analytics Avanzados');
};

// Export functions for global access
window.showHelpModal = showHelpModal;
window.handleFileSelect = handleFileSelect;
window.updateBreadcrumbs = updateBreadcrumbs;