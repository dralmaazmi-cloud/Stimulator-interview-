// حدّان معًا (alpha-3): لكل IP 200/ساعة مشترك بين النقاط (RATE_LIMIT_IP)، ولكل (IP + X-Client-Id) حد النقطة
// (التقييم 40 أو RATE_LIMIT_EVALUATE، التفريغ 30، تقديم الذات 20). المرحلة الثالثة: مخزن KV خادمي للحصص.
const buckets = new Map();

export function enforceRateLimit(key, options = {}) {
  const limit = Number(options.limit) || 30;
  const windowMs = Number(options.windowMs) || 60 * 60 * 1000;
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { remaining: limit - 1, resetAt: now + windowMs };
  }
  if (current.count >= limit) {
    const error = new Error('تم بلوغ الحد المؤقت للطلبات. حاول لاحقًا.');
    error.status = 429;
    error.code = 'RATE_LIMITED';
    throw error;
  }
  current.count += 1;
  return { remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}
