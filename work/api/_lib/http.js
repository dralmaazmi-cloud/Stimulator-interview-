const DEFAULT_JSON_LIMIT = 160_000;

export function applyApiHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function sendJson(res, status, payload) {
  applyApiHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

export function methodAllowed(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { error: 'الطريقة غير مسموحة.' });
  return false;
}

export async function readBuffer(req, maximumBytes) {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > maximumBytes) throw httpError(413, 'حجم الطلب أكبر من الحد المسموح.');
    return Buffer.from(req.body);
  }
  if (typeof req.body === 'string') {
    const body = Buffer.from(req.body);
    if (body.length > maximumBytes) throw httpError(413, 'حجم الطلب أكبر من الحد المسموح.');
    return body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maximumBytes) throw httpError(413, 'حجم الطلب أكبر من الحد المسموح.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, maximumBytes = DEFAULT_JSON_LIMIT) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    // جسم مُسبق التحليل (Vercel): نتحقق من حجمه أيضًا.
    if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > maximumBytes) throw httpError(413, 'حجم الطلب أكبر من الحد المسموح.');
    return req.body;
  }
  const buffer = await readBuffer(req, maximumBytes);
  if (!buffer.length) throw httpError(400, 'الطلب فارغ.');
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw httpError(400, 'صيغة الطلب غير صالحة.');
  }
}

export function httpError(status, message, code = '') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function handleApiError(res, error) {
  const status = Number(error?.status) || 500;
  // أي خطأ يحمل providerStatus يُعامَل كخطأ خادمي من حيث الرسالة الآمنة بغض النظر عن status.
  const fromProvider = error?.providerStatus != null;
  let safeMessage;
  if (error?.code === 'AI_OVERLOADED') {
    safeMessage = error.message;
  } else if (fromProvider) {
    safeMessage = error?.code === 'AI_RATE_LIMITED'
      ? 'الخدمة مشغولة حاليًا. حاول بعد دقيقة.'
      : 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.';
  } else if (status >= 500) {
    safeMessage = error?.code === 'AI_NOT_CONFIGURED'
      ? 'خدمة المحاكاة غير مهيأة بعد. أضف مفتاح الذكاء الاصطناعي في إعدادات الخادم.'
      : 'تعذّر إكمال الطلب الآن. حاول مرة أخرى بعد قليل.';
  } else safeMessage = error.message;
  if (status >= 500 || fromProvider) console.error('[api]', error?.code || error?.name, error?.providerStatus ?? '', error?.message);
  const payload = { error: safeMessage, code: error?.code || undefined };
  // 429: نمرر Retry-After كعدد ثوانٍ آمن فقط (لا ترويسات حساسة).
  if (error?.code === 'AI_RATE_LIMITED' && Number.isFinite(error?.retryAfter) && error.retryAfter > 0) payload.retry_after = error.retryAfter;
  sendJson(res, status, payload);
}

// البند 15: مفتاح الحد = IP فقط؛ معرّف العميل لا يدخل في المفتاح كي لا يُتجاوز الحد بتغييره.
export function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function clientIdForLog(req) {
  return String(req.headers['x-client-id'] || '').slice(0, 80) || 'anonymous';
}

// alpha-3: حدّان معًا — لكل IP (مشترك بين كل النقاط، 200/ساعة أو RATE_LIMIT_IP)،
// ولكل (IP + X-Client-Id) حد النقطة نفسها.
export function rateLimitScopes(req, endpoint) {
  const ip = clientKey(req);
  return {
    ip: { key: `ip:${ip}`, limit: Number(process.env.RATE_LIMIT_IP) || 200 },
    client: { key: `${endpoint}:${ip}:${clientIdForLog(req)}` }
  };
}
