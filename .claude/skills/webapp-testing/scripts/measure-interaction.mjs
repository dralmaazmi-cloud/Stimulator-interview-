#!/usr/bin/env node
// ai-dev-team interaction timing (original to ai-dev-team, MIT).
// Drives real user interactions with Playwright (Chromium) and reports what the browser measured:
// click-to-feedback, interaction latency (Event Timing), main-thread blocking, loading-indicator
// timing, completion time, per-request network/backend timing, and errors during async work.
// Every number comes from the browser or Playwright; anything not measurable is null with a reason.
//
// Usage:
//   node measure-interaction.mjs <localhost-url-or-file> --steps steps.json
//        [--device "iPhone 13"] [--dir rtl|ltr] [--lang ar|en] [--runs 3] [--timeout 10000]
//        [--quiet-ms 500] [--cpu-throttle N] [--latency MS] [--out DIR]
// steps.json: [{ "name": "submit", "action": "click", "selector": "#go",
//                "feedback": "#go[aria-busy=true]", "loading": ".spinner", "done": "#result",
//                "api": "/api/" }, ...]
//   action: click | tap | fill | press | select | check | wait | goto
//   selector: Playwright selector for the action target; feedback/loading/done: CSS selectors.
// Prints a JSON summary (medians over runs) and writes full per-run data to --out.
import { createRequire } from 'node:module';
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const THRESHOLDS = { feedbackMs: 100, interactionGoodMs: 200, interactionPoorMs: 500, longTaskMs: 50, freezeMs: 200, loadingNeededMs: 1000 };

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  try { return createRequire(path.join(process.cwd(), 'noop.js'))('playwright'); } catch {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  } catch {}
  console.log(JSON.stringify({ ok: false, error: 'Playwright is not installed in this environment. Interaction timing cannot run; report this instead of estimating numbers.' }));
  process.exit(3);
}

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith('--') || !opt('--steps')) {
  console.error('usage: measure-interaction.mjs <localhost-url-or-file> --steps steps.json [--device NAME] [--dir rtl|ltr] [--lang ar|en] [--runs N] [--timeout MS] [--quiet-ms MS] [--cpu-throttle N] [--latency MS] [--out DIR]');
  process.exit(1);
}
const target = args[0];
let steps = JSON.parse(fs.readFileSync(opt('--steps'), 'utf8'));
if (!Array.isArray(steps)) steps = steps.steps;
const deviceName = opt('--device', 'iPhone 13');
const forceDir = opt('--dir', null);
const forceLang = opt('--lang', null);
const runs = Math.max(1, parseInt(opt('--runs', '3'), 10));
const stepTimeout = parseInt(opt('--timeout', '10000'), 10);
const quietMs = parseInt(opt('--quiet-ms', '500'), 10);
const cpuThrottle = opt('--cpu-throttle', null) ? Number(opt('--cpu-throttle')) : null;
const latency = opt('--latency', null) ? Number(opt('--latency')) : null;
const outDir = opt('--out', '/tmp/agent-team-interaction');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serveDir(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const file = path.normalize(path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let server = null;
let url;
if (/^https?:/.test(target)) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(target)) {
    console.error('Refusing non-local URL: interaction timing runs against local builds only.');
    process.exit(1);
  }
  url = target;
} else {
  const abs = path.resolve(target.replace(/^file:\/\//, ''));
  if (!fs.existsSync(abs)) { console.error(`File not found: ${abs}`); process.exit(1); }
  const cwd = process.cwd();
  const root = abs.startsWith(cwd + path.sep) ? cwd : path.dirname(abs);
  server = await serveDir(root);
  url = `http://127.0.0.1:${server.address().port}/${path.relative(root, abs).split(path.sep).map(encodeURIComponent).join('/')}`;
}

// ---- in-page collector (runs before any page script) ----
function collector() {
  if (window.__mi) return;
  const now = () => performance.now();
  const visible = (sel) => {
    if (!sel) return false;
    let el; try { el = document.querySelector(sel); } catch { return false; }
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '1') > 0.01;
  };
  const buf = { event: [], longtask: [], loaf: [], paint: [], lcp: [], errors: [] };
  const obs = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); return true; } catch { return false; } };
  const support = {
    eventTiming: obs('event', (e) => buf.event.push({ name: e.name, startTime: e.startTime, processingStart: e.processingStart, processingEnd: e.processingEnd, duration: e.duration, interactionId: e.interactionId || 0 }), { durationThreshold: 16 }),
    longTasks: obs('longtask', (e) => buf.longtask.push({ startTime: e.startTime, duration: e.duration })),
    longAnimationFrames: obs('long-animation-frame', (e) => buf.loaf.push({ startTime: e.startTime, duration: e.duration, blockingDuration: e.blockingDuration })),
    paint: obs('paint', (e) => buf.paint.push({ name: e.name, startTime: e.startTime })),
    lcp: obs('largest-contentful-paint', (e) => buf.lcp.push({ startTime: e.startTime })),
  };
  addEventListener('unhandledrejection', (e) => buf.errors.push({ type: 'unhandledrejection', t: now(), message: String((e.reason && (e.reason.message || e.reason)) || 'unknown').slice(0, 300) }));
  let S = { armed: false };
  const onInput = (e) => {
    if (!S.armed || S.t0 != null) return;
    S.t0 = e.timeStamp; S.trigger = e.type;
    // first frame after the handlers of this input event has been produced
    requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => { S.nextFrame = now(); }; ch.port2.postMessage(0); });
  };
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'beforeinput', 'input', 'change', 'click']) addEventListener(t, onInput, { capture: true, passive: true });
  const mo = new MutationObserver(() => { const t = now(); S.lastMutation = t; if (S.armed && S.t0 != null && S.firstMutation == null) S.firstMutation = t; });
  mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const frame = () => {
    const t = now();
    if (S.armed) {
      if (S.t0 != null && t > S.t0) {
        if (S.lastFrame != null) { const gap = t - S.lastFrame; if (gap > S.maxGap) S.maxGap = gap; if (gap > 50) S.gapsOver50++; }
        const c = S.cfg;
        if (c.feedback && S.feedbackAt == null && visible(c.feedback)) S.feedbackAt = t;
        if (c.loading) { const v = visible(c.loading); if (v && S.loadingShownAt == null) S.loadingShownAt = t; if (!v && S.loadingShownAt != null && S.loadingHiddenAt == null) S.loadingHiddenAt = t; }
        if (c.done && S.doneAt == null && visible(c.done)) S.doneAt = t;
      }
      S.lastFrame = t;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__mi = {
    arm(cfg) {
      S = { armed: true, cfg, t0: null, maxGap: 0, gapsOver50: 0, lastFrame: null, errIdx: buf.errors.length,
        preVisible: { feedback: visible(cfg.feedback), loading: visible(cfg.loading), done: visible(cfg.done) } };
      return S.preVisible;
    },
    state() { return { t0: S.t0, doneAt: S.doneAt ?? null, lastMutation: S.lastMutation ?? null, now: now() }; },
    collect() {
      const t0 = S.t0;
      const end = now();
      S.armed = false;
      return { t0, trigger: S.trigger || null, end, timeOrigin: performance.timeOrigin, support,
        nextFrame: S.nextFrame ?? null, firstMutation: S.firstMutation ?? null, lastMutation: S.lastMutation ?? null,
        feedbackAt: S.feedbackAt ?? null, loadingShownAt: S.loadingShownAt ?? null, loadingHiddenAt: S.loadingHiddenAt ?? null,
        doneAt: S.doneAt ?? null, maxGap: S.maxGap, gapsOver50: S.gapsOver50, preVisible: S.preVisible,
        events: t0 == null ? [] : buf.event.filter((e) => e.startTime >= t0 - 1),
        longtask: t0 == null ? [] : buf.longtask.filter((e) => e.startTime + e.duration >= t0),
        loaf: t0 == null ? [] : buf.loaf.filter((e) => e.startTime + e.duration >= t0),
        errors: buf.errors.slice(S.errIdx) };
    },
    pageLoad() {
      const n = performance.getEntriesByType('navigation')[0];
      const fcp = buf.paint.find((p) => p.name === 'first-contentful-paint');
      return { ttfbMs: n ? n.responseStart : null, domContentLoadedMs: n ? n.domContentLoadedEventEnd : null, loadMs: n ? n.loadEventEnd : null,
        firstContentfulPaintMs: fcp ? fcp.startTime : null, largestContentfulPaintMs: buf.lcp.length ? buf.lcp[buf.lcp.length - 1].startTime : null };
    },
  };
}

const r1 = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 10) / 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function analyze(step, c, net, nodeErrors, navigated, wallMs) {
  const unavailable = {};
  if (navigated) {
    return { navigated: true, note: 'The action started a cross-document navigation; in-page timing restarts on the new document. See pageLoad of the new document.', wallClockMs: r1(wallMs), errors: nodeErrors };
  }
  if (c.t0 == null) return { error: 'No input event reached the page; nothing was measured.', errors: nodeErrors };
  const rel = (x) => (x == null ? null : r1(x - c.t0));
  // Event Timing: the interaction that contains the trigger event
  // Event Timing: the entries of the interaction that contains the trigger event
  let interaction = { latencyMs: null, inputDelayMs: null, processingMs: null, presentationDelayMs: null };
  const withId = c.events.filter((e) => e.interactionId);
  let group = [];
  if (withId.length) {
    const main = withId.reduce((a, b) => (b.duration > a.duration ? b : a));
    group = c.events.filter((e) => e.interactionId === main.interactionId);
  } else {
    group = c.events.filter((e) => e.startTime <= c.t0 + 50);
  }
  if (group.length) {
    const start = Math.min(...group.map((e) => e.startTime));
    const ps = Math.min(...group.map((e) => e.processingStart));
    const pe = Math.max(...group.map((e) => e.processingEnd));
    const endPaint = Math.max(...group.map((e) => e.startTime + e.duration));
    interaction = { latencyMs: r1(endPaint - start), inputDelayMs: r1(ps - start), processingMs: r1(pe - ps), presentationDelayMs: r1(Math.max(0, endPaint - pe)) };
  } else {
    unavailable.interaction = c.support.eventTiming ? 'Event Timing reported nothing: the interaction took under 16 ms, the threshold of the API' : 'Event Timing API not supported';
  }
  let completionAt = c.doneAt;
  let completionMethod = 'done-selector';
  if (step.done && c.doneAt == null) { completionMethod = 'not reached (done selector never became visible before the timeout)'; completionAt = null; }
  if (!step.done) {
    const lastNet = net.length ? Math.max(...net.map((r) => r.endAt ?? r.startAt)) : null;
    completionAt = Math.max(...[c.lastMutation, lastNet, c.t0].filter((v) => v != null));
    completionMethod = `last DOM change or response before ${quietMs} ms of quiet (no done selector given)`;
  }
  const completionMs = rel(completionAt);
  // network attribution
  const requests = net.map((r) => ({ url: r.url, method: r.method, status: r.status, failure: r.failure,
    startMs: rel(r.startAt), endMs: rel(r.endAt), totalMs: r.endAt != null ? r1(r.endAt - r.startAt) : null,
    connectMs: r.connectMs, waitingMs: r.waitingMs, downloadMs: r.downloadMs, serverTiming: r.serverTiming }));
  let breakdown = null;
  if (completionMs != null && net.length) {
    const iv = net.filter((r) => r.endAt != null).map((r) => [r.startAt, Math.min(r.endAt, completionAt)]).sort((a, b) => a[0] - b[0]);
    let covered = 0; let cur = null;
    for (const [s, e] of iv) { if (!cur || s > cur[1]) { if (cur) covered += cur[1] - cur[0]; cur = [s, e]; } else cur[1] = Math.max(cur[1], e); }
    if (cur) covered += cur[1] - cur[0];
    const firstStart = Math.min(...net.map((r) => r.startAt));
    const lastEnd = Math.max(...net.filter((r) => r.endAt != null).map((r) => r.endAt));
    const netMs = r1(covered);
    const feMs = r1(completionMs - covered);
    breakdown = { frontendBeforeFirstRequestMs: rel(firstStart), networkAndBackendMs: netMs,
      frontendAfterLastResponseMs: Number.isFinite(lastEnd) ? r1(completionAt - lastEnd) : null, frontendTotalMs: feMs,
      dominant: netMs >= 0.6 * completionMs ? 'backend/network' : feMs >= 0.6 * completionMs ? 'frontend' : 'mixed' };
  } else if (completionMs != null) {
    breakdown = { frontendTotalMs: completionMs, networkAndBackendMs: 0, dominant: 'frontend', note: 'no matching fetch/XHR request during this step' };
  }
  const lt = c.longtask.map((e) => e.duration);
  const blocking = { longTaskCount: lt.length, longTaskTotalMs: r1(lt.reduce((a, b) => a + b, 0)), longTaskMaxMs: lt.length ? r1(Math.max(...lt)) : 0,
    longAnimationFrameBlockingMs: c.support.longAnimationFrames ? r1(c.loaf.reduce((a, e) => a + (e.blockingDuration || 0), 0)) : null,
    longestFrameGapMs: r1(c.maxGap), framesOver50ms: c.gapsOver50 };
  for (const k of ['feedback', 'loading', 'done']) {
    if (step[k] && c.preVisible[k]) unavailable[k] = `selector "${step[k]}" was already visible before the action, so its timing is not meaningful; use a selector that appears only after the action`;
  }
  const m = {
    trigger: c.trigger,
    nextFrameAfterInputMs: rel(c.nextFrame),
    firstDomChangeMs: rel(c.firstMutation),
    feedbackVisibleMs: step.feedback && !unavailable.feedback ? rel(c.feedbackAt) : null,
    loadingShownMs: step.loading && !unavailable.loading ? rel(c.loadingShownAt) : null,
    loadingVisibleForMs: step.loading && !unavailable.loading && c.loadingShownAt != null && c.loadingHiddenAt != null ? r1(c.loadingHiddenAt - c.loadingShownAt) : null,
    completionMs: unavailable.done ? null : completionMs,
    completionMethod,
    interaction, blocking, breakdown, requests,
  };
  const errors = { ...nodeErrors, unhandledRejections: c.errors.map((e) => e.message) };
  return { metrics: m, errors, unavailable };
}

