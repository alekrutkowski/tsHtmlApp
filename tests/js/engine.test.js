'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createModel} = require('../../inst/templates/engine.js');

function fixture(rows, dimensions = ['country', 'region'], measureNames = ['value', 'rate']) {
  const labels = Array.from(new Set(rows.map(row => row.time).filter(value => value !== null))).sort();
  const timeIds = rows.map(row => row.time === null ? null : labels.indexOf(row.time));
  const dims = dimensions.map(name => {
    const values = rows.map(row => row[name]);
    const unique = Array.from(new Set(values));
    return {name, values, codes: values.map(value => unique.indexOf(value)), choices: unique.map((value, id) => ({id, label: value === null ? '(Missing)' : value === '' ? '(Blank)' : value, value}))};
  });
  const seriesKeys = rows.map((_, index) => JSON.stringify(dims.map(dimension => dimension.codes[index])));
  const uniqueSeries = Array.from(new Set(seriesKeys));
  return {
    schemaVersion: 1, title: 'Test', cascading: false, rowCount: rows.length,
    missingTimeRows: timeIds.filter(value => value === null).length,
    time: {name: 'time', labels, ids: timeIds, values: rows.map(row => row.time)},
    dimensions: dims,
    measures: measureNames.map(name => ({name, values: rows.map(row => row[name])})),
    series: {ids: seriesKeys.map(key => uniqueSeries.indexOf(key)), labels: uniqueSeries.map(key => 'Series ' + key)},
    columns: [{name: 'time', kind: 'time', index: 0}].concat(dimensions.map((name, index) => ({name, kind: 'dimension', index})), measureNames.map((name, index) => ({name, kind: 'measure', index}))),
    original: {filename: 'data.rds', base64: ''}
  };
}

function ordinary() {
  return fixture([
    {time: '2024-Q1', country: 'A', region: 'North', value: 10, rate: 1},
    {time: '2024-Q2', country: 'A', region: 'North', value: 20, rate: 2},
    {time: '2024-Q3', country: 'A', region: 'North', value: 30, rate: 3},
    {time: '2024-Q1', country: 'B', region: 'South', value: 25, rate: 5},
    {time: '2024-Q2', country: 'B', region: 'South', value: 50, rate: 10},
    {time: '2024-Q3', country: 'B', region: 'South', value: 75, rate: 15}
  ]);
}

test('initial defaults, no mutation, multiple metrics and original chronology', () => {
  const data = ordinary();
  data.measures[0].values = [20, 10, 30, 50, 25, 75];
  data.time.ids = [1, 0, 2, 1, 0, 2];
  const before = JSON.stringify(data);
  const model = createModel(data);
  assert.deepEqual(model.state, {selections: [[], []], from: 0, to: 2, indexed: false, base: 0, markers: false});
  assert.deepEqual(model.getChart(0).traces[0].x, [0, 1, 2]);
  assert.deepEqual(model.getChart(0).traces[0].y, [10, 20, 30]);
  assert.equal(model.getChart(1).yTitle, 'rate');
  assert.deepEqual(model.getSummary(), {filteredRows: 6, windowRows: 6, displayedRows: 6, totalSeries: 2, shownSeries: 2, shownIds: [0, 1], missingTimeRows: 0, from: 0, to: 2, fromLabel: '2024-Q1', toLabel: '2024-Q3'});
  assert.equal(JSON.stringify(data), before);
});

test('noncascading multiple selection keeps full choice sets and intersects dimensions', () => {
  const model = createModel(ordinary());
  model.setSelection(0, [0]);
  assert.equal(model.getSummary().filteredRows, 3);
  assert.deepEqual(model.getAvailable(1).map(choice => choice.value), ['North', 'South']);
  model.setSelection(1, [1]);
  assert.equal(model.getSummary().filteredRows, 0);
  assert.match(model.getChart(0).emptyReason, /No rows/);
  model.setSelection(0, [0, 1]);
  assert.equal(model.getSummary().filteredRows, 3);
  model.setSelection(1, []);
  assert.equal(model.getSummary().filteredRows, 6);
});

