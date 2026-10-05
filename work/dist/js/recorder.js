const MAX_SECONDS = 120;
const MAX_BYTES = 4 * 1024 * 1024;
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/mpeg'
];

export function supportedRecordingMime() {
  if (!globalThis.MediaRecorder) return '';
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
}

export function recordingSupported() {
  return Boolean(globalThis.MediaRecorder && navigator.mediaDevices?.getUserMedia && supportedRecordingMime());
}

// alpha-4 (C1): المدة تُحسب من ساعة monotonic محلية (performance.now) لا من ساعة الحائط.
const monotonicNow = () => (globalThis.performance?.now ? performance.now() : Date.now());

export class AudioRecorder {
  constructor(options = {}) {
    this.onTick = options.onTick || (() => {});
    this.onState = options.onState || (() => {});
    this.onLimit = options.onLimit || (() => {});
    this.maximumSeconds = Math.min(MAX_SECONDS, Number(options.maximumSeconds) || MAX_SECONDS);
    this.maximumBytes = Math.min(MAX_BYTES, Number(options.maximumBytes) || MAX_BYTES);
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.bytes = 0;
    this.startedAt = 0;
    this.timer = null;
    this.stopPromise = null;
    this.stopResolve = null;
    this.limitReason = '';
  }

  async start() {
    if (!recordingSupported()) throw new Error('التسجيل الصوتي غير مدعوم في هذا المتصفح. استخدم الإجابة النصية.');
    if (this.recorder?.state === 'recording') return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = supportedRecordingMime();
    this.recorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = [];
    this.bytes = 0;
    this.limitReason = '';
    this.stopPromise = new Promise(resolve => { this.stopResolve = resolve; });
    this.recorder.addEventListener('dataavailable', event => {
      if (!event.data?.size) return;
      this.bytes += event.data.size;
      if (this.bytes <= this.maximumBytes) this.chunks.push(event.data);
      else {
        this.limitReason = 'وصل التسجيل إلى الحد الأقصى للحجم.';
        this.onLimit(this.limitReason);
        this.stop();
      }
    });
    this.recorder.addEventListener('stop', () => {
      const duration = Math.min(this.maximumSeconds, Math.max(0, (monotonicNow() - this.startedAt) / 1000));
      const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || mimeType });
      this.cleanupStream();
      this.stopResolve?.({ blob, duration, mime: blob.type, limitReason: this.limitReason });
      this.stopResolve = null;
      this.onState('stopped');
    }, { once: true });
    this.startedAt = monotonicNow();
    this.recorder.start(500);
    this.onState('recording');
    this.timer = setInterval(() => {
      const seconds = (monotonicNow() - this.startedAt) / 1000;
      this.onTick(Math.min(this.maximumSeconds, seconds), this.maximumSeconds);
      if (seconds >= this.maximumSeconds) {
        this.limitReason = 'اكتملت مدة التسجيل القصوى.';
        this.onLimit(this.limitReason);
        this.stop();
      }
    }, 250);
  }

  isRecording() {
    return this.recorder?.state === 'recording';
  }

  elapsedSeconds() {
    return this.startedAt ? Math.min(this.maximumSeconds, Math.max(0, (monotonicNow() - this.startedAt) / 1000)) : 0;
  }

  async stop() {
    if (!this.recorder || this.recorder.state === 'inactive') return this.stopPromise;
    clearInterval(this.timer);
    this.timer = null;
    this.recorder.stop();
    return this.stopPromise;
  }

  cancel() {
    this.chunks = [];
    this.bytes = 0;
    clearInterval(this.timer);
    this.timer = null;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.cleanupStream();
  }

  cleanupStream() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
}
