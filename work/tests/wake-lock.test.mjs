// alpha-4 (A1) — mock كامل لـWake Lock: الطلب، التحرير، السقوط، وإعادة الطلب بعد العودة، والأسباب الأربعة.
import assert from 'node:assert/strict';
import { WAKE_LOCK_REASONS, createWakeLockController } from '../dist/js/wake-lock.js';

function fakeEnvironment({ supported = true, failRequest = false } = {}) {
  const events = { document: new Map(), window: new Map() };
  const listenerCounts = () => ({ visibility: (events.document.get('visibilitychange') || []).length, pagehide: (events.window.get('pagehide') || []).length });
  const target = map => ({
    addEventListener: (type, handler) => map.set(type, [...(map.get(type) || []), handler]),
    removeEventListener: (type, handler) => map.set(type, (map.get(type) || []).filter(item => item !== handler)),
    dispatch: type => (map.get(type) || []).forEach(handler => handler())
  });
  const doc = { visibilityState: 'visible', ...target(events.document) };
  const win = target(events.window);
  const log = [];
  const sentinels = [];
  const nav = supported ? {
    wakeLock: {
      request: async type => {
        log.push(`request:${type}`);
        if (failRequest) throw new Error('NotAllowedError');
        const handlers = new Map();
        const sentinel = {
          released: false,
          addEventListener: (name, handler) => handlers.set(name, handler),
          removeEventListener: name => handlers.delete(name),
          release: async () => { sentinel.released = true; log.push('release'); },
          dropBySystem: () => { sentinel.released = true; log.push('system-drop'); handlers.get('release')?.(); }
        };
        sentinels.push(sentinel);
        return sentinel;
      }
    }
  } : {};
  return { nav, doc, win, log, sentinels, listenerCounts };
}

// الطلب عند أول سبب فقط، ولا تحرير قبل زوال آخر سبب.
{
  const env = fakeEnvironment();
  const lock = createWakeLockController({ navigator: env.nav, document: env.doc, window: env.win });
  assert.deepEqual(WAKE_LOCK_REASONS, ['recording', 'transcribing', 'evaluating', 'self-intro-timer']);
  for (const reason of WAKE_LOCK_REASONS) assert.equal(await lock.acquireWakeLock(reason), true);
  assert.deepEqual(env.log, ['request:screen'], 'one request for the first reason only');
  assert.equal(lock.isHeld(), true);
  await lock.releaseWakeLock('recording');
  await lock.releaseWakeLock('transcribing');
  await lock.releaseWakeLock('evaluating');
  assert.equal(lock.isHeld(), true, 'still held while a reason remains');
  assert.deepEqual(env.log, ['request:screen']);
  await lock.releaseWakeLock('self-intro-timer');
  assert.equal(lock.isHeld(), false);
  assert.deepEqual(env.log, ['request:screen', 'release']);
  assert.deepEqual(env.listenerCounts(), { visibility: 0, pagehide: 0 }, 'listeners removed after the last reason');
  assert.equal(await lock.acquireWakeLock('not-a-reason'), false, 'unknown reasons are rejected');
  assert.deepEqual(lock.activeReasons(), []);
}
// السقوط من النظام ثم إعادة الطلب عند العودة إلى الواجهة إذا بقي سبب نشط.
{
  const env = fakeEnvironment();
  const lock = createWakeLockController({ navigator: env.nav, document: env.doc, window: env.win });
  await lock.acquireWakeLock('recording');
  env.doc.visibilityState = 'hidden';
  env.sentinels[0].dropBySystem();
  assert.equal(lock.isHeld(), false);
  env.doc.dispatch('visibilitychange');
  await Promise.resolve();
  assert.equal(env.log.filter(item => item === 'request:screen').length, 1, 'no re-request while hidden');
  env.doc.visibilityState = 'visible';
  env.doc.dispatch('visibilitychange');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(env.log.filter(item => item === 'request:screen').length, 2, 're-requested after returning to the foreground');
  assert.equal(lock.isHeld(), true);
  await lock.releaseWakeLock('recording');
  env.doc.visibilityState = 'visible';
  env.doc.dispatch('visibilitychange');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(env.log.filter(item => item === 'request:screen').length, 2, 'no re-request without an active reason');
}
// pagehide يحرر كل الأقفال؛ releaseAllWakeLocks يفرغ الأسباب.
{
  const env = fakeEnvironment();
  const lock = createWakeLockController({ navigator: env.nav, document: env.doc, window: env.win });
  await lock.acquireWakeLock('evaluating');
  await lock.acquireWakeLock('transcribing');
  env.win.dispatch('pagehide');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(lock.isHeld(), false);
  assert.deepEqual(lock.activeReasons(), []);
  await lock.acquireWakeLock('recording');
  await lock.releaseAllWakeLocks();
  assert.equal(lock.isHeld(), false);
  assert.deepEqual(env.listenerCounts(), { visibility: 0, pagehide: 0 });
}
// لا listener مكرر بعد دخول/خروج متكرر.
{
  const env = fakeEnvironment();
  const lock = createWakeLockController({ navigator: env.nav, document: env.doc, window: env.win });
  for (let round = 0; round < 5; round += 1) {
    await lock.acquireWakeLock('recording');
    await lock.acquireWakeLock('evaluating');
    assert.deepEqual(env.listenerCounts(), { visibility: 1, pagehide: 1 });
    await lock.releaseAllWakeLocks();
  }
  assert.deepEqual(env.listenerCounts(), { visibility: 0, pagehide: 0 });
}
// فشل الطلب أو غياب الدعم لا يرمي خطأً ولا يوقف المهمة؛ وتنبيه غياب الدعم يظهر مرة واحدة فقط.
{
  const failing = fakeEnvironment({ failRequest: true });
  const lock = createWakeLockController({ navigator: failing.nav, document: failing.doc, window: failing.win });
  assert.equal(await lock.acquireWakeLock('recording'), false);
  await lock.releaseWakeLock('recording');
  const unsupported = fakeEnvironment({ supported: false });
  const lock2 = createWakeLockController({ navigator: unsupported.nav, document: unsupported.doc, window: unsupported.win });
  assert.equal(lock2.isSupported(), false);
  assert.equal(await lock2.acquireWakeLock('recording'), false);
  assert.equal(lock2.unsupportedNoticeOnce(), 'أبقِ الشاشة مضاءة أثناء التسجيل؛ جهازك لا يدعم منع الإقفال التلقائي.');
  assert.equal(lock2.unsupportedNoticeOnce(), '', 'notice shown once only');
  const supportedLock = createWakeLockController({ navigator: fakeEnvironment().nav, document: fakeEnvironment().doc });
  assert.equal(supportedLock.unsupportedNoticeOnce(), '', 'no notice when supported');
}
console.log('PASS wake lock: four reasons, single request/release, system drop + re-request, pagehide, no duplicate listeners, graceful failure.');
