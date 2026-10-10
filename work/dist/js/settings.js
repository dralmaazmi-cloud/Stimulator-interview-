import { CONFIG } from './config.js';
import { BACKUP_MAX_BYTES, clearAll, exportBackup, importBackup } from './storage.js';
import {
  bindExclusiveAccordions, button, clear, downloadJson, el, icon, notice, toast
} from './ui.js';

export function renderSettings(root, data) {
  clear(root);
  const screen = el('article', { class: 'more-screen' },
    el('header', { class: 'more-heading' },
      el('span', {}, icon('settings')),
      el('div', {}, el('h1', { text: 'المزيد' }), el('p', { text: 'خصّص تجربة القراءة وتحكّم في بياناتك وخصوصيتك.' }))
    ),
    el('section', { class: 'more-shortcuts', 'aria-label': 'اختصارات' },
      shortcut('search', 'البحث', 'ابحث في المحتوى', '#/search'),
      shortcut('bookmark', 'المحفوظات', 'أسئلتك المحفوظة', '#/tools/saved'),
      shortcut('competencies', 'الكفاءات', 'الشرح والأسئلة والتدريب', '#/competencies'),
      shortcut('target', 'خريطة التغطية', 'ما جرّبته وما لم تجرّبه بعد', '#/coverage')
    )
  );

  const accordion = el('section', { class: 'settings-accordion smart-accordion' });
  accordion.append(
    settingsItem('settings-appearance', 'palette', 'المظهر والقراءة', 'الألوان، الخلفية، الخط والحركة', appearancePanel()),
    settingsItem('settings-simulation', 'microphone', 'الصوت والمحاكاة', 'اختبار الميكروفون وأسئلة المتابعة', simulationPanel()),
    settingsItem('settings-data', 'database', 'البيانات والنسخة الاحتياطية', 'تصدير بياناتك أو استعادتها', backupPanel()),
    settingsItem('settings-privacy', 'privacy', 'الخصوصية والتحكم', 'كيف تُستخدم بياناتك وخيار الحذف', privacyPanel()),
    settingsItem('settings-about', 'book', 'عن التطبيق', 'الإصدار ومصادر المحتوى', infoPanel(data))
  );
  bindExclusiveAccordions(accordion, 'settings');
  screen.append(accordion,
    notice('التطبيق أداة تعليم وتدريب، ولا يصدر قرار نجاح أو رسوب ولا يتنبأ بنتيجة المقابلة الفعلية.', 'warning')
  );
  root.append(screen);
}

function shortcut(iconName, title, subtitle, href) {
  return el('a', { class: 'more-shortcut card', href },
    el('span', {}, icon(iconName)),
    el('strong', { text: title }),
    el('small', { text: subtitle })
  );
}

function settingsItem(id, iconName, title, subtitle, content, open = false) {
  return el('details', { class: 'smart-accordion-item settings-item', id, open },
    el('summary', {},
      el('span', { class: 'accordion-icon' }, icon(iconName)),
      el('span', { class: 'accordion-copy' }, el('strong', { text: title }), el('small', { text: subtitle })),
      el('i', { class: 'accordion-chevron', 'aria-hidden': 'true', text: '⌄' })
    ),
    el('div', { class: 'smart-accordion-body settings-item-body' }, content)
  );
}

function appearancePanel() {
  return el('div', { class: 'settings-panel' },
    preferenceGroup('الخلفية', 'theme', [
      ['cream', 'كريمي'], ['light', 'فاتح'], ['dark', 'داكن']
    ], document.documentElement.dataset.theme || 'cream'),
    preferenceGroup('اللون الأساسي', 'accent', [
      ['petrol', 'بترولي'], ['navy', 'كحلي'], ['sage', 'أخضر هادئ']
    ], localStorage.getItem('lic:accent') || 'petrol'),
    preferenceGroup('حجم الخط', 'fontSize', [
      ['small', 'صغير'], ['medium', 'متوسط'], ['large', 'كبير']
    ], localStorage.getItem('lic:font-size') || 'medium'),
    preferenceGroup('تباعد السطور', 'lineSpace', [
      ['compact', 'عادي'], ['comfortable', 'مريح']
    ], localStorage.getItem('lic:line-space') || 'comfortable'),
    preferenceGroup('التباين', 'contrast', [
      ['standard', 'قياسي'], ['high', 'مرتفع']
    ], localStorage.getItem('lic:contrast') || 'standard'),
    preferenceGroup('الحركة', 'motion', [
      ['full', 'سلسة'], ['reduced', 'مخففة']
    ], localStorage.getItem('lic:motion') || 'full'),
    button('استعادة المظهر الافتراضي', {
      variant: 'ghost small',
      onClick: () => {
        const defaults = { theme: 'cream', accent: 'petrol', fontSize: 'medium', lineSpace: 'comfortable', contrast: 'standard', motion: 'full' };
        Object.entries(defaults).forEach(([key, value]) => {
          const storageKey = preferenceStorageKey(key);
          localStorage.setItem(storageKey, value);
        });
        window.dispatchEvent(new CustomEvent('lic:preferences', { detail: defaults }));
        toast('تمت استعادة المظهر الافتراضي.');
        setTimeout(() => location.reload(), 350);
      }
    })
  );
}

