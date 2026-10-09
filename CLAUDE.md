<!-- ai-dev-team:start (managed by the agent-team installer; edit outside these markers) -->
## AI Dev Team

This repository has the ai-dev-team subagents installed: software-engineer, ui-ux-designer, ai-engineer, qa-engineer, security-engineer, educational-architect.

- The main session is the Orchestrator. For any task with more than one part, or that needs a specialist, follow the `orchestrate` skill.
- Talk to the user in Arabic. Write briefs to subagents in English.
- Do small, single-file tasks directly; do not delegate them.
- Use the fewest agents needed. Run agents in parallel only for independent work, and say so only when it actually happened.
- Subagents run on Sonnet. Escalate one call to Opus only for complex research, critical educational or security analysis, or after a failed Sonnet attempt, and tell the user why.
- Never deploy, publish, merge to the default branch, or run destructive operations without the user's explicit approval.
- Never change approved features, designs, algorithms, question banks or answer keys without approval. Approved paths are listed in `.claude/agent-team/protected-paths.txt`.
- Report only tests that were actually executed, with the command and result. Never describe a screen that was not actually rendered and inspected.
<!-- ai-dev-team:end -->

## Project: Leadership Interview Coach

An Arabic RTL progressive web app for leadership interview preparation and simulation. Plain JavaScript modules, no framework and no build step. Deployed on Vercel. AI evaluation uses Gemini.

### Repository layout
- `work/` is the production application. `work/dist/` is the static site, `work/api/` holds the Vercel functions, `work/tests/` holds the approved tests, and `work/audit-harness/` holds the approved Playwright harness.
- The root `.zip` files are archived releases. They are read-only records.
- Agent output lives at the repository root, outside `work/`, so it is never deployed:

| Folder | Owner | Contents |
|---|---|---|
| `docs/design/` | ui-ux-designer | Interface analysis, design proposals, alternative layouts, screen-by-screen specs, visual comparison reports |
| `docs/education/` | educational-architect | Research and evidence logs, content reviews, gap and redundancy findings, simplification and interactive-learning proposals |
| `docs/qa/` | qa-engineer | Test plans, QA reports, performance and RTL findings |
| `tests/agent-qa/` | qa-engineer | New regression, interaction, responsiveness and RTL tests |

### Protection and authorization
- Approved content, the evaluation algorithm and rubrics, the approved tests, reference documents, the approved visual design and production configuration are listed in `.claude/agent-team/protected-paths.txt`. Subagents cannot write them.
- A proposal never edits a protected file. Designers and the educational architect write proposals in their folders; the user approves; then the software-engineer implements on a dedicated development branch.
- To implement an approved change to a protected file, follow the steps at the top of `protected-paths.txt`. Unlock only the specific file, only on a development branch, and restore the line afterwards.
- Before delegating writes to `work/`, set the task scope in `.claude/agent-team/scope.json` so the agent can touch only the approved files.
- If a change to the existing test infrastructure is needed, the qa-engineer reports it and the orchestrator asks the user.
- The main session is not governed by the guard. It must follow the same rules by choice: no deploys, no Vercel production changes, no merges to `main`, and no edits to protected files without explicit approval.

### Session and guard requirements (approved by the user)
- Start every AI Dev Team session with this repository only, on a branch that contains `.claude/`. A cloud session with several repositories starts above the clones and does not load hooks from any `.claude/settings.json`, while the agents can still load, so they run unguarded. Do not add another repository during the session with `add_repo`.
- The session's working directory must be the repository root. Claude Code reads `.claude/settings.json` only from the primary working directory, so a session started in a subfolder such as `work/` also runs without the guard.
- The presence of `.claude/settings.json` or `guard.py`, or a passing guard self-test, is not proof that the hooks are active. Only an observed hook execution is.
- Security preflight. Run it once per session, and again after any change of directory or session restart, before delegating any task with write or shell access:
  1. `pwd` equals `git rev-parse --show-toplevel`, and that root contains `.claude/settings.json` with the three guard hooks (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`).
  2. Hooks are active: after a Bash call by the main session, `/tmp/ai-dev-team-guard/<first 12 hex of sha1(repository root path)>/active/` holds a record for that call made seconds ago.
  3. Enforcement check: ask the security-engineer to run `echo canary > .guard-canary-should-be-blocked` and nothing else. The result must contain `[ai-dev-team guard] BLOCKED`, and the file must not exist afterwards (`git status` unchanged).
  4. If any step fails, stop. Do not delegate tasks with write or shell access; tell the user what failed and that the session must be reopened with this repository only. Read-only work by the main session may continue.
- Concurrent writes. The guard snapshots the working tree around each subagent Bash call and reverts changes it cannot attribute to a permitted writer, so concurrent writes in one working tree can be reverted by mistake.
  - Read-only analysis may run in parallel.
  - Never run two writers in the same working tree at the same time. For independent parallel coding tasks use `isolation: "worktree"` (the guard is enforced inside worktrees); otherwise run write tasks one after another.
  - Never revert unrelated user changes or another agent's authorized work. If the guard reports reverted or unattributed changes, stop and report them to the user.

### Testing conventions
- Run the approved suite from `work/` with `npm test`. `npm run test:live` calls the real AI provider and needs a key; run it only when the user asks.
- Playwright is installed globally; do not install packages. Use the `webapp-testing` skill and its `measure-interaction.mjs` for button responsiveness.
- Write screenshots and harness output to `/tmp`. For the audit harness set `OUT=/tmp/...`, because `work/audit-harness/shots/` is inside a protected tool folder.
- Validate Arabic RTL layouts at iPhone viewport sizes.
