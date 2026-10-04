import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = String(process.env.PHASE2_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) throw new Error('Set PHASE2_BASE_URL to the deployed app URL before running live calibration.');

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const suite = JSON.parse(fs.readFileSync(path.join(project, 'tests/answers/bias-suite.json'), 'utf8'));
const limit = Math.max(1, Math.min(suite.fixtures.length, Number(process.env.PHASE2_CASE_LIMIT) || suite.fixtures.length));
const repeat = Math.max(1, Math.min(10, Number(process.env.PHASE2_REPEAT) || 1));
const results = [];

for (let run = 1; run <= repeat; run += 1) {
  for (const fixture of suite.fixtures.slice(0, limit)) {
    const started = Date.now();
    const response = await fetch(`${baseUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': `phase2-calibration-${run}-${fixture.group}` },
      body: JSON.stringify({ question_id: fixture.question_id, answer: fixture.answer })
    });
    const payload = await response.json().catch(() => ({}));
    results.push({
      id: `${fixture.id}#${run}`,
      fixture_id: fixture.id,
      run,
      group: fixture.group,
      pair_id: fixture.pair_id || '',
      question_id: fixture.question_id,
      status: response.status,
      duration_ms: Date.now() - started,
      report: payload.report || null,
      error_code: payload.code || ''
    });
    process.stdout.write(`${fixture.id} run ${run}: ${response.status}\n`);
  }
}

const firstRun = new Map(results.filter(item => item.run === 1).map(item => [item.fixture_id, item]));
const reportOf = id => firstRun.get(id)?.report;
const scoreOf = id => reportOf(id)?.final_score;
const criterionOf = (id, key) => reportOf(id)?.criteria?.find(item => item.key === key)?.score;
const flagsOf = id => reportOf(id)?.flags || [];
const checks = [];

for (const fixture of suite.fixtures.slice(0, limit)) {
  const expectation = fixture.expectation || {};
  if (expectation.beats_pair) checks.push({
    id: fixture.id, rule: 'short_strong_beats_long_weak',
    passed: Number.isFinite(scoreOf(fixture.id)) && scoreOf(fixture.id) > scoreOf(expectation.beats_pair)
  });
  if (expectation.near_reference_model) checks.push({
    id: fixture.id, rule: 'copied_reference_detected',
    passed: reportOf(fixture.id)?.near_reference_model === true
      && criterionOf(fixture.id, 'competency_evidence') <= expectation.competency_evidence_max
  });
  if (expectation.personal_role_beats) checks.push({
    id: fixture.id, rule: 'i_beats_we',
    passed: criterionOf(fixture.id, 'personal_role_or_options') > criterionOf(expectation.personal_role_beats, 'personal_role_or_options')
  });
  if (expectation.result_beats) checks.push({
    id: fixture.id, rule: 'result_beats_no_result',
    passed: criterionOf(fixture.id, 'result_or_effect') > criterionOf(expectation.result_beats, 'result_or_effect')
      && flagsOf(expectation.result_beats).includes('no_result')
  });
  if (expectation.score_difference_max && fixture.id.endsWith('-msa')) checks.push({
    id: fixture.id, rule: 'dialect_parity',
    passed: Math.abs(scoreOf(fixture.id) - scoreOf(expectation.compare_to)) <= expectation.score_difference_max
  });
  if (expectation.flags_include) checks.push({
    id: fixture.id, rule: `flags:${expectation.flags_include.join(',')}`,
    passed: expectation.flags_include.every(flag => flagsOf(fixture.id).includes(flag))
  });
}

const durations = results.map(item => item.duration_ms).sort((a, b) => a - b);
const successful = results.filter(item => item.status === 200 && item.report);
const summary = {
  requests: results.length,
  successful: successful.length,
  schema_success_rate: results.length ? Number((successful.length / results.length).toFixed(4)) : 0,
  p95_duration_ms: durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)] : 0,
  displayed_rejected_quotes: successful.reduce((sum, item) => sum + Number(item.report?.verification?.rejected_quotes || 0), 0),
  checks_passed: checks.filter(item => item.passed).length,
  checks_total: checks.length,
  checks
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(project, 'tests/results', `${stamp}.json`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify({ suite_version: suite.suite_version, base_url: baseUrl, repeat, summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`Saved ${results.length} live results to ${path.relative(project, target)}`);
