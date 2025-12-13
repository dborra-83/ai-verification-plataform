// Analytics functionality - Advanced reporting and charts
// Created: 2025-12-12

// Global chart instances
let analysisTimeChart = null;
let riskDistributionChart = null;
let courseScoresChart = null;
let confidenceOriginalityChart = null;

// Show analytics section
function showAnalyticsSection() {
    if (typeof hideAllSections === 'function') {
        hideAllSections();
    }
    
    const analyticsSection = document.getElementById('analyticsSection');
    if (analyticsSection) {
        analyticsSection.style.display = 'block';
    }
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = 'Analytics Avanzados';
    }
    
    if (typeof updateActiveNavItem === 'function') {
        updateActiveNavItem('Analytics');
    }
    
    // Load analytics data
    setTimeout(() => {
        loadAnalyticsData();
    }, 500);
}

// Load analytics data and create charts
async function loadAnalyticsData() {
    try {
        // Check if Chart.js is available
        if (typeof window.Chart === 'undefined') {
            showError('Chart.js no está disponible. Por favor recarga la página.');
            return;
        }
        
        const period = document.getElementById('analyticsPeriod')?.value || '30';
        
        // Show loading state
        showLoading('Cargando datos de analytics...');
        
        // Get data from API
        const response = await apiCall(`/analysis?pageSize=1000`);
        const analyses = response.items || [];
        
        // Filter by period
        const now = new Date();
        const periodAgo = new Date(now.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));
        
        const filteredAnalyses = analyses.filter(analysis => {
            const analysisDate = new Date(analysis.createdAt);
            return analysisDate >= periodAgo;
        });
        
        const completedAnalyses = filteredAnalyses.filter(analysis => analysis.status === 'COMPLETED');
        
        hideLoading();
        
        // Create charts
        createAnalysisTimeChart(filteredAnalyses, period);
        createRiskDistributionChart(completedAnalyses);
        createCourseScoresChart(completedAnalyses);
        createConfidenceOriginalityChart(completedAnalyses);
        
        // Update top rankings
        updateTopCourses(completedAnalyses);
        updateTopStudents(completedAnalyses);
        
    } catch (error) {
        hideLoading();
        console.error('Error loading analytics data:', error);
        showError('Error al cargar datos de analytics: ' + error.message);
    }
}

