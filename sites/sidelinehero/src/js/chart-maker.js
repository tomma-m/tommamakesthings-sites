// The rotation chart maker (/rotation-chart-maker). Picks one of the
// ready-made charts embedded in the page and relabels it with the names typed
// in. Names never leave the page: no storage, no network.
import { findChart, playerLabels, renderChartTable, parsePreset } from './chart-render.{{v}}.js';

const form = document.getElementById('chart-maker');
const output = document.getElementById('chart-output');
const data = JSON.parse(document.getElementById('chart-data').textContent);

function render() {
  const players = Number(form.players.value);
  const chart = findChart(data, players, form.format.value);
  if (!chart) return;
  const names = form.names.value.split('\n');
  // renderChartTable escapes every name, so this HTML is safe to insert.
  output.innerHTML = renderChartTable(chart, playerLabels(players, names));
}

const preset = parsePreset(location.search, data);
form.players.value = String(preset.players);
form.format.value = preset.format;
form.addEventListener('input', render);
form.addEventListener('change', render);
form.querySelector('[data-print]').addEventListener('click', () => window.print());
form.hidden = false;
render();

