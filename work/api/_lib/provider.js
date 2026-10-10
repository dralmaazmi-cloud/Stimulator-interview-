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
// deadline بعد 110 ثوانٍ من بداية المعالج (maxDuration = 120 في vercel.json)، وسقف نداءات إجمالي،
// ومهلة لكل نداء 75 ثانية كحد أقصى.
// الساعة وsleep وrandom وfetch قابلة للحقن للاختبارات.
// ---------------------------------------------------------------------------
export const RETRY_DELAYS_MS = Object.freeze([1500, 4000]);
export const RETRY_JITTER = 0.25;
export const MAX_PRIMARY_ATTEMPTS = 3;
// fix/evaluate-timeout: كان 28 ثانية/50 ثانية فانقطع تقييم evaluation-1.3 الطويل بـAI_TIMEOUT.
export const MAX_CALL_TIMEOUT_MS = 75_000;
export const MIN_REMAINING_TO_START_MS = 5_000;
export const HANDLER_BUDGET_MS = 110_000;
// بعد انتهاء مهلة النموذج الأساسي لا يُجرَّب الاحتياطي إلا إن بقي من الميزانية ما يكفي لنداء مفيد.
export const MIN_REMAINING_FOR_TIMEOUT_FALLBACK_MS = 20_000;
// مستوى التفكير لنداءات التقييم (Interactions API: generation_config.thinking_level).
// القيم المدعومة في نوع ThinkingLevel الرسمي: minimal | low | medium | high. «off» يحذف الحقل.
export const THINKING_LEVELS = Object.freeze(['minimal', 'low', 'medium', 'high']);
export const DEFAULT_EVALUATION_THINKING_LEVEL = 'low';
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

export function evaluationThinkingLevel() {
  const configured = String(process.env.GEMINI_EVALUATION_THINKING_LEVEL || '').trim().toLowerCase();
  if (configured === 'off') return null;
  return THINKING_LEVELS.includes(configured) ? configured : DEFAULT_EVALUATION_THINKING_LEVEL;
}

// سقف رموز المخرجات وتفكير التفريغ: اختياريان عبر البيئة ومعطّلان افتراضيًا (لا تغيير في جسم الطلب).
// تحذير: لم يُتحقق من قبول generation_config.max_output_tokens في Interactions API من الوثائق الرسمية
// (تعذّر الوصول إلى ai.google.dev أثناء التدقيق)؛ فعّله في معاينة واختبر قبل الإنتاج.
function positiveInt(value, min, max) {
  const number = Math.floor(Number(String(value || '').trim()));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function evaluationMaxOutputTokens() {
  return positiveInt(process.env.GEMINI_EVALUATION_MAX_OUTPUT_TOKENS, 512, 65_536);
}

export function transcriptionMaxOutputTokens() {
  return positiveInt(process.env.GEMINI_TRANSCRIBE_MAX_OUTPUT_TOKENS, 256, 65_536);
}

export function transcriptionThinkingLevel() {
  const configured = String(process.env.GEMINI_TRANSCRIBE_THINKING_LEVEL || '').trim().toLowerCase();
  return THINKING_LEVELS.includes(configured) ? configured : null;
}

function generationConfig({ thinkingLevel, maxOutputTokens }) {
  const config = {
    ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
    ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {})
  };
  return Object.keys(config).length ? { generation_config: config } : {};
}

// ملخص آمن لنداءات المزود (نماذج وحالات وأزمنة فقط، لا نصوص) للتشخيص في سجل الاستعمال.
export function callSummary(budget) {
  const calls = Array.isArray(budget?.callLog) ? budget.callLog : [];
  return {
    provider_ms: calls.reduce((sum, call) => sum + (call.ms || 0), 0),
    calls: calls.map(call => ({ model: call.model, status: call.status, ms: call.ms, outcome: call.outcome }))
  };
}

