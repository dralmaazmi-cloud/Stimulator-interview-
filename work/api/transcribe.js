import { handleApiError, httpError, methodAllowed, rateLimitScopes, readBuffer, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { createBudget, transcribe, callSummary } from './_lib/provider.js';
import { recordUsage } from './_lib/usage.js';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
// alpha-4 (C2): نطاق واسع موثق لحجم البايتات لكل ثانية وفق MIME؛ يُرفض المتطرف بوضوح فقط
// (تسجيل صامت شبه فارغ، أو ملف أكبر بكثير من أي ترميز صوتي معقول لمدة التسجيل).
const BYTES_PER_SECOND_RANGE = Object.freeze({
  'audio/webm': { min: 100, max: 64 * 1024 },
  'audio/mp4': { min: 100, max: 96 * 1024 },
  'audio/m4a': { min: 100, max: 96 * 1024 },
  'audio/x-m4a': { min: 100, max: 96 * 1024 },
  'audio/mpeg': { min: 100, max: 64 * 1024 },
  'audio/wav': { min: 100, max: 400 * 1024 }
});

export function plausibleSizeForDuration(mime, bytes, durationSeconds) {
  const range = BYTES_PER_SECOND_RANGE[mime];
  if (!range || !(durationSeconds > 0)) return true;
  const perSecond = bytes / durationSeconds;
  return perSecond >= range.min && perSecond <= range.max;
}
const ALLOWED_MIME = new Set(['audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg', 'audio/wav']);

// البند 14: فحص الترويسة الثنائية؛ لا نثق بترويسة Content-Type وحدها.
function matchesAudioSignature(mime, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return false;
  if (mime === 'audio/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (mime === 'audio/mp4' || mime === 'audio/m4a' || mime === 'audio/x-m4a') return bytes.subarray(4, 8).toString('latin1') === 'ftyp';
  if (mime === 'audio/mpeg') return (bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) || bytes.subarray(0, 3).toString('latin1') === 'ID3';
  if (mime === 'audio/wav') return bytes.subarray(0, 4).toString('latin1') === 'RIFF';
  return false;
}

export default async function handler(req, res) {
  const started = Date.now();
  if (!methodAllowed(req, res, ['POST'])) return;
  let audio;
  // ميزانية واحدة: 50 ثانية من بداية المعالج وأربعة نداءات كحد أقصى (ثلاثة أساسية + احتياطي واحد).
  const budget = createBudget({ startedAt: started, maxCalls: 4 });
  try {
    const scopes = rateLimitScopes(req, 'transcribe');
    enforceRateLimit(scopes.ip.key, { limit: scopes.ip.limit, windowMs: 60 * 60 * 1000 });
    enforceRateLimit(scopes.client.key, { limit: 30, windowMs: 60 * 60 * 1000 });
    const rawMime = String(req.headers['content-type'] || '').toLowerCase();
    const mime = rawMime.split(';')[0].trim();
    const duration = Number(req.headers['x-audio-duration'] || 0);
    const contentLength = Number(req.headers['content-length'] || 0);
    if (!ALLOWED_MIME.has(mime)) throw httpError(415, 'صيغة التسجيل غير مدعومة.');
    if (!Number.isFinite(duration) || duration <= 0) throw httpError(400, 'التسجيل قصير جدًا. سجّل ثانية واحدة على الأقل.');
    if (duration > 120) throw httpError(413, 'مدة التسجيل تتجاوز 120 ثانية.');
    if (contentLength > MAX_AUDIO_BYTES) throw httpError(413, 'حجم التسجيل يتجاوز 4 MB.');
    audio = await readBuffer(req, MAX_AUDIO_BYTES);
    if (audio.length < 100) throw httpError(400, 'التسجيل فارغ أو غير مكتمل.');
    if (!matchesAudioSignature(mime, audio)) throw httpError(415, 'صيغة التسجيل غير مدعومة.');
    if (!plausibleSizeForDuration(mime, audio.length, duration)) throw httpError(400, 'حجم التسجيل لا يتناسب مع مدته المذكورة. أعد التسجيل ثم أرسله مرة أخرى.');

    const result = await transcribe(audio, mime, { budget });
    const transcript = String(result.transcript || '').trim();
    if (!transcript) throw httpError(502, 'تعذر استخراج نص من التسجيل.', 'AI_EMPTY_TRANSCRIPT');
    recordUsage({ type: 'transcribe', duration_ms: Date.now() - started, ...result.usage, provider_call_count: budget.calls, ...callSummary(budget), fallback_used: budget.fallbackUsed, final_provider_status: budget.lastProviderStatus, validation: 'passed', success: true });
    sendJson(res, 200, {
      transcript,
      duration_seconds: duration || null,
      word_count: transcript.split(/\s+/).filter(Boolean).length
    });
  } catch (error) {
    recordUsage({ type: 'transcribe', duration_ms: Date.now() - started, provider_call_count: budget.calls, ...callSummary(budget), fallback_used: budget.fallbackUsed, final_provider_status: error?.providerStatus ?? budget.lastProviderStatus, error_code: error?.code || 'failed', validation: error?.code || 'failed', success: false });
    handleApiError(res, error);
  } finally {
    if (Buffer.isBuffer(audio)) audio.fill(0);
  }
}
