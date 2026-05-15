export interface TrafficEntry {
  id: number;
  time: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  contentType?: string;
  contentLength?: string;
  error?: string;
}

export class TrafficRecorder {
  private entries: TrafficEntry[] = [];
  private enabled = false;
  private nextId = 1;

  start(): { recording: boolean } {
    this.enabled = true;
    return { recording: this.enabled };
  }

  stop(): { recording: boolean } {
    this.enabled = false;
    return { recording: this.enabled };
  }

  clear(): { recording: boolean; entries: TrafficEntry[] } {
    this.entries = [];
    return this.snapshot();
  }

  snapshot(): { recording: boolean; entries: TrafficEntry[] } {
    return { recording: this.enabled, entries: this.entries };
  }

  record(entry: Omit<TrafficEntry, "id" | "time">): void {
    if (!this.enabled) return;
    this.entries = [
      {
        id: this.nextId++,
        time: new Date().toISOString(),
        ...entry,
      },
      ...this.entries,
    ].slice(0, 250);
  }

  wrapFetch(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    return async (input, init) => {
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const url = input instanceof Request ? input.url : String(input);
      const started = performance.now();
      try {
        const response = await fetcher(input, init);
        const entry: Omit<TrafficEntry, "id" | "time"> = {
          method,
          url,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
        };
        const contentType = response.headers.get("content-type");
        const contentLength = response.headers.get("content-length");
        if (contentType !== null) entry.contentType = contentType;
        if (contentLength !== null) entry.contentLength = contentLength;
        this.record(entry);
        return response;
      } catch (error) {
        this.record({
          method,
          url,
          durationMs: Math.round(performance.now() - started),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }
}
