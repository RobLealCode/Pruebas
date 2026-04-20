(() => {
  const SUPABASE_URL = 'https://aqmhltdlukponiqcdwpz.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbWhsdGRsdWtwb25pcWNkd3B6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2Mzg3NTEsImV4cCI6MjA5MjIxNDc1MX0.5cLd5MRJVE2xHoWlkfEcn48Poc1fdxblNsbKYPVuZLc';
  const TABLE = 'measurements';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const state = {
    measurements: [],
    filter: { text: '', status: '' },
    charts: {},
  };

  const statusEl = document.getElementById('connection-status');
  function setStatus(kind, text) {
    statusEl.className = 'connection-status ' + kind;
    statusEl.textContent = text;
  }

  /* ---------- Supabase data access ---------- */
  async function fetchMeasurements() {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function insertMeasurement(entry) {
    const { data, error } = await sb.from(TABLE).insert(entry).select().single();
    if (error) throw error;
    return data;
  }

  async function insertManyMeasurements(entries) {
    const { error } = await sb.from(TABLE).insert(entries);
    if (error) throw error;
  }

  async function deleteMeasurement(id) {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  async function deleteAllMeasurements() {
    const { error } = await sb.from(TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }

  async function reload() {
    try {
      state.measurements = await fetchMeasurements();
      setStatus('online', 'Conectado');
    } catch (err) {
      console.error(err);
      setStatus('offline', 'Sin conexión');
      alert('Error al contactar la base de datos: ' + err.message);
    }
    renderAll();
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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    const data = Object.fromEntries(new FormData(form).entries());
    const nominal = parseFloat(data.nominal);
    const measured = parseFloat(data.measured);
    const entry = {
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
    };
    try {
      await insertMeasurement(entry);
      form.reset();
      form.querySelector('input[name="date"]').valueAsDate = new Date();
      await reload();
      switchTab('measurements');
    } catch (err) {
      alert('No se pudo guardar: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar medición';
    }
  });

  document.getElementById('btn-seed').addEventListener('click', async () => {
    if (state.measurements.length && !confirm('¿Añadir datos de ejemplo a los registros existentes?')) return;
    const btn = document.getElementById('btn-seed');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      await insertManyMeasurements(generateSampleData());
      await reload();
    } catch (err) {
      alert('No se pudo cargar ejemplo: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cargar datos de ejemplo';
    }
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

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('.row-action');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('¿Eliminar esta medición?')) return;
    try {
      await deleteMeasurement(id);
      await reload();
    } catch (err) {
      alert('No se pudo eliminar: ' + err.message);
    }
  });

  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!state.measurements.length) return;
    if (!confirm('Esto eliminará TODAS las mediciones. ¿Continuar?')) return;
    try {
      await deleteAllMeasurements();
      await reload();
    } catch (err) {
      alert('No se pudo borrar: ' + err.message);
    }
  });

  document.getElementById('btn-export').addEventListener('click', exportCSV);

  function filteredMeasurements() {
    const { text, status } = state.filter;
    return state.measurements.filter((m) => {
      if (status && m.status !== status) return false;
      if (!text) return true;
      return (
        (m.duct || '').toLowerCase().includes(text) ||
        (m.location || '').toLowerCase().includes(text) ||
        (m.inspector || '').toLowerCase().includes(text)
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
            <td>${Number(m.nominal).toFixed(2)}</td>
            <td>${Number(m.measured).toFixed(2)}</td>
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

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const list = state.measurements;
    const total = list.length;
    const ducts = new Set(list.map((m) => m.duct)).size;
    const avg = total ? list.reduce((s, m) => s + Number(m.measured), 0) / total : 0;
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
    const values = list.map((m) => Number(m.measured));
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
      const key = String(m.date).slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    const labels = sorted.map(([k]) => k);
    const avgData = sorted.map(([, arr]) => arr.reduce((s, m) => s + Number(m.measured), 0) / arr.length);
    const minData = sorted.map(([, arr]) => Math.min(...arr.map((m) => Number(m.measured))));
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
      const val = Number(m.measured);
      if (!byDuct.has(m.duct) || byDuct.get(m.duct) > val) byDuct.set(m.duct, val);
    });
    const entries = [...byDuct.entries()].sort((a, b) => a[1] - b[1]).slice(0, 12);
    const colors = entries.map(([duct]) => {
      const minM = list
        .filter((m) => m.duct === duct)
        .reduce((a, b) => (Number(a.measured) < Number(b.measured) ? a : b));
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

  /* ---------- Realtime ---------- */
  sb.channel('measurements-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => reload())
    .subscribe();

  reload();
})();
