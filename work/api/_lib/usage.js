export function recordUsage(event) {
  const safe = {
    at: new Date().toISOString(),
    type: String(event.type || 'unknown'),
    duration_ms: Number(event.duration_ms) || 0,
    input_tokens: Number(event.input_tokens) || 0,
    output_tokens: Number(event.output_tokens) || 0,
    thought_tokens: Number(event.thought_tokens) || 0,
    attempts: Number(event.attempts) || 0,
    // alpha-4: عدد نداءات المزود الفعلية، هل استُخدم الاحتياطي، آخر حالة من المزود، ورمز الخطأ. لا نصوص.
    provider_call_count: Number(event.provider_call_count) || 0,
    fallback_used: Boolean(event.fallback_used),
    final_provider_status: event.final_provider_status == null ? null : Number(event.final_provider_status) || null,
    error_code: event.error_code ? String(event.error_code) : null,
    // تشخيص زمن المزود: مجموع زمن النداءات وقائمة (نموذج، حالة، زمن، نتيجة) لكل نداء. لا نصوص.
    provider_ms: Number(event.provider_ms) || 0,
    calls: Array.isArray(event.calls) ? event.calls.slice(0, 6).map(call => ({
      model: String(call?.model || '').slice(0, 60),
      status: call?.status == null ? null : Number(call.status) || null,
      ms: Number(call?.ms) || 0,
      outcome: String(call?.outcome || '').slice(0, 20)
    })) : [],
    validation: String(event.validation || 'unknown'),
    success: Boolean(event.success)
  };
  console.info('[usage]', JSON.stringify(safe));
  return safe;
}
