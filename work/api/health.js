import { methodAllowed, sendJson } from './_lib/http.js';
import { providerInfo } from './_lib/provider.js';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET'])) return;
  sendJson(res, 200, {
    ok: true,
    phase: 2,
    ai: providerInfo(),
    features: {
      text_evaluation: true,
      audio_transcription: true,
      follow_up_questions: true, // تُعاد ضمن /api/evaluate؛ لا توجد نقطة مستقلة للمتابعة
      hybrid_self_intro: true
    },
    limits: { audio_seconds: 120, audio_bytes: 4 * 1024 * 1024 }
  });
}