function simulationPanel() {
  const state = el('div', { class: 'microphone-test-state', 'aria-live': 'polite' });
  const test = button('اختبار الميكروفون', {
    variant: 'secondary',
    onClick: async event => {
      event.currentTarget.disabled = true;
      state.replaceChildren(notice('جارٍ فحص الميكروفون…'));
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('غير مدعوم');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        state.replaceChildren(notice('الميكروفون متاح وجاهز للمحاكاة.', '', '✓'));
      } catch {
        state.replaceChildren(notice('تعذر الوصول إلى الميكروفون. تحقق من إذن المتصفح.', 'warning'));
      } finally { event.currentTarget.disabled = false; }
    }
  });
  return el('div', { class: 'settings-panel' },
    preferenceGroup('أسئلة المتابعة', 'followups', [
      ['on', 'مفعّلة'], ['off', 'متوقفة']
    ], localStorage.getItem('lic:followups') || 'on'),
    el('div', { class: 'settings-action-row' },
      el('div', {}, el('strong', { text: 'جاهزية الصوت' }), el('small', { text: 'الفحص لا يحفظ أي تسجيل.' })),
      test
    ),
    state,
    el('div', { class: 'connection-card' },
      icon(navigator.onLine ? 'readiness' : 'problem'),
      el('div', {}, el('strong', { text: navigator.onLine ? 'متصل بالإنترنت' : 'دون اتصال' }), el('small', { text: 'قسم التحضير يعمل دون اتصال بعد تحميله مرة واحدة.' }))
    )
  );
}

