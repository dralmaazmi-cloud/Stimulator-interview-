// alpha-5 (R6): خطة إعادة الإرسال بعد خطأ المزود. دالة خالصة بلا DOM.
// 429: القفل = الأصغر بين Retry-After و120 ثانية؛ النص يتبع المدة (حتى 90 ثانية بالثواني، وأكثر بالدقائق).
// غير ذلك (AI_OVERLOADED): قفل 15 ثانية مع عدّ استرشادي من 60 ثانية.
export const RATE_LIMIT_LOCK_CAP_SECONDS = 120;
export const RATE_LIMIT_SHORT_SECONDS = 90;

export function rateLimitMessage(seconds) {
  const total = Math.max(1, Math.ceil(Number(seconds) || 0));
  if (total <= RATE_LIMIT_SHORT_SECONDS) return `الخدمة مشغولة حاليًا. حاول بعد ${total} ثانية.`;
  const minutes = Math.max(1, Math.ceil(total / 60));
  return `بلغت الخدمة حدّها المؤقت. يمكنك إعادة الإرسال بعد نحو ${minutes} دقيقة. إجابتك محفوظة.`;
}

export function retryLockPlan(error) {
  if (error?.code === 'AI_RATE_LIMITED') {
    const seconds = Number.isFinite(error.retryAfter) && error.retryAfter > 0 ? Math.ceil(error.retryAfter) : 60;
    const lockSeconds = Math.min(seconds, RATE_LIMIT_LOCK_CAP_SECONDS);
    return { lockSeconds, adviceSeconds: lockSeconds, advisory: false, retryAfterSeconds: seconds, message: rateLimitMessage(seconds) };
  }
  return { lockSeconds: 15, adviceSeconds: 60, advisory: true, retryAfterSeconds: null, message: error?.message || 'تعذّر إكمال الطلب الآن.' };
}
