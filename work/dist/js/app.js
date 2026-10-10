import { loadData, loadQuestionAudit } from './data.js';
import { renderHome } from './home.js';
import { cleanupLearn, renderLearnIndex, renderLesson } from './learn.js';
import { renderCompetenciesIndex, renderCompetencyDetail, renderQuestionFocus } from './competencies.js';
import { renderQuestions } from './questions.js';
import { renderQuickReview, renderAnswerGuide } from './quick-review.js';
import { renderSelfIntroPage } from './self-intro.js';
import { renderTools } from './tools.js';
import { renderSavedQuestions } from './bookmarks.js';
import { el, clear, notice } from './ui.js';
import { purgeExpiredRecordings } from './storage.js';
import { loadLazy } from './lazy-load.js';

const root = document.querySelector('#main-content');
const backButton = document.querySelector('#back-button');
const appHeader = document.querySelector('#app-header');
const routeTitle = document.querySelector('#route-title');
const scrollPositions = new Map();
let activeHash = location.hash || '#/home';
const navigationStack = [activeHash];
let goingBack = false;
let replacingContext = false;
let data;
let routeSeq = 0;
// صفحات ثقيلة لا تلزم عند الإقلاع (المحاكاة والتقارير والإعدادات والبحث والتمارين وخريطة التغطية) تُحمَّل عند أول زيارة.
const lazyPages = {
  simulation: () => import('./simulation.js'),
  sessions: () => import('./sessions.js'),
  settings: () => import('./settings.js'),
  search: () => import('./search.js'),
  coverage: () => import('./coverage.js'),
  practice: () => import('./practice.js')
};
const loadedPages = {};

async function withPage(name, seq, render) {
  if (!loadedPages[name]) {
    loadedPages[name] = await loadLazy(root, lazyPages[name], () => seq === routeSeq);
    if (!loadedPages[name]) return;
  }
  if (seq === routeSeq) await render(loadedPages[name]);
}

function parseRoute() {
  const raw = location.hash.slice(1) || '/home';
  const [pathname, query = ''] = raw.split('?');
  return { parts: pathname.split('/').filter(Boolean), params: new URLSearchParams(query) };
}

async function route({ restoreScroll = false } = {}) {
  const seq = ++routeSeq;
  cleanupLearn();
  loadedPages.simulation?.cleanupSimulation();
  const dialog = document.querySelector('#app-dialog');
  if (dialog?.open) dialog.close();
  const { parts, params } = parseRoute();
  const page = parts[0] || 'home';
  updateChrome(page);
  root.setAttribute('aria-busy', 'true');
  try {
    if (page === 'home') await renderHome(root, data);
    else if (page === 'preparation' && parts[1] === 'review') await withPage('practice', seq, mod => mod.renderPractice(root, data, 'a5', params));
    else if (page === 'preparation' && parts[1]) await renderLesson(root, data, parts[1], params);
    else if (page === 'preparation') await renderLearnIndex(root, data);
    else if (page === 'reports' && parts[1]) await withPage('sessions', seq, mod => mod.renderSavedSession(root, parts[1]));
    else if (page === 'reports') await withPage('sessions', seq, mod => mod.renderSessions(root));
    else if (page === 'coverage') await withPage('coverage', seq, mod => mod.renderCoverageMap(root, data));
    else if (page === 'competencies' && parts[1]) await renderCompetencyDetail(root, data, parts[1], params);
    else if (page === 'competencies') await renderCompetenciesIndex(root, data);
    else if (page === 'questions') renderQuestions(root, data, params);
    else if (page === 'question' && parts[1]) await renderQuestionFocus(root, data, decodeURIComponent(parts[1]), params);
    else if (page === 'learn' && parts[1]) await renderLesson(root, data, parts[1], params);
    else if (page === 'learn') await renderLearnIndex(root, data);
    else if (page === 'practice') await withPage('practice', seq, mod => mod.renderPractice(root, data, parts[1], params));
    else if (page === 'bank') await renderCompetenciesIndex(root, data);
    else if (page === 'quick-review') renderQuickReview(root);
    else if (page === 'answer-guide') renderAnswerGuide(root);
    else if (page === 'self-intro') await renderSelfIntroPage(root);
    else if (page === 'simulation') await withPage('simulation', seq, mod => mod.renderSimulation(root, data, params));
    else if (page === 'sessions' && parts[1]) await withPage('sessions', seq, mod => mod.renderSavedSession(root, parts[1]));
    else if (page === 'sessions') await withPage('sessions', seq, mod => mod.renderSessions(root));
    else if (page === 'tools' && parts[1] === 'saved') renderSavedQuestions(root, data);
    else if (page === 'tools') renderTools(root);
    else if (page === 'evidence') renderTools(root);
    else if (page === 'search') await withPage('search', seq, mod => mod.renderSearch(root, data, params));
    else if (page === 'settings') await withPage('settings', seq, mod => mod.renderSettings(root, data));
    else clear(root).append(el('div', { class: 'card empty-state' },
      el('strong', { text: 'الصفحة غير موجودة' }),
      el('a', { class: 'button', href: '#/home', text: 'العودة إلى الرئيسية' })
    ));

    document.title = `${document.querySelector('h1')?.textContent || 'مدرّب المقابلات'} — مدرّب المقابلات القيادية`;
    root.focus({ preventScroll: true });
    const target = restoreScroll ? (scrollPositions.get(location.hash) || 0) : 0;
    requestAnimationFrame(() => window.scrollTo(0, target));
  } catch (error) {
    console.error(error);
    clear(root).append(notice(`حدث خطأ أثناء عرض الصفحة: ${error.message}`, 'danger'));
  } finally {
    if (seq === routeSeq) root.removeAttribute('aria-busy');
  }
}

