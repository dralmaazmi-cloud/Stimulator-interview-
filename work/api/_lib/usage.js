export function recordUsage(event) {
  const safe = {
    at: new Date().toISOString(),
    type: String(event.type || 'unknown'),
    duration_ms: Number(event.duration_ms) || 0,
    input_tokens: Number(event.input_tokens) || 0,
    output_tokens: Number(event.output_tokens) || 0,
    thought_tokens: Number(event.thought_tokens) || 0,
    attempts: Number(event.attempts) || 0,
    validation: String(event.validation || 'unknown'),
    success: Boolean(event.success)
  };
  console.info('[usage]', JSON.stringify(safe));
  return safe;
}
