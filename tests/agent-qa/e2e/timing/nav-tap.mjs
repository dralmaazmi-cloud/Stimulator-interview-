#!/usr/bin/env node
// Bottom-nav tap latency. measure-interaction.mjs cannot time hash links (it flags them as cross-document navigations),
// so this uses in-page Event Timing + a MutationObserver on aria-current, measured from the trusted input event.
//   node nav-tap.mjs http://localhost:4273 [runs]   (iPhone 14 profile, CPU throttle 4x, Chromium)
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://localhost:4273';
const runs = Number(process.argv[3] || 7);
const tabs = ['preparation', 'reports', 'simulation', 'home'];
const browser = await chromium.launch();
const rows = [];
for (let r = 0; r < runs; r += 1) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'ar' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.__t = { events: [], marks: [] };
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__t.events.push({ name: e.name, start: e.startTime, duration: e.duration, processingStart: e.processingStart }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    document.addEventListener('pointerdown', e => { window.__t.down = e.timeStamp; }, true);
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(() => {
        const a = document.querySelector('.bottom-nav a[aria-current="page"]');
        if (a && window.__t.down !== undefined) { window.__t.marks.push({ nav: a.dataset.nav, at: performance.now(), down: window.__t.down }); }
      }).observe(document.querySelector('.bottom-nav'), { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
    });
  });
  await page.goto(`${base}/#/home`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (const tab of tabs) {
    await page.evaluate(() => { window.__t.marks = []; window.__t.events = []; window.__t.down = undefined; });
    const box = await page.locator(`.bottom-nav a[data-nav="${tab}"]`).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(900);
    const t = await page.evaluate(() => window.__t);
    const mark = t.marks.find(m => true);
    const worst = t.events.reduce((m, e) => Math.max(m, e.duration), 0);
    rows.push({ run: r, tab, feedbackMs: mark ? Math.round((mark.at - mark.down) * 10) / 10 : null, eventTimingMs: worst || null });
  }
  await ctx.close();
}
await browser.close();
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const out = {};
for (const tab of tabs) { const r = rows.filter(x => x.tab === tab); out[tab] = { feedbackMedianMs: med(r.map(x => x.feedbackMs)), feedbackMaxMs: Math.max(...r.map(x => x.feedbackMs ?? 0)), eventTimingMedianMs: med(r.map(x => x.eventTimingMs)), eventTimingMaxMs: Math.max(...r.map(x => x.eventTimingMs ?? 0)) }; }
console.log(JSON.stringify({ base, engine: 'chromium', device: 'iPhone 14', cpuThrottle: 4, runs, out }, null, 1));
