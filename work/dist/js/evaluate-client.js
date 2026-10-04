const API_BASE = '/api';
const DEFAULT_TIMEOUT = 45_000;

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
      const error = new Error(payload.error || 'تعذّر إكمال الطلب.');
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('استغرق الطلب وقتًا أطول من المتوقع. حاول مرة أخرى.');
    if (error instanceof TypeError) throw new Error('تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAiHealth() {
  return apiRequest('/health', { timeout: 12_000 });
}

export async function evaluateWithAi(payload) {
  return apiRequest('/evaluate', { method: 'POST', body: payload, timeout: 60_000 });
}

export async function transcribeWithAi(blob, durationSeconds) {
  return apiRequest('/transcribe', {
    method: 'POST',
    body: blob,
    timeout: 60_000,
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      'X-Audio-Duration': String(Math.max(0, Math.round(durationSeconds || 0)))
    }
  });
}

export async function improveSelfIntroduction(payload) {
  return apiRequest('/self-intro', { method: 'POST', body: payload });
}
