import { httpError } from './http.js';

const INTERACTIONS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const DEFAULT_MODEL = 'gemini-3.8-flash';
// يسمح بمحاولتين داخل حد وظيفة Vercel البالغ 60 ثانية مع هامش للتحقق والاستجابة.
const REQUEST_TIMEOUT_MS = 28_000;

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

async function callInteractions(body) {
  const key = apiKey();
  if (!key) throw httpError(503, 'Gemini API is not configured.', 'AI_NOT_CONFIGURED');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError(504, 'انتهت مهلة مزود الذكاء الاصطناعي.', 'AI_TIMEOUT');
    throw httpError(502, 'تعذر الاتصال بمزود الذكاء الاصطناعي.', 'AI_CONNECTION_FAILED');
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // تفاصيل المزود تذهب إلى سجل الخادم فقط؛ العميل يرى رسالة عربية ثابتة.
    console.error('[provider]', response.status, payload?.error?.status || '', payload?.error?.message || `HTTP ${response.status}`);
    const error = response.status === 429
      ? httpError(429, 'الخدمة مشغولة حاليًا. حاول بعد دقيقة.', 'AI_RATE_LIMITED')
      : httpError(502, 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.', 'AI_PROVIDER_ERROR');
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
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
  const payload = await callInteractions({
    model: modelId(options.model),
    input: prompt,
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema
    }
  });
  const text = outputText(payload);
  let data;
  try {
    data = JSON.parse(extractJsonObject(text));
  } catch {
    throw httpError(502, 'مخرجات التقييم ليست JSON صالحًا.', 'AI_INVALID_JSON');
  }
  return { data, usage: usage(payload), model: modelId(options.model) };
}

export async function transcribe(audio, mime) {
  const normalizedMime = String(mime || '').toLowerCase().split(';')[0].trim();
  const providerMime = ({
    'audio/mp4': 'audio/m4a',
    'audio/x-m4a': 'audio/m4a',
    'audio/webm;codecs=opus': 'audio/webm'
  })[mime] || ({
    'audio/mp4': 'audio/m4a',
    'audio/x-m4a': 'audio/m4a'
  })[normalizedMime] || normalizedMime;
  const payload = await callInteractions({
    model: modelId(null, 'transcription'),
    store: false,
    input: [
      {
        type: 'text',
        text: 'فرّغ الكلام العربي حرفيًا فقط. احتفظ باللهجة والكلمات الإنجليزية كما نُطقت. لا تصحح اللغة، لا تلخص، لا تضف ولا تكمل. ضع [غير واضح] لأي مقطع غير مفهوم. أخرج نص التفريغ فقط دون مقدمة أو ملاحظات.'
      },
      { type: 'audio', data: audio.toString('base64'), mime_type: providerMime }
    ]
  });
  return { transcript: outputText(payload), usage: usage(payload), model: modelId(null, 'transcription') };
}
