/* tsHtmlApp browser interface. MIT, copyright 2026 Alek Rutkowski. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const html = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
  const number = value => value.toLocaleString('en-US');
  const iconPaths = {
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1.8 7M4 4v6h6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    warning: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' + iconPaths[name] + '</svg>';
  const palette = ['#3978d5','#ed8b45','#21a7a0','#9a77ce','#cf6882','#778b4e','#62aada','#b18c5f','#6c79b9','#8d9ba9'];
  let toastTimer;
  let fullscreenCard = null;
  let focusBeforeFullscreen = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }

  function setBusy(active) {
    $('busy').classList.toggle('is-active', active);
    $('busy').setAttribute('aria-hidden', String(!active));
    document.body.setAttribute('aria-busy', String(active));
  }

  function fail(error) {
    setBusy(false);
    $('fatal-error-message').textContent = error && error.message || String(error);
    $('fatal-error').hidden = false;
    document.body.dataset.ready = 'error';
    console.error(error);
  }

  function download(bytes, filename, mime) {
    const objectUrl = URL.createObjectURL(new Blob([bytes], {type: mime}));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  }

  function createFilter(dimension, index, model, schedule) {
    const field = node('div', 'filter-field');
    const labelRow = node('div', 'filter-label-row');
    const label = node('label', 'filter-label', dimension.name);
    label.htmlFor = 'filter-' + index;
    const count = node('span', 'filter-count');
    const clear = node('button', 'filter-clear', 'Clear');
    clear.type = 'button';
    clear.setAttribute('aria-label', 'Clear ' + dimension.name);
    const right = node('span');
    right.append(count, clear);
    labelRow.append(label, right);
    const control = node('div', 'multi-input');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'filter-' + index;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'filter-menu-' + index);
    input.placeholder = 'All values';
    const menu = node('div', 'filter-menu');
    menu.id = 'filter-menu-' + index;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', dimension.name + ' choices');
    menu.setAttribute('aria-multiselectable', 'true');
    menu.hidden = true;
    control.append(input);
    field.append(labelRow, control, menu);
    let choices = [];
    let visible = [];
    let active = -1;
    let options = [];

    function close() {
      menu.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function markActive(next) {
      if (!options.length) return;
      active = (next + options.length) % options.length;
      options.forEach((option, i) => option.classList.toggle('is-active', i === active));
      input.setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView({block: 'nearest'});
    }

    function toggle(id) {
      const selected = model.state.selections[index];
      const next = selected.includes(id) ? selected.filter(value => value !== id) : selected.concat(id);
      input.value = '';
      schedule(() => model.setSelection(index, next));
      input.focus({preventScroll: true});
    }

    function renderMenu() {
      const query = input.value.trim().toLocaleLowerCase();
      const matches = choices.filter(choice => choice.label.toLocaleLowerCase().includes(query));
      visible = matches.slice(0, 200);
      const selected = new Set(model.state.selections[index]);
      menu.replaceChildren();
      options = visible.map(choice => {
        const option = node('div', 'filter-option');
        option.id = 'filter-' + index + '-choice-' + choice.id;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(selected.has(choice.id)));
        option.append(node('span', 'option-check', '✓'), node('span', '', choice.label));
        option.addEventListener('pointerdown', event => event.preventDefault());
        option.addEventListener('click', () => toggle(choice.id));
        menu.append(option);
        return option;
      });
      if (!matches.length) menu.append(node('p', 'menu-message', 'No matching values'));
      if (matches.length > visible.length) menu.append(node('p', 'menu-message', 'Showing 200 of ' + number(matches.length) + ' values. Type to narrow the list.'));
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }

    function open() {
      document.querySelectorAll('.filter-menu').forEach(other => {
        if (other !== menu) {
          other.hidden = true;
          const otherInput = other.parentElement.querySelector('[role="combobox"]');
          otherInput.setAttribute('aria-expanded', 'false');
          otherInput.removeAttribute('aria-activedescendant');
        }
      });
      renderMenu();
      menu.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    function update() {
      choices = model.getAvailable(index);
      const selected = model.state.selections[index];
      const byId = new Map(dimension.choices.map(choice => [choice.id, choice]));
      control.querySelectorAll('.filter-chip').forEach(chip => chip.remove());
      selected.forEach(id => {
        const choice = byId.get(id);
        const chip = node('span', 'filter-chip');
        const text = node('span', 'filter-chip-text', choice.label);
        text.title = choice.label;
        const remove = node('button', 'chip-remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + choice.label + ' from ' + dimension.name);
        remove.addEventListener('click', event => { event.stopPropagation(); toggle(id); });
        chip.append(text, remove);
        control.insertBefore(chip, input);
      });
      input.placeholder = selected.length ? 'Add…' : 'All values';
      count.textContent = selected.length ? '' : number(choices.length);
      clear.hidden = !selected.length;
      if (!menu.hidden) renderMenu();
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', open);
    control.addEventListener('click', event => { if (event.target === control) { input.focus(); open(); } });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) open();
        markActive(active + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter' && !menu.hidden && options.length) {
        event.preventDefault();
        toggle(visible[active < 0 ? 0 : active].id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Backspace' && !input.value && model.state.selections[index].length) {
        toggle(model.state.selections[index].slice(-1)[0]);
      } else if (event.key === 'Tab') close();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      schedule(() => model.setSelection(index, []));
    });
    document.addEventListener('pointerdown', event => { if (!field.contains(event.target)) close(); });
    return {element: field, update, close};
  }

  function toggleFullscreen(card) {
    if (fullscreenCard) {
      const previous = fullscreenCard;
      previous.classList.remove('is-fullscreen');
      previous.removeAttribute('role');
      previous.removeAttribute('aria-modal');
      previous.querySelector('.fullscreen-button').innerHTML = icon('expand');
      previous.querySelector('.fullscreen-button').setAttribute('aria-label', 'Expand chart');
      fullscreenCard = null;
      document.body.classList.remove('chart-fullscreen');
      if (focusBeforeFullscreen) focusBeforeFullscreen.focus({preventScroll: true});
      if (previous === card) return;
    }
    focusBeforeFullscreen = document.activeElement;
    fullscreenCard = card;
    card.classList.add('is-fullscreen');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.querySelector('.fullscreen-button').innerHTML = icon('close');
    card.querySelector('.fullscreen-button').setAttribute('aria-label', 'Exit full screen');
    document.body.classList.add('chart-fullscreen');
    card.querySelector('.fullscreen-button').focus({preventScroll: true});
  }

  function addResizeHandles(card) {
    ['right', 'bottom', 'corner'].forEach(edge => {
      const handle = node('div', 'resize-handle resize-handle-' + edge);
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-label', 'Resize chart ' + (edge === 'right' ? 'width' : edge === 'bottom' ? 'height' : 'width and height'));
      handle.title = 'Drag to resize; arrow keys adjust by 20 pixels; double-click to restore';
      if (edge !== 'corner') handle.setAttribute('aria-orientation', edge === 'right' ? 'vertical' : 'horizontal');
      const resize = (width, height) => {
        if (edge !== 'bottom') card.style.width = Math.max(310, Math.min(5000, width)) + 'px';
        if (edge !== 'right') card.style.height = Math.max(315, Math.min(2500, height)) + 'px';
      };
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const box = card.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        card.classList.add('is-resizing');
        handle.setPointerCapture(event.pointerId);
        const move = current => resize(box.width + current.clientX - startX, box.height + current.clientY - startY);
        const end = () => {
          card.classList.remove('is-resizing');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', end);
          handle.removeEventListener('pointercancel', end);
          handle.removeEventListener('lostpointercapture', end);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
        handle.addEventListener('lostpointercapture', end);
      });
      handle.addEventListener('keydown', event => {
        const delta = {ArrowRight: [20, 0], ArrowLeft: [-20, 0], ArrowDown: [0, 20], ArrowUp: [0, -20]}[event.key];
        if (!delta) return;
        event.preventDefault();
        const box = card.getBoundingClientRect();
        resize(box.width + delta[0], box.height + delta[1]);
      });
      handle.addEventListener('dblclick', () => { card.style.width = ''; card.style.height = ''; });
      card.append(handle);
    });
  }

  function createCard(measure, index) {
    const scroll = node('div', 'metric-card-scroll');
    const card = node('section', 'metric-card');
    card.id = 'metric-card-' + index;
    card.setAttribute('aria-labelledby', 'metric-title-' + index);
    const header = node('div', 'metric-header');
    const titleGroup = node('div', 'metric-title');
    const heading = node('h3', '', measure.name);
    heading.id = 'metric-title-' + index;
    const subtitle = node('p', 'metric-subtitle');
    titleGroup.append(heading, subtitle);
    const actions = node('div', 'metric-actions');
    const badge = node('span', 'metric-badge', 'Original values');
    const reset = node('button', 'icon-button');
    reset.type = 'button';
    reset.innerHTML = icon('reset');
    reset.setAttribute('aria-label', 'Reset chart zoom');
    reset.title = 'Reset chart zoom';
    const png = node('button', 'icon-button');
    png.type = 'button';
    png.innerHTML = icon('download');
    png.setAttribute('aria-label', 'Download chart as PNG');
    png.title = 'Download chart as PNG';
    const full = node('button', 'icon-button fullscreen-button');
    full.type = 'button';
    full.innerHTML = icon('expand');
    full.setAttribute('aria-label', 'Expand chart');
    full.title = 'Expand chart / Esc to close';
    actions.append(badge, reset, png, full);
    header.append(titleGroup, actions);
    const plotArea = node('div', 'plot-area');
    const plot = node('div', 'plot');
    plot.id = 'plot-' + index;
    plot.setAttribute('aria-label', measure.name + ' time-series chart');
    const empty = node('div', 'plot-empty');
    empty.hidden = true;
    plotArea.append(plot, empty);
    const footer = node('div', 'metric-footer');
    const status = node('span', 'base-warning');
    const hint = node('span', 'resize-hint', 'Drag shaded edges or corner to resize');
    footer.append(status, hint);
    card.append(header, plotArea, footer);
    addResizeHandles(card);
    scroll.append(card);
    full.addEventListener('click', () => toggleFullscreen(card));
    let resetRange = [-0.2, 1.2];
    reset.addEventListener('click', () => {
      Plotly.relayout(plot, {'xaxis.range': resetRange, 'xaxis.autorange': false, 'yaxis.autorange': true}).catch(fail);
    });
    png.addEventListener('click', () => {
      const filename = measure.name.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 100) || 'chart';
      Plotly.downloadImage(plot, {format: 'png', filename, width: 1600, height: 900}).catch(error => toast('Image download failed: ' + error.message));
    });
    let resizeTimer;
    new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (plot._fullLayout) Plotly.Plots.resize(plot).catch(() => {}); }, 70);
    }).observe(plotArea);
    return {element: scroll, card, plot, subtitle, badge, empty, status, setRange: range => { resetRange = range; }};
  }

  async function start() {
    const payload = JSON.parse($('tsapp-data').textContent);
    if (!window.Plotly || !window.TsHtmlEngine) throw new Error('The embedded chart components are missing. Generate this file again.');
    const model = TsHtmlEngine.createModel(payload);
    const cards = payload.measures.map(createCard);
    const filters = payload.dimensions.map((dimension, index) => createFilter(dimension, index, model, schedule));
    const shortLabels = [];
    payload.series.ids.forEach((id, row) => {
      if (shortLabels[id] === undefined) shortLabels[id] = payload.dimensions.length
        ? payload.dimensions.map(dimension => dimension.values[row] === null ? '(Missing)' : dimension.values[row] === '' ? '(Blank)' : dimension.values[row]).join(' · ') : 'Series';
    });
    let running = false;
    let pending = [];
    let renderId = 0;
    let viewEpoch = 0;
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    // Internal diagnostics used by the package's browser regression tests.
    window.__TSHTML_APP__ = {model, payload, ready};
    $('app-title').textContent = payload.title;
    document.title = payload.title;
    $('filter-mode').textContent = payload.cascading ? 'CASCADING' : 'INDEPENDENT';
    $('filter-note').textContent = payload.cascading
      ? 'Filters cascade from top to bottom. Leave a selector empty to include all currently available values.'
      : 'Leave a selector empty to include all values. Choose several values to compare them.';
    if (filters.length) filters.forEach(filter => $('category-filters').append(filter.element));
    else $('category-filters').append(node('p', 'note', 'No categorical columns. All observations belong to one series.'));
    cards.forEach(card => $('charts').append(card.element));
    $('measure-count').textContent = number(cards.length) + (cards.length === 1 ? ' measure' : ' measures');
    ['time-from', 'time-to', 'base-time'].forEach(id => {
      const select = $(id);
      const fragment = document.createDocumentFragment();
      payload.time.labels.forEach((label, value) => {
        const option = node('option', '', label);
        option.value = String(value);
        fragment.append(option);
      });
      select.append(fragment);
    });
    const mobile = matchMedia('(max-width: 760px)');
    if (mobile.matches) document.body.classList.add('sidebar-hidden');
    $('toggle-sidebar').setAttribute('aria-expanded', String(!document.body.classList.contains('sidebar-hidden')));

    function updateControls() {
      filters.forEach(filter => filter.update());
      $('time-from').value = String(model.state.from);
      $('time-to').value = String(model.state.to);
      $('base-time').value = String(model.state.base);
      $('indexed').checked = model.state.indexed;
      $('markers').checked = model.state.markers;
      $('index-options').hidden = !model.state.indexed;
      const summary = model.getSummary();
      const status = $('selection-status');
      status.replaceChildren();
      [['Matching rows', summary.filteredRows], ['Rows in time window', summary.windowRows], ['Series displayed', summary.shownSeries + ' / ' + summary.totalSeries]].forEach(([label, count]) => {
        const line = node('div', 'selection-line');
        line.append(node('span', '', label), node('strong', '', typeof count === 'number' ? number(count) : count));
        status.append(line);
      });
      status.append(node('div', 'selection-period', summary.fromLabel + ' to ' + summary.toLabel));
      const strip = $('summary-strip');
      strip.replaceChildren();
      [[number(summary.windowRows), ' observations'], [number(summary.totalSeries), ' matching series'], [summary.fromLabel + ' to ' + summary.toLabel, '']].forEach(([strong, suffix], index) => {
        if (index) strip.append(node('span', 'summary-dot'));
        const item = node('span');
        item.append(node('strong', '', strong), document.createTextNode(suffix));
        strip.append(item);
      });
      const warning = $('series-warning');
      warning.hidden = summary.totalSeries <= 10;
      if (!warning.hidden) {
        warning.replaceChildren();
        const warningIcon = node('span');
        warningIcon.innerHTML = icon('warning');
        const text = node('span');
        text.append(node('strong', '', number(summary.totalSeries) + ' series match your filters. '), document.createTextNode('The charts show the same random sample of 10. Narrow the filters to compare a specific set. This sample stays fixed while you change the time window or display options.'));
        warning.append(warningIcon, text);
      }
      $('missing-time-note').hidden = !summary.missingTimeRows;
      $('missing-time-note').textContent = number(summary.missingTimeRows) + ' rows with missing time values are excluded from charts and CSV windows. They remain in the original RDS download.';
      $('download-csv').disabled = !summary.windowRows;
      $('download-displayed-csv').disabled = !summary.displayedRows;
      return summary;
    }

    async function renderCharts(summary) {
      const revision = JSON.stringify([viewEpoch, model.state.selections, model.state.from, model.state.to, model.state.indexed, model.state.base]);
      const span = model.state.to - model.state.from;
      const tickCount = Math.min(10, span + 1);
      const ticks = Array.from(new Set(Array.from({length: tickCount}, (_, i) => tickCount === 1 ? model.state.from : Math.round(model.state.from + span * i / (tickCount - 1)))));
      const range = [model.state.from - 0.2, model.state.to + 0.2];
      const renders = cards.map((card, index) => {
        const chart = model.getChart(index);
        card.empty.hidden = !chart.emptyReason;
        card.empty.textContent = chart.emptyReason;
        card.badge.textContent = model.state.indexed ? 'Index · base 100' : 'Original values';
        card.subtitle.textContent = number(chart.traces.length) + (chart.traces.length === 1 ? ' series' : ' series') + ' · ' + number(chart.rowCount) + ' observations';
        card.status.textContent = chart.omittedBaseCount ? number(chart.omittedBaseCount) + ' series blank: missing, zero or nonfinite base value.' : '';
        card.setRange(range);
        const data = chart.traces.map(trace => ({
          type: chart.rowCount > 5000 && index < 6 ? 'scattergl' : 'scatter',
          mode: model.state.markers ? 'lines+markers' : 'lines',
          x: trace.x, y: trace.y,
          name: html(shortLabels[trace.id]),
          uid: String(trace.id), legendgroup: String(trace.id),
          line: {width: 2.15, color: palette[summary.shownIds.indexOf(trace.id) % palette.length]},
          marker: {size: 5}, connectgaps: false,
          customdata: trace.timeLabels.map(html),
          hovertemplate: '<b>' + html(trace.label) + '</b><br>' + html(payload.time.name) + ': %{customdata}<br>' + html(chart.yTitle) + ': %{y:.7g}<extra></extra>'
        }));
        const showLegend = data.length > 1;
        const width = card.card.getBoundingClientRect().width;
        const layout = {
          autosize: true,
          showlegend: showLegend,
          hovermode: 'x', dragmode: 'zoom', uirevision: revision,
          font: {family: 'Segoe UI, system-ui, sans-serif', size: 10, color: '#75859b'},
          paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
          margin: {l: width < 480 ? 58 : 72, r: 28, t: 28, b: showLegend ? 90 : 42},
          xaxis: {title: {text: ''}, tickmode: 'array', tickvals: ticks, ticktext: ticks.map(id => html(payload.time.labels[id])), range, zeroline: false, showgrid: false, tickfont: {size: 10}, automargin: true},
          yaxis: {title: {text: html(chart.yTitle), font: {size: 10, color: '#8393a8'}, standoff: 12}, zeroline: false, gridcolor: '#edf1f6', automargin: true, tickfont: {size: 10}},
          legend: {orientation: 'h', x: 0, y: -.2, xanchor: 'left', yanchor: 'top', font: {size: 9, color: '#71829a'}, maxheight: .24, entrywidth: Math.max(190, Math.min(380, width - 130)), entrywidthmode: 'pixels', tracegroupgap: 2},
          hoverlabel: {bgcolor: '#fff', bordercolor: '#dce4ee', font: {family: 'Segoe UI, system-ui, sans-serif', size: 11, color: '#344b68'}}
        };
        const config = {displaylogo: false, responsive: true, scrollZoom: false, displayModeBar: 'hover', typesetMath: false, doubleClick: 'reset', modeBarButtonsToRemove: ['lasso2d','select2d','hoverClosestCartesian','hoverCompareCartesian','toImage']};
        return Plotly.react(card.plot, data, layout, config);
      });
      await Promise.all(renders);
    }

    function schedule(mutation) {
      if (mutation) pending.push(mutation);
      if (running) return;
      running = true;
      setBusy(true);
      document.body.dataset.ready = 'busy';
      requestAnimationFrame(() => setTimeout(async () => {
        try {
          do {
            const changes = pending;
            pending = [];
            changes.forEach(change => change());
            const summary = updateControls();
            await renderCharts(summary);
          } while (pending.length);
          renderId += 1;
          document.body.dataset.render = String(renderId);
          document.body.dataset.ready = 'true';
          resolveReady();
        } catch (error) { fail(error); }
        finally { running = false; setBusy(false); }
      }, 0));
    }

    $('time-from').addEventListener('change', event => { const value = Number(event.target.value); schedule(() => model.update({from: value})); });
    $('time-to').addEventListener('change', event => { const value = Number(event.target.value); schedule(() => model.update({to: value})); });
    $('base-time').addEventListener('change', event => { const value = Number(event.target.value); schedule(() => model.update({base: value})); });
    $('indexed').addEventListener('change', event => { const value = event.target.checked; schedule(() => model.update({indexed: value})); });
    $('markers').addEventListener('change', event => { const value = event.target.checked; schedule(() => model.update({markers: value})); });
    $('full-period').addEventListener('click', () => schedule(() => model.update({from: 0, to: payload.time.labels.length - 1})));
    $('reset-all').addEventListener('click', () => {
      filters.forEach(filter => { filter.close(); filter.element.querySelector('input').value = ''; });
      cards.forEach(card => { card.card.style.width = ''; card.card.style.height = ''; });
      if (fullscreenCard) toggleFullscreen(fullscreenCard);
      schedule(() => { viewEpoch += 1; model.reset(); });
    });
    $('toggle-sidebar').addEventListener('click', () => {
      const hidden = document.body.classList.toggle('sidebar-hidden');
      $('toggle-sidebar').setAttribute('aria-expanded', String(!hidden));
      if (!hidden && mobile.matches) $('sidebar').scrollIntoView({block: 'start'});
    });
    $('download-csv').addEventListener('click', () => {
      download('\ufeff' + model.getCsv({scope: 'filtered'}), 'filtered-data.csv', 'text/csv;charset=utf-8');
      toast('CSV downloaded with all matching rows in the selected time window.');
    });
    $('download-displayed-csv').addEventListener('click', () => {
      download('\ufeff' + model.getCsv({scope: 'displayed'}), 'displayed-series.csv', 'text/csv;charset=utf-8');
      toast('CSV downloaded for the displayed series, with original values.');
    });
    $('download-rds').addEventListener('click', () => {
      try {
        const binary = atob(payload.original.base64);
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        download(bytes, payload.original.filename, 'application/octet-stream');
        toast('Original R data downloaded.');
      } catch (error) { toast('RDS download failed: ' + error.message); }
    });
    $('show-about').addEventListener('click', () => $('about-dialog').showModal());
    $('close-about').addEventListener('click', () => $('about-dialog').close());
    $('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) $('about-dialog').close(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && fullscreenCard) toggleFullscreen(fullscreenCard);
      if (event.key === 'Tab' && fullscreenCard) {
        const focusable = Array.from(fullscreenCard.querySelectorAll('button, a[href], [tabindex="0"]')).filter(element => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !fullscreenCard.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !fullscreenCard.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    });
    $('busy-text').textContent = 'Updating your charts…';
    schedule();
    await ready;
  }

  start().catch(fail);
}());