function backupPanel() {
  const file = el('input', { class: 'sr-only', type: 'file', accept: 'application/json,.json', 'aria-label': 'ملف النسخة الاحتياطية' });
  const includeAnswers = el('input', { type: 'checkbox', checked: true, id: 'backup-include-answers' });
  const answersNote = el('div', { class: 'backup-answers-note', role: 'status' });
  const refreshNote = () => answersNote.replaceChildren(includeAnswers.checked
    ? notice('يحتوي الملف على إجاباتك الشخصية وأسئلة المتابعة وتقاريرك. احفظه في مكان آمن ولا تشاركه مع أحد.', 'warning', '!')
    : notice('لن يتضمن الملف نصوص إجاباتك ولا أسئلة المتابعة ولا اقتباسات التقارير ولا تعليقات المقيّم النصية (الملخص والتعليق على المعايير ونقاط القوة والنواقص وخطوات التحسين)، وتبقى الدرجات والتصنيفات والتقدم.', '', 'ⓘ'));
  includeAnswers.addEventListener('change', refreshNote);
  refreshNote();
  const exportButton = button('تصدير البيانات', {
    onClick: async () => {
      try {
        const backup = await exportBackup(
          { app_version: CONFIG.appVersion, reference_sha256: CONFIG.referenceSha256 },
          { includeAnswers: includeAnswers.checked }
        );
        downloadJson(`interview-coach-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
        toast('تم تجهيز ملف النسخة الاحتياطية.');
      } catch (error) { toast(error.message || 'تعذر تصدير البيانات.', 5000, 'error'); }
    }
  });
  const importButton = button('استيراد نسخة', { variant: 'secondary', onClick: () => file.click() });
  file.addEventListener('change', async () => {
    try {
      if (!file.files?.[0]) return;
      if (file.files[0].size > BACKUP_MAX_BYTES) throw new Error('حجم ملف النسخة الاحتياطية أكبر من الحد المسموح (5 ميغابايت). لم تتغير بياناتك.');
      const text = await file.files[0].text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('ملف النسخة الاحتياطية غير صالح أو غير مدعوم. لم تتغير بياناتك.'); }
      await importBackup(parsed);
      toast('اكتمل استيراد البيانات بنجاح.');
    } catch (error) { toast(error.message || 'تعذر استيراد الملف.', 6000, 'error'); }
    file.value = '';
  });
  return el('div', { class: 'settings-panel' },
    el('p', { text: 'تتضمن النسخة تقدم التحضير، والأسئلة المحفوظة، وتمارين التعلّم، والجلسات والتقارير وقوائم الجاهزية، وسجل المحاولات وتدوير الأسئلة. يمكنك اختيار تضمين نصوص إجاباتك وأسئلة المتابعة أو استبعادها. التسجيلات الصوتية لا تدخل في التصدير.' }),
    el('label', { class: 'toggle-row' }, includeAnswers,
      el('span', {}, el('strong', { text: 'تضمين نصوص إجاباتك' }), el('small', { text: 'الإجابات المكتوبة أو المفرّغة، وأسئلة المتابعة، واقتباسات التقارير، وتعليقات المقيّم النصية' }))),
    answersNote,
    el('div', { class: 'document-actions' }, exportButton, importButton, file)
  );
}

function privacyPanel() {
  return el('div', { class: 'settings-panel' },
    el('ul', { class: 'privacy-points' },
      el('li', { text: 'المحتوى التعليمي وتقدمك وتقاريرك محفوظة محليًا على جهازك.' }),
      el('li', { text: 'عند المحاكاة، يُرسل النص الذي راجعته للتقييم فقط.' }),
      el('li', { text: 'تجنّب إدخال أسماء أو بيانات شخصية أو معلومات وظيفية سرية أو حساسة.' }),
      el('li', { text: 'أخفِ الهوية، لكن احتفظ بتفاصيل الموقف ودورك وإجراءاتك والنتيجة حتى يبقى التقييم دقيقًا.' }),
      el('li', { text: 'يطلب التطبيق من المزود عدم تخزين المحتوى، لكنه يغادر جهازك مؤقتًا للمعالجة.' }),
      el('li', { text: 'لا يُنشئ التطبيق سجل محادثة دائمًا، ولا يحتفظ بالتسجيل الصوتي بعد تحويله إلى نص.' })
    ),
    button('حذف جميع بياناتي المحلية', {
      variant: 'danger',
      onClick: async () => {
        if (!window.confirm('سيُحذف التقدم والتقارير والمسودات من هذا الجهاز. هل تريد المتابعة؟')) return;
        await clearAll();
        toast('تم حذف البيانات المحلية.');
        location.hash = '#/home';
      }
    })
  );
}

function infoPanel(data) {
  return el('div', { class: 'settings-panel app-info-panel' },
    infoRow('الإصدار', `${String(CONFIG.appVersion).split('-')[0]} — نسخة اختبار`),
    infoRow('عنوان التطبيق', location.host),
    infoRow('أسئلة التدريب', `${data.manifest.counts.primary_questions} بإجابة نموذجية إرشادية`),
    infoRow('الكفاءات', `${data.manifest.counts.competencies} من 8`),
    infoRow('محطات التحضير', String(data.manifest.counts.lessons))
  );
}

function preferenceStorageKey(key) {
  return ({
    theme: 'lic:theme', accent: 'lic:accent', fontSize: 'lic:font-size', lineSpace: 'lic:line-space',
    contrast: 'lic:contrast', motion: 'lic:motion', followups: 'lic:followups'
  })[key];
}

function preferenceGroup(label, key, options, selected) {
  const group = el('div', { class: 'preference-row' }, el('strong', { text: label }));
  const choices = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
  options.forEach(([value, text]) => {
    const choice = el('button', {
      type: 'button', class: value === selected ? 'active' : '', text,
      'aria-pressed': String(value === selected),
      'data-swatch': key === 'theme' || key === 'accent' ? value : null
    });
    choice.addEventListener('click', () => {
      [...choices.children].forEach(item => {
        item.classList.toggle('active', item === choice);
        item.setAttribute('aria-pressed', String(item === choice));
      });
      localStorage.setItem(preferenceStorageKey(key), value);
      window.dispatchEvent(new CustomEvent('lic:preferences', { detail: { [key]: value } }));
    });
    choices.append(choice);
  });
  group.append(choices);
  return group;
}

function infoRow(label, value) {
  return el('p', {}, el('strong', { text: label }), el('span', { text: value }));
}
