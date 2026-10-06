// alpha-5 (D1/D2): تركيب أسئلة الجلسة. دالة خالصة: تأخذ البيانات وسجل التدوير ومولّدًا عشوائيًا قابلًا للحقن.
// «مقابلة كاملة» بلا نطاق: تقديم الذات (خارج هذه القائمة)، ثم سؤالان سلوكيان من كفاءتين، ثم سؤالان موقفيان من كفاءتين
// أخريين، ثم سؤال قيادة بالمهمة، ثم X1 أو X2. الكفاءات الأربع مختلفة دائمًا. مع نطاق محدد يبقى السلوك القائم.
import { pickRotatedIds, pickRotatedQuestions, rotateOrder } from './rotation.js';

export const MODE_COUNTS = Object.freeze({ single: 1, realistic: 2, extended: 5, full: 6 });
export const AI_QUESTION_IDS = Object.freeze(['X1', 'X2']);
export const PRINCIPLE_IDS = Object.freeze(['M1', 'M2', 'M3', 'M4', 'M5', 'M6']);

function competencyPool(pool) {
  return pool.filter(item => item.owner_type === 'competency' && item.rubric_mode !== 'general');
}

function chooseMixed(pool, count, rotation, random) {
  const behavioural = pickRotatedQuestions(pool.filter(item => item.type === 'behavioural'), 1, rotation, random);
  const scenario = pickRotatedQuestions(pool.filter(item => item.type === 'scenario'), 1, rotation, random);
  const first = [...behavioural, ...scenario];
  const blocked = new Set(first.map(item => item.variant_group).filter(Boolean));
  const remaining = pool.filter(item => !first.some(chosen => chosen.id === item.id) && (!item.variant_group || !blocked.has(item.variant_group)));
  return [...first, ...pickRotatedQuestions(remaining, Math.max(0, count - first.length), rotation, random)].slice(0, count);
}

function missionSet(pool, rotation, random) {
  return PRINCIPLE_IDS
    .map(principle => pickRotatedQuestions(pool.filter(item => item.principle_id === principle), 1, rotation, random)[0])
    .filter(Boolean);
}

// D1: المقابلة الكاملة بلا نطاق.
export function composeFullInterview(data, rotation, random = Math.random) {
  const pool = competencyPool(data.primaryQuestions);
  const byType = type => new Set(pool.filter(item => item.type === type).map(item => item.competency_id));
  const behaviouralComps = byType('behavioural');
  const scenarioComps = byType('scenario');
  const competencyIds = data.competencies.map(item => item.id).filter(id => behaviouralComps.has(id) || scenarioComps.has(id));
  const ordered = rotateOrder(competencyIds, 'competency', id => id, rotation, random);
  // أول كفاءتين تملكان سؤالًا سلوكيًا، ثم كفاءتان أخريان تملكان سؤالًا موقفيًا.
  const chosen = [];
  const behaviouralIds = [];
  const scenarioIds = [];
  for (const id of ordered) {
    if (behaviouralIds.length < 2 && behaviouralComps.has(id)) { behaviouralIds.push(id); chosen.push(id); continue; }
    if (scenarioIds.length < 2 && scenarioComps.has(id)) { scenarioIds.push(id); chosen.push(id); }
    if (behaviouralIds.length === 2 && scenarioIds.length === 2) break;
  }
  const questions = [];
  behaviouralIds.forEach(id => questions.push(pickRotatedQuestions(pool.filter(item => item.competency_id === id && item.type === 'behavioural'), 1, rotation, random)[0]));
  scenarioIds.forEach(id => questions.push(pickRotatedQuestions(pool.filter(item => item.competency_id === id && item.type === 'scenario'), 1, rotation, random)[0]));
  const missionPool = data.primaryQuestions.filter(item => item.owner_type === 'mission_command');
  questions.push(pickRotatedQuestions(missionPool, 1, rotation, random)[0]);
  const aiPool = AI_QUESTION_IDS.map(id => data.questionById.get(id)).filter(Boolean);
  const aiId = pickRotatedIds(aiPool.map(item => item.id), 1, 'question', rotation, random)[0];
  if (aiId) questions.push(data.questionById.get(aiId));
  return questions.filter(Boolean);
}

export function composeQuestionSet(data, mode, scope, requestedId, options = {}) {
  const rotation = options.rotation || new Map();
  const random = options.random || Math.random;
  const requested = requestedId ? data.questionById.get(requestedId) : null;
  if (requested) return [requested];
  let pool = data.primaryQuestions;
  if (scope === 'mission') pool = pool.filter(item => item.owner_type === 'mission_command');
  else if (scope) pool = pool.filter(item => item.competency_id === scope || item.principle_id === scope);
  else pool = pool.filter(item => item.owner_type !== 'additional');

  if (mode === 'single') return pickRotatedQuestions(pool, 1, rotation, random);
  if (mode === 'realistic') {
    if (!scope) {
      const competencyId = rotateOrder(data.competencies.map(item => item.id), 'competency', id => id, rotation, random)[0];
      pool = pool.filter(item => item.competency_id === competencyId);
    }
    return chooseMixed(pool, Math.min(MODE_COUNTS.realistic, pool.length), rotation, random);
  }
  if (mode === 'full') {
    if (scope === 'mission') return missionSet(pool, rotation, random);
    if (scope) return pickRotatedQuestions(pool, Math.min(MODE_COUNTS.full, pool.length), rotation, random);
    return composeFullInterview(data, rotation, random);
  }
  if (scope === 'mission') return missionSet(pool, rotation, random);
  if (!scope) {
    const competencyIds = rotateOrder([...new Set(pool.map(item => item.competency_id).filter(Boolean))], 'competency', id => id, rotation, random).slice(0, 4);
    const selected = competencyIds.flatMap(id => pickRotatedQuestions(pool.filter(item => item.competency_id === id), 1, rotation, random));
    const blocked = new Set(selected.map(item => item.variant_group).filter(Boolean));
    const remaining = pool.filter(item => !selected.some(chosen => chosen.id === item.id)
      && (!item.variant_group || !blocked.has(item.variant_group)));
    return [...selected, ...pickRotatedQuestions(remaining, Math.max(0, MODE_COUNTS.extended - selected.length), rotation, random)]
      .slice(0, MODE_COUNTS.extended);
  }
  return pickRotatedQuestions(pool, Math.min(MODE_COUNTS.extended, pool.length), rotation, random);
}