function flagsFor(step, s) {
  const f = [];
  const med = (k) => (s[k] ? s[k].median : null);
  const fb = med('feedbackVisibleMs') ?? med('firstDomChangeMs');
  if (fb != null && fb > THRESHOLDS.feedbackMs) f.push(`visual feedback after ${fb} ms (target <= ${THRESHOLDS.feedbackMs} ms)`);
  if (step.feedback && s.feedbackVisibleMs && s.feedbackVisibleMs.n === 0) f.push('no visual feedback detected before the timeout');
  const lat = med('interaction.latencyMs');
  if (lat != null && lat > THRESHOLDS.interactionPoorMs) f.push(`interaction latency ${lat} ms (poor: > ${THRESHOLDS.interactionPoorMs} ms)`);
  else if (lat != null && lat > THRESHOLDS.interactionGoodMs) f.push(`interaction latency ${lat} ms (needs improvement: > ${THRESHOLDS.interactionGoodMs} ms)`);
  const gap = med('blocking.longestFrameGapMs');
  if (gap != null && gap > THRESHOLDS.freezeMs) f.push(`UI unresponsive: longest frame gap ${gap} ms`);
  const ltm = med('blocking.longTaskMaxMs');
  if (ltm != null && ltm >= THRESHOLDS.longTaskMs) f.push(`long task(s) on the main thread, max ${ltm} ms`);
  const comp = med('completionMs');
  if (step.loading && comp != null && comp > THRESHOLDS.loadingNeededMs && s.loadingShownMs && s.loadingShownMs.n === 0) f.push(`operation took ${comp} ms but the loading indicator never appeared`);
  const ls = med('loadingShownMs');
  if (ls != null && ls > THRESHOLDS.feedbackMs) f.push(`loading indicator appeared after ${ls} ms`);
  return f;
}

