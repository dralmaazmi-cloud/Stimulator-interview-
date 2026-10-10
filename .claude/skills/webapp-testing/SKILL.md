---
name: webapp-testing
description: Browser tests for local web apps with Playwright (navigation, buttons, forms, loading and error states, iPhone layouts, Arabic RTL, console errors, regressions) plus measured interaction timing. Use for qa-engineer E2E work; reuses the existing Node Playwright.
---

# Webapp Testing (ai-dev-team wrapper)

Upstream: `anthropics/skills` at commit `dbd4588`, `skills/webapp-testing` (Apache-2.0, `upstream/LICENSE.txt`). The files in `upstream/` are unmodified. This wrapper, `references/` and `scripts/measure-interaction.mjs` are original to ai-dev-team.

## Paths
This skill lives at `.claude/skills/webapp-testing/` in a repository install, or at `${CLAUDE_PLUGIN_ROOT}/skills/webapp-testing/` in a plugin install. Below, `<skill>` means that folder. Check which one exists with `ls`.

## What changes from upstream
- **Node Playwright instead of Python.** Upstream writes Python scripts. The team already uses Node Playwright, through the visual-check helper, and Python Playwright is usually not installed. Do not install a second framework. Read `references/node-playwright.md` for the Node form of every upstream pattern.
- **Kept as is:** the upstream decision tree, reconnaissance-then-action, waiting for `networkidle`, and `upstream/scripts/with_server.py`. That script is stdlib-only Python and starts and stops dev servers around any command. Read `upstream/SKILL.upstream.md` once for the method. Run the helper with `--help` rather than reading its source.

## Pick the runner (first match wins)
1. The project has `@playwright/test` and a `playwright.config.*`: write specs in its test folder and run its own command.
2. The project depends on `playwright`: import it in `tests/e2e/*.mjs` scripts.
3. Neither: use the globally installed `playwright` with the loader in `references/node-playwright.md`.
4. None available: report `QA verdict: BLOCKED (Playwright unavailable)`. Do not install packages unless the brief allows it.

## What to cover
Cover what the brief touches, plus neighbors that share code:
- navigation and back;
- buttons and forms, including validation errors;
- loading, empty and error states;
- error handling for failed requests;
- iPhone layouts: "iPhone SE (3rd gen)", "iPhone 13", "iPhone 15 Pro Max";
- Arabic RTL and English LTR;
- console errors and uncaught exceptions;
- regressions in previously working flows.

Assert on what the user sees, through roles, labels and text. Write test files only in your test areas, and put screenshots and results under `/tmp`.

## Interaction performance
Any timing question goes through `node <skill>/scripts/measure-interaction.mjs`. This covers click to feedback, time to completion, API latency, a frozen UI, loading states and async errors. Do not hand-roll timers with `performance.now()` or `Date.now()` around Playwright calls; those include automation overhead and cannot separate frontend time from backend time.
1. Read `references/interaction-performance.md` first. It covers the step file, every metric, and how frontend, backend and network delays are separated.
2. Write the step file under `tests/e2e/`.
3. Run the tool and report only what it output, with its JSON file path.

## Report
- Name the engine. Chromium emulation does not prove iOS Safari behavior.
- Give the exact commands and the real results. List failed tests.
- Name the JSON result file for timing runs.
