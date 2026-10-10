const API_BASE = '/api';
const DEFAULT_TIMEOUT = 45_000;
// fix/evaluate-timeout: مهلة الواجهة أطول من أقصى مدة للدالة على الخادم (maxDuration = 120 ثانية) بخمس ثوانٍ،
// كي لا تقطع الواجهة طلبًا ما زال الخادم يعالجه. التنبيه «ما زلنا نحاول الاتصال…» بعد 8 ثوانٍ كما هو.
export const SERVER_MAX_DURATION_MS = 120_000;
export const LONG_TIMEOUT = SERVER_MAX_DURATION_MS + 5_000;
export const TIMEOUT_MESSAGE = 'استغرق الطلب وقتًا أطول من المعتاد. إجابتك محفوظة، ويمكنك إعادة الإرسال.';
export const SLOW_NOTICE_MS = 8_000;
export const SLOW_NOTICE_TEXT = 'ما زلنا نحاول الاتصال…';

function clientId() {
  const key = 'lic:client-id';
  let value = localStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// v2 (AI audit): مراحل انتظار منظمة، زمن منقضٍ، إعادة محاولة محدودة، ورسائل عربية لكل رمز خطأ.
// واجهة الانتظار (يستعملها المستدعي عبر options): onPhase({phase, label, elapsedMs}), onProgress({phase, label, elapsedMs,
// expectedMs, overrun}) كل ثانية، onSlow(text) كما كان، signal (AbortSignal للإلغاء من المستخدم).
// ---------------------------------------------------------------------------
export const PHASES = Object.freeze({
  uploading: { id: 'uploading', label: 'جارٍ رفع التسجيل…' },
  transcribing: { id: 'transcribing', label: 'جارٍ تحويل الصوت إلى نص…' },
  sending: { id: 'sending', label: 'جارٍ إرسال إجابتك…' },
  evaluating: { id: 'evaluating', label: 'جارٍ تحليل الإجابة…' },
  validating: { id: 'validating', label: 'جارٍ التحقق من النتيجة…' },
  retrying: { id: 'retrying', label: 'انقطع الاتصال، نعيد المحاولة…' },
  done: { id: 'done', label: 'اكتمل.' }
});
// أزمنة متوقعة (من سجلات الإنتاج: التقييم 14-47 ثانية، التفريغ 8-16 ثانية، المثال ~18 ثانية).
export const EXPECTED_MS = Object.freeze({ evaluate: 30_000, transcribe: 15_000, example: 25_000, 'self-intro': 15_000, health: 2_000 });
export const NETWORK_RETRY_DELAYS_MS = Object.freeze([1_500]);
export const CLIENT_RETRY_JITTER = 0.25;

export const ERROR_MESSAGES = Object.freeze({
  AI_TIMEOUT: TIMEOUT_MESSAGE,
  AI_OVERLOADED: 'خدمة الذكاء الاصطناعي مزدحمة الآن. إجابتك محفوظة؛ أعد الإرسال بعد دقيقة.',
  AI_RATE_LIMITED: 'الخدمة مشغولة حاليًا. حاول بعد دقيقة.',
  RATE_LIMITED: 'تم بلوغ الحد المؤقت للطلبات. حاول لاحقًا.',
  AI_PROVIDER_ERROR: 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.',
  AI_CONNECTION_FAILED: 'تعذّر الاتصال بمزود الذكاء الاصطناعي. حاول مرة أخرى بعد قليل.',
  AI_NOT_CONFIGURED: 'خدمة المحاكاة غير متاحة حاليًا. حاول مرة أخرى لاحقًا.',
  AI_INVALID_JSON: 'لم يصلنا تقييم مكتمل هذه المرة. أعد الإرسال؛ إجابتك محفوظة.',
  AI_SCHEMA_FAILED: 'لم يصلنا تقييم مكتمل هذه المرة. أعد الإرسال؛ إجابتك محفوظة.',
  AI_EVIDENCE_FAILED: 'تعذّر التحقق من اقتباسات التقييم هذه المرة. أعد الإرسال؛ إجابتك محفوظة.',
  AI_EMPTY_RESPONSE: 'عاد المزود باستجابة فارغة. أعد المحاولة.',
  AI_EMPTY_TRANSCRIPT: 'لم نتمكن من استخراج كلام واضح من التسجيل. تأكد من الميكروفون وأعد التسجيل.',
  SELF_INTRO_VALIDATION_FAILED: 'لم يجتز النص المحسّن فحص الحفاظ على المعلومات. جرّب مرة أخرى.',
  NETWORK: 'تعذّر الاتصال بالخدمة. تحقق من الإنترنت ثم أعد المحاولة.',
  ABORTED: 'أُلغي الطلب.'
});

function userMessageFor(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || 'تعذّر إكمال الطلب.';
}

function clientRetryDelay(index, random = Math.random) {
  const base = NETWORK_RETRY_DELAYS_MS[Math.min(index, NETWORK_RETRY_DELAYS_MS.length - 1)];
  return Math.round(base * (1 + (random() * 2 - 1) * CLIENT_RETRY_JITTER));
}

const wait = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(timer); reject(Object.assign(new Error(ERROR_MESSAGES.ABORTED), { code: 'ABORTED' })); }, { once: true });
});

