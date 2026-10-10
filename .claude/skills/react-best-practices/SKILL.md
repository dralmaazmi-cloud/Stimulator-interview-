---
name: react-best-practices
description: Vercel performance rules for React and Next.js web apps (re-renders, waterfalls, bundle size, data fetching, rendering). Use only after confirming the app's package.json depends on react-dom or next; never for other frameworks.
---

# React Best Practices (ai-dev-team wrapper)

Upstream: `vercel-labs/agent-skills` at commit `063bee9`, `skills/react-best-practices`, upstream name `vercel-react-best-practices` (MIT, see `LICENSE-NOTICE.md`). The files in `upstream/` are unmodified. The compiled 108 KB `AGENTS.md` is deliberately not included; read individual rule files.

## Step 1: activation gate (mandatory)
Run this in the directory of the `package.json` that builds the code you are working on:
```bash
node -e 'let p={};try{p=require("./package.json")}catch{};const d={...p.dependencies,...p.devDependencies,...p.peerDependencies};console.log(d["react-dom"]||d.next?"REACT_WEB":"NOT_REACT")'
```
- `NOT_REACT`: stop using this skill. Do not apply its rules or vocabulary, such as memo, Suspense, SWR or `next/dynamic`, to vanilla JS, Vue, Svelte, Angular, Preact or React Native code. Say in your report that the gate returned `NOT_REACT`.
- `REACT_WEB`: continue. Note the React and Next.js versions, because some rules need React 19 or the App Router.

## Step 2: measure before you optimize
Recommend or make a performance change only for a problem you measured in this run. Use what the project already has:
- the build output: `npm run build` prints route sizes and first-load JS in Next.js; a bundle analyzer only if one is configured;
- the `webapp-testing` skill's `scripts/measure-interaction.mjs` for click-to-feedback, interaction latency, long tasks and API time;
- existing profiling or tests.

Report the command and the real numbers before and after. If you cannot measure, list the issue as an "unmeasured candidate", with the rule and the file and line. Do not change code for it unless the brief asks. Never estimate a speed-up you did not measure.

## Step 3: apply the relevant rules only
This step is required for measured problems and for unmeasured candidates alike. Every finding names its rule ID, for example `async-parallel`, from a rule file you opened in this run.
1. Read the index of 70 rules in 8 categories with the Read tool: `.claude/skills/react-best-practices/upstream/SKILL.upstream.md` in a repository install, or `${CLAUDE_PLUGIN_ROOT}/skills/react-best-practices/upstream/SKILL.upstream.md` in a plugin install.
2. Pick the categories that match the measured problem: waterfalls, bundle, server, client fetching, re-renders, rendering or JS.
3. Read each rule file you cite in full, at `upstream/rules/<rule>.md` next to the index; the header alone is not enough. Upstream examples say `rules/...`; inside this skill that is `upstream/rules/...`.
4. Keep the smallest change that fixes the measured problem. Follow the project's existing data library and patterns. Do not add SWR, better-all, LRU caches or similar libraries without naming them in your report and having approval.

## Boundaries
Approved features and designs are preserved, and your normal write scope and guard rules apply. Performance changes that alter behavior or visuals go to the report as proposals.
