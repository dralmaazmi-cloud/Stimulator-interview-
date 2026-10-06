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

export async function exportBackup(metadata = {}) {
  const stores = {};
  for (const store of STORES) stores[store] = await getAll(store);
  return {
    format: 'leadership-interview-coach-backup',
    schema_version: 1,
    exported_at: new Date().toISOString(),
    metadata,
    stores,
    bookmarks: JSON.parse(localStorage.getItem('lic:bookmarked-questions') || '[]')
  };
}

export async function importBackup(backup) {
  if (backup?.format !== 'leadership-interview-coach-backup' || backup?.schema_version !== 1) {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو غير مدعوم.');
  }
  for (const store of STORES) {
    await clearStore(store);
    for (const value of backup.stores?.[store] || []) await set(store, value);
  }
  localStorage.setItem('lic:bookmarked-questions', JSON.stringify(Array.isArray(backup.bookmarks) ? backup.bookmarks : []));
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