test('cascades run left to right and clear invalid downstream selections', () => {
  const data = ordinary();
  data.cascading = true;
  const model = createModel(data);
  model.setSelection(1, [1]);
  assert.equal(model.getAvailable(0).length, 2, 'later filter cannot narrow earlier choices');
  model.setSelection(0, [0]);
  assert.deepEqual(model.getAvailable(1).map(choice => choice.value), ['North']);
  assert.deepEqual(model.state.selections, [[0], []]);
  assert.equal(model.getSummary().filteredRows, 3);
  model.setSelection(0, []);
  assert.equal(model.getAvailable(1).length, 2);
});

test('missing-time rows inform cascading choices but never appear in plots', () => {
  const data = fixture([
    {time: '2024', country: 'A', region: 'North', value: 1},
    {time: null, country: 'A', region: 'Missing time only', value: 2},
    {time: '2024', country: 'B', region: 'South', value: 3}
  ], ['country', 'region'], ['value']);
  data.cascading = true;
  const model = createModel(data).setSelection(0, [0]);
  assert.deepEqual(model.getAvailable(1).map(choice => choice.value), ['North', 'Missing time only']);
  assert.equal(model.getSummary().filteredRows, 1);
  assert.equal(model.getSummary().missingTimeRows, 1);
  assert.equal(model.getCsv().split('\r\n').length, 3);
});

test('missing, blank, literal display labels and delimiter collisions remain distinct', () => {
  const data = fixture([null, '', '(Missing)', '(Blank)', '__proto__', 'A | region = B'].map(country => ({time: '2024', country, region: '', value: 1})), ['country', 'region'], ['value']);
  data.series.labels.fill('identical visible label');
  const model = createModel(data);
  assert.equal(model.getChart(0).traces.length, 6);
  assert.equal(new Set(model.getChart(0).traces.map(trace => trace.id)).size, 6);
  model.setSelection(0, [0]);
  assert.equal(model.getSummary().filteredRows, 1);
  model.setSelection(0, [2]);
  assert.equal(model.getSummary().filteredRows, 1);
});

test('series cap is 10, shared by all charts and stable under presentation changes', () => {
  const data = fixture(Array.from({length: 30}, (_, i) => ({time: String(2024 + i % 2), country: String(Math.floor(i / 2)), region: 'X', value: i + 1, rate: i + 2})));
  let calls = 0;
  const model = createModel(data, {rng: () => {calls += 1; return 0.42;}});
  const selected = model.getSummary().shownIds;
  assert.equal(selected.length, 10);
  assert.equal(new Set(selected).size, 10);
  assert.equal(model.getSummary().totalSeries, 15);
  assert.deepEqual(model.getChart(0).traces.map(trace => trace.id), model.getChart(1).traces.map(trace => trace.id));
  model.update({from: 1, to: 1, indexed: true, base: 0, markers: true});
  assert.deepEqual(model.getSummary().shownIds, selected);
  assert.equal(calls, 10, 'presentation changes must not sample again');
  model.setSelection(1, [0]);
  assert.equal(calls, 20, 'categorical selection change refreshes the shared sample');
  model.setSelection(1, [0]);
  assert.equal(calls, 20, 'same effective selection must not sample again');
});

test('index base is resolved before restricting the time window', () => {
  const model = createModel(ordinary()).update({from: 1, to: 2, indexed: true, base: 0});
  const chart = model.getChart(0);
  assert.deepEqual(chart.traces[0].x, [1, 2]);
  assert.deepEqual(chart.traces[0].y, [200, 300]);
  assert.deepEqual(chart.traces[1].y, [200, 300]);
  assert.equal(chart.yTitle, 'Index (2024-Q1 = 100)');
  assert.equal(chart.omittedBaseCount, 0);
});

test('zero, missing, NaN and infinite bases blank each affected series', () => {
  const rows = [0, null, 'NaN', 'Inf', '-Inf', 5].flatMap((base, i) => [
    {time: '2024', country: String(i), region: '', value: base},
    {time: '2025', country: String(i), region: '', value: 10}
  ]);
  const model = createModel(fixture(rows, ['country', 'region'], ['value'])).update({indexed: true, base: 0});
  const chart = model.getChart(0);
  assert.equal(chart.omittedBaseCount, 5);
  chart.traces.slice(0, 5).forEach(trace => assert.deepEqual(trace.y, [null, null]));
  assert.deepEqual(chart.traces[5].y, [100, 200]);
});

