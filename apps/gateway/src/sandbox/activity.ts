export class Activity {
  private open = 0;
  private lastActivityAt: number;

  constructor(private readonly now: () => number = Date.now) {
    this.lastActivityAt = now();
  }

  touch(): void {
    this.lastActivityAt = this.now();
  }

  hold(): () => void {
    this.open++;
    this.touch();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.open--;
        this.touch();
      }
    };
  }

  track(response: Response): Response {
    if (!response.body) {
      this.touch();
      return response;
    }
    const release = this.hold();
    const { readable, writable } = new TransformStream();
    void response.body
      .pipeTo(writable)
      .catch(() => {})
      .finally(release);
    return new Response(readable, response);
  }

  isIdle(limitMs: number): boolean {
    return this.open === 0 && this.now() - this.lastActivityAt >= limitMs;
  }
}
