export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RunbotClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

export class RunbotHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "RunbotHttpError";
  }
}

export class RunbotClient {
  readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(options: RunbotClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://runbot.odoo.com").replace(/\/+$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }

  async getHtml(pathOrUrl: string): Promise<string> {
    const url = this.url(pathOrUrl);
    const response = await this.fetcher(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "runbot-next/0.1",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new RunbotHttpError(`GET ${url} failed with ${response.status}`, response.status, url);
    }
    return response.text();
  }

  async getText(pathOrUrl: string, maxBytes = 200_000): Promise<string> {
    const url = this.url(pathOrUrl);
    const response = await this.fetcher(url, {
      headers: { accept: "text/plain,*/*", "user-agent": "runbot-next/0.1" },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new RunbotHttpError(`GET ${url} failed with ${response.status}`, response.status, url);
    }
    const text = await response.text();
    return text.length > maxBytes ? `${text.slice(0, maxBytes)}\n... truncated at ${maxBytes} chars ...` : text;
  }
}
