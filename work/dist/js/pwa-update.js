// إدارة تحديثات تطبيق الويب التقدّمي دون مقاطعة المستخدم.
// محرك الخدمة الجديد ينتظر (لا skipWaiting تلقائي) حتى تطلب الصفحة تفعيله:
// - فورًا إن لم تكن هناك مهمة جارية؛
// - وإلا يُؤجَّل حتى تنتهي المهمة (تسجيل، تفريغ، تقييم، شاشة سؤال أو تقرير في مقابلة جارية، نص غير مُرسل)،
//   مع تنبيه واحد لكل إصدار وزر «تحديث الآن» لمن يريد التطبيق فورًا.
// بعد التفعيل تُعاد الصفحة مرة واحدة فقط (controllerchange) مع حارس ضد حلقات إعادة التحميل.
import { button, el } from './ui.js';
import { wakeLockState } from './wake-lock.js';

const NOTICE_KEY = 'lic:update-notice-version';
const RELOAD_GUARD_KEY = 'lic:update-reloaded-at';
const SAFE_CHECK_MS = 4000;
const LOOP_GUARD_MS = 3000;

export function activeTask(doc = document) {
  if (wakeLockState.activeReasons().length) return 'background-work'; // تسجيل، تفريغ، تقييم، مؤقت التعريف
  const main = doc.querySelector('#main-content');
  if (!main) return null;
  const inSimulation = location.hash.startsWith('#/simulation');
  if (inSimulation && main.querySelector('.ai-question-card, .ai-working')) return 'simulation';
  if (inSimulation && main.querySelector('.evaluation-report') && !main.querySelector('.session-summary')) return 'simulation';
  const unsaved = [...main.querySelectorAll('textarea')].some(field => !field.readOnly && field.value.trim());
  return unsaved ? 'unsaved-text' : null;
}

function readStorage(store, key) { try { return store.getItem(key); } catch { return null; } }
function writeStorage(store, key, value) { try { store.setItem(key, value); } catch { /* ignore */ } }

function askVersion(worker) {
  return new Promise(resolve => {
    try {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(''), 1500);
      channel.port1.onmessage = event => { clearTimeout(timer); resolve(String(event.data || '')); };
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch { resolve(''); }
  });
}

export function initServiceWorker({ isBusy = activeTask } = {}) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const sw = navigator.serviceWorker;
  const hadController = Boolean(sw.controller); // التثبيت الأول: يتولى المحرك الصفحة دون حاجة لإعادة التحميل
  let waiting = null;
  let reloadWanted = false;
  let timer = null;
  let notice = null;

  const reloadOnce = () => {
    const last = Number(readStorage(sessionStorage, RELOAD_GUARD_KEY)) || 0;
    if (Date.now() - last < LOOP_GUARD_MS) return; // حارس ضد الحلقات: لا أكثر من إعادة واحدة متتالية
    writeStorage(sessionStorage, RELOAD_GUARD_KEY, String(Date.now()));
    location.reload();
  };

  const hideNotice = () => { notice?.remove(); notice = null; };

  const apply = () => {
    hideNotice();
    if (timer) { clearInterval(timer); timer = null; }
    if (waiting) {
      reloadWanted = true;
      waiting.postMessage({ type: 'SKIP_WAITING' }); // يتولى المحرك الجديد ثم controllerchange
    } else if (reloadWanted) {
      reloadOnce();
    }
  };

  const applyWhenSafe = () => { if (!isBusy()) apply(); };

  const showNoticeOnce = async () => {
    const version = waiting ? await askVersion(waiting) : 'controller';
    if (version && readStorage(localStorage, NOTICE_KEY) === version) return;
    if (version) writeStorage(localStorage, NOTICE_KEY, version);
    const region = document.querySelector('#toast-region');
    if (!region || notice) return;
    notice = el('div', { class: 'toast update-notice', role: 'status' },
      el('p', { text: 'يتوفر إصدار أحدث من التطبيق. سيُطبَّق تلقائيًا بعد انتهاء مهمتك الحالية، ولن تتأثر بياناتك.' }),
      el('div', { class: 'button-row' },
        button('تحديث الآن', { variant: 'secondary small', onClick: () => {
          const task = isBusy();
          if (task && !window.confirm(task === 'background-work'
            ? 'هناك تسجيل أو تقييم جارٍ وسيتوقف. هل تريد التحديث الآن؟'
            : 'سيُعاد تحميل التطبيق. ما كتبته محفوظ كمسودة، لكن قد تحتاج إلى استئناف المقابلة. هل تريد التحديث الآن؟')) return;
          apply();
        } }),
        button('لاحقًا', { variant: 'ghost small', onClick: hideNotice })));
    notice.style.pointerEvents = 'auto';
    region.replaceChildren(notice);
  };

  const handleWaiting = worker => {
    if (!worker || !sw.controller) return; // التثبيت الأول لا يحتاج إعادة تحميل
    waiting = worker;
    if (!isBusy()) { apply(); return; }
    showNoticeOnce();
    if (!timer) timer = setInterval(applyWhenSafe, SAFE_CHECK_MS);
  };

  sw.addEventListener('controllerchange', () => {
    if (!hadController && !reloadWanted) return; // أول تثبيت (clients.claim): الصفحة تعمل بالإصدار نفسه
    if (reloadWanted || !isBusy()) { reloadOnce(); return; }
    // تفعّل من نافذة أخرى أثناء مهمة هنا: نؤجل إعادة التحميل حتى تنتهي المهمة.
    reloadWanted = true;
    waiting = null;
    showNoticeOnce();
    if (!timer) timer = setInterval(applyWhenSafe, SAFE_CHECK_MS);
  });

  window.addEventListener('hashchange', () => { if (waiting || reloadWanted) setTimeout(applyWhenSafe, 300); });

  sw.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => {
      if (registration.waiting) handleWaiting(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') handleWaiting(worker); });
      });
      registration.update().catch(() => {});
      // iOS يستأنف تطبيق الشاشة الرئيسية من الذاكرة دون إعادة تحميل؛ نفحص التحديث عند العودة إلى الواجهة.
      const check = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('pageshow', event => { if (event.persisted) check(); });
    })
    .catch(error => console.warn('Service worker:', error));
}
