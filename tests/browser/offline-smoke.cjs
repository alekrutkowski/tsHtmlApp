/* Developer smoke test. Run after generating the bundled workforce example.
   npm install --no-save playwright
   npx playwright install chromium
   node tests/browser/offline-smoke.cjs /absolute/path/workforce-explorer.html
   Optional: TSHTML_QA_DIR, PLAYWRIGHT_CHROMIUM_EXECUTABLE, TSHTML_EDGE_FIXTURES. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const input = path.resolve(process.argv[2] || 'regional-workforce/index.html');
const output = path.resolve(process.env.TSHTML_QA_DIR || 'browser-results');
fs.mkdirSync(output, {recursive: true});
const errors = [], requests = [], passed = [];
let browser;

async function ready(page) {
  await page.waitForFunction(() => ['true','error'].includes(document.body.dataset.ready), null, {timeout: 45000});
  assert.equal(await page.getAttribute('body', 'data-ready'), 'true', await page.locator('#fatal-error-message').textContent());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('busy')).visibility === 'hidden');
}

async function changed(page, action) {
  const before = await page.getAttribute('body', 'data-render');
  await action();
  await page.waitForFunction(value => document.body.dataset.render !== value || document.body.dataset.ready === 'error', before);
  await ready(page);
}

async function getSummary(page) { return page.evaluate(() => window.__TSHTML_APP__.model.getSummary()); }
async function choose(page, index, id) {
  const label = await page.evaluate(({index,id}) => window.__TSHTML_APP__.payload.dimensions[index].choices.find(choice => choice.id === id).label, {index,id});
  await page.locator('#filter-' + index).fill(label);
  await changed(page, () => page.locator('#filter-' + index + '-choice-' + id).click());
}
function check(name) { passed.push(name); console.log('PASS:', name); }

(async () => {
  browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox']});
  const context = await browser.newContext({offline: true, acceptDownloads: true, viewport: {width: 1600, height: 1100}});
  const page = await context.newPage();
  const observe = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  };
  observe(page);
  await page.goto(pathToFileURL(input).href);
  await ready(page);
  const initial = await getSummary(page);
  const dataInfo = await page.evaluate(() => ({rows: __TSHTML_APP__.payload.rowCount, measures: __TSHTML_APP__.payload.measures.length, dims: __TSHTML_APP__.payload.dimensions.length}));
  assert.equal(initial.filteredRows, dataInfo.rows - initial.missingTimeRows);
  assert.equal(await page.locator('.js-plotly-plot').count(), dataInfo.measures);
  assert.equal(initial.shownSeries, Math.min(10, initial.totalSeries));
  assert.equal(await page.locator('#markers').isChecked(), false);
  await page.screenshot({path: path.join(output, 'desktop.png')});
  check('File opens offline and every measure renders with default controls');

  const snapshot = initial.shownIds;
  await changed(page, () => page.locator('#markers').check());
  assert.deepEqual((await getSummary(page)).shownIds, snapshot);
  assert.equal(await page.evaluate(() => document.getElementById('plot-0').data[0].mode), 'lines+markers');
  await changed(page, () => page.locator('#time-from').selectOption({value: '5'}));
  await changed(page, () => page.locator('#indexed').check());
  assert.deepEqual((await getSummary(page)).shownIds, snapshot);
  const chartMatches = await page.evaluate(() => {
    const expected = __TSHTML_APP__.model.getChart(0);
    const actual = document.getElementById('plot-0').data;
    return actual.every((trace, index) => JSON.stringify(trace.y) === JSON.stringify(expected.traces[index].y)) && expected.traces.some(trace => trace.y.some(Number.isFinite));
  });
  assert.equal(chartMatches, true);
  assert.equal(await page.locator('#base-time').inputValue(), '0');
  check('Markers, time window and index rebasing update actual charts while retaining the sample');

  const csvDownload = page.waitForEvent('download');
  await page.locator('#download-csv').click();
  const csv = await csvDownload;
  const csvPath = path.join(output, csv.suggestedFilename());
  await csv.saveAs(csvPath);
  assert.equal(fs.readFileSync(csvPath, 'utf8'), '\ufeff' + await page.evaluate(() => __TSHTML_APP__.model.getCsv({scope:'filtered'})));
  const sampleDownload = page.waitForEvent('download');
  await page.locator('#download-displayed-csv').click();
  const sample = await sampleDownload;
  const samplePath = path.join(output, sample.suggestedFilename());
  await sample.saveAs(samplePath);
  assert.equal(fs.readFileSync(samplePath, 'utf8'), '\ufeff' + await page.evaluate(() => __TSHTML_APP__.model.getCsv({scope:'displayed'})));
  const rdsDownload = page.waitForEvent('download');
  await page.locator('#download-rds').click();
  const rds = await rdsDownload;
  const rdsPath = path.join(output, rds.suggestedFilename());
  await rds.saveAs(rdsPath);
  assert.deepEqual(fs.readFileSync(rdsPath), Buffer.from(await page.evaluate(() => __TSHTML_APP__.payload.original.base64), 'base64'));
  assert.ok(fs.statSync(rdsPath).size > 0);
  check('Both CSV scopes and the embedded original RDS download correctly without a connection');

  await changed(page, () => page.locator('#reset-all').click());
  assert.equal(await page.locator('#markers').isChecked(), false);
  assert.equal(await page.locator('#indexed').isChecked(), false);
  if (dataInfo.dims > 1) {
    const ids = await page.evaluate(() => __TSHTML_APP__.model.getAvailable(0).map(x => x.id));
    await choose(page, 0, ids[0]);
    assert.ok((await getSummary(page)).filteredRows < initial.filteredRows);
    const downstream = await page.evaluate(() => __TSHTML_APP__.model.getAvailable(1).map(x => x.id));
    await choose(page, 1, downstream[0]);
    await changed(page, () => page.locator('.filter-field').nth(0).locator('.filter-clear').click());
    await choose(page, 0, ids[1]);
    const cascade = await page.evaluate(() => ({selected: __TSHTML_APP__.model.state.selections[1], available: __TSHTML_APP__.model.getAvailable(1).map(x => x.id)}));
    assert.ok(cascade.selected.every(id => cascade.available.includes(id)));
    assert.ok(!cascade.available.includes(downstream[0]));
    assert.deepEqual(cascade.selected, []);
    await page.locator('#filter-0').press('Escape');
    check('Searchable filters and cascades clear invalid downstream selections in the live UI');
  }

  const card = page.locator('#metric-card-0');
  await card.scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  const corner = await card.locator('.resize-handle-corner').boundingBox();
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 100, corner.y + 40, {steps: 5});
  await page.mouse.up();
  const after = await card.boundingBox();
  assert.ok(after.width < before.width - 50);
  assert.ok(after.height > before.height + 20);
  await card.locator('.fullscreen-button').click();
  assert.ok(await card.evaluate(element => element.classList.contains('is-fullscreen')));
  assert.ok((await card.boundingBox()).width > 1500);
  await page.keyboard.press('Escape');
  assert.equal(await card.evaluate(element => element.classList.contains('is-fullscreen')), false);
  check('Pointer resizing and full-screen expansion work and Escape restores the chart');

  const imageDownload = page.waitForEvent('download');
  await card.getByRole('button', {name: 'Download chart as PNG'}).click();
  const png = await imageDownload;
  const pngPath = path.join(output, 'chart.png');
  await png.saveAs(pngPath);
  assert.deepEqual(Array.from(fs.readFileSync(pngPath).subarray(0,8)), [137,80,78,71,13,10,26,10]);
  check('Chart PNG export succeeds offline');

  await changed(page, () => page.locator('#reset-all').click());
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await ready(page);
  assert.equal(await page.locator('#sidebar').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({path:path.join(output,'mobile.png')});
  await page.locator('#toggle-sidebar').click();
  assert.equal(await page.locator('#sidebar').isVisible(), true);
  await page.locator('#toggle-sidebar').click();
  check('Mobile layout fits the viewport and exposes collapsible filters');

  if (process.env.TSHTML_EDGE_FIXTURES) {
    const fixtureDir = path.resolve(process.env.TSHTML_EDGE_FIXTURES);
    const security = await context.newPage();
    observe(security);
    await security.goto(pathToFileURL(path.join(fixtureDir,'security.html')).href);
    await ready(security);
    assert.equal(await security.evaluate(() => window.__injected), undefined);
    assert.equal(await security.locator('#app-title').textContent(), await security.evaluate(() => __TSHTML_APP__.payload.title));
    assert.equal(await security.locator('.heading-text script, .heading-text img, #category-filters script, #category-filters img').count(),0);
    await security.close();
    check('User-supplied HTML, script terminators, Unicode and template tokens remain inert text');
    const large = await context.newPage();
    observe(large);
    await large.goto(pathToFileURL(path.join(fixtureDir,'single-series.html')).href);
    await ready(large);
    assert.equal((await getSummary(large)).shownSeries,1);
    assert.equal(await large.locator('.filter-field').count(),0);
    assert.equal(await large.evaluate(() => document.getElementById('plot-0').data[0].type), 'scattergl');
    await changed(large, () => large.locator('#indexed').check());
    assert.equal(await large.locator('#metric-card-0 .plot-empty').isVisible(),true);
    await changed(large, () => large.locator('#base-time').selectOption({value: '1'}));
    assert.equal(await large.locator('#metric-card-0 .plot-empty').isVisible(),false);
    await large.close();
    check('A 6,001-period series uses WebGL and handles zero-base indexing and missing values');
  }
  assert.deepEqual(requests, [], 'External network requests were attempted');
  assert.deepEqual(errors, [], 'Browser errors occurred');
  check('Zero external HTTP requests and zero browser JavaScript errors');
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({browser:await browser.version(),passed,errors,externalRequests:requests},null,2));
  await browser.close();
})().catch(async error => {
  console.error(error);
  fs.writeFileSync(path.join(output,'browser-failure.json'),JSON.stringify({passed,errors,requests,error:String(error)},null,2));
  if(browser) await browser.close();
  process.exitCode=1;
});