async function attemptRequest(path, options, controllerHolder) {
  const controller = new AbortController();
  controllerHolder.current = controller;
  const timeout = setTimeout(() => { controllerHolder.timedOut = true; controller.abort(); }, options.timeout || DEFAULT_TIMEOUT);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener?.('abort', onExternalAbort, { once: true });
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        'X-Client-Id': clientId(),
        ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      body: options.body instanceof Blob ? options.body : options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: controller.signal
    });
    options.onResponseHeaders?.();
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 504 من الخادم (AI_TIMEOUT) أو من المنصة نفسها: رسالة ثابتة تؤكد أن الإجابة محفوظة ويمكن إعادة الإرسال.
      const timedOut = response.status === 504 || payload.code === 'AI_TIMEOUT';
      const code = timedOut ? 'AI_TIMEOUT' : (payload.code || '');
      const error = new Error(timedOut ? TIMEOUT_MESSAGE : userMessageFor(code, payload.error));
      error.status = response.status;
      error.code = code;
      if (Number.isFinite(Number(payload.retry_after)) && Number(payload.retry_after) > 0) error.retryAfter = Number(payload.retry_after);
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener?.('abort', onExternalAbort);
  }
}

async function apiRequest(path, options = {}) {
  const startedAt = Date.now();
  const expectedMs = options.expectedMs || EXPECTED_MS[path.slice(1)] || 20_000;
  const holder = { current: null, timedOut: false };
  let phase = options.phases?.[0] || PHASES.sending;
  const emitPhase = next => {
    phase = next;
    try { options.onPhase?.({ phase: next.id, label: next.label, elapsedMs: Date.now() - startedAt }); } catch { /* ignore UI errors */ }
  };
  const slowTimer = typeof options.onSlow === 'function' ? setTimeout(() => { try { options.onSlow(SLOW_NOTICE_TEXT); } catch { /* ignore */ } }, SLOW_NOTICE_MS) : null;
  const tick = typeof options.onProgress === 'function' ? setInterval(() => {
    const elapsedMs = Date.now() - startedAt;
    try { options.onProgress({ phase: phase.id, label: phase.label, elapsedMs, expectedMs, overrun: elapsedMs > expectedMs }); } catch { /* ignore */ }
  }, 1_000) : null;
  const phaseTimers = (options.phases || []).slice(1).map((next, index) => setTimeout(() => emitPhase(next), (options.phaseDelaysMs || [])[index] ?? 1_500));
  emitPhase(phase);
  const retries = options.retries ?? 1;
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const payload = await attemptRequest(path, { ...options, onResponseHeaders: () => { phaseTimers.forEach(clearTimeout); emitPhase(PHASES.validating); } }, holder);
        emitPhase(PHASES.done);
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          if (holder.timedOut) throw Object.assign(new Error(TIMEOUT_MESSAGE), { code: 'AI_TIMEOUT', status: 504 });
          throw Object.assign(new Error(ERROR_MESSAGES.ABORTED), { code: 'ABORTED' });
        }
        if (error instanceof TypeError) {
          // لا استجابة وصلت (انقطاع شبكة): إعادة واحدة فقط، وللطلبات التي لا أثر جانبي لها على حالة المستخدم.
          if (attempt < retries && !options.signal?.aborted) {
            emitPhase(PHASES.retrying);
            await wait(clientRetryDelay(attempt), options.signal);
            phaseTimers.forEach(clearTimeout);
            emitPhase(options.phases?.[0] || PHASES.sending);
            continue;
          }
          throw Object.assign(new Error(ERROR_MESSAGES.NETWORK), { code: 'NETWORK' });
        }
        throw error;
      }
    }
  } finally {
    phaseTimers.forEach(clearTimeout);
    if (slowTimer) clearTimeout(slowTimer);
    if (tick) clearInterval(tick);
  }
}

function waitingOptions(options) {
  return { onSlow: options.onSlow, onPhase: options.onPhase, onProgress: options.onProgress, signal: options.signal, retries: options.retries };
}

export async function getAiHealth() {
  return apiRequest('/health', { timeout: 12_000 });
}

export async function evaluateWithAi(payload, options = {}) {
  return apiRequest('/evaluate', { method: 'POST', body: payload, timeout: LONG_TIMEOUT, ...waitingOptions(options), phases: [PHASES.sending, PHASES.evaluating], phaseDelaysMs: [800] });
}

export async function transcribeWithAi(blob, durationSeconds, options = {}) {
  return apiRequest('/transcribe', {
    method: 'POST',
    body: blob,
    timeout: LONG_TIMEOUT,
    ...waitingOptions(options),
    phases: [PHASES.uploading, PHASES.transcribing],
    // تقدير: fetch لا يكشف نهاية الرفع؛ نفترض ~150 KB/s كحد أدنى لثانية ونصف.
    phaseDelaysMs: [Math.max(1_500, Math.round((blob.size || 0) / 150) )],
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      'X-Audio-Duration': Math.max(0, Number(durationSeconds) || 0).toFixed(2)
    }
  });
}

// alpha-5 (الخطوة 5): طلب «مثال مكتمل على غرار موقفك» بطلب المتدرب فقط.
export async function requestWorkedExample(payload, options = {}) {
  return apiRequest('/example', { method: 'POST', body: payload, timeout: LONG_TIMEOUT, ...waitingOptions(options), phases: [PHASES.sending, PHASES.evaluating], phaseDelaysMs: [800] });
}

export async function improveSelfIntroduction(payload, options = {}) {
  return apiRequest('/self-intro', { method: 'POST', body: payload, timeout: LONG_TIMEOUT, ...waitingOptions(options), phases: [PHASES.sending, PHASES.evaluating], phaseDelaysMs: [800] });
}
