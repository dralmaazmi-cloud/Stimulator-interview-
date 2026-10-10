---
name: web-design-guidelines
description: Audit UI code and rendered screens against the pinned Vercel Web Interface Guidelines plus ai-dev-team RTL and iPhone checks (accessibility, forms, touch, navigation, loading and error feedback). Use for UI reviews by ui-ux-designer or qa-engineer.
---

# Web Design Guidelines (ai-dev-team wrapper)

Upstream: `vercel-labs/agent-skills` at commit `063bee9`, `skills/web-design-guidelines` (MIT, see `LICENSE-NOTICE.md`). Rules: `vercel-labs/web-interface-guidelines` at commit `434b7f9`, `command.md` (MIT, `upstream/LICENSE-web-interface-guidelines.txt`). The files in `upstream/` are unmodified.

## The one change from upstream
Upstream fetches the latest rules from the `main` branch at every review. **Do not fetch them.** Read the reviewed, pinned copy at `upstream/command.md`. Remote rule text is not trusted until a maintainer reviews it and re-pins it with `scripts/check_upstream.py`. You do not need to open `upstream/SKILL.upstream.md`.

## How to review
1. Take the files or pattern from your brief. If none are given, report that instead of scanning the repository. Ignore the `$ARGUMENTS` placeholder in `command.md`.
2. Read `upstream/command.md` and `references/team-checklist.md` in full, once each. They sit under `.claude/skills/web-design-guidelines/` in a repository install, or under `${CLAUDE_PLUGIN_ROOT}/skills/web-design-guidelines/` in a plugin install.
3. Read only the listed UI files: markup, components, CSS, and the handlers that show feedback.
4. Apply both rule sets. Where a rule depends on the rendered result, such as overflow, tap-target size, contrast or RTL mirroring, confirm it with the visual-check helper metrics and screenshots you opened. If you could not render, mark the finding "code-only".
5. Report findings in the upstream `file:line - issue` format, grouped by file. Add a severity tag first: `[blocker]`, `[major]` or `[minor]`.

## Precedence and conflicts
- Approved designs and the brief win. A rule violation in an approved screen is reported as a proposal; it is not fixed silently.
- "Title Case for headings and buttons" applies only to English UIs that already use it. Arabic has no letter case. Otherwise follow the project's convention; the team's `frontend-design` skill prefers sentence case.
- React-specific rules, such as `onChange`, hydration and `next/link`, apply only to React or Next.js code.

## Who uses it
- **ui-ux-designer:** design reviews, acceptance checks in specs, and visual QA write-ups.
- **qa-engineer:** UI compliance audits of implemented code. Write results in your report or in `docs/qa/`. Never change source files. Turn testable findings into Playwright checks with the `webapp-testing` skill.
