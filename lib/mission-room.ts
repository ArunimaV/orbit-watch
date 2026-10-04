export const OPERATOR_NAME_KEY = "orbit-watch-operator";
export const SPACETIME_TOKEN_KEY = "orbit-watch-spacetime-token";

const NAME_MAX = 40;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._'’-]*$/;

export interface SpacetimeConfig {
  uri: string;
  module: string;
}

/** Both public env vars are required. Either one missing leaves the mission room off. */
export function spacetimeConfig(
  env: Record<string, string | undefined> = process.env,
): SpacetimeConfig | null {
  const uri = env.NEXT_PUBLIC_SPACETIME_URI?.trim();
  const moduleName = env.NEXT_PUBLIC_SPACETIME_MODULE?.trim();
  if (!uri || !moduleName) return null;
  return { uri, module: moduleName };
}

export function defaultOperatorName(random = Math.random): string {
  const n = Math.floor(random() * 10_000);
  return `Operator-${n.toString().padStart(4, "0")}`;
}

export function readOperatorName(storage: Pick<Storage, "getItem"> | null = browserStorage()): string | null {
  const saved = storage?.getItem(OPERATOR_NAME_KEY)?.trim();
  if (!saved || !isOperatorName(saved)) return null;
  return saved;
}

export function isOperatorName(value: string): boolean {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= NAME_MAX && NAME_PATTERN.test(name);
}

/** Compact line for the shared feed, matching the spoken brief when the ranker wrote it. */
export function grokBriefFeedLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const name = flat.match(/^(.+?) is the one threat/)?.[1];
  const meters = flat.match(/about ([\d,]+) meters/)?.[1]?.replace(/,/g, "");
  const clock = flat.match(/\d{1,2}:\d{2}\s*[AP]M/i)?.[0];
  if (name && meters && clock) {
    return `Grok briefed: ${name} ${meters} m at ${clock}`.slice(0, 320);
  }
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const clipped = sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
  return `Grok briefed: ${clipped}`.slice(0, 320);
}

export function grokAlertFeedLine(headline: string): string {
  return `Grok alert: ${headline.replace(/\s+/g, " ").trim()}`.slice(0, 320);
}

type FeedPoster = (kind: "system" | "grok", text: string) => void;

let poster: FeedPoster | null = null;
const pending: { kind: "system" | "grok"; text: string }[] = [];

/** Called by the live connection. Pass null when the socket drops. */
export function bindMissionFeed(next: FeedPoster | null): void {
  poster = next;
  if (!next) return;
  const queued = pending.splice(0, pending.length);
  for (const item of queued) next(item.kind, item.text);
}

/**
 * Post a Grok or system line into the shared feed.
 * No-ops when the mission room is off. Queues until the socket is up.
 */
export function postMissionFeed(kind: "system" | "grok", text: string): void {
  if (!spacetimeConfig()) return;
  const line = text.trim();
  if (!line) return;
  if (!poster) {
    pending.push({ kind, text: line });
    if (pending.length > 8) pending.shift();
    return;
  }
  poster(kind, line);
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
