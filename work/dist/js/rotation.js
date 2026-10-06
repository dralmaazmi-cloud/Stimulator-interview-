// alpha-5 (D2): تدوير الكفاءات والمبادئ والأسئلة. دوال خالصة بلا DOM ولا تخزين؛
// سجل التدوير يُمرَّر كخريطة { id → { last_shown_at, count } } ويُحفظ محليًا في مخزن «rotation».
// القاعدة: غير المجرَّب قبل الجميع، ثم الأقدم ظهورًا، وعند التساوي عشوائي بمولّد قابل للحقن.

export function rotationKey(kind, id) {
  return `${kind}:${id}`;
}

export function rotationEntry(rotation, kind, id) {
  const entry = rotation?.get ? rotation.get(rotationKey(kind, id)) : rotation?.[rotationKey(kind, id)];
  return entry || { count: 0, last_shown_at: '' };
}

function orderValue(entry) {
  if (!entry || !entry.count) return -1; // غير مجرَّب: يسبق الجميع
  const time = Date.parse(entry.last_shown_at || '');
  return Number.isFinite(time) ? time : 0;
}

// يرتب العناصر: غير المجرَّب أولًا، ثم الأقدم ظهورًا، ومع التساوي ترتيب عشوائي ثابت (random محقون).
export function rotateOrder(items, kind, idOf, rotation, random = Math.random) {
  const decorated = items.map(item => ({ item, value: orderValue(rotationEntry(rotation, kind, idOf(item))), tie: random() }));
  decorated.sort((a, b) => a.value - b.value || a.tie - b.tie);
  return decorated.map(entry => entry.item);
}

// اختيار أسئلة بالتدوير مع احترام مجموعات الصياغات المتكافئة (variant_group).
export function pickRotatedQuestions(pool, count, rotation, random = Math.random) {
  const ordered = rotateOrder(pool, 'question', item => item.id, rotation, random);
  const selected = [];
  const blockedGroups = new Set();
  for (const candidate of ordered) {
    if (selected.length >= count) break;
    const group = candidate.variant_group;
    if (group && blockedGroups.has(group)) continue;
    selected.push(candidate);
    if (group) blockedGroups.add(group);
  }
  return selected;
}

export function pickRotatedIds(ids, count, kind, rotation, random = Math.random) {
  return rotateOrder([...ids], kind, id => id, rotation, random).slice(0, count);
}

// التحديث عند عرض السؤال: السؤال نفسه وكفاءته أو مبدؤه. يعيد قائمة السجلات الجديدة (بلا إجابة ولا درجة).
export function shownRecords(question, now = new Date().toISOString(), rotation = new Map()) {
  const keys = [rotationKey('question', question.id)];
  if (question.competency_id) keys.push(rotationKey('competency', question.competency_id));
  if (question.principle_id) keys.push(rotationKey('principle', question.principle_id));
  if (question.owner_type === 'additional') keys.push(rotationKey('competency', 'AI'));
  return keys.map(id => {
    const previous = rotation.get ? rotation.get(id) : rotation?.[id];
    return { id, count: (Number(previous?.count) || 0) + 1, last_shown_at: now };
  });
}

export function applyRecords(rotation, records) {
  records.forEach(record => rotation.set(record.id, { count: record.count, last_shown_at: record.last_shown_at }));
  return rotation;
}
