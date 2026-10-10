#!/usr/bin/env node
// Reusable performance / interaction-latency measurement for the Leadership Interview Coach PWA.
//
//   BASE=http://localhost:4173 OUT=/tmp/perf-v1.json node tests/agent-qa/perf/measure-app.mjs
//
// Env:
//   BASE      app URL (default http://localhost:4173)
//   OUT       result JSON path (default /tmp/perf-result.json)
//   RUNS      repetitions per measurement; medians are reported (default 3)
//   PARTS     comma list of: load,routes,swipe,interactions (default all)
//   THROTTLES comma list of CPU throttle rates (default "1,4"; 4 = mid-range phone proxy)
//   MI        path to measure-interaction.mjs (default: .claude/skills/webapp-testing/scripts/ in the repo)
//   ROUTES    optional JSON array of hashes to override the route list
//   STEPS     optional path to an interaction steps JSON that replaces the built-in V1 steps
//             (V2 will have different selectors for some controls)
//
// Playwright is loaded from the project or the global install (no installation).
// Chromium emulation only: this is NOT iOS Safari. CPU throttling is Chromium's Emulation.setCPUThrottlingRate.
import { createRequire } from 'node:module';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))('playwright');
}
const pw = await loadPlaywright();
const { chromium, devices } = pw;

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.BASE || 'http://localhost:4173').replace(/\/$/, '');
const OUT = process.env.OUT || '/tmp/perf-result.json';
const RUNS = parseInt(process.env.RUNS || '3', 10);
const PARTS = (process.env.PARTS || 'load,routes,swipe,interactions').split(',');
const THROTTLES = (process.env.THROTTLES || '1,4').split(',').map(Number);
const MI = process.env.MI || path.resolve(here, '../../../.claude/skills/webapp-testing/scripts/measure-interaction.mjs');
const ROUTES = process.env.ROUTES ? JSON.parse(process.env.ROUTES) : [
  '#/home', '#/preparation', '#/preparation/U2', '#/competencies', '#/competencies/C1',
  '#/question/C1-S1', '#/questions?view=deck', '#/simulation', '#/reports', '#/self-intro', '#/settings'
];
const median = (a) => { const v = a.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return +(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2).toFixed(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dev = (...names) => { const n = names.find((x) => devices[x]); return { name: n, ...devices[n] }; };
const LOAD_DEVICES = [dev('iPhone SE (3rd gen)', 'iPhone SE'), dev('iPhone 14'), dev('iPhone 15 Pro Max')];
const MAIN_DEVICE = 'iPhone 14';

const result = {
  tool: 'measure-app', base: BASE, startedAt: new Date().toISOString(), runs: RUNS, throttles: THROTTLES,
  notes: ['Chromium emulation, not iOS Safari. Local server: network time is near zero, so transfer size matters more than transfer time.',
    'CPU throttle 4 = Chromium Emulation.setCPUThrottlingRate(4), a mid-range phone proxy only.',
    'Every run uses a fresh browser context (cold HTTP cache, empty storage, new service worker).']
};

const browser = await chromium.launch();
result.engine = `chromium ${browser.version()}`;

// ---------- page-side helpers ----------
const INIT = () => {
  window.__perf = { lcp: 0, longtasks: [], cls: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
};

async function newPage(deviceDef, rate) {
  const { name, ...opts } = deviceDef;
  const ctx = await browser.newContext({ ...opts });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return { ctx, page, cdp };
}
async function heap(cdp) {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch {}
  const { metrics } = await cdp.send('Performance.getMetrics');
  const g = (n) => metrics.find((m) => m.name === n)?.value;
  return { jsHeapUsedMB: +(g('JSHeapUsedSize') / 1048576).toFixed(2), domNodes: g('Nodes'), layoutCount: g('LayoutCount'), recalcStyleCount: g('RecalcStyleCount'),
    layoutDurationMs: +(g('LayoutDuration') * 1000).toFixed(1), recalcStyleDurationMs: +(g('RecalcStyleDuration') * 1000).toFixed(1), scriptDurationMs: +(g('ScriptDuration') * 1000).toFixed(1), taskDurationMs: +(g('TaskDuration') * 1000).toFixed(1) };
}

// ---------- 1. cold load ----------
async function coldLoad(deviceDef, rate) {
  const { ctx, page, cdp } = await newPage(deviceDef, rate);
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, status: e.response.status, encoded: 0, decoded: 0 }));
  cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.encoded = e.encodedDataLength; });
  await page.goto(`${BASE}/#/home`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('#main-content')?.hasAttribute('aria-busy') && !document.querySelector('.loading-screen'), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const lt = window.__perf.longtasks;
    return { ttfbMs: nav.responseStart, fcpMs: fcp ? fcp.startTime : null, lcpMs: window.__perf.lcp || null, dclMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd,
      longTaskCount: lt.length, longTaskTotalMs: lt.reduce((s, x) => s + x[1], 0), longTaskMaxMs: lt.reduce((s, x) => Math.max(s, x[1]), 0), tbtMs: lt.reduce((s, x) => s + Math.max(0, x[1] - 50), 0),
      cls: window.__perf.cls, hscroll: document.documentElement.scrollWidth > innerWidth,
      lcpEl: (() => { try { return null; } catch { return null; } })() };
  });
  const all = [...reqs.values()];
  const kind = (r) => ({ Script: 'js', Stylesheet: 'css', Image: 'image', Font: 'font', Document: 'html', Fetch: 'json/fetch', XHR: 'json/fetch' }[r.type] || 'other');
  const bytes = {}; const decoded = {};
  for (const r of all) { bytes[kind(r)] = (bytes[kind(r)] || 0) + r.encoded; decoded[kind(r)] = (decoded[kind(r)] || 0) + r.decoded; }
  const top = [...all].sort((a, b) => b.encoded - a.encoded).slice(0, 6).map((r) => ({ url: r.url.replace(BASE, ''), type: r.type, encodedKB: +(r.encoded / 1024).toFixed(1) }));
  const hero = all.filter((r) => /hero/i.test(r.url) || (r.type === 'Image' && r.encoded > 100000)).map((r) => ({ url: r.url.replace(BASE, ''), encodedKB: +(r.encoded / 1024).toFixed(1) }));
  const h = await heap(cdp);
  await ctx.close();
  return { ...m, requests: all.length, transferredKB: +(all.reduce((s, r) => s + r.encoded, 0) / 1024).toFixed(1), decodedKB: +(all.reduce((s, r) => s + r.decoded, 0) / 1024).toFixed(1),
    kbByType: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, +(v / 1024).toFixed(1)])), failed: all.filter((r) => r.status >= 400).length, top, hero, heapMB: h.jsHeapUsedMB, domNodes: h.domNodes, ...{ _kb: bytes } };
}
const NUM_KEYS = ['ttfbMs', 'fcpMs', 'lcpMs', 'dclMs', 'loadMs', 'longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs', 'tbtMs', 'cls', 'requests', 'transferredKB', 'decodedKB', 'heapMB', 'domNodes'];
function medianOf(runs, keys) { return Object.fromEntries(keys.map((k) => [k, median(runs.map((r) => r[k]))])); }