test('absent base observations and numeric gaps stay gaps', () => {
  const rows = [
    {time: '2024', country: 'A', value: 10},
    {time: '2025', country: 'A', value: null},
    {time: '2026', country: 'A', value: 'Inf'},
    {time: '2025', country: 'B', value: 5}
  ];
  const model = createModel(fixture(rows, ['country'], ['value']));
  assert.deepEqual(model.getChart(0).traces[0].y, [10, null, null]);
  model.update({indexed: true});
  assert.deepEqual(model.getChart(0).traces[1].y, [null]);
  assert.equal(model.getChart(0).omittedBaseCount, 1);
});

test('single-period, no-dimension data has one series and normalized bounds', () => {
  const model = createModel(fixture([{time: '2024', value: 5}], [], ['value']));
  assert.deepEqual(model.state.selections, []);
  assert.equal(model.getSummary().shownSeries, 1);
  assert.deepEqual(model.getChart(0).traces[0].y, [5]);
  model.update({from: 200, to: -10, base: 100});
  assert.equal(model.state.from, 0);
  assert.equal(model.state.to, 0);
  assert.equal(model.state.base, 0);
});

test('empty time windows return a useful status instead of stale data', () => {
  const model = createModel(fixture([
    {time: '2024', country: 'A', value: 1},
    {time: '2025', country: 'B', value: 2}
  ], ['country'], ['value'])).setSelection(0, [0]).update({from: 1, to: 1});
  assert.equal(model.getChart(0).traces.length, 0);
  assert.match(model.getChart(0).emptyReason, /No observations/);
});

test('CSV includes all matching series, uses raw data by default, and quotes text correctly', () => {
  const rows = Array.from({length: 12}, (_, i) => ({time: '2024', country: 'A,"' + i + '\nB', value: i + 1}));
  const model = createModel(fixture(rows, ['country'], ['value']), {rng: () => 0}).update({indexed: true});
  const csv = model.getCsv();
  assert.ok(csv.startsWith('"time","country","value"\r\n'));
  assert.ok(csv.includes('"A,""0\nB",1\r\n'));
  assert.ok(csv.includes('"A,""11\nB",12\r\n'));
  assert.ok(!model.getCsv({scope: 'displayed'}).includes('"A,""11\nB"'));
  assert.ok(model.getCsv({indexed: true}).includes('"A,""0\nB",100\r\n'));
  assert.throws(() => model.getCsv({scope: 'wrong'}), /CSV scope/);
});

test('CSV preserves nonfinite values, nulls, blank strings and column order', () => {
  const data = fixture([
    {time: '2024', country: '', value: 'Inf'},
    {time: '2025', country: null, value: 'NaN'},
    {time: '2026', country: 'x', value: null}
  ], ['country'], ['value']);
  data.columns.reverse();
  const csv = createModel(data).getCsv();
  assert.equal(csv, '"value","country","time"\r\n"Inf","","2024"\r\n"NaN",,"2025"\r\n,"x","2026"\r\n');
});

test('reset restores filters and presentation defaults', () => {
  const model = createModel(ordinary()).setSelection(0, [1]).update({from: 1, indexed: true, base: 1, markers: true});
  model.reset();
  assert.deepEqual(model.state, {selections: [[], []], from: 0, to: 2, indexed: false, base: 0, markers: false});
  assert.equal(model.getSummary().filteredRows, 6);
});

test('labels are returned as data and cannot modify object prototypes', () => {
  const data = ordinary();
  data.dimensions[0].name = '__proto__';
  data.measures[0].name = '</script><img src=x onerror=alert(1)>';
  data.series.labels[0] = '<b>not HTML</b>';
  const chart = createModel(data).getChart(0);
  assert.equal(chart.yTitle, data.measures[0].name);
  assert.equal(chart.traces[0].label, '<b>not HTML</b>');
  assert.equal({}.polluted, undefined);
});

test('numeric index calculations avoid multiplication overflow when ratio is finite', () => {
  const model = createModel(fixture([{time: '2024', value: 1e307}, {time: '2025', value: 2e307}], [], ['value'])).update({indexed: true});
  assert.deepEqual(model.getChart(0).traces[0].y, [100, 200]);
});

test('malformed payloads and invalid API calls fail clearly', () => {
  assert.throws(() => createModel({schemaVersion: 2}), /unsupported/);
  const model = createModel(ordinary());
  assert.throws(() => model.setSelection(100, []), /Unknown category/);
  assert.throws(() => model.setSelection(0, 'A'), /array/);
  assert.throws(() => model.getChart(100), /Unknown numeric/);
});

module.exports = {fixture, ordinary};
