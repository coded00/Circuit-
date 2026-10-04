/**
 * Circuit — in-process per-key queue. Requests for the same key (a tournament, a
 * listing) run one after another here instead of all opening a database
 * transaction and waiting on its row lock: a waiter in the database holds one of
 * the few pooled connections while it waits, so a busy tournament would starve
 * every other request. This is only an optimisation. The database row lock stays
 * the real guard, and it still covers other server instances.
 */
const tails = new Map<string, Promise<unknown>>();

export class AbandonedError extends Error {}

/** `signal` is the request's abort signal: if the client has gone by the time its turn comes, the work is skipped. */
export async function withKeyedLock<T>(key: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const turn = () => {
    if (signal?.aborted) throw new AbandonedError("client disconnected while queued");
    return fn();
  };
  const run = previous.then(turn, turn);
  const tail = run.then(() => undefined, () => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
