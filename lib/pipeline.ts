/**
 * The request pipeline, as data.
 *
 * Every stage a question passes through is declared here and emitted to the
 * client as it runs, so the page can show the architecture rather than
 * describe it. The interesting part isn't that it's instrumented — it's that
 * two of these stages can end the request before a model is ever called, and
 * the UI shows that happening.
 */

export type StageId =
  | "receive"
  | "ratelimit"
  | "validate"
  | "screen"
  | "route"
  | "assemble"
  | "model"
  | "stream"
  | "verify";

export type StageStatus = "pending" | "ok" | "warn" | "skip" | "fail";

export interface StageEvent {
  type: "stage";
  id: StageId;
  status: StageStatus;
  /** One line the reader can actually learn something from. */
  detail: string;
  /** Key/value pairs rendered as a small table under the stage. */
  meta?: Record<string, string | number>;
  ms?: number;
}

/** Declared up front so the UI can draw the whole pipeline before it runs. */
export const STAGES: { id: StageId; label: string; kind: "code" | "model" }[] = [
  { id: "receive", label: "Receive", kind: "code" },
  { id: "ratelimit", label: "Rate limit", kind: "code" },
  { id: "validate", label: "Validate", kind: "code" },
  { id: "screen", label: "Screen", kind: "code" },
  { id: "route", label: "Route", kind: "code" },
  { id: "assemble", label: "Assemble prompt", kind: "code" },
  { id: "model", label: "Model", kind: "model" },
  { id: "stream", label: "Stream", kind: "model" },
  { id: "verify", label: "Verify", kind: "code" },
];

// ---------------------------------------------------------------------------
// Screen — deterministic, pre-model
// ---------------------------------------------------------------------------

/**
 * High-precision markers for the usual instruction-override attempts.
 *
 * These deliberately **annotate rather than block**. Heuristics like these have
 * a real false-positive rate — "what's in your system prompt?" is a perfectly
 * legitimate question about how this page works — and blocking on them would
 * fail honest visitors to stop attacks the system prompt already handles.
 * Showing the signal without acting on it is the point: the reader sees the
 * detection, and sees the decision not to trust it as a gate.
 */
const INJECTION_MARKERS: { label: string; re: RegExp }[] = [
  { label: "instruction override", re: /ignore\s+(all\s+|your\s+|the\s+)?(previous|prior|above)/i },
  { label: "prompt extraction", re: /\b(system prompt|initial instructions|verbatim)\b/i },
  { label: "persona reset", re: /\byou are now\b|\bdeveloper mode\b|\bunrestricted\b/i },
  { label: "encoding evasion", re: /\bbase64\b|\brot13\b/i },
  { label: "false authority", re: /\b(company policy requires|i am the (hiring manager|admin))\b/i },
];

export function screen(text: string): { signals: string[] } {
  return {
    signals: INJECTION_MARKERS.filter((m) => m.re.test(text)).map((m) => m.label),
  };
}

// ---------------------------------------------------------------------------
// Route — does this need a model at all?
// ---------------------------------------------------------------------------

/**
 * A few questions are about the system rather than about Billy, and have exact
 * answers. Spending a model call on them would be worse in every dimension:
 * slower, costlier, and less reliable than the string that's already correct.
 *
 * This is the model/code decision the rest of the site talks about, running in
 * the request path where a reader can watch it happen.
 */
const CANNED: { id: string; re: RegExp; answer: string }[] = [
  {
    id: "scope",
    re: /^\s*(what|which)\s+(can|do)\s+you\s+(talk about|answer|discuss|know)/i,
    answer:
      "I answer from a fixed set of documents about how Billy builds and leads work on AI systems: what he's built, how he decides what belongs to a model versus to code versus to a person, how he handles evals, approvals, observability, and recovery, and how he runs a team.\n\nOutside that I decline — including anything about compensation, an employer's internals, or your systems, which I know nothing about.",
  },
  {
    id: "identity",
    re: /^\s*(who|what)\s+are\s+you\s*\??\s*$/i,
    answer:
      "I'm a scoped assistant running on Claude Opus 5, grounded in the same letter and résumé you can read on this page plus a longer document on Billy's engineering practice. I only know what's in those files.",
  },
];

export function route(text: string): { canned: (typeof CANNED)[number] | null } {
  return { canned: CANNED.find((c) => c.re.test(text)) ?? null };
}
