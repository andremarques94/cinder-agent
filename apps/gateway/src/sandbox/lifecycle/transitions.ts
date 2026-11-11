type Queued<Results> = { [Kind in keyof Results]?: Promise<Results[Kind]> };

// Transitions run one at a time, in the order they were asked for. Asking for the same kind as
// the last one queued joins it, so concurrent requests share one start, and a stop always runs
// after every start admitted before it.
export class Transitions<Results extends Record<string, unknown>> {
  private tail: Promise<void> = Promise.resolve();
  private last: Queued<Results> = {};
  private pending = 0;

  get busy(): boolean {
    return this.pending > 0;
  }

  run<Kind extends keyof Results>(
    kind: Kind,
    transition: () => Promise<Results[Kind]>,
  ): Promise<Results[Kind]> {
    const joined = this.last[kind];
    if (joined) {
      return joined;
    }
    const done = this.after(this.tail, transition);
    const last: Queued<Results> = {};
    last[kind] = done;
    this.last = last;
    this.pending++;
    this.tail = this.settle(last, done);
    return done;
  }

  private async after<T>(previous: Promise<void>, transition: () => Promise<T>): Promise<T> {
    await previous;
    return transition();
  }

  private async settle(queued: Queued<Results>, done: Promise<unknown>): Promise<void> {
    try {
      await done;
    } catch {
      return;
    } finally {
      this.pending--;
      if (this.last === queued) {
        this.last = {};
      }
    }
  }
}
