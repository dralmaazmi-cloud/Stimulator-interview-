// alpha-5 (الخطوة 5): «مثال مكتمل على غرار موقفك». البنية نفسها في api/evaluate.js:
// التحقق، حدّا المعدل (ضمن حدّ التقييم نفسه)، الميزانية، إعادة المحاولة عند فشل المخطط، الاحتياطي، الرموز، store:false.
// لا يُرسل أي نموذج إجابة إلى المزود، ولا يُسجَّل أي نص.
import crypto from 'node:crypto';
import { handleApiError, httpError, methodAllowed, rateLimitScopes, readJson, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { complete, createBudget } from './_lib/provider.js';
import { getQuestionContext } from './_lib/data.js';
import { exampleSchema } from './_lib/schemas.js';
import { buildExamplePrompt } from './_lib/prompts.js';
import { EXAMPLE_ELEMENTS_BY_MODE, exampleShapeErrors, sanitizeExample } from './_lib/validation.js';
import { recordUsage } from './_lib/usage.js';

export const PROMPT_VERSION = 'example-1.0';
const RETRYABLE = new Set(['AI_INVALID_JSON', 'AI_SCHEMA_FAILED']);
const CRITERIA = ['context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning', 'competency_evidence'];

function keys(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(item => allowed.includes(item)))];
}

async function runExample(context, answer, missingElements, weakCriteria, model, budget) {
  const response = await complete(buildExamplePrompt(context, answer, missingElements, weakCriteria), exampleSchema, { model, budget });
  const errors = exampleShapeErrors(response.data, context.question.id, context.question.rubric_mode);
  if (errors.length) {
    const error = httpError(502, `Schema validation failed: ${errors.join(', ')}`, 'AI_SCHEMA_FAILED');
    error.usage = response.usage;
    throw error;
  }
  return { example: sanitizeExample(response.data, { question: context.question, answer }), usage: response.usage };
}

export default async function handler(req, res) {
  const started = Date.now();
  if (!methodAllowed(req, res, ['POST'])) return;
  const budget = createBudget({ startedAt: started, maxCalls: 5 });
  try {
    // الحدّان ضمن حدّ التقييم: المفتاح نفسه الذي يستعمله /api/evaluate.
    const scopes = rateLimitScopes(req, 'evaluate');
    enforceRateLimit(scopes.ip.key, { limit: scopes.ip.limit, windowMs: 60 * 60 * 1000 });
    enforceRateLimit(scopes.client.key, { limit: Number(process.env.RATE_LIMIT_EVALUATE) || 40, windowMs: 60 * 60 * 1000 });
    const body = await readJson(req, 160_000);
    const questionId = String(body.question_id || '').trim();
    const answer = String(body.answer || '').trim();
    if (!questionId) throw httpError(400, 'معرّف السؤال مطلوب.');
    if (questionId === 'SELF-INTRO') throw httpError(400, 'المثال المكتمل متاح للأسئلة السلوكية والموقفية فقط.');
    if (answer.length < 5) throw httpError(400, 'الإجابة قصيرة جدًا.');
    if (answer.length > 12_000) throw httpError(413, 'الإجابة أطول من الحد المسموح.');

    const context = getQuestionContext(questionId);
    const mode = context.question.rubric_mode;
    if (mode !== 'star_l' && mode !== 'seal') throw httpError(400, 'المثال المكتمل متاح للأسئلة السلوكية والموقفية فقط.');
    const missingElements = keys(body.missing_elements, EXAMPLE_ELEMENTS_BY_MODE[mode] || []);
    const weakCriteria = keys(body.weak_criteria, CRITERIA);

    const retryModel = process.env.GEMINI_RETRY_MODEL || process.env.GEMINI_MODEL;
    let attempts = 0;
    let result;
    let firstError;
    const attempt = async model => {
      attempts += 1;
      return runExample(context, answer, missingElements, weakCriteria, model, budget);
    };
    try {
      result = await attempt();
    } catch (error) {
      if (!RETRYABLE.has(error?.code) || !budget.canStart()) throw error;
      firstError = error;
      result = await attempt(retryModel);
    }

    const usage = {
      input_tokens: (firstError?.usage?.input_tokens || 0) + (result.usage?.input_tokens || 0),
      output_tokens: (firstError?.usage?.output_tokens || 0) + (result.usage?.output_tokens || 0),
      thought_tokens: (firstError?.usage?.thought_tokens || 0) + (result.usage?.thought_tokens || 0)
    };
    recordUsage({
      type: 'example',
      duration_ms: Date.now() - started,
      ...usage,
      attempts,
      provider_call_count: budget.calls,
      fallback_used: budget.fallbackUsed,
      final_provider_status: budget.lastProviderStatus,
      validation: result.example.covered ? 'covered' : 'passed',
      success: true
    });
    sendJson(res, 200, {
      example: result.example,
      meta: {
        request_id: crypto.randomUUID(),
        prompt_version: PROMPT_VERSION,
        reference_sha256: context.referenceSha256
      }
    });
  } catch (error) {
    recordUsage({ type: 'example', duration_ms: Date.now() - started, provider_call_count: budget.calls, fallback_used: budget.fallbackUsed, final_provider_status: error?.providerStatus ?? budget.lastProviderStatus, error_code: error?.code || 'failed', validation: error?.code || 'failed', success: false });
    handleApiError(res, error);
  }
}
