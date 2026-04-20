# Pruebas — Medición de Espesores en Ductos

Aplicación web para registrar y analizar mediciones de espesor en ductos (END/NDT), con un dashboard de estadísticas.

## Características

- **Registro** de mediciones: ducto/TAG, ubicación, espesor nominal, espesor medido, fecha, inspector, método (UT, RT, PEC, MFL, Visual), temperatura y observaciones.
- **Clasificación automática** por pérdida de espesor:
  - Aceptable (&lt; 10%)
  - Advertencia (10–30%)
  - Crítico (&gt; 30%)
- **Dashboard** con:
  - Totales, ductos inspeccionados, espesor promedio y pérdida promedio.
  - Conteo de puntos críticos y en advertencia.
  - Histograma de distribución de espesores.
  - Doughnut de estado por clasificación.
  - Evolución temporal (promedio y mínimo por mes).
  - Espesor mínimo por ducto.
- **Tabla** con búsqueda y filtro por estado.
- **Exportación** a CSV.
- **Persistencia en la nube** vía Supabase (PostgreSQL) con sincronización en tiempo real entre usuarios.

## Uso

Abre `index.html` directamente en un navegador moderno. No requiere backend ni build.

```bash
# Opcional, para servirlo localmente
python3 -m http.server 8000
```

Luego visita `http://localhost:8000`.

La pestaña **Registrar** incluye un botón para cargar datos de ejemplo.

## Stack

- HTML + CSS + JavaScript vanilla.
- [Chart.js](https://www.chartjs.org/) vía CDN para las gráficas.
- [Supabase JS](https://supabase.com/docs/reference/javascript) como backend (PostgreSQL + Realtime).
