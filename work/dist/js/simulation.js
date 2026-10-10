import { evaluateWithAi, getAiHealth, requestWorkedExample, transcribeWithAi } from './evaluate-client.js';
import { AudioRecorder, recordingSupported } from './recorder.js';
import { renderEvaluationReport, renderSessionSummary } from './report.js';
import {
  attemptSummary, attemptsFor, get, getAll, getPendingRecording, loadRotation, pendingRecordingId, previousComparableAttempt,
  recordAttempt, remove, removePendingRecording, savePendingRecording, saveRotationRecords, set
} from './storage.js';
import { composeQuestionSet } from './session-plan.js';
import { applyRecords, shownRecords } from './rotation.js';
import { retryLockPlan } from './retry-plan.js';
import { WEIGHTS_VERSION } from './scoring-rules.js';
import {
  createAiWaiting, setBusy as markBusy, el, button, clear, formatModel, formatType, icon, notice, pageHead, privacyReminder, tag, toast
} from './ui.js';
import { acquireWakeLock, releaseAllWakeLocks, releaseWakeLock, wakeLockUnsupportedNoticeOnce } from './wake-lock.js';
import { modelElements } from './guidance.js';

const MODE_CONFIG = Object.freeze({
  single: { title: 'سؤال واحد', description: 'تدريب سريع', count: 1, minutes: '2–4 دقائق', icon: 'communication' },
  realistic: { title: 'مقابلة واقعية', description: 'سؤالان', count: 2, minutes: 'نحو 7 دقائق', icon: 'interview' },
  extended: { title: 'مقابلة موسّعة', description: 'خمسة أسئلة', count: 5, minutes: 'نحو 16 دقيقة', icon: 'book' },
  full: { title: 'مقابلة كاملة', description: 'تقديم الذات ثم ستة أسئلة: سلوكية وموقفية وقيادة بالمهمة وسؤال معرفي.', count: 6, minutes: 'نحو 20 دقيقة', icon: 'checklist' }
});

let activeRecorder = null;
// البند 14: آخر تسجيل فشل تفريغه يُحتفظ به للذاكرة لإعادة الإرسال دون إعادة التسجيل.
// alpha-4 (A3): النسخة الدائمة في IndexedDB (pending_recordings) تُحذف عند النجاح أو إعادة التسجيل أو الحذف أو بعد 24 ساعة.
let pendingRecording = null;
// alpha-4: كل listener أو مؤقت يسجَّل هنا ويُزال في cleanupSimulation كي لا يبقى مكررًا بعد الدخول والخروج.
const panelCleanups = new Set();
let memoryStorageNoticeShown = false;

function registerCleanup(fn) {
  panelCleanups.add(fn);
  return fn;
}

export function cleanupSimulation() {
  activeRecorder?.cancel();
  activeRecorder = null;
  pendingRecording = null;
  panelCleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } });
  panelCleanups.clear();
  releaseAllWakeLocks();
}

// alpha-4 (B5): عند الازدحام يُقفل زر إعادة الإرسال 15 ثانية فقط مع عدّ استرشادي من 60 ثانية.
// alpha-5 (R6): عند 429 القفل = الأصغر بين Retry-After و120 ثانية، والنص يتبع المدة (retry-plan.js).
export { retryLockPlan };

function applyRetryLock(retryButton, error, host) {
  const plan = retryLockPlan(error);
  const countdown = el('small', { class: 'retry-countdown', 'aria-live': 'polite' });
  host.replaceChildren(notice(plan.message || error.message || 'تعذّر إكمال الطلب الآن.', 'danger'), countdown);
  retryButton.hidden = false;
  retryButton.disabled = true;
  let lockRemaining = plan.lockSeconds;
  let adviceRemaining = plan.adviceSeconds;
  const tick = () => {
    countdown.textContent = plan.advisory
      ? (adviceRemaining > 0 ? `يُفضَّل الانتظار ${adviceRemaining} ثانية قبل إعادة الإرسال.` : 'يمكنك إعادة الإرسال الآن.')
      : (lockRemaining > 0 ? `يمكنك إعادة الإرسال بعد ${lockRemaining} ثانية.` : 'يمكنك إعادة الإرسال الآن.');
    if (lockRemaining <= 0) retryButton.disabled = false;
    if (lockRemaining <= 0 && adviceRemaining <= 0) { clearInterval(timer); panelCleanups.delete(stopTimer); }
    lockRemaining -= 1;
    adviceRemaining -= 1;
  };
  const timer = setInterval(tick, 1000);
  const stopTimer = () => clearInterval(timer);
  registerCleanup(stopTimer);
  tick();
}

// fix/evaluate-timeout: انتهاء المهلة يُظهر زر «إعادة الإرسال» مع بقاء النص أو التسجيل كما هو.
const RETRYABLE_CLIENT_CODES = new Set([
  'AI_OVERLOADED', 'AI_RATE_LIMITED', 'AI_TIMEOUT', 'AI_INVALID_JSON', 'AI_SCHEMA_FAILED',
  'AI_EVIDENCE_FAILED', 'AI_EMPTY_RESPONSE', 'AI_PROVIDER_ERROR', 'NETWORK'
]);

// مشغّل تقييم واحد: يمنع الطلب المزدوج، يحمل قفل الشاشة أثناء الطلب، ويعرض «ما زلنا نحاول الاتصال…» بعد 8 ثوانٍ.
function createEvaluationRunner({ status, submit, retryButton, workingText, workingHint }) {
  let inFlight = false;
  return async function run(request, onSuccess) {
    if (inFlight) return;
    inFlight = true;
    submit.disabled = true;
    markBusy(submit, true);
    retryButton.disabled = true;
    const waiting = createAiWaiting({ title: workingText, hint: workingHint });
    status.replaceChildren(waiting.node);
    waiting.node.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    acquireWakeLock('evaluating');
    try {
      const response = await evaluateWithAi(request, waiting.options);
      await onSuccess(response);
    } catch (error) {
      if (error?.code === 'ABORTED') {
        // الإلغاء يُبقي الإجابة كما هي ويعيد الشاشة إلى حالة التحرير.
        status.replaceChildren(notice('أُلغي الطلب. إجابتك ما زالت محفوظة؛ يمكنك تعديلها وإرسالها متى شئت.', 'warning', '!'));
        submit.hidden = false;
        submit.disabled = false;
        retryButton.hidden = true;
      } else if (RETRYABLE_CLIENT_CODES.has(error?.code)) {
        submit.hidden = true;
        applyRetryLock(retryButton, error, status);
      } else {
        status.replaceChildren(notice(error.message || 'تعذّر التقييم.', 'danger'));
        submit.disabled = false;
      }
    } finally {
      inFlight = false;
      markBusy(submit, false);
      releaseWakeLock('evaluating');
    }
  };
}

