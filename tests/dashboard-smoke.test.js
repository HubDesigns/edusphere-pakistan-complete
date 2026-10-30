import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('institution dashboard exposes direct attendance and finance quick actions', () => {
  assert.match(html, /id="owner-quick-actions"/);
  assert.match(html, /id="quick-mark-attendance"/);
  assert.match(html, /id="quick-pay-salary"/);
  assert.match(html, /id="attendance-nav"/);
  assert.match(js, /schoolTab\('attendance'\)/);
  assert.match(css, /\.quick-actions-grid/);
});

test('attendance workflow supports saved status prefill and bulk marking', () => {
  assert.match(js, /mark-all-present/);
  assert.match(js, /mark-all-absent/);
  assert.match(js, /attendance\?\'/);
});

test('monthly report provides calendar and CSV export', () => {
  assert.match(js, /attendance-calendar/);
  assert.match(js, /export-attendance-csv/);
  assert.match(js, /attendance-\$\{f\.month\}\.csv/);
});