function aggregate(results) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, prefix + k + '.');
      else if (typeof v === 'number') (out[prefix + k] ||= []).push(v);
      else if (v === null) out[prefix + k] ||= [];
    }
  };
  for (const r of results) if (r && r.metrics) walk({ ...r.metrics, requests: undefined }, '');
  const stats = {};
  for (const [k, arr] of Object.entries(out)) {
    const a = [...arr].sort((x, y) => x - y);
    stats[k] = a.length ? { median: r1(a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2), min: a[0], max: a[a.length - 1], n: a.length } : { median: null, n: 0 };
  }
  return stats;
}

const pw = await loadPlaywright();
const { chromium, devices } = pw;
const device = devices[deviceName];
if (!device) { console.error(`Unknown device "${deviceName}"`); process.exit(1); }
const browser = await chromium.launch();
const perRun = [];
const pageLoads = [];
for (let run = 0; run < runs; run++) {
  const ctx = await browser.newContext({ ...device });
  await ctx.addInitScript(collector);
  const page = await ctx.newPage();
  const cdp = (cpuThrottle || latency) ? await ctx.newCDPSession(page) : null;
  if (cpuThrottle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  if (latency) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: -1, uploadThroughput: -1 }); }
  // node-side collection
  let win = null; // { api, startWall, net: [], errs: {...}, pending: [] }
  let timeOrigin = 0;
  const matchApi = (req) => (win && win.api ? req.url().includes(win.api) : ['fetch', 'xhr'].includes(req.resourceType()));
  const recs = new Map();
  page.on('request', (req) => { if (win && matchApi(req)) { const rec = { url: req.url().slice(0, 200), method: req.method(), status: null, failure: null }; recs.set(req, rec); win.net.push(rec); win.inflight.add(req); } });
  const finish = (req, failed) => {
    const rec = recs.get(req); if (!rec) return;
    const t = req.timing();
    rec.startAt = t.startTime - timeOrigin;
    const ph = (a, b) => (t[a] >= 0 && t[b] >= 0 ? r1(t[b] - t[a]) : null);
    rec.connectMs = t.domainLookupStart >= 0 || t.connectStart >= 0 ? r1(Math.max(0, (t.connectEnd >= 0 ? t.connectEnd : 0) - (t.domainLookupStart >= 0 ? t.domainLookupStart : t.connectStart))) : 0;
    rec.waitingMs = ph('requestStart', 'responseStart');
    rec.downloadMs = ph('responseStart', 'responseEnd');
    rec.endAt = t.responseEnd >= 0 ? rec.startAt + t.responseEnd : (failed ? null : null);
    if (failed) rec.failure = req.failure() ? req.failure().errorText : 'failed';
    if (win) { win.inflight.delete(req); win.lastNetWall = Date.now(); }
  };
  page.on('response', (resp) => { const rec = recs.get(resp.request()); if (rec) { rec.status = resp.status(); const st = resp.headers()['server-timing']; rec.serverTiming = st ? st.slice(0, 300) : null; } });
  page.on('requestfinished', (req) => finish(req, false));
  page.on('requestfailed', (req) => finish(req, true));
  page.on('console', (m) => { if (win && m.type() === 'error') win.errs.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (win) win.errs.pageErrors.push(String(e).slice(0, 300)); });
  let navigated = false;
  page.on('framenavigated', (f) => { if (win && f === page.mainFrame()) navigated = true; });

  await page.goto(url, { waitUntil: 'networkidle' });
  if (forceDir || forceLang) await page.evaluate(([d, l]) => { if (d) document.documentElement.setAttribute('dir', d); if (l) document.documentElement.setAttribute('lang', l); }, [forceDir, forceLang]);
  timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await sleep(300); // let late paint/LCP entries arrive
  pageLoads.push(await page.evaluate(() => window.__mi.pageLoad()));

  const runResults = [];
  for (const step of steps) {
    const name = step.name || `${step.action} ${step.selector || ''}`.trim();
    if (step.action === 'wait') { await sleep(step.ms || 500); runResults.push({ name, skipped: 'wait' }); continue; }
    if (step.action === 'goto') {
      await page.goto(new URL(step.url || '', url).href, { waitUntil: 'networkidle' });
      timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await sleep(300);
      runResults.push({ name, pageLoad: await page.evaluate(() => window.__mi.pageLoad()) });
      continue;
    }
    win = { api: step.api || null, net: [], inflight: new Set(), lastNetWall: 0, errs: { consoleErrors: [], pageErrors: [], httpErrors: [], failedRequests: [] } };
    navigated = false;
    await page.evaluate((cfg) => window.__mi.arm(cfg), { feedback: step.feedback || null, loading: step.loading || null, done: step.done || null });
    const loc = page.locator(step.selector);
    const wall0 = Date.now();
    try {
      if (step.action === 'click' || !step.action) await loc.click({ timeout: stepTimeout });
      else if (step.action === 'tap') await loc.tap({ timeout: stepTimeout });
      else if (step.action === 'fill') await loc.fill(String(step.value ?? ''), { timeout: stepTimeout });
      else if (step.action === 'press') await loc.press(step.value || 'Enter', { timeout: stepTimeout });
      else if (step.action === 'select') await loc.selectOption(step.value, { timeout: stepTimeout });
      else if (step.action === 'check') await loc.check({ timeout: stepTimeout });
      else throw new Error(`unknown action ${step.action}`);
    } catch (e) {
      runResults.push({ name, error: `action failed: ${String(e.message || e).split('\n')[0]}` });
      win = null; continue;
    }
    // wait until done selector visible, or DOM and network quiet
    const deadline = Date.now() + stepTimeout;
    let timedOut = true;
    while (Date.now() < deadline && !navigated) {
      let st;
      try { st = await page.evaluate(() => window.__mi.state()); } catch { break; }
      if (st.t0 != null) {
        if (step.done) { if (st.doneAt != null) { timedOut = false; break; } }
        else {
          const lastActivity = Math.max(st.lastMutation ?? 0, st.t0);
          if (win.inflight.size === 0 && st.now - lastActivity >= quietMs && Date.now() - (win.lastNetWall || 0) >= quietMs) { timedOut = false; break; }
        }
      }
      await sleep(25);
    }
    const wallMs = Date.now() - wall0;
    if (navigated) { try { await page.waitForLoadState('load', { timeout: stepTimeout }); } catch {} }
    await sleep(50);
    for (const r of win.net) {
      if (r.status != null && r.status >= 400) win.errs.httpErrors.push(`${r.method} ${r.url} -> ${r.status}`);
      if (r.failure) win.errs.failedRequests.push(`${r.method} ${r.url}: ${r.failure}`);
    }
    let c = null;
    if (!navigated) { try { c = await page.evaluate(() => window.__mi.collect()); } catch { navigated = true; } }
    const net = c ? win.net.filter((r) => r.startAt != null && r.startAt >= c.t0 - 5) : [];
    const res = analyze(step, c || {}, net, win.errs, navigated, wallMs);
    if (timedOut && !navigated) res.timedOut = `step did not settle within ${stepTimeout} ms`;
    runResults.push({ name, ...res });
    win = null;
  }
  perRun.push(runResults);
  await ctx.close();
}
const version = browser.version();
await browser.close();
if (server) server.close();

