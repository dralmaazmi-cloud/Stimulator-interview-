import { httpError } from './http.js';

const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-3.8-flash';

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export function providerConfigured() {
  return Boolean(apiKey());
}

export function providerInfo() {
  return {
    configured: providerConfigured(),
    mode: providerConfigured() ? 'live' : 'unconfigured'
  };
}

function modelId(override, kind = 'evaluation') {
  if (override) return override;
  if (kind === 'transcription') return process.env.GEMINI_TRANSCRIBE_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

// ---------------------------------------------------------------------------
// النقل (alpha-4 — B2/B3): إعادة محاولة عند 5xx/فشل الاتصال فقط، بتأخير مع jitter،
// ثم نداء احتياطي واحد إن عُرّف نموذج احتياطي للدور نفسه. ميزانية واحدة لكل طلب:
// deadline بعد 50 ثانية من بداية المعالج، وسقف نداءات إجمالي، ومهلة لكل نداء.
// الساعة وsleep وrandom وfetch قابلة للحقن للاختبارات.
// ---------------------------------------------------------------------------
export const RETRY_DELAYS_MS = Object.freeze([1500, 4000]);
export const RETRY_JITTER = 0.25;
export const MAX_PRIMARY_ATTEMPTS = 3;
export const MAX_CALL_TIMEOUT_MS = 28_000;
export const MIN_REMAINING_TO_START_MS = 5_000;
export const HANDLER_BUDGET_MS = 50_000;
export const OVERLOADED_MESSAGE = 'خدمة الذكاء الاصطناعي مزدحمة الآن. إجابتك محفوظة؛ أعد الإرسال بعد دقيقة.';
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

const defaultDeps = Object.freeze({
  fetch: (...args) => globalThis.fetch(...args),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  random: Math.random,
  now: Date.now
});
let deps = { ...defaultDeps };

// للاختبارات فقط: يحقن fetch/sleep/random/now ويعيد دالة استرجاع.
export function configureProviderDeps(overrides = {}) {
  const previous = deps;
  deps = { ...deps, ...overrides };
  return () => { deps = previous; };
}

export function resetProviderDeps() {
  deps = { ...defaultDeps };
}

export function fallbackModelId(role) {
  const primary = role === 'transcription' ? modelId(null, 'transcription') : modelId(null, 'evaluation');
  const fallback = String(role === 'transcription'
    ? process.env.GEMINI_TRANSCRIBE_FALLBACK_MODEL || ''
    : process.env.GEMINI_EVALUATION_FALLBACK_MODEL || '').trim();
  // لا احتياطي إذا كان فارغًا أو مساويًا للنموذج الأساسي.
  if (!fallback || fallback === primary) return null;
  return fallback;
}

export function createBudget(options = {}) {
  const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : deps.now();
  const totalMs = Number.isFinite(options.totalMs) ? options.totalMs : HANDLER_BUDGET_MS;
  return {
    startedAt,
    deadline: startedAt + totalMs,
    maxCalls: Number.isFinite(options.maxCalls) ? options.maxCalls : 4,
    calls: 0,
    fallbackUsed: false,
    lastProviderStatus: null,
    remainingMs() { return this.deadline - deps.now(); },
    canStart() { return this.calls < this.maxCalls && this.remainingMs() >= MIN_REMAINING_TO_START_MS; },
    callTimeoutMs() { return Math.max(1000, Math.min(MAX_CALL_TIMEOUT_MS, this.remainingMs() - 1000)); }
  };
}

export function jitteredDelay(baseMs, random = deps.random) {
  const factor = 1 + (random() * 2 - 1) * RETRY_JITTER;
  return Math.round(baseMs * factor);
}

function parseRetryAfter(value) {
  const seconds = Number(String(value || '').trim());
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(3600, Math.ceil(seconds));
  return null;
}

function overloadedError(lastError) {
  const error = httpError(503, OVERLOADED_MESSAGE, 'AI_OVERLOADED');
  error.providerStatus = lastError?.providerStatus ?? null;
  error.cause = lastError?.code || null;
  return error;
}

async function singleCall(body, budget) {
  const key = apiKey();
  if (!key) throw httpError(503, 'Gemini API is not configured.', 'AI_NOT_CONFIGURED');
  budget.calls += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budget.callTimeoutMs());
  let response;
  try {
    response = await deps.fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = httpError(504, 'انتهت مهلة مزود الذكاء الاصطناعي.', 'AI_TIMEOUT');
      timeoutError.retryable = false;
      throw timeoutError;
    }
    const connectionError = httpError(502, 'تعذر الاتصال بمزود الذكاء الاصطناعي.', 'AI_CONNECTION_FAILED');
    connectionError.retryable = true;
    throw connectionError;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  budget.lastProviderStatus = response.status;
  if (!response.ok) {
    // لا نسجل رسالة المزود الخام؛ قد تتضمن تفاصيل لا حاجة لها. الحالة والرمز فقط.
    console.error('[provider]', JSON.stringify({
      status: response.status,
      code: String(payload?.error?.status || 'AI_PROVIDER_ERROR').slice(0, 80)
    }));
    let error;
    if (response.status === 429) {
      error = httpError(429, 'الخدمة مشغولة حاليًا. حاول بعد دقيقة.', 'AI_RATE_LIMITED');
      error.retryable = false;
      error.retryAfter = parseRetryAfter(response.headers?.get?.('retry-after'));
    } else {
      error = httpError(502, 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.', 'AI_PROVIDER_ERROR');
      error.retryable = RETRYABLE_STATUSES.has(response.status);
    }
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

// bodyForModel(model) يبني جسم الطلب؛ تُعاد المحاولة تسلسليًا (لا توازي ولا hedging).
export async function callWithRetry(bodyForModel, { budget, primaryModel, fallbackModel = null }) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_PRIMARY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await deps.sleep(jitteredDelay(RETRY_DELAYS_MS[attempt - 1]));
    if (!budget.canStart()) throw overloadedError(lastError);
    try {
      return { payload: await singleCall(bodyForModel(primaryModel), budget), model: primaryModel, fallbackUsed: false };
    } catch (error) {
      if (!error?.retryable) throw error;
      lastError = error;
    }
  }
  if (fallbackModel && fallbackModel !== primaryModel && budget.canStart()) {
    budget.fallbackUsed = true;
    try {
      return { payload: await singleCall(bodyForModel(fallbackModel), budget), model: fallbackModel, fallbackUsed: true };
    } catch (error) {
      if (!error?.retryable) throw error;
      lastError = error;
    }
  }
  throw overloadedError(lastError);
}

// الشكل الموثق لاستجابة Interactions API (REST):
// { status: 'completed', usage: { total_input_tokens, total_output_tokens, total_thought_tokens? },
//   steps: [ { type: 'thought' }, { type: 'model_output', content: [ { type: 'text', text } ] } ] }
function outputText(payload) {
  if (payload?.status != null && payload.status !== 'completed') {
    console.error('[provider]', 'interaction status', payload.status);
    throw httpError(502, 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.', 'AI_PROVIDER_ERROR');
  }
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();

  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const text = steps
    .filter(step => step?.type === 'model_output' && Array.isArray(step.content))
    .flatMap(step => step.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text))
    .join('\n')
    .trim();
  if (text) return text;
  throw httpError(502, 'عاد المزود باستجابة فارغة.', 'AI_EMPTY_RESPONSE');
}

function usage(payload) {
  const source = payload?.usage || {};
  return {
    input_tokens: Number(source.total_input_tokens) || 0,
    output_tokens: Number(source.total_output_tokens) || 0,
    thought_tokens: Number(source.total_thought_tokens) || 0
  };
}

// المخرجات المنظمة قد تأتي بمسافات أو أسطر زائدة حول JSON؛ نقتطع قبل أول { وبعد آخر } فقط.
function extractJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

export async function complete(prompt, schema, options = {}) {
  const budget = options.budget || createBudget({ maxCalls: MAX_PRIMARY_ATTEMPTS + 1 });
  const primaryModel = modelId(options.model);
  const { payload, model } = await callWithRetry(candidate => ({
    model: candidate,
    input: prompt,
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema
    }
  }), { budget, primaryModel, fallbackModel: options.model ? null : fallbackModelId('evaluation') });
  const text = outputText(payload);
  let data;
  try {
    data = JSON.parse(extractJsonObject(text));
  } catch {
    throw httpError(502, 'مخرجات التقييم ليست JSON صالحًا.', 'AI_INVALID_JSON');
  }
  return { data, usage: usage(payload), model };
}

