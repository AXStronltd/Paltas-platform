/**
 * What the browser is allowed to send, and what it costs.
 *
 * Pure. The history lives in the browser and is posted back with every turn,
 * which is the simplest thing that works and means the server holds no
 * conversation — but it also means every field of it is attacker-controlled.
 * Nothing here trusts any of it.
 *
 * The limits are a bill. An unauthenticated endpoint that calls a paid API will
 * be found and scripted; caps on turns, characters and output tokens are what
 * stand between that and an invoice.
 */

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Longest single message a person may send. Generous for a question. */
export const MAX_MESSAGE_CHARS = 2_000;
/** How many previous turns are carried. Older ones are dropped, oldest first. */
export const MAX_TURNS = 20;
/** Total characters of history sent to the model, after truncation. */
export const MAX_HISTORY_CHARS = 12_000;
/** Ceiling on the reply. A help answer that needs more than this is the wrong answer. */
export const MAX_OUTPUT_TOKENS = 700;

/** Messages allowed from one address per hour, and per day. */
export const RATE_LIMIT = { perHour: 30, perDay: 120 };

const isTurn = (value: unknown): value is Turn => {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<Turn>;
  // "system" is not in the union on purpose: a client that could add a system
  // turn could rewrite every rule the assistant runs under.
  return (t.role === "user" || t.role === "assistant") && typeof t.content === "string";
};

/**
 * Take whatever arrived and return something safe to send on.
 *
 * The API requires turns to alternate and to begin with a user message. A
 * history that does not is not an error worth showing anybody — it is dropped
 * back to something valid, because the alternative is a visitor staring at a
 * failure they cannot act on.
 */
export function sanitiseHistory(input: unknown): Turn[] {
  if (!Array.isArray(input)) return [];

  const cleaned: Turn[] = [];
  for (const raw of input) {
    if (!isTurn(raw)) continue;
    const content = raw.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!content) continue;
    // Collapse a repeated role rather than dropping the turn: two user messages
    // in a row is what happens when a send failed and was retried.
    if (cleaned.length && cleaned[cleaned.length - 1].role === raw.role) {
      cleaned[cleaned.length - 1] = { role: raw.role, content };
      continue;
    }
    cleaned.push({ role: raw.role, content });
  }

  // Must begin with the visitor.
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();

  // Newest turns are the ones worth keeping.
  let trimmed = cleaned.slice(-MAX_TURNS);
  while (trimmed.length && total(trimmed) > MAX_HISTORY_CHARS) trimmed = trimmed.slice(1);
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();

  return trimmed;
}

export const total = (turns: Turn[]): number =>
  turns.reduce((sum, t) => sum + t.content.length, 0);

/** Whether a sanitised history is worth sending to the model at all. */
export function sendable(turns: Turn[]): boolean {
  return turns.length > 0 && turns[turns.length - 1].role === "user";
}

/**
 * A stable, non-reversible handle for one caller.
 *
 * The rate limiter needs to recognise somebody it has seen before. It does not
 * need to know who they are, and storing an address to count requests would put
 * a log of everyone who asked for help in the database for no benefit.
 */
export function callerKey(ip: string | null, salt: string): string {
  return `${salt}:${(ip ?? "unknown").trim()}`;
}

/** The window a request falls in, so counts can be kept per hour without a cron. */
export function windowStart(now: Date, hours = 1): Date {
  const ms = hours * 3_600_000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}
