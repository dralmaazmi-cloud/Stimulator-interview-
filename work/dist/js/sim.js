export function selectSessionQuestions(questions, count, random = Math.random) {
  const pool = [...questions];
  const selected = [];
  const blockedGroups = new Set();
  while (pool.length && selected.length < count) {
    const index = Math.floor(random() * pool.length);
    const [candidate] = pool.splice(index, 1);
    const group = candidate.variant_group;
    if (group && blockedGroups.has(group)) continue;
    selected.push(candidate);
    if (group) blockedGroups.add(group);
  }
  return selected;
}
