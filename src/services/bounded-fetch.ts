// Plain AbortController is supported by both React Native and browsers. Forward
// caller cancellation and cap an unresponsive request without blind write retries.
export const boundedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const inherited =
    init?.signal ||
    (typeof input === "object" && "signal" in input
      ? (input.signal as AbortSignal)
      : undefined);
  const abort = () => controller.abort();
  if (inherited?.aborted) abort();
  inherited?.addEventListener("abort", abort, { once: true });
  const deadline = setTimeout(abort, 20000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(deadline);
    inherited?.removeEventListener("abort", abort);
  }
};