if (PARTS.includes('load')) {
  result.coldLoad = [];
  for (const d of LOAD_DEVICES) for (const rate of THROTTLES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await coldLoad(d, rate));
    const kb = {}; for (const k of new Set(runs.flatMap((r) => Object.keys(r.kbByType)))) kb[k] = median(runs.map((r) => r.kbByType[k] ?? 0));
    result.coldLoad.push({ device: d.name, viewport: d.viewport, cpuThrottle: rate, median: medianOf(runs, NUM_KEYS), kbByType: kb, topResources: runs[0].top, hero: runs[0].hero, horizontalScroll: runs.some((r) => r.hscroll), failedRequests: Math.max(...runs.map((r) => r.failed)), raw: runs.map(({ top, hero, kbByType, _kb, ...r }) => r) });
    console.error(`load ${d.name} x${rate}: FCP ${result.coldLoad.at(-1).median.fcpMs} LCP ${result.coldLoad.at(-1).median.lcpMs}`);
  }
}

// ---------- 2. route navigation ----------
// hash change -> #main-content aria-busy cleared (render function finished) -> two animation frames (content painted)
const NAVIGATE = ([hash, timeoutMs]) => new Promise((resolve) => {
  const main = document.querySelector('#main-content');
  const lt0 = window.__perf.longtasks.length;
  let sawBusy = false; let done = false;
  const t0 = performance.now();
  const finish = (timedOut) => {
    if (done) return; done = true; obs.disconnect();
    const tRender = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const lts = window.__perf.longtasks.slice(lt0);
      resolve({ renderMs: tRender - t0, paintedMs: performance.now() - t0, timedOut, longTasks: lts.length, longTaskMs: lts.reduce((s, x) => s + x[1], 0), domNodes: document.getElementsByTagName('*').length });
    }));
  };
  const obs = new MutationObserver(() => {
    if (main.hasAttribute('aria-busy')) sawBusy = true;
    else if (sawBusy) finish(false);
  });
  obs.observe(main, { attributes: true, attributeFilter: ['aria-busy'] });
  setTimeout(() => finish(true), timeoutMs);
  location.hash = hash;
});

