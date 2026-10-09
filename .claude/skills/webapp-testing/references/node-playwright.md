# Node Playwright equivalents of the upstream Python patterns

## Loading Playwright without installing anything
Save scripts as `tests/e2e/<name>.mjs` (a QA write area). This loader tries the project's own
`playwright`, then the global one (the same order as the team's visual-check helper):
```js
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))('playwright');
}
const { chromium, devices } = await loadPlaywright();
```

## Server lifecycle (upstream helper, unchanged)
```bash
python3 <skill>/upstream/scripts/with_server.py --server "npm run dev" --port 5173 -- node tests/e2e/flow.mjs
```
For a static folder use `--server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765` and open
`http://127.0.0.1:8765/`; in this environment Chromium returned `ERR_EMPTY_RESPONSE` for `localhost` against
Python's server. Static HTML needs no server for screenshots (the visual-check helper serves its folder), but ES modules
and `fetch` need http, not `file://`.

## Reconnaissance, then action (upstream pattern)
```js
const browser = await chromium.launch();               // headless by default
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });   // wait before inspecting
await page.screenshot({ path: '/tmp/agent-team-e2e/inspect.png', fullPage: true });
console.log(await page.getByRole('button').allInnerTexts());              // discover selectors
```

## Acting and asserting
```js
import assert from 'node:assert/strict';
await page.getByLabel('المبلغ').fill('1000');
await page.getByRole('button', { name: 'احسب' }).click();
await page.getByRole('status').waitFor();                                   // loading state appears
await page.getByText('النتيجة').waitFor({ timeout: 5000 });
assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
assert.deepEqual(errors, []);                                               // no console errors
await browser.close();
```
Run with `node tests/e2e/flow.mjs`; a non-zero exit is a failed test. In projects with `@playwright/test`,
write the same steps as a spec and use `expect(...)` instead.

## Checks that are easy to forget
- **RTL:** `dir`/`lang` on `<html>`; directional icons mirrored; numbers and Latin words in order.
- **Layout:** `document.documentElement.scrollWidth <= innerWidth` at each iPhone width (no horizontal scroll).
- **Failed requests:** use `page.route('**/api/**', (r) => r.fulfill({ status: 500, body: '{}' }))` to force
  the error path, and assert the visible error message and recovery action.
- **Slow requests:** delay a route (`await new Promise((r) => setTimeout(r, 1500)); await r.continue();`) and
  assert the loading indicator appears and duplicate submits are blocked.
- **Persistence:** reload and check stored state survives (localStorage or IndexedDB).
