// أزرار الطباعة وتصدير PDF. وحدة print-book.js (≈20KB) تُحمَّل فقط عند الضغط على أحد الزرين.
import { button, el, setBusy, toast } from './ui.js';

async function openPrintBook(control, data, context, action) {
  if (control.getAttribute('aria-busy') === 'true') return;
  setBusy(control, true);
  try {
    const { chooseScope } = await import('./print-book.js');
    chooseScope(data, context, action);
  } catch (error) {
    console.error('print-book failed to load:', error);
    toast('تعذّر تحميل أداة الطباعة. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.', 4200, 'error');
  } finally {
    setBusy(control, false);
  }
}

export function bookActions(data, context, label = 'المحتوى') {
  return el('div', { class: 'document-actions no-print', 'aria-label': `خيارات ${label}` },
    button('طباعة', {
      className: 'document-action primary',
      onClick: event => openPrintBook(event.currentTarget, data, context, 'print')
    }),
    button('تصدير PDF', {
      variant: 'secondary',
      className: 'document-action',
      onClick: event => openPrintBook(event.currentTarget, data, context, 'export')
    })
  );
}
