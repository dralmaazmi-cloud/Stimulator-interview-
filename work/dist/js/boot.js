// نقطة الإقلاع: تمنع خلط إصدارين من الوحدات بعد التحديث.
// عند أول زيارة بعد نشر إصدار جديد يظل محرك الخدمة القديم مسيطرًا، فيخدم الوحدات غير المرقّمة (data.js، ui.js…)
// من ذاكرته القديمة بينما يأتي app.js الجديد من الشبكة. نحذف ذواكر التطبيق القديمة أولًا ثم نحمّل التطبيق،
// فتأتي كل الوحدات من الإصدار نفسه. اسم الذاكرة الحالية ومسار app.js يحددهما index.html.
const script = document.querySelector('script[data-app]');
const appUrl = script?.dataset.app || 'js/app.js';
const currentCache = script?.dataset.cache || '';

try {
  if (currentCache && 'caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('leadership-interview-coach-') && key !== currentCache)
      .map(key => caches.delete(key)));
  }
} catch (error) {
  console.warn('Cache cleanup skipped:', error);
}

await import(new URL(appUrl, document.baseURI).href);