if (PARTS.includes('routes')) {
  result.routes = [];
  const d = dev(MAIN_DEVICE);
  for (const rate of THROTTLES) {
    const per = Object.fromEntries(ROUTES.map((r) => [r, []]));
    const heaps = [];
    for (let i = 0; i < RUNS; i++) {
      const { ctx, page, cdp } = await newPage(d, rate);
      await page.goto(`${BASE}/${ROUTES[0]}`, { waitUntil: 'networkidle' });
      await sleep(800);
      for (const r of ROUTES.slice(1)) {
        await page.evaluate(() => { location.hash = '#/home'; }); await sleep(500);
        const before = await heap(cdp);
        const res = await page.evaluate(NAVIGATE, [r, 10000]);
        await sleep(300);
        const after = await heap(cdp);
        per[r].push({ ...res, heapMB: after.jsHeapUsedMB, heapDeltaMB: +(after.jsHeapUsedMB - before.jsHeapUsedMB).toFixed(2), layoutMs: after.layoutDurationMs - before.layoutDurationMs, styleMs: after.recalcStyleDurationMs - before.recalcStyleDurationMs, scriptMs: after.scriptDurationMs - before.scriptDurationMs });
      }
      heaps.push(await heap(cdp));
      await ctx.close();
    }
    result.routes.push({ device: MAIN_DEVICE, cpuThrottle: rate, routes: Object.entries(per).filter(([, v]) => v.length).map(([route, v]) => ({ route,
      median: medianOf(v, ['renderMs', 'paintedMs', 'longTasks', 'longTaskMs', 'domNodes', 'heapMB', 'heapDeltaMB', 'layoutMs', 'styleMs', 'scriptMs']), timedOut: v.some((x) => x.timedOut), raw: v.map((x) => x.paintedMs) })),
      endOfSessionHeapMB: median(heaps.map((h) => h.jsHeapUsedMB)) });
    console.error(`routes x${rate} done`);
  }
}

// ---------- 3. deck swipe (synthetic pointer events, same ones the app listens for) ----------
if (PARTS.includes('swipe')) {
  result.swipe = [];
  const d = dev(MAIN_DEVICE);
  for (const rate of THROTTLES) {
    const vals = [];
    for (let i = 0; i < RUNS; i++) {
      const { ctx, page } = await newPage(d, rate);
      await page.goto(`${BASE}/#/questions?view=deck`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.question-deck-card'); await sleep(500);
      for (let k = 0; k < 3; k++) {
        const ms = await page.evaluate(() => new Promise((resolve) => {
          const card = document.querySelector('.question-deck-card');
          const first = card.querySelector('h2').textContent;
          const stage = document.querySelector('.question-deck-stage');
          const t0 = performance.now(); let changed = false;
          const obs = new MutationObserver(() => { if (!changed && document.querySelector('.question-deck-card h2')?.textContent !== first) { changed = true; obs.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0))); } });
          obs.observe(stage, { childList: true, subtree: true });
          const o = { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true };
          card.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: 300 }));
          card.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: 150 }));
          setTimeout(() => { if (!changed) resolve(null); }, 3000);
        }));
        vals.push(ms); await sleep(300);
      }
      await ctx.close();
    }
    result.swipe.push({ device: MAIN_DEVICE, cpuThrottle: rate, medianMs: median(vals), samples: vals });
  }
}


