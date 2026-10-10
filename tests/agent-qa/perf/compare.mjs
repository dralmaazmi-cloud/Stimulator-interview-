#!/usr/bin/env node
// Builds the markdown tables for docs/qa/v2/performance-comparison.md from three measure-app.mjs result files.
//   node tests/agent-qa/perf/compare.mjs v1.json before.json after.json > tables.md
import fs from 'node:fs';
const [v1, v2b, v2a] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const f = (x) => (typeof x === 'number' ? String(x) : 'n/a');
const row = (...c) => `| ${c.join(' | ')} |`;
const out = [];
const to = (r) => (r && r.timedOut ? 'n/m' : null);

out.push('### Cold load (median of 3 runs, fresh context)', '');
out.push(row('Device', 'CPU', 'Metric', 'V1', 'V2 before', 'V2 after'), row('---', '---', '---', '---:', '---:', '---:'));
v1.coldLoad.forEach((c, i) => {
  const b = v2b.coldLoad[i], a = v2a.coldLoad[i];
  const m = (k) => [c.median[k], b.median[k], a.median[k]].map(f);
  [['FCP ms', 'fcpMs'], ['LCP ms', 'lcpMs'], ['DCL ms', 'dclMs'], ['TBT ms', 'tbtMs'], ['Longest task ms', 'longTaskMaxMs'], ['Requests', 'requests'], ['Transferred KB', 'transferredKB']]
    .forEach(([label, k]) => out.push(row(c.device, `${c.cpuThrottle}x`, label, ...m(k))));
});

const routeVal = (res, rate, route) => {
  const x = res.routes.find((d) => d.cpuThrottle === rate)?.routes.find((q) => q.route === route);
  return x ? (x.timedOut ? 'n/m' : f(x.median.paintedMs)) : 'n/a';
};
out.push('', '### Route paint time, iPhone 14, ms (hash change to second animation frame; n/m = not measurable, see notes)', '');
out.push(row('Route', 'CPU', 'V1', 'V2 before', 'V2 after'), row('---', '---', '---:', '---:', '---:'));
for (const rate of v1.throttles) for (const d of v1.routes.find((x) => x.cpuThrottle === rate).routes) {
  out.push(row(d.route, `${rate}x`, routeVal(v1, rate, d.route), routeVal(v2b, rate, d.route), routeVal(v2a, rate, d.route)));
}

const inpage = (res, rate, name) => f(res.inpageInteractions.find((d) => d.cpuThrottle === rate)?.steps.find((s) => s.name === name)?.medianMs);
out.push('', '### In-page interaction latency, iPhone 14, ms (event timestamp to second animation frame after content ready)', '');
out.push(row('Interaction', 'CPU', 'V1', 'V2 before', 'V2 after'), row('---', '---', '---:', '---:', '---:'));
for (const rate of v1.throttles) for (const s of v1.inpageInteractions.find((x) => x.cpuThrottle === rate).steps) {
  out.push(row(s.name, `${rate}x`, inpage(v1, rate, s.name), inpage(v2b, rate, s.name), inpage(v2a, rate, s.name)));
}

const swipe = (res, rate) => f(res.swipe.find((d) => d.cpuThrottle === rate)?.medianMs);
out.push('', '### Swipe (question deck), ms', '', row('CPU', 'V1', 'V2 before', 'V2 after'), row('---', '---:', '---:', '---:'));
for (const rate of v1.throttles) out.push(row(`${rate}x`, swipe(v1, rate), swipe(v2b, rate), swipe(v2a, rate)));

console.log(out.join('\n'));
