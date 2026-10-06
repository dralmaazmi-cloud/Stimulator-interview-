// يطبّق tools/exercise-overrides.json على dist/data/exercises.json بعد التوليد (v0.5.1 — البند 11).
// حتمي بالكامل: الخلط والاختصار يستخدمان بذرة مشتقة من معرّف التمرين، ولا يُمس نص السؤال/المحفّز.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '..');
const target = path.join(project, 'dist/data/exercises.json');
const overrides = JSON.parse(fs.readFileSync(path.join(project, 'tools/exercise-overrides.json'), 'utf8'));
const source = JSON.parse(fs.readFileSync(target, 'utf8'));

function hash(value) {
  let state = 2166136261;
  for (const character of String(value)) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function seededRandom(seed) {
  let state = hash(seed) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function applyOverrides(exercises, config, salt = 0) {
  const removed = new Set(config.remove || []);
  return exercises
    .filter(exercise => !removed.has(exercise.id))
    .map(exercise => {
      const result = { ...exercise };
      if (config.explanations?.[exercise.id]) result.explanation = config.explanations[exercise.id];
      const correctText = exercise.choices[exercise.answer];
      let choices = [...exercise.choices];
      if (choices.length > (config.trim_when_more_than ?? 5)) {
        const distractors = shuffle(choices.filter((_, index) => index !== exercise.answer), seededRandom(`${config.seed}|trim|${exercise.id}`))
          .slice(0, (config.max_choices ?? 4) - 1);
        choices = [correctText, ...distractors];
      }
      const shuffled = shuffle(choices, seededRandom(`${config.seed}|order|${salt}|${exercise.id}`));
      result.choices = shuffled;
      result.answer = shuffled.indexOf(correctText);
      return result;
    });
}

export function positionShare(exercises) {
  if (!exercises.length) return 0;
  const counts = new Map();
  exercises.forEach(exercise => counts.set(exercise.answer, (counts.get(exercise.answer) || 0) + 1));
  return Math.max(...counts.values()) / exercises.length;
}

let salt = 0;
let result = applyOverrides(source, overrides, salt);
while (positionShare(result) > (overrides.max_position_share ?? 0.35) && salt < 500) {
  salt += 1;
  result = applyOverrides(source, overrides, salt);
}
if (positionShare(result) > (overrides.max_position_share ?? 0.35)) throw new Error('Could not balance answer positions within 500 salts.');

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  fs.writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  // alpha-4 (D3): الـmanifest يُكتب بعد اكتمال التجاوزات كي يطابق العدد النهائي في exercises.json.
  const manifestPath = path.join(project, 'dist/data/derived/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.counts.exercises = result.length;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Applied exercise overrides: ${source.length} → ${result.length} exercises, salt=${salt}, max position share=${positionShare(result).toFixed(3)}; manifest.counts.exercises=${result.length}`);
}
