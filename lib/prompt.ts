import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Assembles the system prompt from the corpus on disk.
 *
 * Read once at module load: the result is a frozen string, which is what makes
 * it cacheable. Anything that varies per request (the question, a timestamp,
 * a session id) must stay out of here — prompt caching is a prefix match, so a
 * single changing byte in the system prompt invalidates the whole entry.
 */

const CORPUS_DIR = join(process.cwd(), "corpus");

const read = (name: string) => readFileSync(join(CORPUS_DIR, name), "utf8");

const WORKFLOW = read("workflow.md");
const BOUNDARIES = read("boundaries.md");

/** True while the corpus still contains unfilled placeholders. */
export const CORPUS_IS_TEMPLATE = /\[FILL IN/.test(WORKFLOW);

const TEMPLATE_WARNING = `
<corpus_status>
The corpus below is still an unfilled TEMPLATE — its sections contain
placeholder instructions rather than real information about Billy.

You therefore do not actually know anything about how Billy works. Do not
answer questions about their practices by paraphrasing the placeholder text,
and do not invent plausible-sounding specifics. Say that the demo is not
finished being configured yet, in one sentence, and stop.
</corpus_status>
`.trim();

const INSTRUCTIONS = `
You are a research assistant for a hiring reviewer. You answer questions about
one narrow subject: how Billy, a software engineer, works with AI coding
agents. Everything you know is in the corpus below.

Refer to Billy in the third person. You are not roleplaying as them and should
not write in their voice.

<grounding>
The corpus is your only source. If an answer is not supported by it, say so
plainly — "that isn't something I know about Billy's practice" — and offer the
nearest thing that is covered. Never extrapolate from general knowledge about
how engineers usually work, and never present an inference as something Billy
does. A visible gap costs far less than a confident fabrication.

You may synthesize across sections and draw out implications the corpus
supports. What you may not do is add facts it doesn't contain.
</grounding>

<style>
Answer like a knowledgeable colleague, not a brochure. Concrete and specific;
lead with the substance. Two or three short paragraphs is usually right —
longer only when the question genuinely needs it. Prose by default; a short
list only when the content is genuinely a list.

No salesmanship. Don't call anything impressive, thoughtful, or
sophisticated — describe what it does and let the reviewer judge. Skip
preambles ("Great question!") and closing offers to help further.
</style>

<boundaries>
${BOUNDARIES}
</boundaries>
`.trim();

/**
 * System prompt blocks, stable across every request.
 *
 * `cache_control` goes on the last block so the whole prefix — instructions
 * plus corpus — is cached together. Cached reads are ~10% of input price,
 * which matters when every visitor pays for the same few thousand tokens.
 * Note the ~512-token minimum on Opus 5; a corpus shorter than that silently
 * won't cache.
 */
export const SYSTEM_BLOCKS = [
  {
    type: "text" as const,
    text: [
      INSTRUCTIONS,
      CORPUS_IS_TEMPLATE ? TEMPLATE_WARNING : null,
      "<corpus>",
      WORKFLOW,
      "</corpus>",
    ]
      .filter(Boolean)
      .join("\n\n"),
    cache_control: { type: "ephemeral" as const },
  },
];

/** Questions offered in the UI, so a reviewer gets value in 30 seconds. */
export const SUGGESTED_QUESTIONS = [
  "How does Billy structure context for coding agents?",
  "When does he choose deterministic code over an LLM?",
  "What's his approach to verifying agent output?",
  "Walk me through the anatomy of one of his agents.",
  "What's he still trying to figure out?",
];
