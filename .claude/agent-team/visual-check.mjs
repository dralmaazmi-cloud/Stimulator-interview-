#!/usr/bin/env node
// ai-dev-team visual check: renders a page with Playwright and saves real
// screenshots for visual QA. Screenshots go to /tmp by default so read-only
// agents can use it without writing into the project.
//
// Usage:
//   node visual-check.mjs <url-or-file> [--out DIR] [--devices "iPhone SE (3rd gen),iPhone 13,iPhone 15 Pro Max"]
//                         [--dir rtl|ltr] [--lang ar|en] [--dark] [--full]
//
// Local files are served from a temporary 127.0.0.1 HTTP server (rooted at the
// current directory when the file is inside it) so ES modules and fetch work;
// file:// would block them.
// Prints a JSON summary (paths, viewport, document direction, overflow checks).
// The caller must open each PNG with the Read tool before describing it:
// a saved file is not a visual inspection.
import { createRequire } from 'node:module';
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const req = createRequire(path.join(root, 'noop.js'));
    return req('playwright');
  } catch {}
  console.log(JSON.stringify({ ok: false, error: 'Playwright is not installed in this environment. Visual QA cannot run; report this limitation instead of describing visuals.' }));
  process.exit(3);
}

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.error('usage: visual-check.mjs <url-or-file> [--out DIR] [--devices LIST] [--dir rtl|ltr] [--lang ar|en] [--dark] [--full]');
  process.exit(1);
}
const opt = (name, dflt) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : dflt; };
const target = args[0];
const outDir = opt('--out', '/tmp/agent-team-screenshots');
const deviceNames = opt('--devices', 'iPhone SE (3rd gen),iPhone 13,iPhone 15 Pro Max').split(',').map(s => s.trim());
const forceDir = opt('--dir', null);
const forceLang = opt('--lang', null);
const dark = args.includes('--dark');
const full = args.includes('--full');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json' };

function serveDir(root) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(root, rel));
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
    console.error('Refusing non-local URL: visual checks run against local builds only.');
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

const pw = await loadPlaywright();
const { chromium, devices } = pw;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const name of deviceNames) {
  const device = devices[name];
  if (!device) { results.push({ device: name, error: 'unknown device name' }); continue; }
  const ctx = await browser.newContext({ ...device, colorScheme: dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  if (forceDir || forceLang) {
    await page.evaluate(([d, l]) => {
      if (d) document.documentElement.setAttribute('dir', d);
      if (l) document.documentElement.setAttribute('lang', l);
    }, [forceDir, forceLang]);
  }
  const vw = page.viewportSize().width;
  const metrics = await page.evaluate((vw) => {
    const doc = document.documentElement;
    // When content is wider than the device, mobile emulation zooms the page out and
    // innerWidth grows past the device width; compare against the device width.
    const zoomedOut = window.innerWidth > vw + 1 || (window.visualViewport && window.visualViewport.scale < 0.99);
    const overflowX = doc.scrollWidth > vw + 1 || zoomedOut;
    const smallText = [...document.querySelectorAll('body *')].filter(el => {
      if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 12;
    }).length;
    const outside = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && (r.left < -1 || r.right > vw + 1);
    }).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('name') ? `[name=${el.getAttribute('name')}]` : ''));
    const smallTargets = [...document.querySelectorAll('button, a, input, select, [role=button]')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.width < 44 || r.height < 44);
    }).length;
    return {
      dir: getComputedStyle(document.body).direction,
      lang: doc.getAttribute('lang'),
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      deviceWidth: vw,
      pageZoomedOutToFit: zoomedOut,
      horizontalOverflow: overflowX || outside.length > 0,
      elementsOutsideViewport: outside.slice(0, 20),
      textNodesUnder12px: smallText,
      tapTargetsUnder44px: smallTargets,
    };
  }, vw);
  const file = path.join(outDir, `${name.replace(/\s+/g, '-')}${forceDir ? '-' + forceDir : ''}${dark ? '-dark' : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  results.push({ device: name, viewport: page.viewportSize(), screenshot: file, consoleErrors, ...metrics });
  await ctx.close();
}
await browser.close();
if (server) server.close();
console.log(JSON.stringify({ ok: true, url, results }, null, 2));
