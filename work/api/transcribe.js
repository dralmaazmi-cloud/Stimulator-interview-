import { clientKey, handleApiError, httpError, methodAllowed, readBuffer, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { transcribe } from './_lib/provider.js';
import { recordUsage } from './_lib/usage.js';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
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
  try {
    enforceRateLimit(`transcribe:${clientKey(req)}`, { limit: 30, windowMs: 60 * 60 * 1000 });
    const rawMime = String(req.headers['content-type'] || '').toLowerCase();
    const mime = rawMime.split(';')[0].trim();
    const duration = Number(req.headers['x-audio-duration'] || 0);
    const contentLength = Number(req.headers['content-length'] || 0);
    if (!ALLOWED_MIME.has(mime)) throw httpError(415, 'صيغة التسجيل غير مدعومة.');
    if (!Number.isFinite(duration) || duration <= 0) throw httpError(400, 'مدة التسجيل مطلوبة.');
    if (duration > 120) throw httpError(413, 'مدة التسجيل تتجاوز 120 ثانية.');
    if (contentLength > MAX_AUDIO_BYTES) throw httpError(413, 'حجم التسجيل يتجاوز 4 MB.');
    audio = await readBuffer(req, MAX_AUDIO_BYTES);
    if (audio.length < 100) throw httpError(400, 'التسجيل فارغ أو غير مكتمل.');
    if (!matchesAudioSignature(mime, audio)) throw httpError(415, 'صيغة التسجيل غير مدعومة.');

    const result = await transcribe(audio, mime);
    const transcript = String(result.transcript || '').trim();
    if (!transcript) throw httpError(502, 'تعذر استخراج نص من التسجيل.', 'AI_EMPTY_TRANSCRIPT');
    recordUsage({ type: 'transcribe', duration_ms: Date.now() - started, ...result.usage, validation: 'passed', success: true });
    sendJson(res, 200, {
      transcript,
      duration_seconds: duration || null,
      word_count: transcript.split(/\s+/).filter(Boolean).length
    });
  } catch (error) {
    recordUsage({ type: 'transcribe', duration_ms: Date.now() - started, validation: error?.code || 'failed', success: false });
    handleApiError(res, error);
  } finally {
    if (Buffer.isBuffer(audio)) audio.fill(0);
  }
}
