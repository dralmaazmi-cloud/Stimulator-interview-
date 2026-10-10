# Subagent brief template

Copy, fill and send as the Agent prompt. Keep it under about 250 words; link to files instead of pasting them.

```
GOAL: <one sentence, the outcome>
CONTEXT: <why; key facts the agent cannot find quickly>
FILES TO READ FIRST: <exact paths>
YOU MAY WRITE: <exact globs; must match scope.json if used>
DO NOT CHANGE: <approved features, designs, content, files>
ACCEPTANCE CRITERIA:
- <observable check 1>
- <observable check 2>
VERIFY WITH: <commands to run, or "propose the right check">
INPUTS FROM OTHER AGENTS: <paths to blueprint/spec/report, if any>
REPORT: use your standard final report; keep it short.
```

## Examples

**Software Engineer, bug fix**
```
GOAL: Fix the compound-interest result, which is wrong when the rate is entered as a percentage.
FILES TO READ FIRST: src/interest.js, src/app.js, tests/interest.test.js
YOU MAY WRITE: src/interest.js, src/app.js
DO NOT CHANGE: src/approved/**, the page layout
ACCEPTANCE CRITERIA:
- 1000 at 5% for 2 years compounded yearly returns 1102.50
- existing tests still pass
VERIFY WITH: node --test
```

**Educational Architect, Educational Quality Gate**
```
GOAL: Run the Educational Quality Gate on the implemented lesson.
FILES TO READ FIRST: docs/education/compound-interest/blueprint.md, index.html, src/lesson.js
YOU MAY WRITE: docs/education/compound-interest/gate-review.md
DO NOT CHANGE: everything else
ACCEPTANCE CRITERIA:
- each blueprint objective is checked against the implementation
- verdict line present and separate from QA
VERIFY WITH: real screenshots of index.html via visual-check.mjs
```
