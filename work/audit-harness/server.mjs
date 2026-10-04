// Local harness: serves dist/ statically and mounts the real api/ handlers with a MOCK provider.
// Nothing in the project is modified. Mock behaviour is steered by magic tokens in the user answer.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.ROOT || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIST = path.join(ROOT, 'dist');
process.env.GEMINI_API_KEY = process.env.MOCK_UNCONFIGURED ? '' : 'mock-key-for-local-harness';

const handlers = {
  '/api/health': (await import(path.join(ROOT, 'api/health.js'))).default,
  '/api/evaluate': (await import(path.join(ROOT, 'api/evaluate.js'))).default,
  '/api/transcribe': (await import(path.join(ROOT, 'api/transcribe.js'))).default,
  '/api/self-intro': (await import(path.join(ROOT, 'api/self-intro.js'))).default
};

const calls = [];
globalThis.__providerCalls = calls;

function pick(text, n) {
  // return n literal substrings (sentences) of the user text
  const parts = text.split(/[.؟!\n]/).map(s => s.trim()).filter(s => s.length > 3);
  return parts.slice(0, n);
}

function buildEvaluation(prompt) {
  const q = JSON.parse(prompt.split('السؤال:\n')[1].split('\n\n')[0]);
  const answer = prompt.split('<<<')[1].split('>>>')[0];
  const followupsText = prompt.split('المتابعات السابقة وإجاباتها:\n')[1] || '';
  const combined = answer + ' ' + followupsText;
  globalThis.__seq = globalThis.__seq || new Map();
  const seqN = (globalThis.__seq.get(answer) || 0) + 1; globalThis.__seq.set(answer, seqN);
  const seqMode = /SEQX/.test(answer) ? (seqN === 1 ? 'BADQUOTES' : seqN === 2 ? 'BADSCHEMA' : 'OK') : '';
  const bad = /BADQUOTES/.test(answer) || seqMode === 'BADQUOTES';
  const invalid = /BADJSON/.test(answer);
  const schemaFail = /BADSCHEMA/.test(answer) || seqMode === 'BADSCHEMA';
  const noFollowup = /NOFOLLOWUP/.test(answer);
  const noQuotes = /NOQUOTES/.test(answer);
  const lowScore = /LOWSCORE/.test(answer); // two criteria scored 2 with real quotes, four scored 0 without evidence
  const allZero = /ALLZERO/.test(answer); // every criterion 0, no quotes anywhere
  const quotes = bad ? ['اقتباس مختلق غير موجود في الإجابة', 'اقتباس آخر مختلق', 'ثالث مختلق'] : pick(answer, 5);
  const qt = i => (noQuotes ? [] : [quotes[i % quotes.length] || quotes[0]]);
  const elementQuote = i => (noQuotes ? null : (quotes[i % quotes.length] || quotes[0]));
  const mode = q.rubric_mode;
  const criteriaKeys = mode === 'general' ? ['clarity', 'reasoning_depth', 'link_to_practice', 'realism_maturity']
    : mode === 'self_intro' ? ['coverage', 'structure_clarity', 'timing']
      : ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'];
  const elements = {};
  const elementKeys = mode === 'star_l' ? ['situation', 'task', 'action', 'result', 'learning'] : mode === 'seal' ? ['situation', 'evaluation', 'action', 'leadership_effect'] : [];
  elementKeys.forEach((k, i) => { elements[k] = { present: !noQuotes && !lowScore && !allZero, quote: (lowScore || allZero) ? null : elementQuote(i) }; });
  const pointsMatch = prompt.split('النقاط المتوقعة:\n')[1].split('\n\n')[0];
  let points = [];
  try { points = JSON.parse(pointsMatch); } catch { points = []; }
  const report = {
    question_id: schemaFail ? 'WRONG-ID' : q.id,
    rubric_mode: mode,
    elements,
    criteria: criteriaKeys.map((key, i) => ({
      key,
      score: allZero ? 0 : lowScore ? (i < 2 ? 2 : 0) : 3 + (i % 3),
      evidence: allZero ? [] : lowScore ? (i < 2 ? qt(i) : []) : qt(i),
      justification: `تبرير تجريبي للمعيار ${key}.`
    })),
    expected_points_coverage: points.map((p, i) => ({ point: p, covered: !(lowScore || allZero) && i % 2 === 0, quote: !(lowScore || allZero) && i % 2 === 0 ? elementQuote(i) : null })),
    behaviours_observed: { supporting: [], negative: [] },
    mission_command_indicators: q.id.startsWith('M') ? ['M1'] : [],
    flags: /نحن/.test(answer) ? ['we_not_i'] : [],
    strengths: ['وضوح الموقف (تجريبي)'],
    missing: ['مؤشر رقمي للنتيجة (تجريبي)'],
    next_actions: ['أضف مؤشرًا قابلًا للقياس (تجريبي).'],
    follow_up_questions: noFollowup ? [] : ['ما المؤشر الذي استخدمته لقياس النتيجة؟ (متابعة تجريبية)']
  };
  if (invalid) return '{ this is not json';
  return JSON.stringify(report);
}

globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (process.env.MOCK_PROVIDER_429) return new Response(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota). [Gemini quota detail]', status: 'RESOURCE_EXHAUSTED' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  if (process.env.MOCK_PROVIDER_400) return new Response(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const rec = { url: String(url), model: body.model, kind: 'unknown' };
  calls.push(rec);
  let text;
  if (Array.isArray(body.input)) {
    rec.kind = 'transcribe';
    rec.mime = body.input[1]?.mime_type;
    rec.audioBytes = Math.round((body.input[1]?.data?.length || 0) * 3 / 4);
    text = 'هذا تفريغ تجريبي للتسجيل الصوتي، في بداية المشروع كان الفريق متأخرًا وأنا أعدت توزيع المهام.';
  } else if (body.response_format?.schema?.properties?.facts_preserved) {
    rec.kind = 'self-intro';
    const src = body.input.split('<<<')[1].split('>>>')[0];
    text = JSON.stringify({ text: src.replace(/\s+/g, ' ').trim() + ' (نسخة محسّنة تجريبيًا)', changes: ['تحسين الربط بين الجمل (تجريبي)'], facts_preserved: !/ADDFACT/.test(src) });
  } else if (body.response_format?.schema?.properties?.questions) {
    rec.kind = 'followup';
    text = JSON.stringify({ questions: ['ما الذي فعلته أنت تحديدًا؟'], reasons: ['الدور الشخصي غير واضح'] });
  } else {
    rec.kind = 'evaluate';
    text = buildEvaluation(body.input);
  }
  const shape = process.env.MOCK_SHAPE || 'legacy';
  // 'legacy' = the shape the project's own tests assume; 'rest' = the documented REST response (steps[]).
  const payload = shape === 'rest'
    ? { id: 'v1_mock', status: 'completed', usage: { total_tokens: 150, total_input_tokens: 100, total_output_tokens: 50 }, steps: [{ type: 'model_output', content: [{ type: 'text', text }] }], object: 'interaction', model: body.model }
    : { output_text: text, usage_metadata: { input_token_count: 100, output_token_count: 50 } };
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const handler = handlers[url.pathname];
    if (!handler) { res.statusCode = 404; res.end('{"error":"not found"}'); return; }
    if (process.env.MOCK_API_DOWN) { res.statusCode = 503; res.end('<html>down</html>'); return; }
    // Emulate Vercel: JSON bodies are pre-parsed into req.body
    if ((req.headers['content-type'] || '').startsWith('application/json')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      try { req.body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { req.body = {}; }
    }
    try { await handler(req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: 'harness crash: ' + e.message })); }
    return;
  }
  if (url.pathname === '/__calls') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(calls)); return; }
  let file = path.join(DIST, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.env.PORT) || 4173, () => console.log('harness on', server.address().port));
