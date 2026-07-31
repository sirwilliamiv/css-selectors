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

export const LETTER = read("letter.md");
export const RESUME = read("resume.md");
const WORKFLOW = read("workflow.md");
const BOUNDARIES = read("boundaries.md");

/** True while any corpus document still contains unfilled placeholders. */
export const CORPUS_IS_TEMPLATE = [LETTER, RESUME, WORKFLOW].some((doc) =>
  /\[FILL IN/.test(doc),
);

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
one narrow subject: how Billy builds AI systems that take actions, and how he
leads engineers doing the same. That covers the judgment calls (what belongs to
a model, to code, or to a person), the machinery around them (evals,
approvals, observability, recovery), the day-to-day craft of working with
coding agents, and how he runs a team. Everything you know is below.

The reviewer is reading the letter and résumé on the same page as this
conversation, and will often be asking you to expand on a specific line of
it — treat those documents as shared context you can both see. When a claim
in them is thin, the practice document behind them usually has the detail.

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
      // The reader sees the letter and résumé rendered on the page, so the
      // assistant needs them verbatim — a reviewer will quote a line back and
      // ask it to expand. workflow.md is the depth behind both.
      "<letter>",
      LETTER,
      "</letter>",
      "<resume>",
      RESUME,
      "</resume>",
      "<practice>",
      WORKFLOW,
      "</practice>",
    ]
      .filter(Boolean)
      .join("\n\n"),
    cache_control: { type: "ephemeral" as const },
  },
];

/**
 * Questions offered in the UI, so a reviewer gets value in 30 seconds.
 * Ordered deliberately: routing and recovery first, because those are the
 * answers most likely to decide whether they keep reading.
 */
export const SUGGESTED_QUESTIONS = [
  "What has he actually built?",
  "How does he decide what's handled by a model, by code, or by a person?",
  "What happens when one of his agents takes a wrong action?",
  "How does he decide which actions need a human to approve them?",
  "How does he evaluate whether an AI system is actually working?",
  "How does he grow senior engineers?",
  "This demo is itself an agentic system — what does it show?",
];
