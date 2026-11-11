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
    const { readable, writable } = new TransformStream();
    void this.pipeWhileHeld(response.body, writable);
    return new Response(readable, response);
  }

  private async pipeWhileHeld(body: ReadableStream, writable: WritableStream): Promise<void> {
    const release = this.hold();
    try {
      await body.pipeTo(writable);
    } catch {
      return;
    } finally {
      release();
    }
  }

  isIdle(limitMs: number): boolean {
    return this.open === 0 && this.now() - this.lastActivityAt >= limitMs;
  }
}
