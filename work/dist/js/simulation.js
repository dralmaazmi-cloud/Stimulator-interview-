import { selectSessionQuestions } from './sim.js';
import { evaluateWithAi, getAiHealth, transcribeWithAi } from './evaluate-client.js';
import { AudioRecorder, recordingSupported } from './recorder.js';
import { renderEvaluationReport, renderSessionSummary } from './report.js';
import { get, getAll, getPendingRecording, pendingRecordingId, remove, removePendingRecording, savePendingRecording, set } from './storage.js';
import { el, button, clear, formatModel, formatType, notice, pageHead, tag, toast } from './ui.js';
import { acquireWakeLock, releaseAllWakeLocks, releaseWakeLock, wakeLockUnsupportedNoticeOnce } from './wake-lock.js';

const MODE_CONFIG = Object.freeze({
  single: { title: 'سؤال واحد', description: 'سؤال مع تقييم وتقرير سريع.', count: 1, minutes: '2–4 دقائق', icon: '▤' },
  realistic: { title: 'محاكاة واقعية', description: 'كفاءة واحدة وأسئلة متنوعة مع متابعات.', count: 2, minutes: 'نحو 7 دقائق', icon: '◎' },
  extended: { title: 'محاكاة ممتدة', description: 'عدة كفاءات أو مسار قيادة المهمة.', count: 5, minutes: 'نحو 16 دقيقة', icon: '▥' }
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

// alpha-4 (B5): عند الازدحام يُقفل زر إعادة الإرسال 15 ثانية فقط مع عدّ استرشادي من 60 ثانية؛
// عند 429 يُقفل فعليًا مدة Retry-After أو دقيقة. النص والتسجيل يبقيان دون تغيير.
export function retryLockPlan(error) {
  if (error?.code === 'AI_RATE_LIMITED') {
    const seconds = Number.isFinite(error.retryAfter) && error.retryAfter > 0 ? Math.ceil(error.retryAfter) : 60;
    return { lockSeconds: seconds, adviceSeconds: seconds, advisory: false };
  }
  return { lockSeconds: 15, adviceSeconds: 60, advisory: true };
}

function applyRetryLock(retryButton, error, host) {
  const plan = retryLockPlan(error);
  const countdown = el('small', { class: 'retry-countdown', 'aria-live': 'polite' });
  host.replaceChildren(notice(error.message || 'تعذّر إكمال الطلب الآن.', 'danger'), countdown);
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

const RETRYABLE_CLIENT_CODES = new Set(['AI_OVERLOADED', 'AI_RATE_LIMITED']);

// مشغّل تقييم واحد: يمنع الطلب المزدوج، يحمل قفل الشاشة أثناء الطلب، ويعرض «ما زلنا نحاول الاتصال…» بعد 8 ثوانٍ.
function createEvaluationRunner({ status, submit, retryButton, workingText, workingHint }) {
  let inFlight = false;
  return async function run(request, onSuccess) {
    if (inFlight) return;
    inFlight = true;
    submit.disabled = true;
    retryButton.disabled = true;
    const working = el('div', { class: 'card ai-working' },
      el('span', { class: 'loader' }),
      el('strong', { text: workingText }),
      workingHint ? el('small', { text: workingHint }) : null
    );
    status.replaceChildren(working);
    acquireWakeLock('evaluating');
    try {
      const response = await evaluateWithAi(request, { onSlow: text => working.append(el('small', { class: 'slow-notice', text })) });
      await onSuccess(response);
    } catch (error) {
      if (RETRYABLE_CLIENT_CODES.has(error?.code)) {
        submit.hidden = true;
        applyRetryLock(retryButton, error, status);
      } else {
        status.replaceChildren(notice(error.message || 'تعذّر التقييم.', 'danger'));
        submit.disabled = false;
      }
    } finally {
      inFlight = false;
      releaseWakeLock('evaluating');
    }
  };
}

function sessionId() {
  return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function chooseMixedQuestions(pool, count) {
  const behavioural = selectSessionQuestions(pool.filter(item => item.type === 'behavioural'), 1);
  const scenario = selectSessionQuestions(pool.filter(item => item.type === 'scenario'), 1);
  const first = [...behavioural, ...scenario];
  const blocked = new Set(first.map(item => item.variant_group).filter(Boolean));
  const remaining = pool.filter(item => !first.some(chosen => chosen.id === item.id) && (!item.variant_group || !blocked.has(item.variant_group)));
  return [...first, ...selectSessionQuestions(remaining, Math.max(0, count - first.length))].slice(0, count);
}

function buildQuestionSet(data, mode, scope, requestedId) {
  const requested = requestedId ? data.questionById.get(requestedId) : null;
  if (requested) return [requested];
  let pool = data.primaryQuestions;
  if (scope === 'mission') pool = pool.filter(item => item.owner_type === 'mission_command');
  else if (scope) pool = pool.filter(item => item.competency_id === scope || item.principle_id === scope);

  if (mode === 'single') return selectSessionQuestions(pool, 1);
  if (mode === 'realistic') {
    if (!scope) {
      const competency = data.competencies[Math.floor(Math.random() * data.competencies.length)];
      pool = pool.filter(item => item.competency_id === competency.id);
    }
    return chooseMixedQuestions(pool, Math.min(MODE_CONFIG.realistic.count, pool.length));
  }
  if (scope === 'mission') {
    return ['M1', 'M2', 'M3', 'M4', 'M5', 'M6']
      .map(principle => selectSessionQuestions(pool.filter(item => item.principle_id === principle), 1)[0])
      .filter(Boolean);
  }
  if (!scope) {
    const competencyIds = [...new Set(pool.map(item => item.competency_id).filter(Boolean))]
      .sort(() => Math.random() - 0.5)
      .slice(0, 4);
    const selected = competencyIds.flatMap(id => selectSessionQuestions(pool.filter(item => item.competency_id === id), 1));
    const blocked = new Set(selected.map(item => item.variant_group).filter(Boolean));
    const remaining = pool.filter(item => !selected.some(chosen => chosen.id === item.id)
      && (!item.variant_group || !blocked.has(item.variant_group)));
    return [...selected, ...selectSessionQuestions(remaining, Math.max(0, MODE_CONFIG.extended.count - selected.length))]
      .slice(0, MODE_CONFIG.extended.count);
  }
  return selectSessionQuestions(pool, Math.min(MODE_CONFIG.extended.count, pool.length));
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
  el('span', { class: 'simulation-mode-icon', text: config.icon }),
  el('div', {}, el('strong', { text: config.title }), el('p', { text: config.description }), el('small', { text: config.minutes })),
  el('span', { class: 'mode-radio', text: selected ? '●' : '○' })
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
    try {
      const response = await transcribeWithAi(recording.blob, recording.duration, { onSlow: text => { stateText.textContent = text; } });
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
      stateText.textContent = 'تعذر التفريغ';
      transcriptArea.hidden = false;
      if (RETRYABLE_CLIENT_CODES.has(error?.code)) applyRetryLock(resend, error, warning);
      else warning.replaceChildren(notice(`${error.message || 'تعذر تحويل التسجيل إلى نص.'} يمكنك إعادة إرسال التسجيل نفسه أو إعادة التسجيل.`, 'danger'));
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
      el('span', { text: 'أوافق على إرسال التسجيل لمزود الذكاء الاصطناعي للتفريغ ثم حذفه من ذاكرة الخادم.' })
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
  let includeSelfIntro = false;
  let selfIntroDuration = 60;
  let health = null;

  const healthHost = el('div', { class: 'ai-health-host' }, notice('جارٍ التحقق من خدمة المحاكاة…'));
  try {
    health = await getAiHealth();
    healthHost.replaceChildren(health.ai?.configured
      ? notice('خدمة المحاكاة متصلة وجاهزة للاختبار.', '', '✓')
      : notice('الواجهة جاهزة، لكن مسؤول التطبيق يحتاج إلى تهيئة مفتاح الخدمة في الخادم ثم إعادة النشر.', 'warning', '⚙'));
  } catch {
    healthHost.replaceChildren(notice('التعلّم والبنك يعملان، لكن خدمة المحاكاة غير متاحة الآن.', 'warning'));
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
    if (session.include_self_intro && !session.intro_response) drawSelfIntroduction(session, questions);
    else drawQuestion(session, questions);
  };

  const drawSetup = async () => {
    cleanupSimulation();
    clear(root);
    scrollToTop();
    const pending = (await inProgressSessions())[0] || null;
    root.append(
      pageHead('محاكاة المقابلة', 'اختيار المحاكاة', 'اختر طول الجلسة وطريقة الإجابة، ثم ابدأ التدريب.'),
      notice('أداة تدريب فقط. لا تقيس أداء المقابلة الفعلية ولا تصدر نجاحًا أو رسوبًا.', 'warning'),
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
    const redrawModes = () => {
      modeGrid.replaceChildren(...Object.entries(MODE_CONFIG).map(([id, config]) =>
        renderModeCard(id, config, selectedMode === id, next => {
          selectedMode = next;
          redrawModes();
          if (introOptions) introOptions.hidden = selectedMode === 'single';
        })
      ));
    };
    redrawModes();

    const answerSwitch = el('div', { class: 'segmented simulation-answer-switch', role: 'group', 'aria-label': 'طريقة الإجابة' });
    const drawAnswerSwitch = () => {
      answerSwitch.replaceChildren(...[
        ['text', '▤', 'إجابة نصية'],
        ['voice', '◉', 'إجابة صوتية']
      ].map(([id, icon, label]) => el('button', {
        type: 'button',
        class: answerMode === id ? 'active' : '',
        on: { click: () => { answerMode = id; drawAnswerSwitch(); } }
      }, el('span', { text: icon }), document.createTextNode(label))));
    };
    drawAnswerSwitch();

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
    const selfIntroToggle = el('input', { type: 'checkbox', checked: includeSelfIntro });
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
          el('small', { text: 'اختياري في المحاكاة الواقعية والممتدة.' })
        )
      ),
      el('label', { class: 'field' }, el('span', { text: 'المدة المستهدفة' }), durationSelect)
    );

    const startSession = async () => {
      const questions = buildQuestionSet(data, selectedMode, selectedScope, params.get('question'));
      if (!questions.length) {
        toast('لا توجد أسئلة ضمن هذا الاختيار.');
        return;
      }
      if (pending) {
        if (!window.confirm('لديك جلسة غير مكتملة. بدء جلسة جديدة سيحذفها. هل تريد المتابعة؟')) return;
        await remove('sessions', pending.id);
      }
      const session = {
        id: sessionId(),
        mode: selectedMode,
        answer_mode: answerMode,
        followups_enabled: followupsEnabled,
        include_self_intro: includeSelfIntro && selectedMode !== 'single',
        self_intro_duration: selfIntroDuration,
        created_at: new Date().toISOString(),
        status: 'in_progress',
        current_index: 0,
        question_ids: questions.map(item => item.id),
        responses: []
      };
      if (session.include_self_intro) drawSelfIntroduction(session, questions);
      else drawQuestion(session, questions);
    };

    root.append(el('section', { class: 'card simulation-setup-card section-block' },
      el('h2', { text: 'نوع المحاكاة' }), modeGrid,
      el('h2', { text: 'طريقة الإجابة' }), answerSwitch,
      el('label', { class: 'field' }, el('span', { text: 'الكفاءة أو المسار' }), scope),
      el('label', { class: 'toggle-row' }, followupToggle,
        el('span', {}, el('strong', { text: 'أسئلة المتابعة' }), el('small', { text: 'حتى سؤالين عند وجود نقص واضح فقط.' }))
      ),
      introOptions,
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
    // A4: المسودة مرتبطة بمعرّف السؤال؛ لا تُستعاد مسودة سؤال آخر.
    const draftForThisQuestion = session.draft_question_id === question.id ? session.draft_answer : '';
    let answer = session.responses[session.current_index]?.answer || draftForThisQuestion || '';
    const previousFollowups = session.responses[session.current_index]?.followups || [];
    clear(root);
    scrollToTop();
    const progressValue = Math.round(((session.current_index + 1) / questions.length) * 100);
    root.append(
      pageHead('المحاكاة', `السؤال ${session.current_index + 1} من ${questions.length}`, 'اقرأ السؤال، ثم أجب من خبرتك أو حلّل السيناريو.'),
      el('div', { class: 'simulation-progress', role: 'progressbar', 'aria-valuenow': String(progressValue), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        el('span', { style: { width: `${progressValue}%` } })
      ),
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
    answerInput.addEventListener('input', () => { answer = answerInput.value; scheduleDraft(); });
    if (session.answer_mode === 'voice') answerInput.hidden = !answer;

    const capture = session.answer_mode === 'voice'
      ? createVoicePanel(answerInput, value => { answer = value; scheduleDraft(); }, { sessionId: session.id, questionId: question.id, onPersistSession: () => set('sessions', { ...session, updated_at: new Date().toISOString() }) })
      : el('label', { class: 'field card text-answer-card' },
        el('span', { text: 'إجابتك' }), answerInput,
        el('small', { text: 'قيّم التطبيق المضمون، وليس اللغة أو الطلاقة.' })
      );
    const status = el('div', { class: 'evaluation-status' });
    const submit = button('إرسال الإجابة للتقييم', { className: 'wide' });
    const retryButton = button('إعادة الإرسال', { className: 'wide resend-evaluation', hidden: true });
    const runner = createEvaluationRunner({ status, submit, retryButton, workingText: 'جارٍ تحليل الأدلة والتحقق من الاقتباسات…', workingHint: 'قد يستغرق ذلك عدة ثوانٍ.' });

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
      capture,
      session.answer_mode === 'voice' ? el('label', { class: 'field transcript-field' },
        el('span', { text: 'راجع التفريغ وصححه' }), answerInput
      ) : null,
      status,
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
        session.responses[session.current_index] = { ...current, followups, report: response.report, meta: response.meta, evaluated_at: new Date().toISOString() };
        await set('sessions', { ...session, updated_at: new Date().toISOString() });
        drawReport(session, questions);
      });
    };
    resubmit.addEventListener('click', submitFollowup);
    retryButton.addEventListener('click', submitFollowup);
    root.append(el('section', { class: 'answer-capture section-block' },
      capture,
      session.answer_mode === 'voice' ? el('label', { class: 'field transcript-field' }, el('span', { text: 'راجع التفريغ وصححه' }), input) : null,
      status,
      resubmit,
      retryButton,
      button('تخطي المتابعة', { variant: 'ghost', className: 'wide', onClick: () => drawReport(session, questions) })
    ));
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

  drawSetup();
}
