const DB_NAME = 'leadership-interview-coach';
const DB_VERSION = 1;
const STORES = ['settings', 'progress', 'stories', 'sessions', 'checklists', 'review'];
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach(store => {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
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
  await Promise.all(STORES.map(clearStore));
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
