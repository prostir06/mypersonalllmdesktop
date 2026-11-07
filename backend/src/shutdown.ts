export async function runShutdown(opts: {
  close: () => Promise<void>;
  disconnect: () => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 25_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('shutdown timeout')), timeoutMs);
  });
  try {
    await Promise.race([
      (async () => {
        await opts.close();
        await opts.disconnect();
      })(),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
