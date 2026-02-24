/**
 * Student History Page
 * Shows all analyses for a given student with trend chart.
 */

let trendChartInstance = null;

document.addEventListener("DOMContentLoaded", loadStudentHistory);

async function loadStudentHistory() {
  const params = new URLSearchParams(window.location.search);
  const studentName = params.get("student");

  if (!studentName) {
    showState("empty");
    return;
  }

  document.getElementById("pageTitle").textContent =
    `Historial: ${studentName}`;

  try {
    showState("loading");
    const data = await apiCall(
      `/analysis/student?studentName=${encodeURIComponent(studentName)}`,
    );

    if (!data.analyses || data.analyses.length === 0) {
      showState("empty");
      return;
    }

    renderSummary(data.studentName, data.summary);
    renderChart(data.analyses);
    renderTable(data.analyses);
    showState("content");
  } catch (err) {
    console.error("Error loading student history:", err);
    showState("empty");
  }
}

function showState(state) {
  document.getElementById("loadingState").style.display =
    state === "loading" ? "block" : "none";
  document.getElementById("historyContent").style.display =
    state === "content" ? "block" : "none";
  document.getElementById("emptyState").style.display =
    state === "empty" ? "block" : "none";
}

function renderSummary(studentName, summary) {
  document.getElementById("studentNameTitle").textContent = studentName;
  document.getElementById("studentAvatar").textContent = studentName
    .charAt(0)
    .toUpperCase();
  document.getElementById("summaryTotal").textContent =
    summary.totalAnalyses || 0;
  document.getElementById("summaryAvg").textContent =
    (summary.avgAiScore || 0) + "%";

  const trendMap = {
    increasing: "↑ Subiendo",
    decreasing: "↓ Bajando",
    stable: "→ Estable",
  };
  const trendEl = document.getElementById("summaryTrend");
  trendEl.textContent = trendMap[summary.trend] || "→ Estable";
  trendEl.className =
    "fw-bold fs-4 " +
    (summary.trend === "increasing"
      ? "text-danger"
      : summary.trend === "decreasing"
        ? "text-success"
        : "text-warning");
}

function renderChart(analyses) {
  const ctx = document.getElementById("trendChart");
  if (!ctx) return;

  const labels = analyses.map((a) => formatDateShort(a.createdAt));
  const scores = analyses.map((a) => a.aiLikelihoodScore);

  if (trendChartInstance) trendChartInstance.destroy();

  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Score IA (%)",
          data: scores,
          borderColor: "#008FD0",
          backgroundColor: "rgba(0,143,208,0.1)",
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => v + "%" } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Score IA: ${ctx.parsed.y}%`,
          },
        },
      },
    },
  });
}

function renderTable(analyses) {
  const tbody = document.getElementById("analysesTableBody");
  if (!tbody) return;

  tbody.innerHTML = analyses
    .map((a) => {
      const score = a.aiLikelihoodScore || 0;
      const badgeClass =
        score >= 70 ? "bg-danger" : score >= 40 ? "bg-warning" : "bg-success";
      const notes = a.teacherNotes
        ? `<span class="text-truncate d-inline-block" style="max-width:150px;" title="${escapeHtml(a.teacherNotes)}">${escapeHtml(a.teacherNotes)}</span>`
        : '<span class="text-muted">-</span>';

      return `
        <tr>
          <td>${formatDate(a.createdAt)}</td>
          <td>${escapeHtml(a.course || "-")}</td>
          <td>${escapeHtml(a.assignmentName || "-")}</td>
          <td><span class="badge ${badgeClass}">${score}%</span></td>
          <td>${a.originalityScore || 0}%</td>
          <td>${notes}</td>
          <td>
            <a href="detail.html?id=${a.analysisId}" class="btn btn-sm btn-outline-primary">
              <i class="bi bi-eye"></i>
            </a>
          </td>
        </tr>`;
    })
    .join("");
}

function formatDateShort(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  } catch {
    return dateStr;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
