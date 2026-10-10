#!/usr/bin/env node
// Counts the JavaScript files and bytes fetched on a cold load of a route (fresh context, service worker blocked).
//   BASE=http://localhost:4273 ROUTES='["#/home","#/practice/a1"]' node tests/agent-qa/perf/startup-js.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))('playwright');
}
const { chromium, devices } = await loadPlaywright();
const BASE = (process.env.BASE || 'http://localhost:4273').replace(/\/$/, '');
const ROUTES = process.env.ROUTES ? JSON.parse(process.env.ROUTES) : ['#/home', '#/preparation', '#/competencies', '#/questions', '#/practice', '#/practice/a1', '#/simulation', '#/reports', '#/settings'];
const browser = await chromium.launch();
const result = [];
for (const route of ROUTES) {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const js = new Map();
  page.on('response', async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.endsWith('.js')) return;
    try { js.set(url.pathname, (await res.body()).length); } catch { js.set(url.pathname, 0); }
  });
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#main-content')?.hasAttribute('aria-busy') && !document.querySelector('.loading-screen'), null, { timeout: 15000 }).catch(() => {});
  const bytes = [...js.values()].reduce((a, b) => a + b, 0);
  result.push({ route, files: js.size, kb: Math.round(bytes / 102.4) / 10, names: [...js.keys()].map((n) => n.replace('/js/', '')).sort() });
  await ctx.close();
}
await browser.close();
console.log('| Route | JS files | JS KB |\n| --- | ---: | ---: |');
for (const r of result) console.log(`| ${r.route} | ${r.files} | ${r.kb} |`);
if (process.env.VERBOSE) for (const r of result) console.log(r.route, r.names.join(' '));
