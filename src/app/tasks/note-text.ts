/** A note's first line is its title; the rest is its plain-text body. Never truncate pasted text. */
export function editingFields(value: string): { title: string; description: string } {
  const text = value.replace(/\r\n?/g, '\n');
  const newline = text.indexOf('\n');
  const first = newline < 0 ? text : text.slice(0, newline);
  const rest = newline < 0 ? '' : text.slice(newline + 1);
  if (first.length <= 300) return { title: first, description: rest };
  return { title: first.slice(0, 300), description: first.slice(300) + (rest ? '\n' + rest : '') };
}
export function noteFields(value: string): { title: string; description: string } {
  const fields = editingFields(value.trimStart());
  return { ...fields, title: fields.title.trim() };
}
export interface ContinueLine {
  side: 'after' | 'before';
  text: string;
}

/** getRandomValues also works on HTTP LAN origins, where randomUUID is unavailable. */
export function newDraftId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface MarkdownHeading {
  level: number;
  title: string;
  description: string;
}
/** Only a line-start ATX heading is structural; #tag, C# and escaped hashes stay text. */
export function parseHeading(value: string): MarkdownHeading | null {
  const [line = '', ...body] = value.replace(/\r\n?/g, '\n').split('\n');
  const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
  return match
    ? { level: match[1]!.length, title: (match[2] ?? '').trim(), description: body.join('\n') }
    : null;
}
export const headingSize = (level: number) => [0, 25, 20, 17, 15, 14, 13][level] ?? 20;
