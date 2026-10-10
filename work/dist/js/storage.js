const DB_NAME = 'leadership-interview-coach';
// alpha-5: الإصدار 3 يضيف مخزني «attempts» (سجل المحاولات لكل سؤال، بلا نص إجابة) و«rotation» (تدوير الأسئلة).
// الترحيل لا يفقد بيانات: تُنشأ المخازن الناقصة فقط ولا يُحذف أو يُعاد كتابة أي مخزن قائم.
export const DB_VERSION = 3;
export const STORES = ['settings', 'progress', 'stories', 'sessions', 'checklists', 'review', 'attempts', 'rotation'];
export const MAX_ATTEMPTS_PER_QUESTION = 5;
// alpha-4 (A3): مخزن مستقل للتسجيل الصوتي المعلق؛ لا يدخل في التصدير ولا يُكتب في localStorage.
const PENDING_RECORDINGS = 'pending_recordings';
const PENDING_RECORDING_TTL_MS = 24 * 60 * 60 * 1000;
const memoryPendingRecordings = new Map();
let pendingStorageDegraded = false;
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => upgradeDatabase(request.result, event.oldVersion);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// دالة ترحيل خالصة (قابلة للاختبار): تنشئ المخازن الناقصة فقط. تعيد أسماء المخازن التي أُنشئت.
export function upgradeDatabase(db, oldVersion = 0) {
  const created = [];
  [...STORES, PENDING_RECORDINGS].forEach(store => {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: 'id' });
      created.push(store);
    }
  });
  return { from: Number(oldVersion) || 0, to: DB_VERSION, created };
}

function fallbackKey(store) { return `lic:${store}`; }
function fallbackRead(store) {
  try { return JSON.parse(localStorage.getItem(fallbackKey(store)) || '[]'); }
  catch { return []; }
}
function fallbackWrite(store, values) { localStorage.setItem(fallbackKey(store), JSON.stringify(values)); }

