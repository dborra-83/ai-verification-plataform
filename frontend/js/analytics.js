// Analytics functionality - Advanced reporting and charts
// Created: 2025-12-12

// Global chart instances
let analysisTimeChart = null;
let riskDistributionChart = null;
let courseScoresChart = null;
let confidenceOriginalityChart = null;

// Show analytics section
function showAnalyticsSection() {
    console.log('Showing analytics section');
    
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
    
    // Load analytics data immediately
    setTimeout(() => {
        loadAnalyticsData();
    }, 100);
}

// Load analytics data and create charts
async function loadAnalyticsData() {
    console.log('Starting loadAnalyticsData');
    
    try {
        const period = document.getElementById('analyticsPeriod')?.value || '30';
        
        // Show loading state
        showLoading('Cargando datos de analytics...');
        
        // Get data from API
        console.log('Calling API for analysis data...');
        const response = await apiCall(`/analysis?pageSize=1000`);
        const analyses = response.items || [];
        
        console.log('API Response:', response);
        console.log('Total analyses loaded:', analyses.length);
        
        // Filter by period
        const now = new Date();
        const periodAgo = new Date(now.getTime() - (parseInt(period) * 24 * 60 * 60 * 1000));
        
        const filteredAnalyses = analyses.filter(analysis => {
            const analysisDate = new Date(analysis.createdAt);
            return analysisDate >= periodAgo;
        });
        
        const completedAnalyses = filteredAnalyses.filter(analysis => analysis.status === 'COMPLETED');
        
        console.log('Filtered analyses (last', period, 'days):', filteredAnalyses.length);
        console.log('Completed analyses:', completedAnalyses.length);
        
        hideLoading();
        
        // Always use fallback charts for now (more reliable)
        console.log('Creating fallback charts...');
        createFallbackCharts(filteredAnalyses, completedAnalyses, period);
        
        // Update top rankings
        console.log('Updating top rankings...');
        updateTopCourses(completedAnalyses);
        updateTopStudents(completedAnalyses);
        
        console.log('Analytics data loading completed');
        
    } catch (error) {
        hideLoading();
        console.error('Error loading analytics data:', error);
        showError('Error al cargar datos de analytics: ' + error.message);
        
        // Show error message in analytics section
        const analyticsSection = document.getElementById('analyticsSection');
        if (analyticsSection) {
            const chartsContainer = analyticsSection.querySelector('.row.mb-4');
            if (chartsContainer && chartsContainer.children.length > 1) {
                chartsContainer.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger">
                            <div class="d-flex align-items-center">
                                <i class="bi bi-exclamation-triangle me-3" style="font-size: 2rem;"></i>
                                <div>
                                    <h5 class="alert-heading">Error al cargar analytics</h5>
                                    <p class="mb-2">No se pudieron cargar los datos de analytics: ${error.message}</p>
                                    <button class="btn btn-outline-danger btn-sm" onclick="loadAnalyticsData()">
                                        <i class="bi bi-arrow-clockwise me-1"></i>Reintentar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }
}

// Create fallback charts using CSS and HTML when Chart.js is not available
function createFallbackCharts(filteredAnalyses, completedAnalyses, period) {
    console.log('Creating fallback charts with data:', {
        filtered: filteredAnalyses.length,
        completed: completedAnalyses.length,
        period: period
    });
    
    // Analysis Time Chart (simple bar chart)
    const analysisTimeChart = document.getElementById('analysisTimeChart');
    if (analysisTimeChart) {
        const parent = analysisTimeChart.parentElement;
        
        // Group analyses by date
        const dateGroups = {};
        const days = parseInt(period);
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            dateGroups[dateKey] = 0;
        }
        
        filteredAnalyses.forEach(analysis => {
            const date = new Date(analysis.createdAt).toISOString().split('T')[0];
            if (dateGroups.hasOwnProperty(date)) {
                dateGroups[date]++;
            }
        });
        
        const maxCount = Math.max(...Object.values(dateGroups), 1);
        
        parent.innerHTML = `
            <div class="fallback-chart">
                <div class="chart-title mb-3">Análisis por día (últimos ${period} días)</div>
                <div class="bar-chart">
                    ${Object.entries(dateGroups).map(([date, count]) => {
                        const height = (count / maxCount) * 100;
                        const dateLabel = new Date(date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
                        return `
                            <div class="bar-item">
                                <div class="bar" style="height: ${height}%; background-color: #008FD0;" title="${count} análisis el ${dateLabel}"></div>
                                <div class="bar-label">${dateLabel}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        
        console.log('Analysis time chart created');
    }
    
    // Risk Distribution Chart (simple pie representation)
    const riskDistributionChart = document.getElementById('riskDistributionChart');
    if (riskDistributionChart) {
        const parent = riskDistributionChart.parentElement;
        
        let lowRisk = 0, mediumRisk = 0, highRisk = 0;
        
        completedAnalyses.forEach(analysis => {
            const score = analysis.aiLikelihoodScore || 0;
            if (score < 40) lowRisk++;
            else if (score < 70) mediumRisk++;
            else highRisk++;
        });
        
        const total = lowRisk + mediumRisk + highRisk;
        
        parent.innerHTML = `
            <div class="fallback-chart">
                <div class="chart-title mb-3">Distribución de Riesgo IA</div>
                <div class="pie-chart-fallback">
                    <div class="risk-item">
                        <div class="risk-color" style="background-color: #28a745;"></div>
                        <span>Bajo Riesgo: ${lowRisk} (${total > 0 ? ((lowRisk/total)*100).toFixed(1) : 0}%)</span>
                    </div>
                    <div class="risk-item">
                        <div class="risk-color" style="background-color: #ffc107;"></div>
                        <span>Riesgo Medio: ${mediumRisk} (${total > 0 ? ((mediumRisk/total)*100).toFixed(1) : 0}%)</span>
                    </div>
                    <div class="risk-item">
                        <div class="risk-color" style="background-color: #dc3545;"></div>
                        <span>Alto Riesgo: ${highRisk} (${total > 0 ? ((highRisk/total)*100).toFixed(1) : 0}%)</span>
                    </div>
                </div>
            </div>
        `;
        
        console.log('Risk distribution chart created');
    }
    
    // Course Scores Chart
    const courseScoresChart = document.getElementById('courseScoresChart');
    if (courseScoresChart) {
        const parent = courseScoresChart.parentElement;
        
        const courseData = {};
        
        completedAnalyses.forEach(analysis => {
            const course = analysis.course || 'Sin Curso';
            if (!courseData[course]) {
                courseData[course] = { total: 0, count: 0 };
            }
            courseData[course].total += analysis.aiLikelihoodScore || 0;
            courseData[course].count++;
        });
        
        const courseAverages = Object.entries(courseData)
            .map(([course, data]) => ({
                course,
                average: data.total / data.count,
                count: data.count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 for fallback
        
        parent.innerHTML = `
            <div class="fallback-chart">
                <div class="chart-title mb-3">Top 5 Cursos por Promedio IA</div>
                <div class="horizontal-bar-chart">
                    ${courseAverages.length > 0 ? courseAverages.map(item => {
                        const color = item.average >= 70 ? '#dc3545' : item.average >= 40 ? '#ffc107' : '#28a745';
                        return `
                            <div class="h-bar-item">
                                <div class="h-bar-label">${item.course}</div>
                                <div class="h-bar-container">
                                    <div class="h-bar" style="width: ${item.average}%; background-color: ${color};"></div>
                                    <span class="h-bar-value">${item.average.toFixed(1)}%</span>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="text-center text-muted">No hay datos disponibles</div>'}
                </div>
            </div>
        `;
        
        console.log('Course scores chart created');
    }
    
    // Confidence vs Originality Chart
    const confidenceOriginalityChart = document.getElementById('confidenceOriginalityChart');
    if (confidenceOriginalityChart) {
        const parent = confidenceOriginalityChart.parentElement;
        
        const avgConfidence = completedAnalyses.length > 0 ? 
            completedAnalyses.reduce((sum, a) => sum + (a.confidence || 0), 0) / completedAnalyses.length : 0;
        const avgOriginality = completedAnalyses.length > 0 ? 
            completedAnalyses.reduce((sum, a) => sum + (a.originalityScore || 0), 0) / completedAnalyses.length : 0;
        
        parent.innerHTML = `
            <div class="fallback-chart">
                <div class="chart-title mb-3">Promedios Generales</div>
                <div class="metrics-grid">
                    <div class="metric-item">
                        <div class="metric-value">${avgConfidence.toFixed(1)}%</div>
                        <div class="metric-label">Confianza Promedio</div>
                    </div>
                    <div class="metric-item">
                        <div class="metric-value">${avgOriginality.toFixed(1)}%</div>
                        <div class="metric-label">Originalidad Promedio</div>
                    </div>
                </div>
            </div>
        `;
        
        console.log('Confidence vs originality chart created');
    }
}

// Update top courses table
function updateTopCourses(analyses) {
    console.log('Updating top courses with', analyses.length, 'analyses');
    
    const tableBody = document.getElementById('topCoursesTable');
    if (!tableBody) {
        console.log('Top courses table not found');
        return;
    }
    
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
    
    console.log('Top courses table updated with', topCourses.length, 'courses');
}

// Update top students table
function updateTopStudents(analyses) {
    console.log('Updating top students with', analyses.length, 'analyses');
    
    const tableBody = document.getElementById('topStudentsTable');
    if (!tableBody) {
        console.log('Top students table not found');
        return;
    }
    
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
    
    console.log('Top students table updated with', topStudents.length, 'students');
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