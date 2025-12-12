// Upload functionality
let selectedFile = null;
let currentAnalysisId = null;

document.addEventListener('DOMContentLoaded', function() {
    setupUploadZone();
    setupUploadForm();
});

function setupUploadZone() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadZone || !fileInput) return;
    
    // Click to select file
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // File input change
    fileInput.addEventListener('change', handleFileSelect);
    
    // Drag and drop events
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('dragleave', handleDragLeave);
    uploadZone.addEventListener('drop', handleDrop);
}

function setupUploadForm() {
    const uploadForm = document.getElementById('uploadForm');
    if (!uploadForm) return;
    
    uploadForm.addEventListener('submit', handleFormSubmit);
    
    // Form validation
    const requiredFields = ['studentName', 'course', 'assignmentName'];
    requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', validateForm);
        }
    });
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files: files } });
    }
}

// File selection handler
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length === 0) return;
    
    const file = files[0];
    
    // Validate file type
    if (file.type !== 'application/pdf') {
        Swal.fire({
            icon: 'error',
            title: 'Tipo de archivo no válido',
            text: 'Solo se permiten archivos PDF',
            confirmButtonColor: '#008FD0'
        });
        return;
    }
    
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        Swal.fire({
            icon: 'error',
            title: 'Archivo muy grande',
            text: 'El archivo no puede superar los 10MB',
            confirmButtonColor: '#008FD0'
        });
        return;
    }
    
    selectedFile = file;
    showFileInfo(file);
    validateForm();
}

function showFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    
    if (fileInfo && fileName) {
        fileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        fileInfo.style.display = 'block';
    }
}

function clearFile() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').style.display = 'none';
    validateForm();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Form validation
function validateForm() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (!analyzeBtn) return;
    
    const studentName = document.getElementById('studentName')?.value.trim();
    const course = document.getElementById('course')?.value.trim();
    const assignmentName = document.getElementById('assignmentName')?.value.trim();
    
    const isValid = selectedFile && studentName && course && assignmentName;
    
    analyzeBtn.disabled = !isValid;
    
    if (isValid) {
        analyzeBtn.classList.remove('btn-secondary');
        analyzeBtn.classList.add('btn-primary');
    } else {
        analyzeBtn.classList.remove('btn-primary');
        analyzeBtn.classList.add('btn-secondary');
    }
}

// Form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!selectedFile) {
        showError('Por favor selecciona un archivo PDF');
        return;
    }
    
    const metadata = {
        studentName: document.getElementById('studentName').value.trim(),
        studentId: document.getElementById('studentId').value.trim(),
        course: document.getElementById('course').value.trim(),
        subject: document.getElementById('subject').value.trim(),
        assignmentName: document.getElementById('assignmentName').value.trim()
    };
    
    try {
        await uploadAndAnalyze(selectedFile, metadata);
    } catch (error) {
        console.error('Upload and analysis failed:', error);
        showError('Error al procesar el documento: ' + error.message);
    }
}

// Upload and analysis workflow
async function uploadAndAnalyze(file, metadata) {
    try {
        // Step 1: Get pre-signed URL
        showLoading('Preparando subida...');
        
        const presignResponse = await apiCall('/uploads/presign', {
            method: 'POST',
            body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                metadata: metadata
            })
        });
        
        // Step 2: Upload file to S3
        Swal.update({
            title: 'Subiendo archivo...'
        });
        
        await uploadToS3(presignResponse.uploadUrl, file);
        
        // Step 3: Start analysis
        Swal.update({
            title: 'Iniciando análisis...'
        });
        
        const analysisResponse = await apiCall('/analysis/start', {
            method: 'POST',
            body: JSON.stringify({
                s3Key: presignResponse.s3Key,
                metadata: metadata
            })
        });
        
        currentAnalysisId = analysisResponse.analysisId;
        
        // Step 4: Poll for results
        await pollAnalysisStatus(currentAnalysisId);
        
    } catch (error) {
        hideLoading();
        throw error;
    }
}