function sessionId() {
  return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// alpha-5 (D1/D2): تركيب الجلسة في session-plan.js مع سجل التدوير المحلي ومولّد عشوائي قابل للحقن.
async function buildQuestionSet(data, mode, scope, requestedId) {
  const rotation = await loadRotation().catch(() => new Map());
  return composeQuestionSet(data, mode, scope, requestedId, { rotation, random: Math.random });
}

// D2: يُحدَّث السجل عند عرض السؤال (السؤال وكفاءته أو مبدؤه)، بلا إجابة ولا درجة.
async function markQuestionShown(question) {
  try {
    const rotation = await loadRotation();
    const records = shownRecords(question, new Date().toISOString(), rotation);
    applyRecords(rotation, records);
    await saveRotationRecords(records);
  } catch { /* التدوير اختياري؛ لا يعطل الجلسة */ }
}

// R5: تسجيل محاولة موثوقة (بلا نص إجابة) وإرجاع المحاولة السابقة القابلة للمقارنة.
async function storeAttempt(session, index, response) {
  const key = `${session.id}:${index}`;
  const summary = attemptSummary(response.report, key, response.evaluated_at || new Date().toISOString());
  if (!summary) return { current: null, previous: null };
  const before = await attemptsFor(response.question.id).catch(() => []);
  const previous = previousComparableAttempt(before, key, summary.weights_version || WEIGHTS_VERSION);
  await recordAttempt(response.question.id, summary).catch(() => {});
  return { current: summary, previous };
}

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function renderQuestionText(question) {
  return el('article', { class: 'card ai-question-card' },
    el('div', { class: 'question-meta' },
      tag(question.competency_name || question.principle_title || 'سؤال عام', 'accent'),
      tag(formatType(question.type), 'warning'),
      tag(formatModel(question.rubric_mode))
    ),
    el('span', { class: 'question-id', text: question.id }),
    el('h2', { text: question.question }),
    question.options?.length ? el('ol', { class: 'question-options' }, ...question.options.map(option => el('li', { text: option }))) : null,
    question.question_continuation ? el('p', { class: 'continuation', text: question.question_continuation }) : null
  );
}

function renderModeCard(id, config, selected, choose) {
  return el('button', {
    type: 'button',
    class: `simulation-mode-card ${selected ? 'selected' : ''}`,
    on: { click: () => choose(id) },
    'aria-pressed': selected ? 'true' : 'false'
  },
  el('span', { class: 'mode-radio', 'aria-hidden': 'true' }, selected ? '●' : '○'),
  el('span', { class: 'simulation-mode-icon' }, icon(config.icon)),
  el('div', {}, el('strong', { text: config.title }), el('p', { text: config.description }), el('small', { text: config.minutes }))
  );
}

function createVoicePanel(transcriptArea, setAnswer, options = {}) {
  const supported = recordingSupported();
  const panel = el('section', { class: 'card voice-answer-panel' });
  if (!supported) {
    panel.append(notice('التسجيل غير مدعوم في هذا المتصفح. استخدم وضع الإجابة النصية.', 'warning'));
    transcriptArea.hidden = false;
    return panel;
  }

  const pendingKey = options.sessionId && options.questionId ? pendingRecordingId(options.sessionId, options.questionId) : '';
  const alreadyConsented = localStorage.getItem('lic:audio-consent') === 'yes';
  const consent = el('input', { type: 'checkbox', checked: alreadyConsented });
  const timer = el('strong', { class: 'recording-clock', text: '00:00' });
  const stateText = el('span', { class: 'recording-state', text: 'جاهز للتسجيل' });
  const progress = el('span', { style: { width: '0%' } });
  const start = button('بدء التسجيل', { className: 'record-start' });
  const stop = button('إنهاء التسجيل', { variant: 'danger', className: 'record-stop', hidden: true });
  const resend = button('إعادة إرسال التسجيل نفسه', { variant: 'secondary', className: 'record-resend', hidden: true });
  const warning = el('div');
  const interruptedHost = el('div', { class: 'interrupted-recording-host' });
  let stopping = false;

  const setBusy = value => {
    start.disabled = value;
    stop.disabled = value;
    resend.disabled = value;
  };

  // A3: الحفظ الدائم للتسجيل المعلق (Blob + MIME + المدة + معرّفا الجلسة والسؤال)؛ لا تفريغ داخله.
  const persistPending = async (recording, meta = {}) => {
    pendingRecording = recording;
    if (!pendingKey) return;
    const stored = await savePendingRecording({
      id: pendingKey,
      blob: recording.blob,
      mime: recording.mime || recording.blob.type || '',
      duration: recording.duration,
      session_id: options.sessionId,
      question_id: options.questionId,
      interrupted: Boolean(meta.interrupted),
      created_at: Date.now()
    });
    if (stored.stored === 'memory' && !memoryStorageNoticeShown) {
      memoryStorageNoticeShown = true;
      warning.append(notice('احتُفظ بالتسجيل مؤقتًا في هذه الصفحة؛ لا تغلقها قبل الإرسال.', 'warning'));
    }
    try { await options.onPersistSession?.(); } catch { /* ignore */ }
  };
  const discardPending = async () => {
    pendingRecording = null;
    resend.hidden = true;
    if (pendingKey) await removePendingRecording(pendingKey);
  };

  const transcribeRecording = async recording => {
    stateText.textContent = 'جارٍ تحويل الصوت إلى نص…';
    acquireWakeLock('transcribing');
    const controller = new AbortController();
    const cancelTranscription = button('إلغاء الانتظار', {
      variant: 'ghost', className: 'ai-cancel',
      onClick: () => { cancelTranscription.disabled = true; controller.abort(); }
    });
    warning.replaceChildren(cancelTranscription);
    const showProgress = ({ label, elapsedMs }) => {
      stateText.textContent = `${label} · ${Math.floor((elapsedMs || 0) / 1000)} ث`;
    };
    try {
      const response = await transcribeWithAi(recording.blob, recording.duration, {
        onSlow: text => { stateText.textContent = text; },
        onPhase: showProgress,
        onProgress: showProgress,
        signal: controller.signal
      });
      await discardPending();
      interruptedHost.replaceChildren();
      transcriptArea.value = response.transcript;
      transcriptArea.hidden = false;
      setAnswer(response.transcript, recording.duration);
      stateText.textContent = 'راجع النص وصححه قبل التقييم';
      warning.replaceChildren(
        recording.limitReason ? notice(recording.limitReason, 'warning') : notice('تم التفريغ. صحح أي كلمة لم تُفهم بدقة، ثم أرسل النص للتقييم.', '', '✓')
      );
    } catch (error) {
      await persistPending(recording);
      resend.hidden = false;
      transcriptArea.hidden = false;
      if (error?.code === 'ABORTED') {
        stateText.textContent = 'أُلغي التفريغ؛ التسجيل محفوظ';
        warning.replaceChildren(notice('أُلغي التفريغ. تسجيلك محفوظ؛ يمكنك إعادة إرساله أو إعادة التسجيل.', 'warning', '!'));
      } else if (RETRYABLE_CLIENT_CODES.has(error?.code)) {
        stateText.textContent = 'تعذر التفريغ';
        applyRetryLock(resend, error, warning);
      } else {
        stateText.textContent = 'تعذر التفريغ';
        warning.replaceChildren(notice(`${error.message || 'تعذر تحويل التسجيل إلى نص.'} يمكنك إعادة إرسال التسجيل نفسه أو إعادة التسجيل.`, 'danger'));
      }
    } finally {
      releaseWakeLock('transcribing');
    }
  };

  resend.addEventListener('click', async () => {
    if (!pendingRecording?.blob?.size) {
      resend.hidden = true;
      return;
    }
    setBusy(true);
    try {
      await transcribeRecording(pendingRecording);
    } finally {
      setBusy(false);
    }
  });

  // A2: بطاقة التسجيل المتوقف (خروج من الواجهة) أو المستعاد بعد إعادة التحميل.
  const showPendingCard = (recording, { restored = false } = {}) => {
    const seconds = Math.round(recording.duration);
    const text = restored
      ? `لديك تسجيل محفوظ لهذا السؤال لم يُفرَّغ بعد. مدته ${seconds} ثانية.`
      : `توقّف التسجيل لأن التطبيق خرج من الواجهة. سُجّل منه ${seconds} ثانية.`;
    const card = el('div', { class: 'card interrupted-recording' },
      notice(text, 'warning'),
      el('div', { class: 'button-row' },
        recording.duration >= 1 ? button('أرسل ما سُجّل للتفريغ', { className: 'send-pending', onClick: async () => {
          card.remove();
          setBusy(true);
          try { await transcribeRecording(recording); } finally { setBusy(false); }
        } }) : null,
        button('إعادة التسجيل', { variant: 'secondary', className: 'rerecord-pending', onClick: async () => {
          await discardPending();
          card.remove();
          stateText.textContent = 'جاهز للتسجيل';
          warning.replaceChildren();
        } })
      )
    );
    interruptedHost.replaceChildren(card);
    stateText.textContent = recording.duration >= 1 ? 'تسجيل محفوظ بانتظار قرارك' : 'التسجيل أقصر من ثانية؛ أعد التسجيل';
    start.hidden = false;
    start.textContent = 'إعادة التسجيل';
    stop.hidden = true;
  };

  // مسار الإيقاف الواحد: من زر الإنهاء (مع تفريغ تلقائي) أو من الخروج من الواجهة (بلا إرسال تلقائي).
  const finishRecording = async ({ autoTranscribe }) => {
    if (!activeRecorder || stopping) return;
    stopping = true;
    setBusy(true);
    stateText.textContent = 'جارٍ تجهيز التسجيل…';
    try {
      const recording = await activeRecorder.stop();
      releaseWakeLock('recording');
      if (!recording?.blob?.size) throw new Error('لم يتم التقاط صوت.');
      if (autoTranscribe) await transcribeRecording(recording);
      else {
        await persistPending(recording, { interrupted: true });
        showPendingCard(recording);
      }
    } catch (error) {
      stateText.textContent = 'تعذر التفريغ';
      warning.replaceChildren(notice(error.message || 'تعذر تحويل التسجيل إلى نص.', 'danger'));
      transcriptArea.hidden = false;
    } finally {
      setBusy(false);
      start.hidden = false;
      start.textContent = 'إعادة التسجيل';
      stop.hidden = true;
      activeRecorder = null;
      stopping = false;
    }
  };

  start.addEventListener('click', async () => {
    if (!consent.checked) {
      toast('اقرأ إشعار الخصوصية ووافق قبل التسجيل.');
      consent.focus();
      return;
    }
    localStorage.setItem('lic:audio-consent', 'yes');
    transcriptArea.hidden = true;
    transcriptArea.value = '';
    setAnswer('');
    warning.replaceChildren();
    interruptedHost.replaceChildren();
    await discardPending();
    activeRecorder?.cancel();
    activeRecorder = new AudioRecorder({
      onTick: (seconds, maximum) => {
        timer.textContent = formatClock(seconds);
        progress.style.width = `${Math.min(100, seconds / maximum * 100)}%`;
        if (seconds >= 90 && !warning.childNodes.length) warning.append(notice('بقيت 30 ثانية على الحد الأقصى.', 'warning'));
      },
      onState: state => {
        if (state === 'recording') {
          stateText.textContent = 'جارٍ التسجيل…';
          start.hidden = true;
          stop.hidden = false;
        }
      },
      onLimit: () => { if (!stop.disabled) stop.click(); }
    });
    try {
      // A1/A5: القفل يبدأ بعد تفاعل المستخدم؛ وتنبيه غياب الدعم يظهر مرة واحدة في شاشة التسجيل فقط.
      acquireWakeLock('recording');
      const unsupportedNotice = wakeLockUnsupportedNoticeOnce();
      if (unsupportedNotice) warning.append(notice(unsupportedNotice, 'warning'));
      await activeRecorder.start();
    } catch (error) {
      releaseWakeLock('recording');
      warning.replaceChildren(notice(error.message || 'تعذر بدء التسجيل.', 'danger'));
      start.hidden = false;
      stop.hidden = true;
    }
  });

  stop.addEventListener('click', () => finishRecording({ autoTranscribe: true }));

  // A2: الخروج من الواجهة أثناء التسجيل يوقفه إيقافًا نظيفًا مرة واحدة دون إرسال تلقائي.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && activeRecorder?.isRecording()) finishRecording({ autoTranscribe: false });
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  registerCleanup(() => document.removeEventListener('visibilitychange', onVisibilityChange));

  // A3: استعادة تسجيل معلق محفوظ لهذا السؤال (بعد إعادة التحميل أو الاستئناف).
  if (pendingKey) {
    getPendingRecording(pendingKey).then(record => {
      if (!record?.blob?.size || activeRecorder) return;
      const recording = { blob: record.blob, duration: Number(record.duration) || 0, mime: record.mime || record.blob.type };
      pendingRecording = recording;
      showPendingCard(recording, { restored: true });
    }).catch(() => {});
  }

  transcriptArea.addEventListener('input', () => setAnswer(transcriptArea.value));
  panel.append(
    el('label', { class: 'privacy-consent' }, consent,
      el('span', { text: 'أوافق على إرسال التسجيل مؤقتًا لتحويله إلى نص، ثم حذفه بعد اكتمال العملية.' })
    ),
    el('div', { class: 'recording-visual' },
      timer,
      el('div', { class: 'recording-progress' }, progress),
      el('div', { class: 'audio-wave', 'aria-hidden': 'true' }, ...Array.from({ length: 14 }, (_, index) => el('i', { style: { '--bar': String(index % 5) } }))),
      stateText
    ),
    el('div', { class: 'button-row recording-actions' }, start, stop, resend),
    interruptedHost,
    warning
  );
  return panel;
}

export async function renderSimulation(root, data, params = new URLSearchParams()) {
  cleanupSimulation();
  clear(root);
  let selectedMode = params.get('mode') && MODE_CONFIG[params.get('mode')] ? params.get('mode') : 'single';
  let answerMode = params.get('answer') === 'voice' ? 'voice' : 'text';
  let selectedScope = params.get('competency') || '';
  let followupsEnabled = localStorage.getItem('lic:followups') !== 'off';
  let includeSelfIntro = selectedMode === 'full';
  let selfIntroDuration = 60;
  let health = null;

  const healthHost = el('div', { class: 'ai-health-host' }, notice('جارٍ التحقق من خدمة المحاكاة…'));
  try {
    health = await getAiHealth();
    healthHost.replaceChildren(health.ai?.configured
      ? notice('المحاكاة جاهزة.', '', '✓')
      : notice('خدمة المحاكاة غير متاحة حاليًا. حاول مرة أخرى لاحقًا.', 'warning'));
  } catch {
    healthHost.replaceChildren(notice('خدمة المحاكاة غير متاحة حاليًا. حاول مرة أخرى لاحقًا.', 'warning'));
  }

  // البند 8: كل شاشة جديدة تبدأ من أعلى الصفحة مع نقل التركيز إلى المحتوى.
  const scrollToTop = () => {
    window.scrollTo({ top: 0 });
    root.focus({ preventScroll: true });
  };

  // البند 6: الجلسات غير المكتملة، أحدثها أولًا.
  const inProgressSessions = async () => (await getAll('sessions'))
    .filter(item => item.status === 'in_progress' && Array.isArray(item.question_ids) && item.question_ids.length)
    .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));

  const resumeSession = session => {
    const questions = session.question_ids.map(id => data.questionById.get(id)).filter(Boolean);
    if (questions.length !== session.question_ids.length) {
      toast('تعذر استئناف الجلسة لأن أسئلتها لم تعد متاحة.');
      remove('sessions', session.id).then(() => drawSetup());
      return;
    }
    session.responses = Array.isArray(session.responses) ? session.responses : [];
    session.current_index = Math.min(Math.max(0, Number(session.current_index) || 0), questions.length - 1);
    if (!session.privacy_acknowledged_at) {
      drawPrivacyGate(session, questions);
      return;
    }
    if (session.include_self_intro && !session.intro_response) drawSelfIntroduction(session, questions);
    else drawQuestion(session, questions);
  };

  const drawPrivacyGate = (session, questions, pendingSession = null) => {
    cleanupSimulation();
    clear(root);
    scrollToTop();

    const acknowledgement = el('input', {
      type: 'checkbox',
      id: 'simulation-privacy-acknowledgement'
    });
    const continueButton = button('فهمت، متابعة', {
      className: 'wide simulation-privacy-continue',
      disabled: true,
      'aria-describedby': 'simulation-privacy-hint'
    });
    // سطر مساعد يشرح سبب تعطيل الزر ويختفي عند التأكيد.
    const continueHint = el('small', { class: 'hint', id: 'simulation-privacy-hint', text: 'أكّد التنبيه للمتابعة' });
    acknowledgement.addEventListener('change', () => {
      continueButton.disabled = !acknowledgement.checked;
      continueHint.hidden = acknowledgement.checked;
    });
    continueButton.addEventListener('click', async () => {
      if (!acknowledgement.checked) return;
      const acknowledgedAt = new Date().toISOString();
      localStorage.setItem('lic:simulation-privacy-acknowledged-at', acknowledgedAt);
      if (pendingSession?.id) await remove('sessions', pendingSession.id);
      session.privacy_acknowledged_at = acknowledgedAt;
      await set('sessions', { ...session, updated_at: acknowledgedAt });
      if (session.include_self_intro) drawSelfIntroduction(session, questions);
      else drawQuestion(session, questions);
    });

    root.append(el('section', { class: 'simulation-privacy-page' },
      el('header', { class: 'simulation-privacy-hero' },
        el('span', { class: 'simulation-privacy-hero-icon' }, icon('privacy')),
        el('div', {},
          el('small', { text: 'قبل أن تبدأ' }),
          el('h1', { text: 'خصوصيتك أولًا' }),
          el('p', { text: 'راجع هذا التنبيه قبل إرسال أي إجابة للتفريغ أو التقييم.' })
        )
      ),
      el('article', { class: 'simulation-privacy-card', role: 'note' },
        el('span', { class: 'simulation-privacy-card-icon' }, icon('privacy')),
        el('div', {},
          el('strong', { text: 'احمِ معلوماتك' }),
          el('p', { text: 'تُرسل إجاباتك النصية أو الصوتية إلى خدمة ذكاء اصطناعي لغرض التفريغ والتقييم. تجنّب ذكر الأسماء والبيانات الشخصية والمعلومات الوظيفية السرية أو الحساسة. استخدم أمثلة مجهولة الهوية، مع الإبقاء على تفاصيل الموقف ودورك وإجراءاتك والنتيجة.' })
        )
      ),
      el('article', { class: 'privacy-info-card' },
        el('span', { 'aria-hidden': 'true', text: 'i' }),
        el('p', { text: 'يطلب التطبيق من المزود عدم تخزين المحتوى، لكنه يغادر جهازك مؤقتًا للمعالجة.' })
      ),
      el('label', { class: 'privacy-acknowledgement', for: 'simulation-privacy-acknowledgement' },
        acknowledgement,
        el('span', {},
          el('strong', { text: 'فهمت تنبيه الخصوصية' }),
          el('small', { text: 'سأخفي الهوية وأُبقي التفاصيل اللازمة للتقييم.' })
        )
      ),
      continueHint,
      el('div', { class: 'simulation-privacy-actions' },
        continueButton,
        button('رجوع', {
          variant: 'ghost wide',
          onClick: () => {
            if (session.direct_training) history.back();
            else drawSetup();
          }
        })
      ),
      privacyReminder('أخفِ الهوية والمعلومات الحساسة، مع إبقاء تفاصيل الموقف ودورك وإجراءاتك والنتيجة.')
    ));
    acknowledgement.focus({ preventScroll: true });
  };

  const drawSetup = async () => {
    cleanupSimulation();
    clear(root);
    scrollToTop();
    const pending = (await inProgressSessions())[0] || null;
    root.append(
      el('section', { class: 'simulation-hero' },
        el('span', {}, icon('microphone')),
        el('div', {}, el('small', { text: 'بيئة تدريب تفاعلية' }), el('h1', { text: 'اختر تجربة تناسب استعدادك' }), el('p', { text: 'حدّد نوع المقابلة ثم ابدأ عندما تكون جاهزًا.' }))
      ),
      healthHost
    );
    if (pending) {
      root.append(el('section', { class: 'card resume-card section-block' },
        el('div', {},
          el('strong', { text: 'لديك جلسة غير مكتملة' }),
          el('p', { text: `السؤال ${Math.min(pending.current_index + 1, pending.question_ids.length)} من ${pending.question_ids.length} — ${MODE_CONFIG[pending.mode]?.title || 'محاكاة'}` })
        ),
        el('div', { class: 'button-row' },
          button('استئناف', { onClick: () => resumeSession(pending) }),
          button('حذف الجلسة', { variant: 'ghost', onClick: async () => { await remove('sessions', pending.id); drawSetup(); } })
        )
      ));
    }

    const modeGrid = el('div', { class: 'simulation-mode-grid' });
    let introOptions;
    let selfIntroToggle;
    let selfIntroHelp;
    const syncIntroOptions = () => {
      if (!introOptions || !selfIntroToggle || !selfIntroHelp) return;
      introOptions.hidden = selectedMode === 'single';
      const full = selectedMode === 'full';
      if (full) includeSelfIntro = true;
      selfIntroToggle.checked = includeSelfIntro;
      selfIntroToggle.disabled = full;
      selfIntroHelp.textContent = full
        ? 'جزء ثابت من المقابلة الكاملة.'
        : 'اختياري في المحاكاة الواقعية والممتدة.';
    };
    const redrawModes = () => {
      modeGrid.replaceChildren(...Object.entries(MODE_CONFIG).map(([id, config]) =>
        renderModeCard(id, config, selectedMode === id, next => {
          selectedMode = next;
          redrawModes();
          syncIntroOptions();
        })
      ));
    };
    redrawModes();

    const answerSwitch = el('div', { class: 'segmented simulation-answer-switch', role: 'group', 'aria-label': 'طريقة الإجابة' });
    const readinessStrip = el('div', { class: 'simulation-readiness-strip' });
    const drawReadiness = () => readinessStrip.replaceChildren(
      icon(answerMode === 'voice' ? 'microphone' : 'answer'),
      el('div', {},
        el('strong', { text: answerMode === 'voice' ? 'الميكروفون جاهز' : 'الإجابة النصية جاهزة' }),
        el('small', { text: answerMode === 'voice' ? 'سيُطلب إذن التسجيل عند البدء.' : 'ستكتب إجابتك قبل إرسالها للتقييم.' })
      ),
      el('span', { class: 'ready-dot', 'aria-hidden': 'true' })
    );
    const drawAnswerSwitch = () => {
      answerSwitch.replaceChildren(...[
        ['text', '▤', 'إجابة نصية'],
        ['voice', '◉', 'إجابة صوتية']
      ].map(([id, icon, label]) => el('button', {
        type: 'button',
        class: answerMode === id ? 'active' : '',
        'aria-pressed': String(answerMode === id),
        on: { click: () => { answerMode = id; drawAnswerSwitch(); drawReadiness(); } }
      }, el('span', { text: icon }), document.createTextNode(label))));
    };
    drawAnswerSwitch();
    drawReadiness();

    const scope = el('select', { class: 'input', 'aria-label': 'مجال المحاكاة' },
      el('option', { value: '', text: 'اختيار عشوائي' }),
      ...data.competencies.map(item => el('option', { value: item.id, text: item.name })),
      el('option', { value: 'mission', text: 'مسار قيادة المهمة' })
    );
    scope.value = selectedScope;
    scope.addEventListener('change', () => { selectedScope = scope.value; });
    const followupToggle = el('input', { type: 'checkbox', checked: followupsEnabled });
    followupToggle.addEventListener('change', () => {
      followupsEnabled = followupToggle.checked;
      localStorage.setItem('lic:followups', followupsEnabled ? 'on' : 'off');
    });
    selfIntroToggle = el('input', { type: 'checkbox', checked: includeSelfIntro });
    selfIntroToggle.addEventListener('change', () => { includeSelfIntro = selfIntroToggle.checked; });
    const durationSelect = el('select', { class: 'input compact-select', 'aria-label': 'مدة تقديم الذات' },
      el('option', { value: '60', text: 'حتى 60 ثانية' }),
      el('option', { value: '120', text: 'حتى 120 ثانية' })
    );
    durationSelect.value = String(selfIntroDuration);
    durationSelect.addEventListener('change', () => { selfIntroDuration = Number(durationSelect.value) === 120 ? 120 : 60; });
    introOptions = el('div', { class: 'simulation-intro-options', hidden: selectedMode === 'single' },
      el('label', { class: 'toggle-row' }, selfIntroToggle,
        el('span', {},
          el('strong', { text: 'ابدأ بتقديم الذات' }),
          selfIntroHelp = el('small', { text: 'اختياري في المحاكاة الواقعية والممتدة.' })
        )
      ),
      el('label', { class: 'field' }, el('span', { text: 'المدة المستهدفة' }), durationSelect)
    );
    syncIntroOptions();

    const startSession = async () => {
      const questions = await buildQuestionSet(data, selectedMode, selectedScope, params.get('question'));
      if (!questions.length) {
        toast('لا توجد أسئلة ضمن هذا الاختيار.');
        return;
      }
      if (pending) {
        if (!window.confirm('لديك جلسة غير مكتملة. بدء جلسة جديدة سيحذفها. هل تريد المتابعة؟')) return;
      }
      const session = {
        id: sessionId(),
        mode: selectedMode,
        answer_mode: answerMode,
        followups_enabled: followupsEnabled,
        include_self_intro: selectedMode === 'full' || (includeSelfIntro && selectedMode !== 'single'),
        self_intro_duration: selfIntroDuration,
        created_at: new Date().toISOString(),
        status: 'in_progress',
        current_index: 0,
        question_ids: questions.map(item => item.id),
        responses: []
      };
      drawPrivacyGate(session, questions, pending);
    };

    root.append(el('section', { class: 'card simulation-setup-card section-block' },
      el('h2', { text: 'نوع المحاكاة' }), modeGrid,
      el('h2', { text: 'طريقة الإجابة' }), answerSwitch,
      el('label', { class: 'field' }, el('span', { text: 'الكفاءة أو المسار' }), scope),
      el('label', { class: 'toggle-row' }, followupToggle,
        el('span', {}, el('strong', { text: 'أسئلة المتابعة' }), el('small', { text: 'حتى سؤالين عند وجود نقص واضح فقط.' }))
      ),
      introOptions,
      readinessStrip,
      notice('هذه أداة تدريبية؛ لا تصدر نجاحًا أو رسوبًا ولا تتنبأ بنتيجة المقابلة الفعلية.', 'warning'),
      button('ابدأ المحاكاة', { className: 'wide simulation-start', onClick: startSession })
    ));
  };

  const drawSelfIntroduction = async (session, questions) => {
    cleanupSimulation();
    const saved = await get('settings', 'self-intro-draft');
    let answer = session.intro_response?.answer || saved?.text || '';
    let spokenDuration = 0;
    clear(root);
    scrollToTop();
    root.append(
      pageHead('بداية المحاكاة', `تقديم الذات — حتى ${session.self_intro_duration} ثانية`, 'ابدأ بالماضي، ثم الحاضر، ثم هدفك المستقبلي.'),
      notice('يمكنك استخدام مسودتك المحفوظة أو تعديلها. التقييم للتغطية والترتيب والمدة، لا لجمال الأسلوب.', 'warning')
    );

    const input = el('textarea', {
      class: 'input simulation-answer-input',
      rows: 11,
      value: answer,
      placeholder: session.answer_mode === 'voice' ? 'سيظهر التفريغ هنا بعد التسجيل…' : 'اكتب تقديمك الذاتي…'
    });
    input.addEventListener('input', () => { answer = input.value; });
    if (session.answer_mode === 'voice') input.hidden = !answer;
    const persistSession = () => set('sessions', { ...session, updated_at: new Date().toISOString() });
    const capture = session.answer_mode === 'voice'
      ? createVoicePanel(input, (value, duration) => { answer = value; spokenDuration = duration || spokenDuration; }, { sessionId: session.id, questionId: 'SELF-INTRO', onPersistSession: persistSession })
      : el('label', { class: 'field card text-answer-card' }, el('span', { text: 'تقديمك الذاتي' }), input);
    const status = el('div', { class: 'evaluation-status' });
    const submit = button('تقييم تقديم الذات', { className: 'wide' });
    const retryButton = button('إعادة الإرسال', { className: 'wide resend-evaluation', hidden: true });
    const runner = createEvaluationRunner({ status, submit, retryButton, workingText: 'جارٍ تقييم التغطية والترتيب والمدة…' });
    const submitSelfIntro = () => {
      const corrected = input.value.trim();
      if (corrected.length < 20) {
        toast('أكمل تقديم الذات أولًا.');
        return;
      }
      return runner({
        question_id: 'SELF-INTRO',
        answer: corrected,
        target_duration: session.self_intro_duration,
        spoken_duration: spokenDuration
      }, async response => {
        session.intro_response = {
          question: {
            id: 'SELF-INTRO',
            question: 'قدّم نفسك بصورة مهنية، من الماضي إلى الحاضر ثم المستقبل.',
            type: 'self_intro',
            rubric_mode: 'self_intro'
          },
          answer: corrected,
          followups: [],
          report: response.report,
          meta: response.meta,
          evaluated_at: new Date().toISOString()
        };
        await set('sessions', { ...session, updated_at: new Date().toISOString() });
        drawSelfIntroReport(session, questions);
      });
    };
    submit.addEventListener('click', submitSelfIntro);
    retryButton.addEventListener('click', submitSelfIntro);

    root.append(el('section', { class: 'answer-capture section-block' },
      privacyReminder('أخفِ الهوية والمعلومات الحساسة، مع إبقاء تفاصيل الموقف ودورك وإجراءاتك والنتيجة.'),
      capture,
      session.answer_mode === 'voice'
        ? el('label', { class: 'field transcript-field' }, el('span', { text: 'راجع التفريغ وصححه' }), input)
        : null,
      status,
      submit,
      retryButton,
      button('تخطي تقديم الذات', { variant: 'ghost', className: 'wide', onClick: () => drawQuestion(session, questions) })
    ));
  };

  const drawSelfIntroReport = (session, questions) => {
    cleanupSimulation();
    const current = session.intro_response;
    clear(root);
    scrollToTop();
    root.append(
      pageHead('نتيجة تدريبية', 'تقرير تقديم الذات', 'راجع التقرير، ثم انتقل إلى أسئلة المقابلة.'),
      renderEvaluationReport({
        report: current.report,
        question: current.question,
        answer: current.answer,
        followups: [],
        onNext: () => drawQuestion(session, questions),
        nextLabel: 'ابدأ أسئلة المقابلة'
      })
    );
  };

  const drawQuestion = (session, questions) => {
    cleanupSimulation();
    const question = questions[session.current_index];
    // D2: لا يُحدَّث التدوير مرتين للسؤال نفسه في الجلسة نفسها (استئناف أو تبديل طريقة الإجابة).
    session.shown_question_ids = Array.isArray(session.shown_question_ids) ? session.shown_question_ids : [];
    if (!session.shown_question_ids.includes(question.id)) {
      session.shown_question_ids.push(question.id);
      markQuestionShown(question);
    }
    // A4: المسودة مرتبطة بمعرّف السؤال؛ لا تُستعاد مسودة سؤال آخر.
    const draftForThisQuestion = session.draft_question_id === question.id ? session.draft_answer : '';
    let answer = session.responses[session.current_index]?.answer || draftForThisQuestion || '';
    const previousFollowups = session.responses[session.current_index]?.followups || [];
    clear(root);
    scrollToTop();
    const progressValue = Math.round(((session.current_index + 1) / questions.length) * 100);
    root.append(
      pageHead(
        session.direct_training ? (question.competency_name || question.principle_title || 'تدريب موجه') : 'المحاكاة',
        session.direct_training ? 'التدرّب على السؤال' : `السؤال ${session.current_index + 1} من ${questions.length}`,
        session.direct_training ? 'أجب بطريقتك أولًا، ثم أرسل الإجابة لتحصل على تحليل تطويري.' : 'اقرأ السؤال، ثم أجب من خبرتك أو حلّل السيناريو.'
      ),
      // alpha-5: root.append هو DOM الأصلي؛ null كان يُطبع نصًا «null» في شاشة التدريب المباشر.
      ...(session.direct_training ? [] : [el('div', { class: 'simulation-progress', role: 'progressbar', 'aria-valuenow': String(progressValue), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        el('span', { style: { width: `${progressValue}%` } })
      )]),
      renderQuestionText(question)
    );

    const answerInput = el('textarea', {
      class: 'input simulation-answer-input',
      rows: 12,
      value: answer,
      placeholder: session.answer_mode === 'voice' ? 'سيظهر التفريغ هنا بعد انتهاء التسجيل…' : 'اكتب إجابتك هنا…'
    });
    // A4: حفظ المسودة أثناء الكتابة (debounce) وفورًا عند إخفاء الصفحة أو pagehide.
    let draftTimer = null;
    const persistDraft = async () => {
      clearTimeout(draftTimer);
      draftTimer = null;
      session.draft_answer = answerInput.value;
      session.draft_question_id = question.id;
      await set('sessions', { ...session, updated_at: new Date().toISOString() });
    };
    const scheduleDraft = () => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(persistDraft, 600);
    };
    const flushDraft = () => { if (draftTimer) persistDraft(); };
    const onDraftVisibility = () => { if (document.visibilityState === 'hidden') flushDraft(); };
    document.addEventListener('visibilitychange', onDraftVisibility);
    window.addEventListener('pagehide', flushDraft);
    registerCleanup(() => {
      document.removeEventListener('visibilitychange', onDraftVisibility);
      window.removeEventListener('pagehide', flushDraft);
      clearTimeout(draftTimer);
    });
    answerInput.addEventListener('input', () => { answer = answerInput.value; scheduleDraft(); syncSubmitState(); });
    if (session.answer_mode === 'voice') answerInput.hidden = !answer;

    const answerCount = el('small', { class: 'answer-count', 'aria-live': 'off' });
    const updateAnswerCount = () => {
      const words = answerInput.value.trim().split(/\s+/).filter(Boolean).length;
      answerCount.textContent = `${words} كلمة`;
    };
    answerInput.addEventListener('input', updateAnswerCount);
    updateAnswerCount();
    const capture = session.answer_mode === 'voice'
      ? createVoicePanel(answerInput, value => { answer = value; scheduleDraft(); syncSubmitState(); }, { sessionId: session.id, questionId: question.id, onPersistSession: () => set('sessions', { ...session, updated_at: new Date().toISOString() }) })
      : el('label', { class: 'field card text-answer-card' },
        el('span', { text: 'إجابتك' }), answerInput,
        answerCount,
        el('small', { text: 'قيّم التطبيق المضمون، وليس اللغة أو الطلاقة.' })
      );
    const status = el('div', { class: 'evaluation-status' });
    const submit = button('إرسال الإجابة للتقييم', { className: 'wide', 'aria-describedby': 'answer-submit-hint' });
    const retryButton = button('إعادة الإرسال', { className: 'wide resend-evaluation', hidden: true });
    // سطر مساعد يشرح سبب تعطيل زر الإرسال.
    const submitHint = el('small', { class: 'hint', id: 'answer-submit-hint', text: 'اكتب إجابتك أولًا' });
    const runner = createEvaluationRunner({ status, submit, retryButton, workingText: 'جارٍ تحليل الأدلة والتحقق من الاقتباسات…', workingHint: 'قد يستغرق ذلك عدة ثوانٍ.' });
    function syncSubmitState() {
      submit.disabled = answerInput.value.trim().length < 5;
      submitHint.hidden = !submit.disabled;
    }
    syncSubmitState();

    const answerSwitch = session.direct_training ? el('div', { class: 'segmented direct-training-switch', role: 'group', 'aria-label': 'طريقة الإجابة' },
      ...[['voice', 'إجابة صوتية'], ['text', 'إجابة نصية']].map(([mode, label]) => el('button', {
        type: 'button',
        class: session.answer_mode === mode ? 'active' : '',
        text: label,
        on: { click: async () => {
          if (session.answer_mode === mode) return;
          session.draft_answer = answerInput.value;
          session.draft_question_id = question.id;
          session.answer_mode = mode;
          await set('sessions', { ...session, updated_at: new Date().toISOString() });
          drawQuestion(session, questions);
        } }
      }))
    ) : null;
    const methodReminder = session.direct_training ? el('section', { class: 'training-method-reminder' },
      el('strong', { text: question.rubric_mode === 'star_l' ? 'تذكّر بناء STAR-L' : 'تذكّر بناء SEAL' }),
      el('div', {}, ...modelElements(question.rubric_mode).map(item => el('span', {}, el('b', { text: item.key }), el('small', { text: item.title }))))
    ) : null;

    const submitEvaluation = async (followups = previousFollowups) => {
      const corrected = answerInput.value.trim();
      if (corrected.length < 5) {
        toast('اكتب الإجابة أو سجّلها ثم راجع التفريغ أولًا.');
        answerInput.focus();
        return;
      }
      clearTimeout(draftTimer);
      draftTimer = null;
      return runner({ question_id: question.id, answer: corrected, followups }, async response => {
        session.responses[session.current_index] = {
          question,
          answer: corrected,
          followups,
          report: response.report,
          meta: response.meta,
          evaluated_at: new Date().toISOString()
        };
        // R5: سجل المحاولات لكل سؤال (بلا نص إجابة) والمحاولة السابقة للمقارنة.
        const attempt = await storeAttempt(session, session.current_index, session.responses[session.current_index]);
        session.responses[session.current_index].attempt = attempt;
        // تُحذف المسودة عند تقييم موثوق فقط؛ وإلا تبقى مرتبطة بهذا السؤال حتى الانتقال الآمن.
        if (response.report?.trusted) {
          delete session.draft_answer;
          delete session.draft_question_id;
        }
        await set('sessions', { ...session, updated_at: new Date().toISOString() });
        drawReport(session, questions);
      });
    };

    submit.addEventListener('click', () => submitEvaluation(previousFollowups));
    retryButton.addEventListener('click', () => submitEvaluation(previousFollowups));
    root.append(el('section', { class: 'answer-capture section-block' },
      answerSwitch,
      privacyReminder('أخفِ الهوية والمعلومات الحساسة، مع إبقاء تفاصيل الموقف ودورك وإجراءاتك والنتيجة.'),
      capture,
      session.answer_mode === 'voice' ? el('label', { class: 'field transcript-field' },
        el('span', { text: 'راجع التفريغ وصححه' }), answerInput
      ) : null,
      methodReminder,
      status,
      submitHint,
      submit,
      retryButton,
      button('حفظ والخروج إلى الرئيسية', {
        variant: 'ghost',
        className: 'wide',
        onClick: async () => {
          clearTimeout(draftTimer);
          draftTimer = null;
          session.draft_answer = answerInput.value;
          session.draft_question_id = question.id;
          await set('sessions', { ...session, updated_at: new Date().toISOString() });
          location.hash = '#/home';
        }
      })
    ));
  };

  const drawFollowup = (session, questions, followupQuestion, followupReason) => {
    cleanupSimulation();
    const current = session.responses[session.current_index];
    let followupAnswer = '';
    clear(root);
    scrollToTop();
    root.append(
      pageHead('متابعة موجهة', 'سؤال متابعة', 'طُرح هذا السؤال لأن عنصرًا محددًا يحتاج إلى توضيح.'),
      el('article', { class: 'card followup-question-card' },
        el('span', { class: 'followup-avatar', 'aria-hidden': 'true', text: '؟' }),
        el('h2', { text: followupQuestion }),
        el('p', { text: 'أجب بإيجاز وركّز على هذا المحور فقط.' }),
        followupReason ? el('small', { text: `سبب السؤال: ${followupReason}` }) : null
      )
    );
    const input = el('textarea', { class: 'input simulation-answer-input', rows: 8, placeholder: 'اكتب إجابة المتابعة…' });
    input.addEventListener('input', () => { followupAnswer = input.value; });
    if (session.answer_mode === 'voice') input.hidden = true;
    const capture = session.answer_mode === 'voice'
      ? createVoicePanel(input, value => { followupAnswer = value; }, { sessionId: session.id, questionId: `${current.question.id}:followup-${current.followups.length + 1}` })
      : el('label', { class: 'field card text-answer-card' }, el('span', { text: 'إجابة المتابعة' }), input);
    const status = el('div', { class: 'evaluation-status' });
    const resubmit = button('إعادة التقييم مع المتابعة', { className: 'wide' });
    const retryButton = button('إعادة الإرسال', { className: 'wide resend-evaluation', hidden: true });
    const runner = createEvaluationRunner({ status, submit: resubmit, retryButton, workingText: 'جارٍ تحديث التقرير…' });
    const submitFollowup = () => {
      const corrected = input.value.trim() || followupAnswer.trim();
      if (corrected.length < 3) {
        toast('أجب عن سؤال المتابعة أولًا.');
        return;
      }
      const followups = [...current.followups, { question: followupQuestion, answer: corrected, reason: followupReason || '' }].slice(0, 2);
      return runner({ question_id: current.question.id, answer: current.answer, followups }, async response => {
        session.responses[session.current_index] = { ...current, followups, report: response.report, meta: response.meta, evaluated_at: new Date().toISOString(), example: null };
        const attempt = await storeAttempt(session, session.current_index, session.responses[session.current_index]);
        session.responses[session.current_index].attempt = attempt;
        await set('sessions', { ...session, updated_at: new Date().toISOString() });
        drawReport(session, questions);
      });
    };
    resubmit.addEventListener('click', submitFollowup);
    retryButton.addEventListener('click', submitFollowup);
    root.append(el('section', { class: 'answer-capture section-block' },
      privacyReminder('أخفِ الهوية والمعلومات الحساسة، مع إبقاء تفاصيل الموقف ودورك وإجراءاتك والنتيجة.'),
      capture,
      session.answer_mode === 'voice' ? el('label', { class: 'field transcript-field' }, el('span', { text: 'راجع التفريغ وصححه' }), input) : null,
      status,
      resubmit,
      retryButton,
      button('تخطي المتابعة', { variant: 'ghost', className: 'wide', onClick: () => drawReport(session, questions) })
    ));
  };

  // R5: «أعد الإجابة وقارن» يفتح السؤال نفسه في جلسة تدريب مباشر جديدة.
  const retrySameQuestion = (session, question) => {
    const fresh = {
      id: sessionId(),
      mode: 'single',
      direct_training: true,
      answer_mode: session.answer_mode === 'voice' ? 'voice' : 'text',
      followups_enabled: session.followups_enabled,
      include_self_intro: false,
      created_at: new Date().toISOString(),
      status: 'in_progress',
      current_index: 0,
      question_ids: [question.id],
      responses: [],
      retry_of: question.id
    };
    drawQuestion(fresh, [question]);
  };
  const drawReport = (session, questions) => {
    cleanupSimulation();
    const current = session.responses[session.current_index];
    clear(root);
    scrollToTop();
    root.append(
      pageHead('نتيجة تدريبية', 'تقرير الإجابة', 'النتيجة مبنية على الأدلة الموجودة في إجابتك.'),
      renderEvaluationReport({
        report: current.report,
        question: current.question,
        answer: current.answer,
        followups: current.followups,
        currentAttempt: current.attempt?.current || null,
        previousAttempt: current.attempt?.previous || null,
        example: current.example || null,
        onRetry: () => retrySameQuestion(session, current.question),
        // الخطوة 5: المثال بطلب المتدرب فقط، ويُحفظ محليًا مع الجلسة؛ مثال واحد لكل إجابة.
        onRequestExample: async (payload, waitOptions = {}) => {
          const response = await requestWorkedExample({ ...payload, answer: current.answer }, waitOptions);
          current.example = { ...response.example, meta: response.meta, requested_at: new Date().toISOString() };
          session.responses[session.current_index] = current;
          await set('sessions', { ...session, updated_at: new Date().toISOString() });
          return current.example;
        },
        onFollowup: session.followups_enabled ? (question, reason) => drawFollowup(session, questions, question, reason) : null,
        onNext: session.current_index < questions.length - 1 ? async () => {
          // A4: الإجابة محفوظة في استجابة السؤال الحالي؛ تُمسح مسودة خانة الإدخال قبل الانتقال.
          if (!session.responses[session.current_index]?.answer && session.draft_question_id === current.question.id && session.draft_answer) {
            session.responses[session.current_index] = { ...current, answer: session.draft_answer };
          }
          delete session.draft_answer;
          delete session.draft_question_id;
          session.current_index += 1;
          await set('sessions', { ...session, updated_at: new Date().toISOString() });
          drawQuestion(session, questions);
        } : null,
        onFinish: session.current_index >= questions.length - 1 ? () => finishSession(session) : null
      })
    );
  };

  const finishSession = async session => {
    cleanupSimulation();
    session.status = 'completed';
    session.completed_at = new Date().toISOString();
    delete session.draft_answer;
    delete session.draft_question_id;
    await set('sessions', session);
    const previousSessions = (await getAll('sessions'))
      .filter(item => item.status === 'completed' && item.id !== session.id)
      .sort((a, b) => String(a.completed_at || '').localeCompare(String(b.completed_at || '')));
    clear(root);
    scrollToTop();
    root.append(renderSessionSummary(session, { onRestart: drawSetup, previousSessions }));
  };

  const requestedQuestion = params.get('question') ? data.questionById.get(params.get('question')) : null;
  if (requestedQuestion) {
    const session = {
      id: sessionId(),
      mode: 'single',
      direct_training: true,
      answer_mode: params.get('answer') === 'text' ? 'text' : 'voice',
      followups_enabled: followupsEnabled,
      include_self_intro: false,
      created_at: new Date().toISOString(),
      status: 'in_progress',
      current_index: 0,
      question_ids: [requestedQuestion.id],
      responses: []
    };
    drawPrivacyGate(session, [requestedQuestion]);
  } else drawSetup();
}
