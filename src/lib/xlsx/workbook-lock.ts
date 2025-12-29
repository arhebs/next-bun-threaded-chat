let last: Promise<void> = Promise.resolve();

export async function withWorkbookLock<T>(fn: () => T | Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });

  const previous = last;
  last = previous.then(
    () => next,
    () => next
  );

  await previous;

  try {
    return await fn();
  } finally {
    release();
  }
}
