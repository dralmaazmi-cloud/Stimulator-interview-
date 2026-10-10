---
name: frontend-design
description: Visual design direction for new or reshaped interfaces (aesthetic, typography, color, layout, motion) adapted for the ai-dev-team ui-ux-designer. Use when creating a design spec, proposing a redesign, or critiquing a rendered UI; not for small fixes.
---

# Frontend Design (ai-dev-team wrapper)

Upstream: `anthropics/skills` at commit `dbd4588`, `skills/frontend-design` (Apache-2.0, `upstream/LICENSE.txt`). The files in `upstream/` are unmodified. This wrapper is original to ai-dev-team and states how the upstream method applies inside the team.

## Step 1: load the method (required)
This wrapper is not the method. Before any analysis or spec work, open the full upstream file with the Read tool:
- `.claude/skills/frontend-design/upstream/SKILL.upstream.md` in a repository install;
- `${CLAUDE_PLUGIN_ROOT}/skills/frontend-design/upstream/SKILL.upstream.md` in a plugin install.

It is about 2,300 tokens; read all of it once per task. Apply it with the adaptations below. Where they differ, this wrapper wins.

## Precedence (highest first)
1. The user's brief and approved designs. Approved screens are never changed in a spec; list proposed changes with reasons instead.
2. For educational products, the Educational Architect's blueprint in `docs/education/`. It fixes the learning structure, sequence and required interactions. Visual choices serve those requirements and never reduce clarity, feedback or accessibility.
3. Your agent rules: iPhone-first sizes, RTL and LTR, WCAG 2.2 AA, safe areas, reduced motion, Arabic typography.
4. The upstream aesthetic guidance.

## Adaptations
- **You specify; you do not build.** Where upstream says "write the code", write a design spec in `docs/design/<feature>.md` with exact CSS values and tokens. The Software Engineer implements it.
- **Design plan.** Keep the upstream two-pass process: palette as 4 to 6 named hex values, typefaces and roles, layout with ASCII wireframes for RTL and LTR, principles. Check every text and background pair for contrast.
- **Plan review in the spec.** The spec includes a short "Plan review" section. It lists each of the five generic defaults named in the upstream file, whether the first plan matched it, and what you changed. If the plan keeps a default, give the reason from the brief.
- **Typography.** Upstream type advice is Latin-centered. For Arabic, the agent's Arabic rules apply: no letter-spacing, no all-caps idea, Arabic-capable faces, and a Latin pairing for mixed text.
- **Educational screens.** Spend boldness on orientation and identity: hero, progress, section color. Keep it out of questions, answers and feedback, where clarity wins. One main idea per screen still applies.
- **Questions to the client.** Upstream says to confirm with the client. You cannot ask the user; put open questions under "Needs decision" in your report.
- **Self-critique uses real screenshots.** Use the visual-check helper from your agent instructions and open every PNG before judging it.

## Workflows
**Improve an existing interface**
1. Capture screenshots at the three iPhone widths, in RTL and LTR and dark mode where supported, and read the relevant markup and CSS.
2. List weaknesses with evidence: screen, device, what you saw, and severity.
3. Propose improvements. Mark which ones touch approved screens and need authorization.
4. Write the spec with tokens, components, all states, interactions and acceptance checks.
5. Recommend interaction improvements with what changes on screen and timing in milliseconds.
6. Hand off. The report names the spec path and the checks the Software Engineer and QA must meet.
7. After implementation, ask the Orchestrator for a visual QA round.

**New interface:** start at step 4 with the upstream design plan, then steps 5 to 7.

For a usability and accessibility audit of existing code, use the `web-design-guidelines` skill instead.