function navPage(page) {
  if (page === 'preparation' || page === 'learn' || page === 'competencies' || page === 'questions' || page === 'question' || page === 'bank' || page === 'practice') return 'preparation';
  if (page === 'reports' || page === 'sessions' || page === 'coverage') return 'reports';
  if (page === 'simulation') return 'simulation';
  if (page === 'settings' || page === 'tools' || page === 'search') return 'more';
  return 'home';
}

function updateChrome(page) {
  const active = navPage(page);
  document.querySelectorAll('[data-nav]').forEach(link => {
    const isActive = link.dataset.nav === active;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.body.dataset.page = page;
  appHeader.hidden = page === 'home';
  backButton.hidden = page === 'home';
  backButton.disabled = page === 'home';
  delete backButton.dataset.returnHash;
  const titles = {
    preparation: 'التحضير للمقابلة', learn: 'التحضير للمقابلة', competencies: 'الكفاءات الثمانية',
    questions: 'الأسئلة', question: 'سؤال تدريبي', bank: 'الكفاءات الثمانية', practice: 'تمارين التعلّم', simulation: 'المحاكاة', reports: 'التقارير',
    sessions: 'التقارير', coverage: 'خريطة التغطية', settings: 'المزيد', search: 'البحث', tools: 'الأدوات',
    'quick-review': 'المراجعة السريعة', 'answer-guide': 'بناء الإجابة', 'self-intro': 'إعداد التعريف الشخصي'
  };
  routeTitle.textContent = titles[page] || 'مدرّب المقابلات';
}

function applyTheme(theme) {
  const next = ['dark', 'light', 'cream'].includes(theme) ? theme : 'cream';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('lic:theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0A1A1C' : next === 'light' ? '#FFFFFF' : '#F7F3EA');
}

function setupPreferences() {
  const savedTheme = localStorage.getItem('lic:theme');
  applyTheme(savedTheme || 'cream');
  document.documentElement.dataset.fontSize = localStorage.getItem('lic:font-size') || 'medium';
  document.documentElement.dataset.lineSpace = localStorage.getItem('lic:line-space') || 'comfortable';
  document.documentElement.dataset.accent = localStorage.getItem('lic:accent') || 'petrol';
  document.documentElement.dataset.contrast = localStorage.getItem('lic:contrast') || 'standard';
  document.documentElement.dataset.motion = localStorage.getItem('lic:motion') || 'full';
  window.addEventListener('lic:preferences', event => {
    if (event.detail?.theme) applyTheme(event.detail.theme);
    if (event.detail?.fontSize) document.documentElement.dataset.fontSize = event.detail.fontSize;
    if (event.detail?.lineSpace) document.documentElement.dataset.lineSpace = event.detail.lineSpace;
    if (event.detail?.accent) document.documentElement.dataset.accent = event.detail.accent;
    if (event.detail?.contrast) document.documentElement.dataset.contrast = event.detail.contrast;
    if (event.detail?.motion) document.documentElement.dataset.motion = event.detail.motion;
  });
}

function setupBackButton() {
  const returnToContext = returnHash => {
    if (!returnHash?.startsWith('#/')) return false;
    if (navigationStack.at(-2) === returnHash) {
      goingBack = true;
      history.back();
      return true;
    }
    replacingContext = true;
    location.replace(returnHash);
    return true;
  };
  window.addEventListener('lic:route-replaced', event => {
    const hash = event.detail?.hash;
    if (!hash?.startsWith('#/') || location.hash !== hash) return;
    activeHash = hash;
    navigationStack.splice(-1, 1, hash);
  });
  window.addEventListener('lic:return-to-context', event => returnToContext(event.detail?.returnHash));
  backButton.addEventListener('click', () => {
    const returnHash = backButton.dataset.returnHash;
    if (returnToContext(returnHash)) return;
    if (navigationStack.length > 1) {
      goingBack = true;
      history.back();
    } else location.hash = '#/home';
  });
}

// فحص سلامة قائمة المستبعدة (question-audit.json، ≈24KB) يعمل بعد أول عرض بدل تأخير الإقلاع.
// عدم التطابق يوقف التطبيق كما كان قبل التأجيل؛ فشل الجلب وحده لا يوقفه.
function verifyQuestionAudit() {
  loadQuestionAudit().then(audit => {
    if (data.manifest.counts.excluded_questions !== audit.excluded_question_count) {
      clear(root).append(notice('تعذر تشغيل التطبيق: فشل تحقق سلامة بيانات الأسئلة.', 'danger'));
    }
  }).catch(error => console.warn('Question audit check skipped:', error));
}

async function init() {
  setupPreferences();
  setupBackButton();
  try {
    purgeExpiredRecordings().catch(() => {});
    data = await loadData();
    if (data.manifest.counts.total_questions !== data.questions.length
      || data.manifest.counts.unique_question_ids !== new Set(data.questions.map(question => question.id)).size
      || data.manifest.counts.primary_questions !== data.curation.primary_ids.length
      || !data.questions.every(question => ['complete_source_star_l', 'approved_expanded_seal', 'complete_source_paragraph'].includes(question.model_answer_status))) {
      throw new Error('فشل تحقق سلامة بيانات الأسئلة.');
    }
    window.addEventListener('hashchange', async () => {
      scrollPositions.set(activeHash, window.scrollY);
      activeHash = location.hash || '#/home';
      if (replacingContext) {
        navigationStack.splice(-1, 1, activeHash);
        replacingContext = false;
      } else if (goingBack) {
        navigationStack.pop();
        goingBack = false;
      } else if (navigationStack.at(-1) !== activeHash) navigationStack.push(activeHash);
      await route({ restoreScroll: true });
    });
    await route();
    verifyQuestionAudit();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      const upgradingExistingInstall = Boolean(navigator.serviceWorker.controller);
      if (upgradingExistingInstall) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
      }
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .then(registration => registration.update())
        .catch(error => console.warn('Service worker:', error));
      // iOS يستأنف تطبيق الشاشة الرئيسية من الذاكرة دون إعادة تحميل، فلا يُفحص التحديث عند الإقلاع وحده.
      // نفحص عند العودة إلى الواجهة؛ إن وُجد إصدار أحدث يتولى محرك الخدمة الجديد الصفحة فتُعاد مرة واحدة (controllerchange).
      const checkForUpdate = () => navigator.serviceWorker.getRegistration()
        .then(registration => registration?.update())
        .catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
      window.addEventListener('pageshow', event => { if (event.persisted) checkForUpdate(); });
    }
  } catch (error) {
    console.error(error);
    clear(root).append(notice(`تعذر تشغيل التطبيق: ${error.message}`, 'danger'));
  }
}

init();