const summarySteps = steps.map((step, i) => {
  const rs = perRun.map((r) => r[i]).filter(Boolean);
  const name = rs[0] ? rs[0].name : step.name;
  if (step.action === 'wait' || step.action === 'goto') return { name, action: step.action };
  const stats = aggregate(rs);
  const errs = {};
  for (const r of rs) for (const [k, v] of Object.entries(r.errors || {})) for (const x of v) (errs[k] ||= new Set()).add(x);
  const errors = Object.fromEntries(Object.entries(errs).filter(([, v]) => v.size).map(([k, v]) => [k, [...v]]));
  const flags = flagsFor(step, stats);
  if (Object.keys(errors).length) flags.push('errors during the interaction: ' + Object.keys(errors).join(', '));
  const problems = rs.filter((r) => r.error || r.timedOut || r.navigated).map((r) => r.error || r.timedOut || r.note);
  const unavailable = {};
  rs.forEach((r) => Object.entries(r.unavailable || {}).forEach(([k, v]) => { (unavailable[k] ||= { reason: v, runs: 0 }).runs++; }));
  for (const k of Object.keys(unavailable)) unavailable[k] = `${unavailable[k].reason} (${unavailable[k].runs} of ${rs.length} runs)`;
  const lastReq = [...rs].reverse().find((r) => r.metrics && r.metrics.requests.length);
  const dominant = rs.map((r) => r.metrics && r.metrics.breakdown && r.metrics.breakdown.dominant).filter(Boolean);
  return { name, action: step.action || 'click', medians: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.median])),
    spread: Object.fromEntries(Object.entries(stats).filter(([, v]) => v.n > 1).map(([k, v]) => [k, [v.min, v.max]])),
    dominantDelay: dominant.length ? [...new Set(dominant)].join(' / ') : null,
    requestsLastRun: lastReq ? lastReq.metrics.requests : [], errors, flags, unavailable, problems };
});
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `interaction-${Date.now()}.json`);
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url);
const result = {
  ok: true, tool: 'measure-interaction', url, engine: `chromium ${version}`, device: deviceName, runs,
  conditions: { cpuThrottle: cpuThrottle || 1, addedLatencyMs: latency || 0, coldContextPerRun: true },
  notes: [
    'Chromium emulation; not iOS Safari. Desktop CPU unless --cpu-throttle is set.',
    'Times are milliseconds from the trusted input event (event.timeStamp) on the page clock.',
    'Event Timing values have 8 ms granularity and only report interactions of 16 ms or more.',
    'feedback/loading/done times are detected per animation frame (about 16 ms resolution).',
    local && !latency ? 'Local server: network transfer is near zero, so waitingMs is mostly backend processing.' : 'waitingMs = server processing + network round trip; use Server-Timing headers to separate them.',
    'Network times come from Playwright request timing aligned to the page clock (about 1 ms skew).',
    ...(latency ? [`--latency ${latency}: Chromium latency emulation sets a MINIMUM time per request that overlaps with server time (it is not added to it), so requests slower than ${latency} ms are unchanged. Use it only to exercise loading states.`] : []),
    ...(cpuThrottle ? [`--cpu-throttle ${cpuThrottle}: emulated slower CPU; work timed by wall clock (for example busy loops on performance.now()) is not slowed.`] : []),
  ],
  thresholds: THRESHOLDS,
  pageLoad: aggregate(pageLoads.map((p) => ({ metrics: p }))),
  steps: summarySteps,
  fullResults: file,
};
fs.writeFileSync(file, JSON.stringify({ ...result, perRun, pageLoads }, null, 2));
console.log(JSON.stringify(result, null, 2));
