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

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
  const slowTimer = typeof options.onSlow === 'function' ? setTimeout(() => { try { options.onSlow(SLOW_NOTICE_TEXT); } catch { /* ignore */ } }, SLOW_NOTICE_MS) : null;
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
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 504 من الخادم (AI_TIMEOUT) أو من المنصة نفسها: رسالة ثابتة تؤكد أن الإجابة محفوظة ويمكن إعادة الإرسال.
      const timedOut = response.status === 504 || payload.code === 'AI_TIMEOUT';
      const error = new Error(timedOut ? TIMEOUT_MESSAGE : (payload.error || 'تعذّر إكمال الطلب.'));
      error.status = response.status;
      error.code = timedOut ? 'AI_TIMEOUT' : (payload.code || '');
      if (Number.isFinite(Number(payload.retry_after)) && Number(payload.retry_after) > 0) error.retryAfter = Number(payload.retry_after);
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error(TIMEOUT_MESSAGE), { code: 'AI_TIMEOUT', status: 504 });
    if (error instanceof TypeError) throw new Error('تعذّر الاتصال بالخدمة. تحقق من الإنترنت ثم أعد المحاولة.');
    throw error;
  } finally {
    clearTimeout(timeout);
    if (slowTimer) clearTimeout(slowTimer);
  }
}

export async function getAiHealth() {
  return apiRequest('/health', { timeout: 12_000 });
}

export async function evaluateWithAi(payload, options = {}) {
  return apiRequest('/evaluate', { method: 'POST', body: payload, timeout: LONG_TIMEOUT, onSlow: options.onSlow });
}

export async function transcribeWithAi(blob, durationSeconds, options = {}) {
  return apiRequest('/transcribe', {
    method: 'POST',
    body: blob,
    timeout: LONG_TIMEOUT,
    onSlow: options.onSlow,
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      'X-Audio-Duration': Math.max(0, Number(durationSeconds) || 0).toFixed(2)
    }
  });
}

// alpha-5 (الخطوة 5): طلب «مثال مكتمل على غرار موقفك» بطلب المتدرب فقط.
export async function requestWorkedExample(payload, options = {}) {
  return apiRequest('/example', { method: 'POST', body: payload, timeout: LONG_TIMEOUT, onSlow: options.onSlow });
}

export async function improveSelfIntroduction(payload) {
  return apiRequest('/self-intro', { method: 'POST', body: payload, timeout: LONG_TIMEOUT });
}
