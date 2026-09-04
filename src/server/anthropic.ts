import { MAX_OUTPUT_TOKENS, type Turn } from "@/lib/support/chat";

/**
 * The Claude API, server-side only.
 *
 * `fetch` rather than the SDK, for the same reason `stripe.ts` and `mail.ts`
 * are: the dependency surface stays small and every field that leaves this
 * process is visible in one file.
 *
 * The rules this module exists to enforce:
 *
 *  - `ANTHROPIC_API_KEY` is read here and nowhere else. It is never returned in
 *    a response, never logged, never interpolated into an error message, and
 *    never reaches a variable the browser bundle can see. A key placed in a
 *    NEXT_PUBLIC_ variable is treated as a fatal misconfiguration, because
 *    Next.js inlines those into JavaScript served to every visitor.
 *  - The system prompt is built on the server from `knowledge.ts`. The browser
 *    sends conversation turns and nothing else; it cannot supply instructions.
 */

const API = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

/**
 * Which model answers.
 *
 * Configurable so a model can be changed, or rolled back, without a deploy —
 * and so a wrong id is a setting to correct rather than a code change.
 */
export function model(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
}

export function anthropicEnabled(): boolean {
  // Trimmed: a value pasted into a dashboard field frequently arrives with a
  // trailing newline, which is truthy and then fails at the API as a malformed
  // header — a confusing failure a long way from its cause.
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Why the assistant is off, when it is off.
 *
 * Names of environment variables, never values. A key set under a slightly
 * wrong name and a key not set at all look identical from outside and need
 * completely different fixes, and "check the dashboard again" is not a
 * diagnosis. Only ever returned while the assistant is unavailable, so it
 * disappears the moment it stops being useful.
 */
export function configurationHint(): { sawNames: string[]; exactKeySet: boolean } {
  return {
    sawNames: Object.keys(process.env).filter((n) => /anthropic|claude/i.test(n)).sort(),
    exactKeySet: typeof process.env.ANTHROPIC_API_KEY === "string",
  };
}

/**
 * The one mistake that cannot be undone quietly: a key in a NEXT_PUBLIC_
 * variable, which is compiled into the browser bundle and cannot be recalled
 * from the people who have already loaded the page.
 */
export function assertKeyNotPublic(): void {
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (typeof value === "string" && /^sk-ant-/.test(value.trim())) {
      throw new Error(
        `${name} looks like an Anthropic API key. NEXT_PUBLIC_ variables are served to every ` +
        "visitor. Move it to ANTHROPIC_API_KEY and revoke the exposed key.",
      );
    }
  }
}

export interface StreamResult {
  ok: boolean;
  status: number;
  /** Server-sent events from the API, when ok. */
  body: ReadableStream<Uint8Array> | null;
  /** The provider's own message. Never our request, which carries the key. */
  error?: string;
}

/** Ask, and stream the answer back. Never throws on a refusal — it reports one. */
export async function streamChat(input: {
  system: string;
  turns: Turn[];
  signal?: AbortSignal;
}): Promise<StreamResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, status: 503, body: null, error: "not configured" };

  let response: Response;
  try {
    response = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": VERSION,
      },
      signal: input.signal,
      body: JSON.stringify({
        model: model(),
        max_tokens: MAX_OUTPUT_TOKENS,
        system: input.system,
        stream: true,
        messages: input.turns.map((t) => ({ role: t.role, content: t.content })),
      }),
    });
  } catch (error) {
    // A network failure, or the visitor closing the panel mid-answer.
    return {
      ok: false, status: 502, body: null,
      error: error instanceof Error ? error.name : "network error",
    };
  }

  if (!response.ok) {
    // The provider's message only. Read it rather than guessing, because a
    // wrong model id and an exhausted quota need different fixes and both
    // arrive as a 400.
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    return {
      ok: false,
      status: response.status,
      body: null,
      error: String(detail?.error?.message ?? "").slice(0, 300),
    };
  }

  return { ok: true, status: 200, body: response.body };
}

/**
 * The provider's event stream, reduced to the only thing the browser needs.
 *
 * Passing the raw stream through would work and would also hand the client a
 * shape that changes when the API's does. This emits one thing: text.
 */
export function textOnly(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = source.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line; a frame can arrive split
          // across reads, so only whole ones are taken.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const event = JSON.parse(line.slice(5).trim());
              if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ text: event.delta.text })}\n\n`,
                ));
              }
            } catch {
              /* A frame we cannot parse is a frame we do not need. */
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}
