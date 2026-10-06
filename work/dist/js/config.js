export const CONFIG = Object.freeze({
  appVersion: '0.6.0-alpha-5',
  referenceSha256: '51d413def77dd11a33a672222acbad46e9612da0f2d202bc28537928c2b7a357',
  promptVersion: 'evaluation-1.2',
  examplePromptVersion: 'example-1.0',
  rubricVersion: 'reference-rubric-1.0',
  configVersion: '6.0',
  review: {
    repeatAfterMistake: true,
    maxExercisesPerLessonSession: 3
  },
  selfIntroduction: { wordsPerMinute: 115, durations: [60, 120] },
  ai: {
    enabled: true,
    maximumAudioSeconds: 120,
    audioWarningSeconds: 90,
    maximumAudioBytes: 4 * 1024 * 1024,
    endpoints: {
      health: '/api/health',
      evaluate: '/api/evaluate',
      transcribe: '/api/transcribe',
      selfIntro: '/api/self-intro',
      example: '/api/example'
    }
  }
});