// Create analysis time trend chart
function createAnalysisTimeChart(analyses, period) {
    const ctx = document.getElementById('analysisTimeChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (analysisTimeChart) {
        analysisTimeChart.destroy();
    }
    
    // Group analyses by date
    const dateGroups = {};
    const days = parseInt(period);
    
    // Initialize all dates in period
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dateGroups[dateKey] = 0;
    }
    
    // Count analyses by date
    analyses.forEach(analysis => {
        const date = new Date(analysis.createdAt).toISOString().split('T')[0];
        if (dateGroups.hasOwnProperty(date)) {
            dateGroups[date]++;
        }
    });
    
    const labels = Object.keys(dateGroups).map(date => {
        return new Date(date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    });
    const data = Object.values(dateGroups);
    
    analysisTimeChart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Análisis por Día',
                data: data,
                borderColor: '#008FD0',
                backgroundColor: 'rgba(0, 143, 208, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Create risk distribution pie chart
function createRiskDistributionChart(analyses) {
    const ctx = document.getElementById('riskDistributionChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (riskDistributionChart) {
        riskDistributionChart.destroy();
    }
    
    // Categorize by risk level
    let lowRisk = 0, mediumRisk = 0, highRisk = 0;
    
    analyses.forEach(analysis => {
        const score = analysis.aiLikelihoodScore || 0;
        if (score < 40) lowRisk++;
        else if (score < 70) mediumRisk++;
        else highRisk++;
    });
    
    riskDistributionChart = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bajo Riesgo (0-39%)', 'Riesgo Medio (40-69%)', 'Alto Riesgo (70-100%)'],
            datasets: [{
                data: [lowRisk, mediumRisk, highRisk],
                backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Create course scores bar chart
function createCourseScoresChart(analyses) {
    const ctx = document.getElementById('courseScoresChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (courseScoresChart) {
        courseScoresChart.destroy();
    }
    
    // Group by course and calculate averages
    const courseData = {};
    
    analyses.forEach(analysis => {
        const course = analysis.course || 'Sin Curso';
        if (!courseData[course]) {
            courseData[course] = { total: 0, count: 0 };
        }
        courseData[course].total += analysis.aiLikelihoodScore || 0;
        courseData[course].count++;
    });
    
    // Calculate averages and sort
    const courseAverages = Object.entries(courseData)
        .map(([course, data]) => ({
            course,
            average: data.total / data.count,
            count: data.count
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10
    
    const labels = courseAverages.map(item => item.course);
    const data = courseAverages.map(item => item.average);
    const colors = data.map(score => {
        if (score >= 70) return '#dc3545';
        if (score >= 40) return '#ffc107';
        return '#28a745';
    });
    
    courseScoresChart = new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio IA Score',
                data: data,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45
                    }
                }
            }
        }
    });
}

// Create confidence vs originality scatter chart
function createConfidenceOriginalityChart(analyses) {
    const ctx = document.getElementById('confidenceOriginalityChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (confidenceOriginalityChart) {
        confidenceOriginalityChart.destroy();
    }
    
    // Prepare scatter data
    const scatterData = analyses.map(analysis => ({
        x: analysis.confidence || 0,
        y: analysis.originalityScore || 0,
        aiScore: analysis.aiLikelihoodScore || 0
    }));
    
    // Color by AI score
    const colors = scatterData.map(point => {
        if (point.aiScore >= 70) return 'rgba(220, 53, 69, 0.6)';
        if (point.aiScore >= 40) return 'rgba(255, 193, 7, 0.6)';
        return 'rgba(40, 167, 69, 0.6)';
    });
    
    confidenceOriginalityChart = new window.Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Análisis',
                data: scatterData,
                backgroundColor: colors,
                borderColor: colors.map(color => color.replace('0.6', '1')),
                borderWidth: 1,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.parsed;
                            return `Confianza: ${point.x}%, Originalidad: ${point.y}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Confianza (%)'
                    },
                    min: 0,
                    max: 100
                },
                y: {
                    title: {
                        display: true,
                        text: 'Originalidad (%)'
                    },
                    min: 0,
                    max: 100
                }
            }
        }
    });
}

// Update top courses table
function updateTopCourses(analyses) {
    const tableBody = document.getElementById('topCoursesTable');
    if (!tableBody) return;
    
    // Group by course
    const courseData = {};
    
    analyses.forEach(analysis => {
        const course = analysis.course || 'Sin Curso';
        if (!courseData[course]) {
            courseData[course] = { total: 0, count: 0 };
        }
        courseData[course].total += analysis.aiLikelihoodScore || 0;
        courseData[course].count++;
    });
    
    // Sort by count and get top 10
    const topCourses = Object.entries(courseData)
        .map(([course, data]) => ({
            course,
            count: data.count,
            average: (data.total / data.count).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    if (topCourses.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    No hay datos disponibles
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = topCourses.map((item, index) => `
        <tr>
            <td><span class="badge bg-primary">${index + 1}</span></td>
            <td>${item.course}</td>
            <td>${item.count}</td>
            <td>
                <span class="badge badge-${getScoreColor(parseFloat(item.average))}">
                    ${item.average}%
                </span>
            </td>
        </tr>
    `).join('');
}

// Update top students table
function updateTopStudents(analyses) {
    const tableBody = document.getElementById('topStudentsTable');
    if (!tableBody) return;
    
    // Sort by originality score and get top 10
    const topStudents = analyses
        .filter(analysis => analysis.originalityScore > 0)
        .sort((a, b) => (b.originalityScore || 0) - (a.originalityScore || 0))
        .slice(0, 10);
    
    if (topStudents.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-muted">
                    <i class="bi bi-inbox me-2"></i>
                    No hay datos disponibles
                </td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = topStudents.map((analysis, index) => `
        <tr>
            <td><span class="badge bg-success">${index + 1}</span></td>
            <td>${analysis.studentName || 'Sin nombre'}</td>
            <td>${analysis.course || 'Sin curso'}</td>
            <td>
                <span class="badge badge-${getScoreColor(100 - (analysis.originalityScore || 0))}">
                    ${analysis.originalityScore || 0}%
                </span>
            </td>
        </tr>
    `).join('');
}

// Export dashboard to PDF
async function exportDashboardToPDF() {
    try {
        showLoading('Generando reporte PDF...');
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // Add title
        pdf.setFontSize(20);
        pdf.text('Reporte de Dashboard - AI Verification Platform', 20, 20);
        
        // Add date
        pdf.setFontSize(12);
        pdf.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, 20, 30);
        
        // Get KPI values
        const totalAnalyses = document.getElementById('totalAnalyses')?.textContent || '0';
        const avgAiScore = document.getElementById('avgAiScore')?.textContent || '0%';
        const highRiskCount = document.getElementById('highRiskCount')?.textContent || '0';
        const avgOriginalityScore = document.getElementById('avgOriginalityScore')?.textContent || '0%';
        const todayAnalyses = document.getElementById('todayAnalyses')?.textContent || '0';
        const avgConfidence = document.getElementById('avgConfidence')?.textContent || '0%';
        
        // Add KPIs
        pdf.setFontSize(14);
        pdf.text('Métricas Principales:', 20, 45);
        
        pdf.setFontSize(11);
        let yPos = 55;
        pdf.text(`• Total de Análisis: ${totalAnalyses}`, 25, yPos);
        yPos += 8;
        pdf.text(`• Promedio IA Score: ${avgAiScore}`, 25, yPos);
        yPos += 8;
        pdf.text(`• Análisis de Alto Riesgo: ${highRiskCount}`, 25, yPos);
        yPos += 8;
        pdf.text(`• Promedio de Originalidad: ${avgOriginalityScore}`, 25, yPos);
        yPos += 8;
        pdf.text(`• Análisis de Hoy: ${todayAnalyses}`, 25, yPos);
        yPos += 8;
        pdf.text(`• Confianza Promedio: ${avgConfidence}`, 25, yPos);
        
        // Add footer
        pdf.setFontSize(8);
        pdf.text('AI Verification Platform - Powered by Amazon Bedrock', 20, 280);
        
        // Save PDF
        pdf.save(`dashboard-report-${new Date().toISOString().split('T')[0]}.pdf`);
        
        hideLoading();
        showSuccess('Reporte PDF generado correctamente');
        
    } catch (error) {
        hideLoading();
        console.error('Error generating PDF:', error);
        showError('Error al generar el reporte PDF: ' + error.message);
    }
}

// Export analytics to PDF
async function exportAnalyticsToPDF() {
    try {
        showLoading('Generando reporte de analytics...');
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        
        // Add title
        pdf.setFontSize(20);
        pdf.text('Reporte de Analytics Avanzados', 20, 20);
        
        // Add date and period
        const period = document.getElementById('analyticsPeriod')?.value || '30';
        pdf.setFontSize(12);
        pdf.text(`Período: Últimos ${period} días`, 20, 30);
        pdf.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, 20, 38);
        
        // Add charts as images (simplified version)
        pdf.setFontSize(14);
        pdf.text('Resumen de Analytics:', 20, 55);
        
        pdf.setFontSize(11);
        pdf.text('• Gráficos de tendencias incluidos en la plataforma web', 25, 65);
        pdf.text('• Distribución de riesgo por categorías', 25, 73);
        pdf.text('• Análisis comparativo por cursos', 25, 81);
        pdf.text('• Rankings de estudiantes y cursos', 25, 89);
        
        // Add note
        pdf.setFontSize(10);
        pdf.text('Nota: Para ver los gráficos interactivos, accede a la sección Analytics en la plataforma web.', 20, 110);
        
        // Add footer
        pdf.setFontSize(8);
        pdf.text('AI Verification Platform - Analytics Report', 20, 280);
        
        // Save PDF
        pdf.save(`analytics-report-${new Date().toISOString().split('T')[0]}.pdf`);
        
        hideLoading();
        showSuccess('Reporte de analytics generado correctamente');
        
    } catch (error) {
        hideLoading();
        console.error('Error generating analytics PDF:', error);
        showError('Error al generar el reporte de analytics: ' + error.message);
    }
}

// Export dashboard data to Excel (CSV format)
async function exportDashboardToExcel() {
    try {
        showLoading('Generando archivo Excel...');
        
        // Get recent analyses data
        const response = await apiCall('/analysis?pageSize=100');
        const analyses = response.items || [];
        
        // Create CSV content
        let csvContent = 'Estudiante,Curso,Tarea,Fecha,IA Score,Originalidad,Confianza,Estado\n';
        
        analyses.forEach(analysis => {
            const row = [
                analysis.studentName || '',
                analysis.course || '',
                analysis.assignmentName || '',
                new Date(analysis.createdAt).toLocaleDateString('es-ES'),
                analysis.aiLikelihoodScore || 0,
                analysis.originalityScore || 0,
                analysis.confidence || 0,
                analysis.status || ''
            ].map(field => `"${field}"`).join(',');
            
            csvContent += row + '\n';
        });
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `dashboard-data-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        hideLoading();
        showSuccess('Archivo Excel generado correctamente');
        
    } catch (error) {
        hideLoading();
        console.error('Error generating Excel:', error);
        showError('Error al generar el archivo Excel: ' + error.message);
    }
}