// ---------- 4a. interactions the team tool cannot time (they change location.hash / history, which it treats as navigation) ----------
// Measured in-page: trusted pointerdown/keydown event.timeStamp -> predicate true and #main-content not busy -> two animation frames.
// Upper bound of input-to-next-paint (one frame granularity). Real touch via page.tap / keyboard.
const INPAGE_STEPS_V1 = [
  { goto: '#/home' },
  { name: 'nav tap: home -> preparation', tap: '.bottom-nav a[data-nav=preparation]', done: 'body[data-page=preparation]' },
  { name: 'nav tap: preparation -> simulation', tap: '.bottom-nav a[data-nav=simulation]', done: 'body[data-page=simulation]' },
  { name: 'nav tap: simulation -> reports', tap: '.bottom-nav a[data-nav=reports]', done: 'body[data-page=reports]' },
  { name: 'nav tap: reports -> more (settings)', tap: '.bottom-nav a[data-nav=more]', done: 'body[data-page=settings]' },
  { name: 'nav tap: settings -> home', tap: '.bottom-nav a[data-nav=home]', done: 'body[data-page=home]' },
  { goto: '#/questions?view=deck' },
  { name: 'deck: next question (button)', tap: 'button[aria-label="السؤال التالي"]', done: '.question-deck-position span', changed: true },
  { name: 'deck: filter scenario', tap: 'button[data-filter=scenario]', done: 'button[data-filter=scenario].active' },
  { name: 'deck: filter all', tap: 'button[data-filter=all]', done: 'button[data-filter=all].active' },
  { focus: '.question-deck-search-input' },
  { typeOnly: 'ق' },
  { name: 'deck: search keystroke (filters 70 -> 23)', key: 'ي', done: '.question-deck-position span', changed: true }
];
const ARM = ([doneSel, changed]) => {
  window.__tm = { t0: null, t1: null, tDone: null, longTasks0: window.__perf.longtasks.length };
  const base = changed ? (document.querySelector(doneSel)?.textContent ?? '') : null;
  const main = document.querySelector('#main-content');
  const ok = () => { const el = document.querySelector(doneSel); return !!el && !main.hasAttribute('aria-busy') && (!changed || el.textContent !== base); };
  const start = (e) => { if (window.__tm.t0 != null) return; window.__tm.t0 = e.timeStamp;
    const poll = () => { if (ok()) { window.__tm.tDone = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => { window.__tm.t1 = performance.now(); })); } else if (performance.now() - window.__tm.t0 < 8000) requestAnimationFrame(poll); else window.__tm.t1 = -1; };
    requestAnimationFrame(poll); };
  document.addEventListener('pointerdown', start, { capture: true, once: true });
  document.addEventListener('keydown', start, { capture: true, once: true });
  document.addEventListener('input', start, { capture: true, once: true });
};
if (PARTS.includes('interactions')) {
  result.inpageInteractions = [];
  const steps = process.env.INPAGE_STEPS ? JSON.parse(fs.readFileSync(process.env.INPAGE_STEPS, 'utf8')) : INPAGE_STEPS_V1;
  for (const rate of THROTTLES) {
    const samples = {};
    for (let i = 0; i < RUNS; i++) {
      const { ctx, page } = await newPage(dev(MAIN_DEVICE), rate);
      await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' }); await sleep(800);
      for (const s of steps) {
        if (s.goto) { await page.evaluate((h) => { location.hash = h; }, s.goto); await sleep(900); continue; }
        if (s.typeOnly) { await page.keyboard.type(s.typeOnly); await sleep(500); continue; }
        if (s.focus) { await page.locator(s.focus).tap(); await sleep(300); continue; }
        await page.evaluate(ARM, [s.done, !!s.changed]);
        if (s.tap) await page.locator(s.tap).tap(); else await page.keyboard.type(s.key);
        const r = await page.waitForFunction(() => window.__tm && window.__tm.t1 != null && window.__tm, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
        const lt = await page.evaluate(() => window.__perf.longtasks.slice(window.__tm.longTasks0));
        (samples[s.name] ||= []).push(r && r.t1 > 0 ? { ms: r.t1 - r.t0, renderMs: r.tDone - r.t0, longTasks: lt.length, longTaskMs: lt.reduce((a, x) => a + x[1], 0) } : { ms: null });
        await sleep(400);
      }
      await ctx.close();
    }
    result.inpageInteractions.push({ device: MAIN_DEVICE, cpuThrottle: rate, method: 'in-page event.timeStamp to second animation frame after content ready',
      steps: Object.entries(samples).map(([name, v]) => ({ name, medianMs: median(v.map((x) => x.ms)), medianRenderMs: median(v.map((x) => x.renderMs)), medianLongTasks: median(v.map((x) => x.longTasks)), medianLongTaskMs: median(v.map((x) => x.longTaskMs)), samples: v.map((x) => x.ms) })) });
    console.error(`in-page interactions x${rate} done`);
  }
}

// ---------- 4b. interaction latency through the team tool (measure-interaction.mjs) ----------
const STEPS_V1 = [
  { action: 'goto', url: '/#/preparation/U2' },
  { name: 'accordion open (lesson details)', action: 'tap', selector: 'summary:has-text("معايير الإجابة الممتازة")', feedback: 'details[open] > summary' },
  { action: 'goto', url: '/#/competencies/C1' },
  { name: 'accordion open (competency details)', action: 'tap', selector: 'summary:has-text("ما الذي يبحث عنه")', feedback: 'details:nth-of-type(2)[open] > summary' },
  { name: 'competency tab: how to show', action: 'tap', selector: 'button:has-text("كيف تُظهرها")' },
  { action: 'goto', url: '/#/simulation' },
  { name: 'simulation: select mode card (2 questions)', action: 'tap', selector: '.simulation-mode-card:nth-child(2)', feedback: '.simulation-mode-card:nth-child(2).selected' },
  { name: 'simulation: answer method voice', action: 'tap', selector: 'button:has-text("إجابة صوتية")', feedback: '.segmented button:nth-child(2).active' },
  { name: 'simulation: answer method text', action: 'tap', selector: 'button:has-text("إجابة نصية")', feedback: '.segmented button:nth-child(1).active' },
  { name: 'simulation: start (privacy gate)', action: 'tap', selector: '.simulation-start', feedback: '#simulation-privacy-acknowledgement' },
  { name: 'simulation: acknowledge privacy', action: 'tap', selector: '#simulation-privacy-acknowledgement' },
  { name: 'simulation: continue to first question', action: 'tap', selector: '.simulation-privacy-continue', done: '.simulation-answer-input' },
  { action: 'goto', url: '/#/settings' },
  { name: 'settings: theme dark', action: 'tap', selector: 'button:has-text("داكن")', feedback: 'html[data-theme=dark]' },
  { name: 'settings: font size large', action: 'tap', selector: 'button:has-text("كبير")', feedback: 'html[data-font-size=large]' },
  { name: 'settings: motion reduced', action: 'tap', selector: 'button:has-text("مخففة")', feedback: 'html[data-motion=reduced], html[data-motion=reduce]' },
  { name: 'settings: contrast high', action: 'tap', selector: 'button:has-text("مرتفع")', feedback: 'html[data-contrast=high]' },
  { name: 'settings: open audio section (accordion, closes appearance)', action: 'tap', selector: 'summary:has-text("الصوت والمحاكاة")', feedback: 'details:nth-of-type(2)[open] > summary' }
];

if (PARTS.includes('interactions')) {
  result.interactions = [];
  const stepsFile = path.join(os.tmpdir(), `perf-steps-${process.pid}.json`);
  const steps = process.env.STEPS ? JSON.parse(fs.readFileSync(process.env.STEPS, 'utf8')) : STEPS_V1;
  fs.writeFileSync(stepsFile, JSON.stringify(steps));
  for (const rate of THROTTLES) {
    const outDir = path.join(os.tmpdir(), `perf-mi-${process.pid}-x${rate}`);
    const p = spawnSync('node', [MI, `${BASE}/`, '--steps', stepsFile, '--device', MAIN_DEVICE, '--dir', 'rtl', '--lang', 'ar', '--runs', String(RUNS), '--cpu-throttle', String(rate), '--out', outDir, '--quiet-ms', '400'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let j = null; try { j = JSON.parse(p.stdout); } catch { j = { ok: false, error: (p.stderr || p.stdout || '').slice(0, 500) }; }
    result.interactions.push({ device: MAIN_DEVICE, cpuThrottle: rate, ok: j.ok, error: j.error, fullResults: j.fullResults,
      steps: (j.steps || []).filter((s) => s.action !== 'goto').map((s) => ({ name: s.name, medians: s.medians, spread: s.spread, flags: s.flags, errors: s.errors, problems: s.problems, unavailable: s.unavailable })) });
    console.error(`interactions x${rate}: ${j.ok ? 'ok' : j.error}`);
  }
}

await browser.close();
result.finishedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`wrote ${OUT}`);
