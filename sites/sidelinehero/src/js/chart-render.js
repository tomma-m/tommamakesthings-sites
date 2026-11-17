// Rotation chart rendering, shared by build.mjs (roster pages, the chart
// maker's no-JavaScript chart) and the chart maker in the browser. Pure: no
// DOM, no network, no storage. The charts come from the app's engine via
// rotation-charts-app.json (see README "Rotation charts").

export const FORMATS = [
  { key: 'h16', periods: 2, minutes: 16, label: '2 × 16-min halves' },
  { key: 'h20', periods: 2, minutes: 20, label: '2 × 20-min halves' },
  { key: 'q6', periods: 4, minutes: 6, label: '4 × 6-min quarters' },
  { key: 'q8', periods: 4, minutes: 8, label: '4 × 8-min quarters' },
  { key: 'q10', periods: 4, minutes: 10, label: '4 × 10-min quarters' },
  { key: 'q12', periods: 4, minutes: 12, label: '4 × 12-min quarters' },
];

export const formatLabel = (key) => FORMATS.find((f) => f.key === key)?.label;

export function findChart(file, players, formatKey) {
  return file.charts.find((c) => c.players === players && c.format === formatKey);
}

export function playerLabels(n, names = []) {
  return Array.from({ length: n }, (_, i) => {
    const name = typeof names[i] === 'string' ? names[i].trim() : '';
    return name || `Player ${i + 1}`;
  });
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// The scoreboard countdown at game second `seconds`, within its period, the
// way the app shows it: 8:00 at the start of an 8-minute quarter.
export function periodClock(seconds, chart) {
  const len = chart.period_length_minutes * 60;
  const intoPeriod = seconds % len;
  return mmss(len - intoPeriod);
}

const periodTag = (chart, period) => `${chart.periods === 2 ? 'H' : 'Q'}${period}`;

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// A grid: a column per stretch (headed by its period and the scoreboard time
// it starts at), a row per player, a dot where the player is on court, and
// each player's total court time. The dot is text, not just a background, so
// the chart still prints when the browser drops background colours.
export function renderChartTable(chart, labels) {
  const head = chart.stretches.map((s, i) => {
    const newPeriod = i === 0 || chart.stretches[i - 1].period !== s.period;
    return `<th scope="col"${newPeriod ? ' class="period-start"' : ''}><span class="chart-period">${periodTag(chart, s.period)}</span> ${periodClock(s.start, chart)}</th>`;
  }).join('');
  const rows = labels.map((label, i) => {
    const cells = chart.stretches.map((s) => (s.on.includes(i + 1)
      ? '<td class="on"><span aria-hidden="true">●</span><span class="visually-hidden">On</span></td>'
      : '<td></td>')).join('');
    return `<tr class="player"><th scope="row">${escapeHtml(label)}</th>${cells}<td class="mins">${mmss(chart.seconds[i])}</td></tr>`;
  }).join('\n');
  return [
    '<table class="rotation-chart">',
    `<caption>${chart.players} players · ${formatLabel(chart.format)}</caption>`,
    `<thead><tr><th scope="col">Player</th>${head}<th scope="col">Mins</th></tr></thead>`,
    `<tbody>\n${rows}\n</tbody>`,
    '</table>',
  ].join('\n');
}

// The chart a maker link asks for (?players=8&format=h20), if the data has it;
// otherwise the default, so a bad or old link never shows a blank page.
export const DEFAULT_PRESET = { players: 10, format: 'q8' };
export function parsePreset(search, file) {
  const params = new URLSearchParams(search);
  const raw = params.get('players');
  const players = /^\d+$/.test(raw ?? '') ? Number(raw) : NaN;
  const format = params.get('format');
  return findChart(file, players, format) ? { players, format } : { ...DEFAULT_PRESET };
}
