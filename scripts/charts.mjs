// Rotation chart data helpers, shared by build.mjs and sync-charts.mjs.
//
// The app repo owns docs/rotation-charts.json (made by its engine, which never
// leaves that repo); this repo holds a copy, rotation-charts-app.json. The
// build refuses a copy that isn't a set of valid charts.
import { FORMATS } from '../sites/sidelinehero/src/js/chart-render.js';

export function parseChartsJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${err.message})`);
  }
}

export function formatCharts(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

const isInt = (n) => Number.isInteger(n);

export function validateCharts(data, label) {
  const fail = (message) => { throw new Error(`${label}: ${message}`); };
  if (!data || data.version !== 1 || !Array.isArray(data.charts)) fail('expected { "version": 1, "charts": [...] }');
  if (data.charts.length === 0) fail('needs at least one chart');

  const seen = new Set();
  data.charts.forEach((c, index) => {
    const format = FORMATS.find((f) => f.key === c?.format);
    if (!format) fail(`chart ${index + 1} has an unknown format ${JSON.stringify(c?.format)}`);
    const where = `${c.players} players, ${c.format}`;
    const bad = (message) => fail(`${where}: ${message}`);
    if (!isInt(c.players) || c.players < 5) bad('players must be a whole number of 5 or more');
    const key = `${c.players}/${c.format}`;
    if (seen.has(key)) bad('appears twice');
    seen.add(key);
    if (c.periods !== format.periods || c.period_length_minutes !== format.minutes) bad('periods or period length do not match the format');
    if (!isInt(c.subs) || c.subs < 0) bad('subs must be a whole number');
    if (!Array.isArray(c.stretches) || c.stretches.length === 0) bad('needs stretches');

    const len = format.minutes * 60;
    for (let p = 1; p <= format.periods; p++) {
      const inPeriod = c.stretches.filter((s) => s.period === p);
      if (inPeriod.length === 0 || inPeriod[0].start !== (p - 1) * len || inPeriod.at(-1).end !== p * len) {
        bad(`period ${p} has a gap at its start or end`);
      }
      inPeriod.forEach((s, i) => {
        if (i > 0 && s.start !== inPeriod[i - 1].end) bad(`period ${p} has a gap or overlap at ${s.start}s`);
      });
    }
    c.stretches.forEach((s) => {
      if (!isInt(s.start) || !isInt(s.end) || s.end <= s.start) bad(`stretch at ${s.start}s has no length`);
      if (s.period < 1 || s.period > format.periods) bad(`stretch at ${s.start}s is in no period`);
      const on = s.on;
      if (!Array.isArray(on) || on.length !== 5 || new Set(on).size !== 5
          || on.some((n) => !isInt(n) || n < 1 || n > c.players)) {
        bad(`stretch at ${s.start}s must have five different players from 1 to ${c.players}`);
      }
    });

    if (!Array.isArray(c.seconds) || c.seconds.length !== c.players) bad('seconds needs one entry per player');
    c.seconds.forEach((sec, i) => {
      const fromStretches = c.stretches.filter((s) => s.on.includes(i + 1)).reduce((t, s) => t + s.end - s.start, 0);
      if (sec !== fromStretches) bad(`player ${i + 1}'s seconds don't match the stretches`);
    });
    const total = c.seconds.reduce((a, b) => a + b, 0);
    if (total !== 5 * format.periods * len) bad(`seconds add up to ${total}, not 5 × the game`);
  });
  return data;
}