export function createBudget(options = {}) {
  const startedAt = Number.isFinite(options.startedAt) ? options.startedAt : deps.now();
  const totalMs = Number.isFinite(options.totalMs) ? options.totalMs : HANDLER_BUDGET_MS;
  return {
    startedAt,
    deadline: startedAt + totalMs,
    maxCalls: Number.isFinite(options.maxCalls) ? options.maxCalls : 4,
    calls: 0,
    callLog: [],
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
  const callStartedAt = deps.now();
  const logCall = (status, outcome) => budget.callLog.push({ model: String(body?.model || '').slice(0, 60), status, ms: Math.max(0, deps.now() - callStartedAt), outcome });
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
      logCall(null, 'timeout');
      const timeoutError = httpError(504, 'انتهت مهلة مزود الذكاء الاصطناعي.', 'AI_TIMEOUT');
      timeoutError.retryable = false;
      throw timeoutError;
    }
    logCall(null, 'network');
    const connectionError = httpError(502, 'تعذر الاتصال بمزود الذكاء الاصطناعي.', 'AI_CONNECTION_FAILED');
    connectionError.retryable = true;
    throw connectionError;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  budget.lastProviderStatus = response.status;
  logCall(response.status, response.ok ? 'ok' : 'error');
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
export async function callWithRetry(bodyForModel, { budget, primaryModel, fallbackModel = null, fallbackOnTimeout = false }) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_PRIMARY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await deps.sleep(jitteredDelay(RETRY_DELAYS_MS[attempt - 1]));
    if (!budget.canStart()) throw overloadedError(lastError);
    try {
      return { payload: await singleCall(bodyForModel(primaryModel), budget), model: primaryModel, fallbackUsed: false };
    } catch (error) {
      // alpha-5 (R6): عند 429 لا تُعاد المحاولة على النموذج نفسه، بل يُجرَّب الاحتياطي مرة واحدة إن كان معرّفًا ومختلفًا.
      if (error?.code === 'AI_RATE_LIMITED') {
        if (fallbackModel && fallbackModel !== primaryModel && budget.canStart()) {
          budget.fallbackUsed = true;
          try {
            return { payload: await singleCall(bodyForModel(fallbackModel), budget), model: fallbackModel, fallbackUsed: true };
          } catch (fallbackError) {
            if (fallbackError?.code === 'AI_RATE_LIMITED') {
              fallbackError.retryAfter = Math.max(Number(error.retryAfter) || 0, Number(fallbackError.retryAfter) || 0) || undefined;
              throw fallbackError;
            }
            if (!fallbackError?.retryable) throw fallbackError;
            throw error;
          }
        }
        throw error;
      }
      // fix/evaluate-timeout: انتهاء مهلة الأساسي لا يُعاد على النموذج نفسه؛ يُجرَّب الاحتياطي مرة واحدة
      // إن طلبه المستدعي وكان معرّفًا ومختلفًا وبقي وقت كافٍ. إن فشل الاحتياطي يُعاد خطأ المهلة الأصلي.
      if (error?.code === 'AI_TIMEOUT') {
        if (fallbackOnTimeout && fallbackModel && fallbackModel !== primaryModel
          && budget.canStart() && budget.remainingMs() >= MIN_REMAINING_FOR_TIMEOUT_FALLBACK_MS) {
          budget.fallbackUsed = true;
          try {
            return { payload: await singleCall(bodyForModel(fallbackModel), budget), model: fallbackModel, fallbackUsed: true };
          } catch (fallbackError) {
            if (fallbackError?.code === 'AI_TIMEOUT' || fallbackError?.retryable) throw error;
            throw fallbackError;
          }
        }
        throw error;
      }
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

// options.thinkingLevel: يضيف generation_config.thinking_level (Interactions API) — يمرّره التقييم فقط.
// options.fallbackOnTimeout: يسمح بتجربة النموذج الاحتياطي مرة واحدة بعد انتهاء مهلة الأساسي — التقييم فقط.
export async function complete(prompt, schema, options = {}) {
  const budget = options.budget || createBudget({ maxCalls: MAX_PRIMARY_ATTEMPTS + 1 });
  const primaryModel = modelId(options.model);
  const thinkingLevel = THINKING_LEVELS.includes(options.thinkingLevel) ? options.thinkingLevel : null;
  const maxOutputTokens = positiveInt(options.maxOutputTokens, 512, 65_536);
  const { payload, model } = await callWithRetry(candidate => ({
    model: candidate,
    input: prompt,
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema
    },
    ...generationConfig({ thinkingLevel, maxOutputTokens })
  }), {
    budget,
    primaryModel,
    fallbackModel: options.model ? null : fallbackModelId('evaluation'),
    fallbackOnTimeout: options.fallbackOnTimeout === true
  });
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
    ],
    ...generationConfig({ thinkingLevel: transcriptionThinkingLevel(), maxOutputTokens: transcriptionMaxOutputTokens() })
  }), { budget, primaryModel: modelId(null, 'transcription'), fallbackModel: fallbackModelId('transcription') });
  return { transcript: outputText(payload), usage: usage(payload), model };
}