export async function transcribe(audio, mime, options = {}) {
  const normalizedMime = String(mime || '').toLowerCase().split(';')[0].trim();
  const providerMime = ({
    'audio/mp4': 'audio/m4a',
    'audio/x-m4a': 'audio/m4a',
    'audio/webm;codecs=opus': 'audio/webm'
  })[mime] || ({
    'audio/mp4': 'audio/m4a',
    'audio/x-m4a': 'audio/m4a'
  })[normalizedMime] || normalizedMime;
  const budget = options.budget || createBudget({ maxCalls: MAX_PRIMARY_ATTEMPTS + 1 });
  const audioBase64 = audio.toString('base64');
  const { payload, model } = await callWithRetry(candidate => ({
    model: candidate,
    store: false,
    input: [
      {
        type: 'text',
        text: 'فرّغ الكلام العربي حرفيًا فقط. احتفظ باللهجة والكلمات الإنجليزية كما نُطقت. لا تصحح اللغة، لا تلخص، لا تضف ولا تكمل. ضع [غير واضح] لأي مقطع غير مفهوم. أخرج نص التفريغ فقط دون مقدمة أو ملاحظات.'
      },
      { type: 'audio', data: audioBase64, mime_type: providerMime }
    ]
  }), { budget, primaryModel: modelId(null, 'transcription'), fallbackModel: fallbackModelId('transcription') });
  return { transcript: outputText(payload), usage: usage(payload), model };
}
