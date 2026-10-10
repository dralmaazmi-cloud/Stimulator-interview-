// تحميل الوحدات عند الحاجة (dynamic import) مع حالة تحميل قصيرة وإشعار عربي عند الفشل.
// الوحدات المؤجَّلة تبقى في APP_SHELL داخل sw.js فتعمل دون اتصال بعد أول تحميل ناجح.
import { button, clear, el, notice } from './ui.js';

const SLOW_MS = 200;
export const LOAD_FAILED_TEXT = 'تعذّر تحميل هذا الجزء من التطبيق. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.';

function loadingScreen() {
  return el('section', { class: 'loading-screen', 'aria-live': 'polite' },
    el('span', { class: 'loader', 'aria-hidden': 'true' }),
    el('p', { text: 'جارٍ التحميل…' })
  );
}

function failureView() {
  return el('div', { class: 'card empty-state' },
    notice(LOAD_FAILED_TEXT, 'danger'),
    button('إعادة المحاولة', { onClick: () => location.reload() })
  );
}

// يشغّل loader (مثل () => import('./x.js')). إن تأخر أكثر من 200ms تظهر شاشة تحميل داخل root،
// وإن فشل يظهر إشعار عربي مع زر إعادة المحاولة ويُرجع null. isCurrent يمنع تعديل شاشة غادرها المستخدم.
export async function loadLazy(root, loader, isCurrent = () => true) {
  const timer = window.setTimeout(() => {
    if (isCurrent()) clear(root).append(loadingScreen());
  }, SLOW_MS);
  try {
    return await loader();
  } catch (error) {
    console.error('Lazy module failed to load:', error);
    if (isCurrent()) clear(root).append(failureView());
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
