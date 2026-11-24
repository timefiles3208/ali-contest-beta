export const RECOGNITION_BUDGET_MS = 18_000;

export async function withinRecognitionBudget(run, ms = RECOGNITION_BUDGET_MS) {
  const deadline = performance.now() + ms;
  const expired = { timedOut: true };
  let active = true;
  const current = () => active && performance.now() < deadline;
  let timer;
  try {
    return await Promise.race([
      new Promise(resolve => { timer = setTimeout(() => resolve(expired), ms); }),
      Promise.resolve().then(() => run(current)).then(value => current() ? { value, timedOut: false } : expired),
    ]);
  } finally {
    active = false;
    clearTimeout(timer);
  }
}