// Upload file to S3
async function uploadToS3(uploadUrl, file) {
    const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type
        }
    });
    
    if (!response.ok) {
        throw new Error('Error al subir el archivo');
    }
}

// Poll analysis status
async function pollAnalysisStatus(analysisId) {
    const maxAttempts = 60; // 5 minutes max (5 seconds * 60)
    let attempts = 0;
    
    const poll = async () => {
        try {
            attempts++;
            
            const response = await apiCall(`/analysis/${analysisId}`);
            const analysis = response.item;
            
            if (analysis.status === 'COMPLETED') {
                hideLoading();
                showAnalysisComplete(analysis);
                return;
            }
            
            if (analysis.status === 'FAILED') {
                hideLoading();
                throw new Error(analysis.errorMessage || 'El análisis falló');
            }
            
            if (attempts >= maxAttempts) {
                hideLoading();
                throw new Error('El análisis está tomando más tiempo del esperado');
            }
            
            // Update progress message
            Swal.update({
                title: 'Analizando documento...',
                html: `
                    <div class="progress mt-3">
                        <div class="progress-bar progress-bar-striped progress-bar-animated" 
                             role="progressbar" 
                             style="width: ${Math.min((attempts / maxAttempts) * 100, 90)}%">
                        </div>
                    </div>
                    <p class="mt-2 text-muted">Esto puede tomar unos minutos...</p>
                `
            });
            
            // Continue polling
            setTimeout(poll, 3000); // Poll every 3 seconds
            
        } catch (error) {
            hideLoading();
            console.error('Polling error:', error);
            
            // Show more specific error message
            let errorMessage = 'Error al obtener el resultado del análisis';
            if (error.message.includes('Failed to retrieve analysis details')) {
                errorMessage = 'El análisis se está procesando. Por favor, revisa el historial en unos minutos.';
            }
            
            Swal.fire({
                icon: 'warning',
                title: 'Análisis en Proceso',
                text: errorMessage,
                confirmButtonColor: '#008FD0',
                confirmButtonText: 'Ir al Dashboard'
            }).then(() => {
                // Redirect to dashboard
                window.location.href = 'index.html';
            });
            
            return; // Don't throw error, handle gracefully
        }
    };
    
    // Start polling
    setTimeout(poll, 2000); // Initial delay
}

// Show analysis complete
function showAnalysisComplete(analysis) {
    const aiScore = analysis.aiLikelihoodScore || 0;
    const originalityScore = analysis.originalityScore || 0;
    
    let icon = 'success';
    let title = '¡Análisis Completado!';
    
    if (aiScore >= 70) {
        icon = 'warning';
        title = 'Análisis Completado - Revisar';
    }
    
    Swal.fire({
        icon: icon,
        title: title,
        html: `
            <div class="text-start">
                <p><strong>Estudiante:</strong> ${analysis.metadata?.studentName || '-'}</p>
                <p><strong>Probabilidad de IA:</strong> <span class="badge badge-${getScoreColor(aiScore)}">${aiScore}%</span></p>
                <p><strong>Originalidad:</strong> <span class="badge badge-${getScoreColor(100 - originalityScore)}">${originalityScore}%</span></p>
                <p><strong>Confianza:</strong> ${analysis.confidence || 0}%</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#008FD0',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-eye me-2"></i>Ver Detalle',
        cancelButtonText: 'Cerrar'
    }).then((result) => {
        if (result.isConfirmed) {
            viewAnalysis(analysis.analysisId);
        } else {
            // Reset form
            resetUploadForm();
        }
    });
}

// Reset upload form
function resetUploadForm() {
    selectedFile = null;
    currentAnalysisId = null;
    
    document.getElementById('uploadForm').reset();
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').style.display = 'none';
    
    validateForm();
}

// Export functions for global access
window.clearFile = clearFile;
window.resetUploadForm = resetUploadForm;