export interface HtmlLink {
  href: string;
  text: string;
  title?: string;
  className?: string;
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "));
}

export function stripTagsPreserveLines(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|tr|li|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split("\n")
    .map((line) => decodeHtml(line.replace(/[ \t\f\v]+/g, " ")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\s${name}=(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2] ?? "") : undefined;
}

export function links(html: string): HtmlLink[] {
  const result: HtmlLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const attrs = match[1] ?? "";
    const href = attr(attrs, "href");
    if (!href) continue;
    const link: HtmlLink = {
      href,
      text: stripTags(match[2] ?? ""),
    };
    const title = attr(attrs, "title") ?? attr(attrs, "aria-label");
    const className = attr(attrs, "class");
    if (title !== undefined) link.title = title;
    if (className !== undefined) link.className = className;
    result.push(link);
  }
  return result;
}

export function pageTitle(html: string): string | undefined {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1] ?? "") : undefined;
}

export function textAfterLabel(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stripTags(html).match(new RegExp(`${escaped}\\s*:?\\s*([^\\n]+?)(?:\\s{2,}|$)`, "i"));
  return match?.[1]?.trim();
}
