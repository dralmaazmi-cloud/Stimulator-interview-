import { CONFIG } from './config.js';
import { clearAll, exportBackup, importBackup } from './storage.js';
import { el, button, clear, downloadJson, notice, pageHead, toast } from './ui.js';

export function renderSettings(root, data) {
  clear(root);
  root.append(pageHead('حسب راحتك في القراءة', 'الإعدادات', 'اختر المظهر وحجم النص، وتحكم في بياناتك المحفوظة على هذا الجهاز.'));
  const list = el('div', { class: 'settings-list' });

  const appearance = el('section', { class: 'card settings-card' },
    el('h2', { text: 'المظهر' }),
    el('p', { text: 'يمكنك التنقل بين المظهر الفاتح والداكن في أي وقت.' }),
    preferenceGroup('لون التطبيق', 'theme', [
      ['light', 'فاتح'], ['dark', 'غامق']
    ], document.documentElement.dataset.theme || 'light'),
    preferenceGroup('حجم الخط', 'fontSize', [
      ['small', 'صغير'], ['medium', 'متوسط'], ['large', 'كبير']
    ], localStorage.getItem('lic:font-size') || 'medium'),
    preferenceGroup('تباعد السطور', 'lineSpace', [
      ['compact', 'عادي'], ['comfortable', 'مريح']
    ], localStorage.getItem('lic:line-space') || 'comfortable')
  );

  const backup = el('section', { class: 'card settings-card' },
    el('h2', { text: 'النسخة الاحتياطية' }),
    el('p', { text: 'تتضمن تقدم الدراسة، والأسئلة المحفوظة، والجلسات والتقارير، وقوائم التحضير، ومسودة تقديم الذات. لا تتضمن المرجع لأنه جزء من التطبيق.' })
  );
  const file = el('input', { class: 'sr-only', type: 'file', accept: 'application/json,.json' });
  const exportButton = button('تصدير JSON', { variant: 'secondary small' });
  exportButton.addEventListener('click', async () => {
    const dataBackup = await exportBackup({ app_version: CONFIG.appVersion, reference_sha256: CONFIG.referenceSha256 });
    downloadJson(`interview-coach-backup-${new Date().toISOString().slice(0, 10)}.json`, dataBackup);
  });
  const importButton = button('استيراد نسخة', { variant: 'ghost small' });
  importButton.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    try {
      if (!file.files?.[0]) return;
      const text = await file.files[0].text();
      await importBackup(JSON.parse(text));
      toast('اكتمل الاستيراد. أعد تحميل الصفحة لرؤية جميع البيانات.');
    } catch (error) { toast(error.message); }
    file.value = '';
  });
  backup.append(el('div', { class: 'button-row' }, exportButton, importButton, file));

  const simulation = el('section', { class: 'card settings-card' },
    el('h2', { text: 'المحاكاة' }),
    el('p', { text: 'حدد الإعداد الافتراضي لأسئلة المتابعة. يمكنك تغييره أيضًا قبل بدء كل جلسة.' }),
    preferenceGroup('أسئلة المتابعة', 'followups', [
      ['on', 'مفعّلة'], ['off', 'متوقفة']
    ], localStorage.getItem('lic:followups') || 'on')
  );

  const privacy = el('section', { class: 'card settings-card' },
    el('h2', { text: 'الخصوصية' }),
    el('p', { text: 'التعلّم والبنك محليان. في المحاكاة فقط يُرسل الصوت للتفريغ ثم يُحذف، ويُرسل النص الذي راجعته للتقييم. الجلسات والتقارير تبقى على جهازك.' }),
    el('div', { class: 'button-row' }, button('حذف كل بياناتي المحلية', {
      variant: 'danger small',
      onClick: async () => {
        if (!window.confirm('سيُحذف التقدم والأسئلة المحفوظة والمسودات من هذا الجهاز. هل تريد المتابعة؟')) return;
        await clearAll();
        toast('تم حذف البيانات المحلية.');
        location.hash = '#/home';
      }
    }))
  );

  const info = el('section', { class: 'card settings-card' },
    el('h2', { text: 'معلومات النسخة' }),
    el('p', { text: `الإصدار ${CONFIG.appVersion} — نسخة اختبار` }),
    el('div', { class: 'divider' }),
    infoRow('الأسئلة الأساسية', `${data.manifest.counts.primary_questions} من 89`),
    infoRow('الصياغات الإضافية المحفوظة', String(data.manifest.counts.alternate_questions)),
    infoRow('الكفاءات', `${data.manifest.counts.competencies} من 8`),
    infoRow('تمارين الجولة', '3 كحد أقصى لكل وحدة'),
    infoRow('أزواج الصياغات القريبة', String(data.manifest.counts.variant_pairs)),
    shaRow('بصمة المرجع SHA-256', data.manifest.reference_sha256)
  );

  list.append(appearance, simulation, backup, privacy, info,
    notice('التطبيق أداة تعليم وتدريب. لا يصدر نجاحًا أو رسوبًا، ولا يتنبأ بنتيجة المقابلة الفعلية.', 'warning'));
  root.append(list);
}

function preferenceGroup(label, key, options, selected) {
  const group = el('div', { class: 'preference-row' }, el('strong', { text: label }));
  const choices = el('div', { class: 'segmented', role: 'group', 'aria-label': label });
  options.forEach(([value, text]) => {
    const choice = el('button', { type: 'button', class: value === selected ? 'active' : '', text });
    choice.addEventListener('click', () => {
      [...choices.children].forEach(item => item.classList.toggle('active', item === choice));
      const storageKey = ({
        theme: 'lic:theme',
        fontSize: 'lic:font-size',
        lineSpace: 'lic:line-space',
        followups: 'lic:followups'
      })[key];
      localStorage.setItem(storageKey, value);
      window.dispatchEvent(new CustomEvent('lic:preferences', { detail: { [key]: value } }));
    });
    choices.append(choice);
  });
  group.append(choices);
  return group;
}

// البند 9: البصمة الطويلة تُعرض مختصرة مع زر نسخ كي لا تمدّد الصفحة أفقيًا.
function shaRow(label, sha) {
  const copy = button('نسخ البصمة كاملة', {
    variant: 'ghost small',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(sha);
        toast('تم نسخ البصمة كاملة.');
      } catch {
        toast('تعذر النسخ تلقائيًا؛ البصمة الكاملة موجودة في ملف manifest.json.');
      }
    }
  });
  return el('div', { class: 'sha-row' },
    el('p', {}, el('strong', { text: `${label}: ` }), el('span', { class: 'ltr', title: sha, text: `${sha.slice(0, 12)}…` })),
    copy
  );
}

function infoRow(label, value, ltr = false) {
  return el('p', {}, el('strong', { text: `${label}: ` }), el('span', { class: ltr ? 'ltr' : '', text: value }));
}
