/** Distinct RUTs one source can have checked inside a window. */
export const MAX_RUTS_PER_SOURCE = 3;

export const RUT_WINDOW_MS = 60 * 60 * 1000;

/** Sources kept at once, so a flood of addresses cannot grow this forever. */
const MAX_SOURCES = 10_000;

interface Attempts {
  ruts: Set<string>;
  resetsAt: number;
}

/**
 * Limits how many different RUTs one source can try. A RUT identifies but does
 * not authenticate, so this is what stops someone walking through RUTs to see
 * whose they are. Counted per visitor's address and not per conversation: a
 * new conversation is free. Repeating a RUT already tried does not count, so
 * a customer retyping their own is never locked out.
 *
 * In memory, like the conversations: a restart starts the count over.
 */
export class RutAttempts {
  private readonly sources = new Map<string, Attempts>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Whether `source` may have `rut` checked, counting it if so. */
  allow(source: string, rut: string): boolean {
    const now = this.now();
    let attempts = this.sources.get(source);
    if (!attempts || now >= attempts.resetsAt) {
      this.sources.delete(source);
      attempts = { ruts: new Set(), resetsAt: now + RUT_WINDOW_MS };
      this.sources.set(source, attempts);
      this.evict();
    }

    if (attempts.ruts.has(rut)) return true;
    if (attempts.ruts.size >= MAX_RUTS_PER_SOURCE) return false;
    attempts.ruts.add(rut);
    return true;
  }

  private evict(): void {
    while (this.sources.size > MAX_SOURCES) {
      const oldest = this.sources.keys().next().value;
      if (oldest === undefined) return;
      this.sources.delete(oldest);
    }
  }
}
