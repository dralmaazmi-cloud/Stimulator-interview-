const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }]
};

const detectedElement = {
  type: 'object',
  properties: {
    present: { type: 'boolean' },
    quote: nullableString
  },
  required: ['present', 'quote']
};

export const evaluationSchema = {
  type: 'object',
  properties: {
    question_id: { type: 'string' },
    rubric_mode: { type: 'string', enum: ['star_l', 'seal', 'general', 'self_intro'] },
    elements: {
      type: 'object',
      properties: {
        situation: detectedElement,
        task: detectedElement,
        action: detectedElement,
        result: detectedElement,
        learning: detectedElement,
        evaluation: detectedElement,
        leadership_effect: detectedElement
      }
    },
    criteria: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: [
              'context', 'personal_role_or_options', 'action_or_plan', 'result_or_effect', 'learning',
              'competency_evidence', 'clarity', 'reasoning_depth', 'link_to_practice', 'realism_maturity',
              'coverage', 'structure_clarity', 'timing'
            ]
          },
          score: { type: 'integer', minimum: 0, maximum: 5 },
          evidence: { type: 'array', maxItems: 4, items: { type: 'string' } },
          justification: { type: 'string' }
        },
        required: ['key', 'score', 'evidence', 'justification']
      }
    },
    expected_points_coverage: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        properties: {
          point: { type: 'string' },
          covered: { type: 'boolean' },
          quote: nullableString
        },
        required: ['point', 'covered', 'quote']
      }
    },
    behaviours_observed: {
      type: 'object',
      properties: {
        supporting: { type: 'array', maxItems: 12, items: { type: 'string' } },
        negative: { type: 'array', maxItems: 12, items: { type: 'string' } }
      },
      required: ['supporting', 'negative']
    },
    mission_command_indicators: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', enum: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] }
    },
    flags: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'string',
        enum: ['we_not_i', 'no_result', 'hypothetical_drift', 'generic', 'opinion_not_behaviour', 'off_competency', 'exaggeration']
      }
    },
    strengths: { type: 'array', maxItems: 5, items: { type: 'string' } },
    missing: { type: 'array', maxItems: 5, items: { type: 'string' } },
    next_actions: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
    follow_up_questions: { type: 'array', maxItems: 2, items: { type: 'string' } },
    follow_up_reasons: { type: 'array', maxItems: 2, items: { type: 'string' } }
  },
  required: [
    'question_id', 'rubric_mode', 'elements', 'criteria', 'expected_points_coverage',
    'behaviours_observed', 'mission_command_indicators', 'flags', 'strengths', 'missing',
    'next_actions', 'follow_up_questions'
  ]
};

export const selfIntroSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    changes: { type: 'array', maxItems: 6, items: { type: 'string' } },
    facts_preserved: { type: 'boolean' }
  },
  required: ['text', 'changes', 'facts_preserved']
};
