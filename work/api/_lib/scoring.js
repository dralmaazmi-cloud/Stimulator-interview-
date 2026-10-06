// alpha-5 (R1): القواعد نفسها التي يستخدمها العميل، من dist/js/scoring-rules.js (دالة خالصة مشتركة).
import { WEIGHTS, WEIGHTS_VERSION, computeReportScore, fallbackSummary } from '../../dist/js/scoring-rules.js';

export function calculateScore(report, questionType, answerText = '') {
  return computeReportScore(report, questionType, answerText);
}

export function weightsForTesting() {
  return WEIGHTS;
}

export { WEIGHTS_VERSION, fallbackSummary };
