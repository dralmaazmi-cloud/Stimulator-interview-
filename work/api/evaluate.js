import crypto from 'node:crypto';
import { handleApiError, httpError, methodAllowed, rateLimitScopes, readJson, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { complete } from './_lib/provider.js';
import { getQuestionContext, sampleAnswerTexts } from './_lib/data.js';
import { evaluationSchema } from './_lib/schemas.js';
import { buildEvaluationPrompt } from './_lib/prompts.js';
import { nearReferenceModel, referenceSimilarity, referenceSimilarityDetails, sanitizeEvaluation, shapeErrors, verifyEvidence } from './_lib/validation.js';
import { calculateScore } from './_lib/scoring.js';
import { recordUsage } from './_lib/usage.js';

const PROMPT_VERSION = 'evaluation-1.1';
const RUBRIC_VERSION = 'reference-rubric-1.0';

function cleanFollowups(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2).map(item => ({
    question: String(item?.question || '').trim().slice(0, 500),
    answer: String(item?.answer || '').trim().slice(0, 6000)
  })).filter(item => item.question && item.answer);
}

async function runEvaluation(context, answer, followups, model) {
  const response = await complete(buildEvaluationPrompt(context, answer, followups), evaluationSchema, { model });
  const errors = shapeErrors(response.data, context.question.id, context.question.rubric_mode);
  if (errors.length) {
    const error = httpError(502, `Schema validation failed: ${errors.join(', ')}`, 'AI_SCHEMA_FAILED');
    error.usage = response.usage;
    throw error;
  }
  const sanitized = sanitizeEvaluation(response.data, context);
  const combinedText = [answer, ...followups.map(item => item.answer)].join('\n');
  const verified = verifyEvidence(sanitized, combinedText);
  return { ...verified, usage: response.usage, combinedText };
}

