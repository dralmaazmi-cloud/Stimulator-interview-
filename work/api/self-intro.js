import { handleApiError, httpError, methodAllowed, rateLimitScopes, readJson, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { complete, createBudget } from './_lib/provider.js';
import { selfIntroSchema } from './_lib/schemas.js';
import { buildSelfIntroPrompt } from './_lib/prompts.js';
import { recordUsage } from './_lib/usage.js';

export default async function handler(req, res) {
  const started = Date.now();
  if (!methodAllowed(req, res, ['POST'])) return;
  const budget = createBudget({ startedAt: started, maxCalls: 4 });
  try {
    const scopes = rateLimitScopes(req, 'self-intro');
    enforceRateLimit(scopes.ip.key, { limit: scopes.ip.limit, windowMs: 60 * 60 * 1000 });
    enforceRateLimit(scopes.client.key, { limit: 20, windowMs: 60 * 60 * 1000 });
    const body = await readJson(req, 80_000);
    const text = String(body.text || '').trim();
    const duration = Number(body.duration) === 120 ? 120 : 60;
    if (text.length < 20) throw httpError(400, 'ابنِ المسودة المحلية أولًا.');
    if (text.length > 6000) throw httpError(413, 'النص أطول من الحد المسموح.');

    const result = await complete(buildSelfIntroPrompt(text, duration), selfIntroSchema, { budget });
    const candidate = String(result.data?.text || '').trim();
    const wordCount = candidate.split(/\s+/).filter(Boolean).length;
    const maximumWords = duration === 120 ? 225 : 112;
    if (!candidate || wordCount > maximumWords || result.data?.facts_preserved !== true) {
      throw httpError(502, 'لم يجتز النص المحسن فحص الحفاظ على المعلومات.', 'SELF_INTRO_VALIDATION_FAILED');
    }
    recordUsage({ type: 'self-intro', duration_ms: Date.now() - started, ...result.usage, provider_call_count: budget.calls, fallback_used: budget.fallbackUsed, final_provider_status: budget.lastProviderStatus, validation: 'passed', success: true });
    sendJson(res, 200, {
      text: candidate,
      changes: Array.isArray(result.data.changes) ? result.data.changes.slice(0, 6) : [],
      word_count: wordCount,
      duration,
      requires_user_approval: true
    });
  } catch (error) {
    recordUsage({ type: 'self-intro', duration_ms: Date.now() - started, provider_call_count: budget.calls, fallback_used: budget.fallbackUsed, final_provider_status: error?.providerStatus ?? budget.lastProviderStatus, error_code: error?.code || 'failed', validation: error?.code || 'failed', success: false });
    handleApiError(res, error);
  }
}
