(() => {
  const STORAGE_KEY = 'ndt-duct-measurements-v1';

  const state = {
    measurements: loadMeasurements(),
    filter: { text: '', status: '' },
    charts: {},
  };

  /* ---------- Persistence ---------- */
  function loadMeasurements() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveMeasurements() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.measurements));
  }

  /* ---------- Domain helpers ---------- */
  function classify(nominal, measured) {
    if (!nominal || nominal <= 0) return 'ok';
    const loss = (nominal - measured) / nominal;
    if (loss >= 0.30) return 'critical';
    if (loss >= 0.10) return 'warning';
    return 'ok';
  }

  function lossPercent(nominal, measured) {
    if (!nominal || nominal <= 0) return 0;
    return Math.max(0, ((nominal - measured) / nominal) * 100);
  }

  function statusLabel(status) {
    return { ok: 'Aceptable', warning: 'Advertencia', critical: 'Crítico' }[status] || status;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === target));
      if (target === 'dashboard') renderDashboard();
    });
  });

  /* ---------- Form ---------- */
  const form = document.getElementById('measurement-form');
  form.querySelector('input[name="date"]').valueAsDate = new Date();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const nominal = parseFloat(data.nominal);
    const measured = parseFloat(data.measured);
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      duct: data.duct.trim(),
      location: data.location.trim(),
      nominal,
      measured,
      date: data.date,
      inspector: data.inspector.trim(),
      method: data.method,
      temperature: data.temperature ? parseFloat(data.temperature) : null,
      notes: data.notes ? data.notes.trim() : '',
      status: classify(nominal, measured),
      createdAt: new Date().toISOString(),
    };
    state.measurements.push(entry);
    saveMeasurements();
    form.reset();
    form.querySelector('input[name="date"]').valueAsDate = new Date();
    renderAll();
    switchTab('measurements');
  });

  document.getElementById('btn-seed').addEventListener('click', () => {
    if (state.measurements.length && !confirm('¿Añadir datos de ejemplo a los registros existentes?')) return;
    state.measurements.push(...generateSampleData());
    saveMeasurements();
    renderAll();
  });

  /* ---------- Table ---------- */
  const tbody = document.getElementById('measurements-body');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('filter-status');

  searchInput.addEventListener('input', (e) => {
    state.filter.text = e.target.value.toLowerCase();
    renderTable();
  });

  statusFilter.addEventListener('change', (e) => {
    state.filter.status = e.target.value;
    renderTable();
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.row-action');
    if (!btn) return;
    const id = btn.dataset.id;
    if (confirm('¿Eliminar esta medición?')) {
      state.measurements = state.measurements.filter((m) => m.id !== id);
      saveMeasurements();
      renderAll();
    }
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!state.measurements.length) return;
    if (confirm('Esto eliminará TODAS las mediciones. ¿Continuar?')) {
      state.measurements = [];
      saveMeasurements();
      renderAll();
    }
  });

  document.getElementById('btn-export').addEventListener('click', exportCSV);

  function filteredMeasurements() {
    const { text, status } = state.filter;
    return state.measurements.filter((m) => {
      if (status && m.status !== status) return false;
      if (!text) return true;
      return (
        m.duct.toLowerCase().includes(text) ||
        m.location.toLowerCase().includes(text) ||
        m.inspector.toLowerCase().includes(text)
      );
    });
  }

  function renderTable() {
    const items = filteredMeasurements().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    tbody.innerHTML = items
      .map((m) => {
        const loss = lossPercent(m.nominal, m.measured).toFixed(1);
        return `
          <tr>
            <td>${formatDate(m.date)}</td>
            <td><strong>${escapeHtml(m.duct)}</strong></td>
            <td>${escapeHtml(m.location)}</td>
            <td>${m.nominal.toFixed(2)}</td>
            <td>${m.measured.toFixed(2)}</td>
            <td>${loss}%</td>
            <td><span class="badge ${m.status}">${statusLabel(m.status)}</span></td>
            <td>${escapeHtml(m.inspector)}</td>
            <td>${escapeHtml(m.method)}</td>
            <td><button class="row-action" data-id="${m.id}">Eliminar</button></td>
          </tr>
        `;
      })
      .join('');
    emptyState.style.display = items.length ? 'none' : 'block';
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const list = state.measurements;
    const total = list.length;
    const ducts = new Set(list.map((m) => m.duct)).size;
    const avg = total ? list.reduce((s, m) => s + m.measured, 0) / total : 0;
    const avgLoss = total ? list.reduce((s, m) => s + lossPercent(m.nominal, m.measured), 0) / total : 0;
    const critical = list.filter((m) => m.status === 'critical').length;
    const warning = list.filter((m) => m.status === 'warning').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-ducts').textContent = ducts;
    document.getElementById('stat-avg').textContent = avg.toFixed(2);
    document.getElementById('stat-loss').textContent = `${avgLoss.toFixed(1)}%`;
    document.getElementById('stat-critical').textContent = critical;
    document.getElementById('stat-warning').textContent = warning;

    renderDistributionChart(list);
    renderStatusChart(list);
    renderTimelineChart(list);
    renderDuctsChart(list);
  }

  function getOrCreateChart(key, ctx, config) {
    if (state.charts[key]) {
      state.charts[key].data = config.data;
      state.charts[key].options = config.options;
      state.charts[key].update();
      return state.charts[key];
    }
    state.charts[key] = new Chart(ctx, config);
    return state.charts[key];
  }

  function renderDistributionChart(list) {
    const ctx = document.getElementById('chart-distribution');
    if (!list.length) {
      getOrCreateChart('distribution', ctx, emptyChartConfig('bar'));
      return;
    }
    const values = list.map((m) => m.measured);
    const min = Math.floor(Math.min(...values));
    const max = Math.ceil(Math.max(...values));
    const binCount = Math.min(8, Math.max(4, max - min));
    const binSize = (max - min) / binCount || 1;
    const bins = Array.from({ length: binCount }, (_, i) => ({
      label: `${(min + i * binSize).toFixed(1)}–${(min + (i + 1) * binSize).toFixed(1)}`,
      count: 0,
    }));
    values.forEach((v) => {
      const idx = Math.min(binCount - 1, Math.floor((v - min) / binSize));
      bins[idx].count++;
    });
    getOrCreateChart('distribution', ctx, {
      type: 'bar',
      data: {
        labels: bins.map((b) => b.label),
        datasets: [{
          label: 'Mediciones',
          data: bins.map((b) => b.count),
          backgroundColor: '#2563eb',
          borderRadius: 4,
        }],
      },
      options: baseOptions({ yTitle: 'Cantidad' }),
    });
  }

  function renderStatusChart(list) {
    const ctx = document.getElementById('chart-status');
    const counts = { ok: 0, warning: 0, critical: 0 };
    list.forEach((m) => counts[m.status]++);
    getOrCreateChart('status', ctx, {
      type: 'doughnut',
      data: {
        labels: ['Aceptable', 'Advertencia', 'Crítico'],
        datasets: [{
          data: [counts.ok, counts.warning, counts.critical],
          backgroundColor: ['#16a34a', '#d97706', '#dc2626'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  function renderTimelineChart(list) {
    const ctx = document.getElementById('chart-timeline');
    if (!list.length) {
      getOrCreateChart('timeline', ctx, emptyChartConfig('line'));
      return;
    }
    const groups = new Map();
    list.forEach((m) => {
      if (!m.date) return;
      const key = m.date.slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    const labels = sorted.map(([k]) => k);
    const avgData = sorted.map(([, arr]) => arr.reduce((s, m) => s + m.measured, 0) / arr.length);
    const minData = sorted.map(([, arr]) => Math.min(...arr.map((m) => m.measured)));
    getOrCreateChart('timeline', ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Promedio (mm)', data: avgData, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3 },
          { label: 'Mínimo (mm)', data: minData, borderColor: '#dc2626', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3 },
        ],
      },
      options: baseOptions({ yTitle: 'Espesor (mm)' }),
    });
  }

  function renderDuctsChart(list) {
    const ctx = document.getElementById('chart-ducts');
    if (!list.length) {
      getOrCreateChart('ducts', ctx, emptyChartConfig('bar'));
      return;
    }
    const byDuct = new Map();
    list.forEach((m) => {
      if (!byDuct.has(m.duct) || byDuct.get(m.duct) > m.measured) {
        byDuct.set(m.duct, m.measured);
      }
    });
    const entries = [...byDuct.entries()].sort((a, b) => a[1] - b[1]).slice(0, 12);
    const colors = entries.map(([duct]) => {
      const minM = list.filter((m) => m.duct === duct).reduce((a, b) => (a.measured < b.measured ? a : b));
      return { ok: '#16a34a', warning: '#d97706', critical: '#dc2626' }[minM.status];
    });
    getOrCreateChart('ducts', ctx, {
      type: 'bar',
      data: {
        labels: entries.map(([d]) => d),
        datasets: [{
          label: 'Espesor mínimo (mm)',
          data: entries.map(([, v]) => v),
          backgroundColor: colors,
          borderRadius: 4,
        }],
      },
      options: baseOptions({ yTitle: 'Espesor (mm)', indexAxis: 'y' }),
    });
  }

  function baseOptions({ yTitle, indexAxis } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: indexAxis || 'x',
      plugins: { legend: { display: true, position: 'bottom' } },
      scales: {
        x: { grid: { display: false } },
        y: { title: { display: !!yTitle, text: yTitle || '' }, beginAtZero: indexAxis !== 'y' },
      },
    };
  }

  function emptyChartConfig(type) {
    return {
      type,
      data: { labels: [], datasets: [{ data: [], label: 'Sin datos' }] },
      options: { responsive: true, maintainAspectRatio: false },
    };
  }

  /* ---------- Export ---------- */
  function exportCSV() {
    if (!state.measurements.length) {
      alert('No hay mediciones para exportar.');
      return;
    }
    const headers = ['fecha', 'ducto', 'ubicacion', 'nominal_mm', 'medido_mm', 'perdida_pct', 'estado', 'inspector', 'metodo', 'temperatura_c', 'notas'];
    const rows = state.measurements.map((m) => [
      m.date,
      m.duct,
      m.location,
      m.nominal,
      m.measured,
      lossPercent(m.nominal, m.measured).toFixed(2),
      statusLabel(m.status),
      m.inspector,
      m.method,
      m.temperature ?? '',
      (m.notes || '').replace(/\n/g, ' '),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediciones-ductos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- Sample data ---------- */
  function generateSampleData() {
    const ducts = ['P-101', 'P-102', 'P-103', 'L-200', 'L-201', 'T-305'];
    const locations = ['Codo norte', 'Tramo recto', 'Soldadura 1', 'Válvula A', 'Entrada bomba', 'Salida tanque'];
    const inspectors = ['A. Ramírez', 'L. Gómez', 'M. Torres', 'J. Pérez'];
    const methods = ['UT', 'RT', 'PEC'];
    const now = new Date();
    const items = [];
    for (let i = 0; i < 40; i++) {
      const nominal = [6.35, 9.53, 11.13, 12.7][Math.floor(Math.random() * 4)];
      const lossFactor = Math.random() < 0.15 ? 0.35 + Math.random() * 0.15
        : Math.random() < 0.35 ? 0.1 + Math.random() * 0.2
        : Math.random() * 0.08;
      const measured = +(nominal * (1 - lossFactor)).toFixed(2);
      const date = new Date(now);
      date.setDate(date.getDate() - Math.floor(Math.random() * 240));
      items.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random() + i),
        duct: ducts[Math.floor(Math.random() * ducts.length)],
        location: locations[Math.floor(Math.random() * locations.length)],
        nominal,
        measured,
        date: date.toISOString().slice(0, 10),
        inspector: inspectors[Math.floor(Math.random() * inspectors.length)],
        method: methods[Math.floor(Math.random() * methods.length)],
        temperature: +(20 + Math.random() * 40).toFixed(1),
        notes: '',
        status: classify(nominal, measured),
        createdAt: new Date().toISOString(),
      });
    }
    return items;
  }

  function switchTab(id) {
    const btn = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (btn) btn.click();
  }

  function renderAll() {
    renderTable();
    renderDashboard();
  }

  renderAll();
})();
