import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_BLOCKS } from "../lib/prompt.js";
import { STAGES, screen, route, type StageId, type StageStatus } from "../lib/pipeline.js";

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

function rateCheck(ip: string): { limited: boolean; used: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return { limited: recent.length > RATE_LIMIT.max, used: recent.length };
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
    ...(withFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

const isBetaRejection = (err: unknown) => {
  const e = err as { status?: number; message?: string };
  return e?.status === 400 && /fallback|beta/i.test(e?.message ?? "");
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  // The stream opens before any work happens, so every stage — including the
  // ones that reject the request — is reported through the same channel and
  // shows up in the pipeline the reader is watching.
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (obj: unknown) => res.write(JSON.stringify(obj) + "\n");
  const reached = new Set<StageId>();
  let clock = Date.now();

  const stage = (
    id: StageId,
    status: StageStatus,
    detail: string,
    meta?: Record<string, string | number>,
  ) => {
    const now = Date.now();
    reached.add(id);
    send({ type: "stage", id, status, detail, meta, ms: now - clock });
    clock = now;
  };

  /** Anything not reached is reported as skipped, so the path taken is legible. */
  const finish = (stopReason: string) => {
    for (const s of STAGES) {
      if (!reached.has(s.id)) send({ type: "stage", id: s.id, status: "skip", detail: "not reached" });
    }
    send({ type: "done", stop_reason: stopReason });
    res.end();
  };

  send({ type: "pipeline", stages: STAGES });

  // -- receive -------------------------------------------------------------
  const raw = (req.body as { messages?: Msg[] })?.messages ?? [];
  const question = raw[raw.length - 1]?.content ?? "";
  stage("receive", "ok", "Request body accepted over HTTPS.", {
    characters: question.length,
    "turns in context": raw.length,
  });

  // -- rate limit ----------------------------------------------------------
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const rate = rateCheck(ip);
  if (rate.limited) {
    stage("ratelimit", "fail", "Per-IP budget exhausted; request dropped before any spend.", {
      window: `${RATE_LIMIT.windowMs / 1000}s`,
      limit: RATE_LIMIT.max,
    });
    send({ type: "error", message: "Too many questions in a short window — give it a minute." });
    finish("rate_limited");
    return;
  }
  stage("ratelimit", "ok", "Within the per-IP budget for this window.", {
    used: `${rate.used}/${RATE_LIMIT.max}`,
    window: `${RATE_LIMIT.windowMs / 1000}s`,
  });

  // -- validate ------------------------------------------------------------
  const validated = validate(req.body);
  if (typeof validated === "string") {
    stage("validate", "fail", validated);
    send({ type: "error", message: validated });
    finish("invalid_request");
    return;
  }
  stage("validate", "ok", "Shape, roles, and length caps check out.", {
    "max chars": MAX_MESSAGE_CHARS,
    "max turns": MAX_TURNS,
  });

  // -- screen --------------------------------------------------------------
  const { signals } = screen(question);
  if (signals.length) {
    stage(
      "screen",
      "warn",
      "Injection markers matched. Recording the signal, not acting on it — these heuristics have a real false-positive rate, and the boundaries in the system prompt already cover this. Blocking here would reject honest questions to stop attacks that are handled anyway.",
      { matched: signals.join(", ") },
    );
  } else {
    stage("screen", "ok", "No instruction-override markers matched.", {
      patterns: 5,
      cost: "0 tokens",
    });
  }

  // -- route ---------------------------------------------------------------
  const { canned } = route(question);
  if (canned) {
    stage(
      "route",
      "warn",
      "This question has an exact answer, so it is served from code. A model call here would be slower, costlier, and less reliable than a string that is already correct.",
      { handler: `canned:${canned.id}`, "model calls": 0 },
    );
    for (const chunk of canned.answer.match(/[\s\S]{1,24}/g) ?? []) {
      send({ type: "delta", text: chunk });
    }
    stage("verify", "ok", "Deterministic answer; nothing to verify.");
    finish("end_turn");
    return;
  }
  stage("route", "ok", "Open-ended question — needs the model.", { handler: "model" });

  // -- assemble ------------------------------------------------------------
  const systemChars = SYSTEM_BLOCKS.reduce((n, b) => n + b.text.length, 0);
  stage("assemble", "ok", "Letter, résumé, practice doc, and boundaries assembled into a frozen prefix.", {
    "system blocks": SYSTEM_BLOCKS.length,
    "prefix chars": systemChars,
    "cache breakpoint": "last block",
  });

  // Tracked at handler scope: once any token has reached the client, no retry
  // can be safe — it would duplicate the partial answer already on screen.
  let streamed = false;

  const attempt = async (withFallbacks: boolean) => {
    stage("model", "ok", `Calling ${MODEL}.`, {
      effort: EFFORT,
      thinking: "adaptive (default)",
      "max tokens": MAX_TOKENS,
      fallbacks: withFallbacks ? "on refusal" : "off",
    });

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
    const usage = final.usage;

    stage("stream", "ok", "Response streamed to the browser as it was generated.", {
      "output tokens": usage.output_tokens,
      "cache read": usage.cache_read_input_tokens ?? 0,
      "cache write": usage.cache_creation_input_tokens ?? 0,
      uncached: usage.input_tokens,
    });

    // Check stop_reason before trusting the output — a refusal can arrive with
    // empty content, or mid-stream after a partial answer.
    if (final.stop_reason === "refusal") {
      stage("verify", "fail", "Safety classifier declined this request.", {
        stop_reason: "refusal",
      });
      send({
        type: "error",
        message: streamed
          ? "\n\n(Cut off there — that question tripped a safety filter. Try rephrasing.)"
          : "That question tripped a safety filter rather than a topic boundary. Try rephrasing it.",
      });
    } else {
      stage("verify", "ok", "Completed normally; output is safe to render.", {
        stop_reason: final.stop_reason ?? "end_turn",
      });
    }

    finish(final.stop_reason ?? "end_turn");
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
    stage(streamed ? "verify" : "model", "fail", message, { status: e?.status ?? "network" });
    send({ type: "error", message });
    finish("error");
  }
}