async function transaction(store, mode, operation) {
  const db = await openDb();
  if (!db) return operation(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const objectStore = tx.objectStore(store);
    let result;
    try { result = operation(objectStore); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function get(store, id) {
  const db = await openDb();
  if (!db) return fallbackRead(store).find(item => item.id === id) ?? null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDb();
  if (!db) return fallbackRead(store);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function set(store, value) {
  if (!value?.id) throw new Error('Stored values require an id.');
  const db = await openDb();
  if (!db) {
    const values = fallbackRead(store).filter(item => item.id !== value.id);
    values.push(value);
    fallbackWrite(store, values);
    return value;
  }
  await transaction(store, 'readwrite', objectStore => objectStore.put(value));
  return value;
}

export async function remove(store, id) {
  const db = await openDb();
  if (!db) {
    fallbackWrite(store, fallbackRead(store).filter(item => item.id !== id));
    return;
  }
  await transaction(store, 'readwrite', objectStore => objectStore.delete(id));
}

export async function clearStore(store) {
  const db = await openDb();
  if (!db) { localStorage.removeItem(fallbackKey(store)); return; }
  await transaction(store, 'readwrite', objectStore => objectStore.clear());
}

export async function clearAll() {
  await Promise.all([...STORES, PENDING_RECORDINGS].map(clearStore).map(promise => promise.catch(() => {})));
  memoryPendingRecordings.clear();
  Object.keys(localStorage)
    .filter(key => key.startsWith('lic:'))
    .forEach(key => localStorage.removeItem(key));
}

export const BACKUP_FORMAT = 'leadership-interview-coach-backup';
export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;
const BACKUP_SCHEMA_VERSIONS = [1, 2];
const V2_KEY_PREFIX = 'lic:v2:';
const V2_KEY_PATTERN = /^lic:v2:[A-Za-z0-9:_.-]{1,80}$/;
const MAX_RECORDS_PER_STORE = 5000;
const MAX_V2_VALUE_BYTES = 200 * 1024;

function localKeys(prefix) {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(prefix));
  } catch {
    return [];
  }
}

// مفاتيح تمارين التعلّم lic:v2:* كقيم JSON مفككة (تُدرج في النسخة الاحتياطية).
function readV2Keys() {
  const values = {};
  localKeys(V2_KEY_PREFIX).forEach(key => {
    try { values[key] = JSON.parse(localStorage.getItem(key)); } catch { /* قيمة تالفة: تُتجاوز */ }
  });
  return values;
}

// حقول نصوص الإجابات داخل الجلسات: تُفرَّغ عند تصدير نسخة بلا نصوص (تطابق تامّ للمفتاح).
const TEXT_KEYS_EMPTY_STRING = new Set(['answer', 'transcript', 'draft_answer', 'original_answer']);
const TEXT_KEYS_EMPTY_LIST = new Set(['followups', 'follow_ups', 'evidence', 'quotes']);
const TEXT_KEYS_NULL = new Set(['example']);
// حقول نص المقيّم الحرّة في تقرير التقييم (justification وimprove وsummary وstrengths وmissing وnext_actions وغيرها):
// قد تُعيد صياغة الإجابة أو تقتبس منها، فتُفرَّغ هي أيضًا. الدرجات والتصنيفات وأرقام المعايير (key وscore) وأعلام التحقق تبقى.
const REPORT_TEXT_EMPTY_STRING = new Set(['justification', 'improve', 'summary']);
const REPORT_TEXT_EMPTY_LIST = new Set([
  'strengths', 'gaps', 'missing', 'next_actions', 'follow_up_questions', 'follow_up_reasons', 'supporting', 'negative'
]);
const REPORT_FEEDBACK_KEY = /feedback/i;

export function stripAnswerText(value) {
  if (Array.isArray(value)) return value.map(stripAnswerText);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (TEXT_KEYS_EMPTY_STRING.has(key) && typeof item === 'string') result[key] = '';
    else if (TEXT_KEYS_EMPTY_LIST.has(key) && Array.isArray(item)) result[key] = [];
    else if (key === 'quote' && typeof item === 'string') result[key] = '';
    else if (TEXT_KEYS_NULL.has(key) && item && typeof item === 'object') result[key] = null;
    else if ((REPORT_TEXT_EMPTY_STRING.has(key) || REPORT_FEEDBACK_KEY.test(key)) && typeof item === 'string') result[key] = '';
    else if ((REPORT_TEXT_EMPTY_LIST.has(key) || REPORT_FEEDBACK_KEY.test(key)) && Array.isArray(item)) result[key] = [];
    else result[key] = stripAnswerText(item);
  }
  return result;
}

export async function exportBackup(metadata = {}, options = {}) {
  const includeAnswers = options.includeAnswers !== false;
  const stores = {};
  for (const store of STORES) stores[store] = await getAll(store);
  let bookmarks = [];
  try { bookmarks = JSON.parse(localStorage.getItem('lic:bookmarked-questions') || '[]'); } catch { bookmarks = []; }
  if (!includeAnswers) {
    stores.sessions = stores.sessions.map(stripAnswerText);
    // المسودة المحلية للتعريف الشخصي نص شخصي أيضًا؛ ومخزن القصص غير مستخدم لكنه مخصص لنصوص المتعلم.
    stores.settings = stores.settings.filter(item => item.id !== 'self-intro-draft');
    stores.stories = [];
  }
  return {
    format: BACKUP_FORMAT,
    schema_version: 2,
    exported_at: new Date().toISOString(),
    include_answers: includeAnswers,
    metadata,
    stores,
    bookmarks: Array.isArray(bookmarks) ? bookmarks.filter(item => typeof item === 'string') : [],
    v2: readV2Keys()
  };
}

const INVALID = 'ملف النسخة الاحتياطية غير صالح أو غير مدعوم. لم تتغير بياناتك.';
const fail = detail => { throw new Error(detail ? `${INVALID} (${detail})` : INVALID); };
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isIdType = value => (typeof value === 'string' && value.length > 0 && value.length <= 300) || (typeof value === 'number' && Number.isFinite(value));

// يتحقق من النسخة كاملة قبل أي كتابة. يرمي خطأً بالعربية ولا يغيّر شيئًا.
export function validateBackup(backup, { maxBytes = BACKUP_MAX_BYTES } = {}) {
  if (!isPlainObject(backup) || backup.format !== BACKUP_FORMAT) fail();
  if (!BACKUP_SCHEMA_VERSIONS.includes(backup.schema_version)) fail('إصدار غير مدعوم');
  let size = 0;
  try {
    const json = JSON.stringify(backup);
    size = typeof TextEncoder === 'function' ? new TextEncoder().encode(json).length : json.length;
  } catch { fail(); }
  if (size > maxBytes) throw new Error('حجم ملف النسخة الاحتياطية أكبر من الحد المسموح (5 ميغابايت). لم تتغير بياناتك.');
  if (backup.stores !== undefined && !isPlainObject(backup.stores)) fail('بنية المخازن');
  for (const store of STORES) {
    const records = backup.stores?.[store];
    if (records === undefined) continue;
    if (!Array.isArray(records)) fail(`المخزن ${store}`);
    if (records.length > MAX_RECORDS_PER_STORE) fail(`المخزن ${store} كبير جدًا`);
    for (const record of records) {
      if (!isPlainObject(record) || !isIdType(record.id)) fail(`سجل غير صالح في ${store}`);
      if (hasForbiddenKey(record)) fail(`سجل غير آمن في ${store}`);
      validateRecordShape(store, record);
    }
  }
  if (backup.bookmarks !== undefined && (!Array.isArray(backup.bookmarks) || !backup.bookmarks.every(item => typeof item === 'string'))) {
    fail('المحفوظات');
  }
  if (backup.v2 !== undefined) {
    if (!isPlainObject(backup.v2)) fail('تمارين التعلّم');
    for (const [key, value] of Object.entries(backup.v2)) {
      if (!V2_KEY_PATTERN.test(key)) fail('مفتاح تمارين غير صالح');
      let encoded;
      if (hasForbiddenKey(value)) fail('قيمة تمارين غير آمنة');
      try { encoded = JSON.stringify(value); } catch { fail('قيمة تمارين غير صالحة'); }
      if (encoded === undefined || encoded.length > MAX_V2_VALUE_BYTES) fail('قيمة تمارين غير صالحة');
    }
  }
  return true;
}

// L-A: مفاتيح تلوّث النموذج الأولي (prototype pollution) مرفوضة في أي مستوى من السجلات المستوردة.
// JSON.parse ينشئ __proto__ كمفتاح عادي، لذا يظهر في Object.keys. العمق الأقصى 12؛ ما بعده يُرفض.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const BACKUP_MAX_DEPTH = 12;

export function hasForbiddenKey(value, depth = 0) {
  if (!value || typeof value !== 'object') return false;
  if (depth > BACKUP_MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some(item => hasForbiddenKey(item, depth + 1));
  return Object.keys(value).some(key => FORBIDDEN_KEYS.has(key) || hasForbiddenKey(value[key], depth + 1));
}

function validateRecordShape(store, record) {
  const bad = detail => fail(`${store}: ${detail}`);
  if (store === 'sessions') {
    if (record.responses !== undefined && !Array.isArray(record.responses)) bad('responses');
    if (record.status !== undefined && typeof record.status !== 'string') bad('status');
    if (record.question_ids !== undefined && !Array.isArray(record.question_ids)) bad('question_ids');
  } else if (store === 'progress') {
    if (record.completed !== undefined && typeof record.completed !== 'boolean') bad('completed');
  } else if (store === 'checklists') {
    if (record.checked !== undefined && (!Array.isArray(record.checked) || !record.checked.every(Number.isFinite))) bad('checked');
  } else if (store === 'attempts') {
    if (record.attempts !== undefined && !Array.isArray(record.attempts)) bad('attempts');
  } else if (store === 'rotation') {
    if (record.count !== undefined && !Number.isFinite(record.count)) bad('count');
    if (record.last_shown_at !== undefined && typeof record.last_shown_at !== 'string') bad('last_shown_at');
  }
}

export async function importBackup(backup) {
  validateBackup(backup);
  // لقطة من الحالة الحالية لاستعادتها إن فشلت الكتابة في منتصف الاستيراد.
  const snapshot = {};
  for (const store of STORES) snapshot[store] = await getAll(store);
  const previousBookmarks = localStorage.getItem('lic:bookmarked-questions');
  const previousV2 = {};
  localKeys(V2_KEY_PREFIX).forEach(key => { previousV2[key] = localStorage.getItem(key); });
  try {
    for (const store of STORES) {
      await clearStore(store);
      for (const value of backup.stores?.[store] || []) await set(store, value);
    }
    localStorage.setItem('lic:bookmarked-questions', JSON.stringify(Array.isArray(backup.bookmarks) ? backup.bookmarks : []));
    if (backup.v2) {
      localKeys(V2_KEY_PREFIX).forEach(key => localStorage.removeItem(key));
      for (const [key, value] of Object.entries(backup.v2)) localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    try {
      for (const store of STORES) {
        await clearStore(store);
        for (const value of snapshot[store]) await set(store, value);
      }
      if (previousBookmarks == null) localStorage.removeItem('lic:bookmarked-questions');
      else localStorage.setItem('lic:bookmarked-questions', previousBookmarks);
      localKeys(V2_KEY_PREFIX).forEach(key => localStorage.removeItem(key));
      Object.entries(previousV2).forEach(([key, value]) => { if (value != null) localStorage.setItem(key, value); });
    } catch { /* الاستعادة بأفضل جهد */ }
    throw new Error('تعذر استيراد النسخة الاحتياطية، وأُعيدت بياناتك السابقة.');
  }
}

// ---------- التسجيل الصوتي المعلق (A3) ----------
export function pendingRecordingId(sessionId, questionId) {
  return `${sessionId}:${questionId}`;
}

// يعيد true إذا تعذر IndexedDB وتم الحفظ في الذاكرة فقط (يُعرض تنبيه مرة واحدة).
export function pendingRecordingStorageDegraded() {
  return pendingStorageDegraded;
}

export async function savePendingRecording(record) {
  const value = { ...record, created_at: record.created_at || Date.now() };
  if (!value.id) throw new Error('Pending recordings require an id.');
  try {
    const db = await openDb();
    if (!db) throw new Error('IndexedDB unavailable');
    await transaction(PENDING_RECORDINGS, 'readwrite', objectStore => objectStore.put(value));
    memoryPendingRecordings.delete(value.id);
    return { stored: 'indexeddb' };
  } catch {
    pendingStorageDegraded = true;
    memoryPendingRecordings.set(value.id, value);
    return { stored: 'memory' };
  }
}

export async function getPendingRecording(id, now = Date.now()) {
  const memory = memoryPendingRecordings.get(id);
  if (memory) return memory;
  try {
    const db = await openDb();
    if (!db) return null;
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_RECORDINGS, 'readonly');
      const request = tx.objectStore(PENDING_RECORDINGS).get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    if (record && now - Number(record.created_at || 0) > PENDING_RECORDING_TTL_MS) {
      await removePendingRecording(id);
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export async function removePendingRecording(id) {
  memoryPendingRecordings.delete(id);
  try {
    const db = await openDb();
    if (!db) return;
    await transaction(PENDING_RECORDINGS, 'readwrite', objectStore => objectStore.delete(id));
  } catch { /* ignore */ }
}

// تنظيف السجلات المنتهية (أقدم من 24 ساعة) عند تشغيل التطبيق.
export async function purgeExpiredRecordings(now = Date.now()) {
  let removed = 0;
  for (const [id, record] of memoryPendingRecordings) {
    if (now - Number(record.created_at || 0) > PENDING_RECORDING_TTL_MS) { memoryPendingRecordings.delete(id); removed += 1; }
  }
  try {
    const db = await openDb();
    if (!db) return removed;
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_RECORDINGS, 'readonly');
      const request = tx.objectStore(PENDING_RECORDINGS).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    for (const record of records) {
      if (now - Number(record.created_at || 0) > PENDING_RECORDING_TTL_MS) {
        await transaction(PENDING_RECORDINGS, 'readwrite', objectStore => objectStore.delete(record.id));
        removed += 1;
      }
    }
  } catch { /* ignore */ }
  return removed;
}

// ---------- alpha-5 (R5): سجل المحاولات لكل سؤال — بلا نص إجابة ----------
// attempt = { key, at, score, classification, criteria: {key: score}, elements_complete, elements_total, weights_version }
export function attemptSummary(report, key, at = new Date().toISOString()) {
  if (!report || report.trusted === false || !Number.isFinite(report.final_score)) return null;
  const criteria = {};
  (report.criteria || []).forEach(item => { if (item?.key) criteria[item.key] = Number(item.score) || 0; });
  const elements = {};
  Object.entries(report.elements || {}).forEach(([name, value]) => { elements[name] = Boolean(value?.complete); });
  return {
    key,
    at,
    score: report.final_score,
    classification: report.classification || '',
    criteria,
    elements,
    elements_complete: Number.isFinite(report.elements_complete) ? report.elements_complete : null,
    elements_total: Number.isFinite(report.elements_total) ? report.elements_total : null,
    weights_version: report.weights_version || ''
  };
}

export async function recordAttempt(questionId, attempt) {
  if (!questionId || !attempt) return null;
  const current = (await get('attempts', questionId)) || { id: questionId, attempts: [] };
  const attempts = (current.attempts || []).filter(item => item.key !== attempt.key);
  attempts.push(attempt);
  attempts.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const value = { id: questionId, attempts: attempts.slice(-MAX_ATTEMPTS_PER_QUESTION), updated_at: new Date().toISOString() };
  await set('attempts', value);
  return value;
}

export async function attemptsFor(questionId) {
  const value = await get('attempts', questionId);
  return Array.isArray(value?.attempts) ? value.attempts : [];
}

// المحاولة السابقة القابلة للمقارنة: آخر محاولة قبل المفتاح الحالي بنسخة الأوزان نفسها.
export function previousComparableAttempt(attempts, currentKey, weightsVersion) {
  const list = attempts || [];
  const current = list.find(item => item.key === currentKey);
  const others = list.filter(item => item.key !== currentKey
    && item.weights_version === weightsVersion
    && (!current || String(item.at) < String(current.at)));
  return others.length ? others[others.length - 1] : null;
}

// ---------- alpha-5 (D2): سجل التدوير — تاريخ آخر ظهور وعدد المرات، بلا إجابة ولا درجة ----------
export async function loadRotation() {
  const records = await getAll('rotation');
  return new Map(records.map(item => [item.id, { count: Number(item.count) || 0, last_shown_at: item.last_shown_at || '' }]));
}

export async function saveRotationRecords(records) {
  for (const record of records) await set('rotation', { id: record.id, count: record.count, last_shown_at: record.last_shown_at });
}

export async function completedLessons() {
  const values = await getAll('progress');
  return new Set(values.filter(item => item.completed).map(item => item.id));
}

export async function markLesson(id, completed = true) {
  return set('progress', { id, completed, updated_at: new Date().toISOString() });
}

export async function saveChecklist(id, checked) {
  return set('checklists', { id, checked, updated_at: new Date().toISOString() });
}
