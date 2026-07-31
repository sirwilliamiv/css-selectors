import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_BLOCKS } from "../lib/prompt.js";

const MODEL = "claude-opus-5";

// Thinking is on by default on Opus 5 and shares the max_tokens budget with the
// response, so this is not purely an answer-length cap. Low effort keeps the
// demo responsive; it's a much better lever here than disabling thinking, which
// on this model can leak reasoning into the visible text.
const MAX_TOKENS = 4096;
const EFFORT = "low" as const;

const MAX_MESSAGE_CHARS = 2000;
const MAX_TURNS = 24;

// Public demo behind a real API key: cap per-IP request volume. This is
// per-instance memory, so it is a speed bump rather than a real limit —
// serverless spreads traffic across instances and cold-starts reset the map.
// Put a platform-level rate limit in front of this before sharing the URL
// anywhere it could be found by strangers.
const RATE_LIMIT = { windowMs: 60_000, max: 12 };
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

const client = new Anthropic();

type Msg = { role: "user" | "assistant"; content: string };

function validate(body: unknown): Msg[] | string {
  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return "Expected a non-empty `messages` array.";
  }
  if (messages.length > MAX_TURNS) {
    return "This conversation is long enough — please start a new one.";
  }
  const clean: Msg[] = [];
  for (const m of messages) {
    const { role, content } = (m ?? {}) as Partial<Msg>;
    if (role !== "user" && role !== "assistant") return "Invalid message role.";
    if (typeof content !== "string" || content.trim() === "") {
      return "Messages must have non-empty text content.";
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return `Questions are limited to ${MAX_MESSAGE_CHARS} characters.`;
    }
    clean.push({ role, content });
  }
  if (clean[clean.length - 1].role !== "user") {
    return "The last message must be from the user.";
  }
  return clean;
}

/**
 * Opus 5's safety classifiers can decline a request outright. Server-side
 * fallbacks re-run it on another model inside the same call, so a false
 * positive on a benign question doesn't dead-end the demo. It's a beta, so
 * fall back to a plain request if the account can't use it.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const useFallbacks = process.env.ENABLE_REFUSAL_FALLBACK !== "0";
let fallbacksUnavailable = false;

function requestParams(messages: Msg[], withFallbacks: boolean) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system: SYSTEM_BLOCKS,
    messages,
    ...(withFallbacks
      ? { betas: [FALLBACK_BETA], fallbacks: "default" as const }
      : {}),
  };
}

function isBetaRejection(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  return (
    e?.status === 400 &&
    /fallback|beta/i.test(e?.message ?? "")
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  if (rateLimited(ip)) {
    res.status(429).json({ error: "Too many questions in a short window — give it a minute." });
    return;
  }

  const validated = validate(req.body);
  if (typeof validated === "string") {
    res.status(400).json({ error: validated });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  // Tracked at handler scope: once any token has reached the client, no retry
  // can be safe — it would duplicate the partial answer already on screen.
  let streamed = false;

  const send = (obj: unknown) => res.write(JSON.stringify(obj) + "\n");

  const attempt = async (withFallbacks: boolean) => {
    const stream = client.beta.messages.stream(requestParams(validated, withFallbacks));

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        streamed = true;
        send({ type: "delta", text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();

    // Check stop_reason before trusting the output — a refusal can arrive with
    // empty content, or mid-stream after a partial answer.
    if (final.stop_reason === "refusal") {
      send({
        type: "error",
        message: streamed
          ? "\n\n(Cut off there — that question tripped a safety filter. Try rephrasing.)"
          : "That question tripped a safety filter rather than a topic boundary. Try rephrasing it.",
      });
    }

    send({ type: "done", stop_reason: final.stop_reason });
  };

  try {
    try {
      await attempt(useFallbacks && !fallbacksUnavailable);
    } catch (err) {
      // Retry only if the beta was rejected up front. `!streamed` is the
      // load-bearing guard: a mid-stream failure must surface as an error, not
      // restart and repeat text the reader has already seen.
      if (!streamed && useFallbacks && !fallbacksUnavailable && isBetaRejection(err)) {
        fallbacksUnavailable = true;
        console.warn("Refusal fallbacks unavailable on this account; continuing without.");
        await attempt(false);
      } else {
        throw err;
      }
    }
  } catch (err) {
    const e = err as { status?: number };
    console.error("ask handler failed:", err);
    const message =
      e?.status === 429
        ? "The API is rate limiting right now. Try again shortly."
        : "Something went wrong reaching the model. Try again.";
    // Headers are already sent, so surface the error in-band.
    send({ type: "error", message });
    send({ type: "done", stop_reason: "error" });
  } finally {
    res.end();
  }
}
