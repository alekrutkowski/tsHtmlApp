/* tsHtmlApp: browser-only data engine. MIT, copyright 2026 Alek Rutkowski. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TsHtmlEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SERIES_LIMIT = 10;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const integer = value => Number.isInteger(value) && value >= 0;

  function createModel(data, options) {
    if (!data || data.schemaVersion !== 1 || !data.time || !Array.isArray(data.time.labels) || !data.time.labels.length) {
      throw new Error('This file contains unsupported or incomplete time-series data.');
    }
    const rng = options && options.rng || Math.random;
    const rowCount = data.rowCount;
    const lastTime = data.time.labels.length - 1;
    const state = {
      selections: data.dimensions.map(() => []),
      from: 0, to: lastTime, indexed: false, base: 0, markers: false
    };
    let available = [];
    let filteredRows = [];
    let displayedRows = [];
    let shownIds = [];
    let totalSeries = 0;
    let previousSignature = null;
    const model = {state, setSelection, update, reset, getAvailable, getSummary, getChart, getCsv};

    function clampTime(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(0, Math.min(lastTime, Math.trunc(number))) : fallback;
    }

    function chooseSeries(ids) {
      if (ids.length <= SERIES_LIMIT) return ids.slice();
      const pool = ids.slice();
      for (let i = 0; i < SERIES_LIMIT; i += 1) {
        const random = rng();
        if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('The random generator must return a number from 0 up to 1.');
        const j = i + Math.floor(random * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, SERIES_LIMIT);
    }

    function refreshCategories() {
      // All rows determine filter choices, including rows without a time value.
      // Only rows with a usable time value can be plotted or exported as a window.
      let allowedRows = Array.from({length: rowCount}, (_, i) => i);
      available = data.dimensions.map((dimension, index) => {
        const observed = data.cascading && index > 0
          ? new Set(allowedRows.map(row => dimension.codes[row])) : null;
        const choices = observed ? dimension.choices.filter(choice => observed.has(choice.id)) : dimension.choices.slice();
        const requested = new Set(state.selections[index]);
        state.selections[index] = choices.filter(choice => requested.has(choice.id)).map(choice => choice.id);
        if (data.cascading && state.selections[index].length) {
          const selected = new Set(state.selections[index]);
          allowedRows = allowedRows.filter(row => selected.has(dimension.codes[row]));
        }
        return choices;
      });
      const signature = JSON.stringify(state.selections);
      if (signature === previousSignature) return;
      previousSignature = signature;
      const selections = state.selections.map(values => new Set(values));
      filteredRows = [];
      const ids = new Set();
      for (let row = 0; row < rowCount; row += 1) {
        if (!integer(data.time.ids[row]) || data.time.ids[row] > lastTime) continue;
        if (!data.dimensions.every((dimension, index) => !selections[index].size || selections[index].has(dimension.codes[row]))) continue;
        filteredRows.push(row);
        ids.add(data.series.ids[row]);
      }
      totalSeries = ids.size;
      shownIds = chooseSeries(Array.from(ids));
      const shown = new Set(shownIds);
      displayedRows = filteredRows.filter(row => shown.has(data.series.ids[row]));
    }

    function setSelection(index, ids) {
      if (!integer(index) || index >= data.dimensions.length) throw new RangeError('Unknown category filter.');
      if (!Array.isArray(ids)) throw new TypeError('Filter selections must be an array of category IDs.');
      state.selections[index] = Array.from(new Set(ids.map(Number).filter(integer)));
      refreshCategories();
      return model;
    }

    function update(patch) {
      patch = patch || {};
      if (Object.prototype.hasOwnProperty.call(patch, 'from')) state.from = clampTime(patch.from, state.from);
      if (Object.prototype.hasOwnProperty.call(patch, 'to')) state.to = clampTime(patch.to, state.to);
      if (state.from > state.to) [state.from, state.to] = [state.to, state.from];
      if (Object.prototype.hasOwnProperty.call(patch, 'base')) state.base = clampTime(patch.base, state.base);
      ['indexed', 'markers'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) state[key] = patch[key] === true;
      });
      return model;
    }

    function reset() {
      state.selections = data.dimensions.map(() => []);
      state.from = 0;
      state.to = lastTime;
      state.indexed = false;
      state.base = 0;
      state.markers = false;
      refreshCategories();
      return model;
    }

    function getAvailable(index) {
      if (!integer(index) || index >= available.length) return [];
      return available[index].slice();
    }

    function insideWindow(row) {
      return data.time.ids[row] >= state.from && data.time.ids[row] <= state.to;
    }

    function getSummary() {
      return {
        filteredRows: filteredRows.length,
        windowRows: filteredRows.filter(insideWindow).length,
        displayedRows: displayedRows.filter(insideWindow).length,
        totalSeries,
        shownSeries: shownIds.length,
        shownIds: shownIds.slice(),
        missingTimeRows: data.missingTimeRows,
        from: state.from, to: state.to,
        fromLabel: data.time.labels[state.from],
        toLabel: data.time.labels[state.to]
      };
    }

    function baseLookup(metricIndex, rows) {
      const lookup = new Map();
      rows.forEach(row => {
        if (data.time.ids[row] === state.base) lookup.set(data.series.ids[row], data.measures[metricIndex].values[row]);
      });
      return lookup;
    }

    function indexValue(value, base) {
      if (!finite(value) || !finite(base) || base === 0) return null;
      const indexed = (value / base) * 100;
      return Number.isFinite(indexed) ? indexed : null;
    }

    function getChart(metricIndex) {
      if (!integer(metricIndex) || metricIndex >= data.measures.length) throw new RangeError('Unknown numeric measure.');
      const measure = data.measures[metricIndex];
      const rows = displayedRows.filter(insideWindow);
      const bases = state.indexed ? baseLookup(metricIndex, displayedRows) : null;
      const bySeries = new Map();
      rows.forEach(row => {
        const id = data.series.ids[row];
        if (!bySeries.has(id)) bySeries.set(id, []);
        bySeries.get(id).push(row);
      });
      let omittedBaseCount = 0;
      const traces = shownIds.filter(id => bySeries.has(id)).map(id => {
        const seriesRows = bySeries.get(id).sort((a, b) => data.time.ids[a] - data.time.ids[b]);
        const base = state.indexed ? bases.get(id) : null;
        if (state.indexed && (!finite(base) || base === 0)) omittedBaseCount += 1;
        return {
          id,
          label: data.series.labels[id],
          x: seriesRows.map(row => data.time.ids[row]),
          y: seriesRows.map(row => state.indexed ? indexValue(measure.values[row], base) : finite(measure.values[row]) ? measure.values[row] : null),
          timeLabels: seriesRows.map(row => data.time.labels[data.time.ids[row]])
        };
      });
      const anyFinite = traces.some(trace => trace.y.some(finite));
      const emptyReason = !filteredRows.length ? 'No rows match the current filters.'
        : !rows.length ? 'No observations fall inside the selected time window.'
          : !anyFinite ? state.indexed ? 'No usable indexed values. Choose a base period with a finite, non-zero value.'
            : 'This measure has no finite values in the selected time window.' : '';
      return {
        traces,
        yTitle: state.indexed ? 'Index (' + data.time.labels[state.base] + ' = 100)' : measure.name,
        omittedBaseCount,
        rowCount: rows.length,
        emptyReason
      };
    }

    function csvCell(value) {
      if (value === null || value === undefined) return '';
      const text = String(value);
      // Always quote text: this preserves whitespace, line breaks, delimiters,
      // literal empty strings and the exact categorical labels. Missing values
      // remain unquoted empty cells. Consumers decide their own import types.
      return typeof value === 'string' ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function getCsv(options) {
      options = options || {};
      const scope = options.scope || 'filtered';
      if (scope !== 'filtered' && scope !== 'displayed') throw new Error('CSV scope must be filtered or displayed.');
      const rows = (scope === 'displayed' ? displayedRows : filteredRows).filter(insideWindow);
      const indexed = options.indexed === true;
      const bases = indexed ? data.measures.map((_, index) => baseLookup(index, filteredRows)) : [];
      const header = data.columns.map(column => csvCell(column.name)).join(',');
      const lines = rows.map(row => data.columns.map(column => {
        if (column.kind === 'time') return csvCell(data.time.values[row]);
        if (column.kind === 'dimension') return csvCell(data.dimensions[column.index].values[row]);
        const value = data.measures[column.index].values[row];
        return csvCell(indexed ? indexValue(value, bases[column.index].get(data.series.ids[row])) : value);
      }).join(','));
      return [header].concat(lines).join('\r\n') + '\r\n';
    }

    refreshCategories();
    return model;
  }

  return {createModel, SERIES_LIMIT};
}));