// Export analytics data to Excel
async function exportAnalyticsToExcel() {
    try {
        showLoading('Generando datos de analytics...');
        
        // Get analytics data
        const response = await apiCall('/analysis?pageSize=1000');
        const analyses = response.items || [];
        
        // Create CSV content with analytics data
        let csvContent = 'Estudiante,Curso,Tarea,Fecha,IA Score,Originalidad,Confianza,Estado,Señales Detectadas\n';
        
        analyses.forEach(analysis => {
            const signals = (analysis.signals || []).map(s => s.type).join('; ');
            const row = [
                analysis.studentName || '',
                analysis.course || '',
                analysis.assignmentName || '',
                new Date(analysis.createdAt).toLocaleDateString('es-ES'),
                analysis.aiLikelihoodScore || 0,
                analysis.originalityScore || 0,
                analysis.confidence || 0,
                analysis.status || '',
                signals
            ].map(field => `"${field}"`).join(',');
            
            csvContent += row + '\n';
        });
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `analytics-data-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        hideLoading();
        showSuccess('Datos de analytics exportados correctamente');
        
    } catch (error) {
        hideLoading();
        console.error('Error exporting analytics data:', error);
        showError('Error al exportar datos de analytics: ' + error.message);
    }
}

// Export functions for global access
window.showAnalyticsSection = showAnalyticsSection;
window.loadAnalyticsData = loadAnalyticsData;
window.exportDashboardToPDF = exportDashboardToPDF;
window.exportDashboardToExcel = exportDashboardToExcel;
window.exportAnalyticsToPDF = exportAnalyticsToPDF;
window.exportAnalyticsToExcel = exportAnalyticsToExcel;