// Runs a Supabase call; if it returns an error, tries once more after a short
// pause (a transient database or network hiccup). Returns the final error, or null.
export const retryOnce = async (call: () => PromiseLike<{ error: unknown }>, pauseMs = 300): Promise<unknown> => {
  const first = await call()
  if (!first.error) return null
  await new Promise((resolve) => setTimeout(resolve, pauseMs))
  const second = await call()
  return second.error ?? null
}