export default async function handler(req, res) {
  const started = Date.now();
  if (!methodAllowed(req, res, ['POST'])) return;
  try {
    const scopes = rateLimitScopes(req, 'evaluate');
    enforceRateLimit(scopes.ip.key, { limit: scopes.ip.limit, windowMs: 60 * 60 * 1000 });
    enforceRateLimit(scopes.client.key, { limit: Number(process.env.RATE_LIMIT_EVALUATE) || 40, windowMs: 60 * 60 * 1000 });
    const body = await readJson(req, 160_000);
    const questionId = String(body.question_id || '').trim();
    const answer = String(body.answer || '').trim();
    const followups = cleanFollowups(body.followups);
    if (!questionId) throw httpError(400, 'معرّف السؤال مطلوب.');
    if (answer.length < 5) throw httpError(400, 'الإجابة قصيرة جدًا للتقييم.');
    if (answer.length > 12_000) throw httpError(413, 'الإجابة أطول من الحد المسموح.');

    const context = getQuestionContext(questionId);
    if (questionId === 'SELF-INTRO') {
      const targetDuration = Number(body.target_duration) === 120 ? 120 : 60;
      const spokenDuration = Math.max(0, Math.min(180, Number(body.spoken_duration) || 0));
      const estimatedDuration = Math.round(answer.split(/\s+/).filter(Boolean).length / 115 * 60);
      context.question = {
        ...context.question,
        target_duration: targetDuration,
        answer_duration_seconds: spokenDuration || estimatedDuration,
        duration_source: spokenDuration ? 'recording' : 'word_count_estimate'
      };
    }
    const retryModel = process.env.GEMINI_RETRY_MODEL || process.env.GEMINI_MODEL;
    // عدّاد صريح: لا يتجاوز عدد الطلبات إلى المزود 2 في أي مسار.
    const RETRYABLE = new Set(['AI_INVALID_JSON', 'AI_SCHEMA_FAILED']);
    let attempts = 0;
    let evaluated;
    let firstError;
    const attempt = async model => {
      attempts += 1;
      return runEvaluation(context, answer, followups, model);
    };
    try {
      evaluated = await attempt();
    } catch (error) {
      if (!RETRYABLE.has(error?.code)) throw error;
      firstError = error;
      evaluated = await attempt(retryModel);
    }
    if (evaluated.failureRate > 0.3 && attempts < 2) {
      firstError = httpError(502, 'Too many unverified quotes.', 'AI_EVIDENCE_FAILED');
      firstError.usage = evaluated.usage;
      evaluated = await attempt(retryModel);
    }

    const similarities = sampleAnswerTexts(context.question).map(sample => referenceSimilarityDetails(answer, sample));
    const referenceSimilarityValue = Math.max(0, ...sampleAnswerTexts(context.question).map(sample => referenceSimilarity(answer, sample)));
    const nearReference = similarities.some(nearReferenceModel);
    if (nearReference) {
      const competencyCriterion = evaluated.report.criteria.find(item => item.key === 'competency_evidence');
      if (competencyCriterion) competencyCriterion.score = Math.min(3, competencyCriterion.score);
    }
    // بوابة الثقة (alpha-3): نسبة فشل الاقتباسات ≤ 30% وعدد المعايير غير الموثقة ≤ نصف المعايير المُدرَّجة.
    // إذا لم يُدرِّج النموذج أي معيار (scoredCriteria = 0) فالتقرير موثوق بدرجة 0 وتصنيف «ضعيفة».
    const trusted = evaluated.failureRate <= 0.3
      && evaluated.unverifiedCriteria <= Math.floor(evaluated.scoredCriteria / 2);
    let score;
    if (!trusted) score = { final_score: null, classification: 'غير موثوق', action_ratio: null, weights_version: 'phase2-1.0' };
    else {
      score = calculateScore(evaluated.report, context.question.type, evaluated.combinedText);
      if (evaluated.scoredCriteria === 0) score = { ...score, final_score: 0, classification: 'ضعيفة' };
    }
    const report = {
      ...evaluated.report,
      ...score,
      trusted,
      reliability_label: trusted ? 'موثّق بالاقتباسات' : 'تقييم غير موثوق — لا توجد درجة رقمية',
      near_reference_model: nearReference,
      reference_similarity: Number(referenceSimilarityValue.toFixed(3)),
      verification: {
        checked_quotes: evaluated.checked,
        rejected_quotes: evaluated.failed,
        failure_rate: Number(evaluated.failureRate.toFixed(3)),
        verified_criteria: evaluated.verifiedCriteria,
        scored_criteria: evaluated.scoredCriteria,
        unverified_criteria: evaluated.unverifiedCriteria,
        retried: Boolean(firstError)
      }
    };
    const askedFollowups = new Set(followups.map(item => item.question));
    const keptFollowups = report.follow_up_questions
      .map((question, index) => ({ question, reason: report.follow_up_reasons?.[index] || '' }))
      .filter(item => !askedFollowups.has(item.question))
      .slice(0, 2);
    report.follow_up_questions = keptFollowups.map(item => item.question);
    report.follow_up_reasons = keptFollowups.map(item => item.reason).filter(Boolean).length === keptFollowups.length
      ? keptFollowups.map(item => item.reason)
      : [];

    const usage = {
      input_tokens: (firstError?.usage?.input_tokens || 0) + (evaluated.usage?.input_tokens || 0),
      output_tokens: (firstError?.usage?.output_tokens || 0) + (evaluated.usage?.output_tokens || 0),
      thought_tokens: (firstError?.usage?.thought_tokens || 0) + (evaluated.usage?.thought_tokens || 0)
    };
    recordUsage({
      type: 'evaluate',
      duration_ms: Date.now() - started,
      ...usage,
      attempts,
      validation: trusted ? 'passed' : 'untrusted',
      success: true
    });
    sendJson(res, 200, {
      report,
      meta: {
        request_id: crypto.randomUUID(),
        prompt_version: PROMPT_VERSION,
        rubric_version: RUBRIC_VERSION,
        reference_sha256: context.referenceSha256
      }
    });
  } catch (error) {
    recordUsage({ type: 'evaluate', duration_ms: Date.now() - started, validation: error?.code || 'failed', success: false });
    handleApiError(res, error);
  }
}
