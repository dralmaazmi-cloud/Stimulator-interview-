// alpha-4 (A1): قفل إبقاء الشاشة مضاءة. مجموعة أسباب نشطة (لا عدّاد)، طلب واحد عند أول سبب،
// تحرير عند زوال آخر سبب، وإعادة الطلب عند العودة إلى الواجهة إذا بقي سبب نشط.
// كل العمليات داخل try/catch؛ الفشل لا يوقف المهمة ولا يظهر خطأً تقنيًا.
export const WAKE_LOCK_REASONS = Object.freeze(['recording', 'transcribing', 'evaluating', 'self-intro-timer']);

export function createWakeLockController(env = {}) {
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const doc = env.document ?? (typeof document !== 'undefined' ? document : undefined);
  const win = env.window ?? (typeof window !== 'undefined' ? window : undefined);
  const reasons = new Set();
  let sentinel = null;
  let requesting = null;
  let listenersAttached = false;
  let warnedUnsupported = false;

  const supported = () => Boolean(nav?.wakeLock?.request);

  const onRelease = () => {
    sentinel = null;
    // أسقطه النظام (مثلًا عند إخفاء الصفحة)؛ يُعاد طلبه عند العودة إن بقي سبب نشط.
  };

  const request = async () => {
    if (!supported() || sentinel || requesting) return sentinel;
    if (doc && doc.visibilityState === 'hidden') return null;
    requesting = (async () => {
      try {
        const lock = await nav.wakeLock.request('screen');
        if (!reasons.size) {
          try { await lock.release(); } catch { /* ignore */ }
          return null;
        }
        sentinel = lock;
        try { lock.addEventListener?.('release', onRelease); } catch { /* ignore */ }
        return lock;
      } catch {
        return null;
      } finally {
        requesting = null;
      }
    })();
    return requesting;
  };

  const release = async () => {
    const lock = sentinel;
    sentinel = null;
    if (!lock) return;
    try { lock.removeEventListener?.('release', onRelease); } catch { /* ignore */ }
    try { await lock.release(); } catch { /* ignore */ }
  };

  const onVisibilityChange = () => {
    if (doc?.visibilityState === 'visible' && reasons.size && !sentinel) request();
  };
  const onPageHide = () => { releaseAllWakeLocks(); };

  const attachListeners = () => {
    if (listenersAttached || !doc) return;
    try {
      doc.addEventListener('visibilitychange', onVisibilityChange);
      win?.addEventListener?.('pagehide', onPageHide);
      listenersAttached = true;
    } catch { /* ignore */ }
  };
  const detachListeners = () => {
    if (!listenersAttached || !doc) return;
    try {
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      win?.removeEventListener?.('pagehide', onPageHide);
    } catch { /* ignore */ }
    listenersAttached = false;
  };

  async function acquireWakeLock(reason) {
    if (!WAKE_LOCK_REASONS.includes(reason)) return false;
    const first = reasons.size === 0;
    reasons.add(reason);
    attachListeners();
    if (first || !sentinel) await request();
    return Boolean(sentinel);
  }

  async function releaseWakeLock(reason) {
    if (!reasons.has(reason)) return;
    reasons.delete(reason);
    if (reasons.size === 0) {
      await release();
      detachListeners();
    }
  }

  async function releaseAllWakeLocks() {
    reasons.clear();
    await release();
    detachListeners();
  }

  // تنبيه مرة واحدة فقط عند غياب الدعم (A5)؛ يستدعيه العميل داخل شاشة التسجيل فقط.
  function unsupportedNoticeOnce() {
    if (supported() || warnedUnsupported) return '';
    warnedUnsupported = true;
    return 'أبقِ الشاشة مضاءة أثناء التسجيل؛ جهازك لا يدعم منع الإقفال التلقائي.';
  }

  return {
    acquireWakeLock,
    releaseWakeLock,
    releaseAllWakeLocks,
    unsupportedNoticeOnce,
    isSupported: supported,
    activeReasons: () => [...reasons],
    isHeld: () => Boolean(sentinel),
    hasListeners: () => listenersAttached
  };
}

const shared = createWakeLockController();
export const acquireWakeLock = shared.acquireWakeLock;
export const releaseWakeLock = shared.releaseWakeLock;
export const releaseAllWakeLocks = shared.releaseAllWakeLocks;
export const wakeLockUnsupportedNoticeOnce = shared.unsupportedNoticeOnce;
export const wakeLockSupported = shared.isSupported;
export const wakeLockState = { activeReasons: shared.activeReasons, isHeld: shared.isHeld, hasListeners: shared.hasListeners };
