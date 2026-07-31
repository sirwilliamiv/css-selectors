# Ask Claude how Billy builds with AI

A small chat page. A reviewer types a question and gets an answer grounded in a
short document describing how I build and lead work on agentic systems — how I
route tasks between models, deterministic code, and people; how approvals,
evals, observability, and recovery paths get designed; and how I run a team
doing that work. Everything outside that scope is declined.

The premise: instead of a paragraph asserting I take this seriously, here is a
working thing you can interrogate.

It's also, deliberately, an instance of its own argument. The chat loop took an
afternoon. The parts that took the rest of the time are the eval suite, the
grounding constraint that makes it refuse rather than guess, the deploy gate
that blocks an unfilled corpus, the refusal handling, and the retry that can't
duplicate a partial answer. That ratio is the claim.

```
corpus/workflow.md      the grounding document — everything downstream is only as good as this
corpus/boundaries.md    what's off-limits and how it declines
lib/prompt.ts           assembles the system prompt; sets the cache breakpoint
api/ask.ts              serverless handler, streams from the Messages API
api/config.ts           suggested questions + setup-banner state
public/                 the page (no framework, no build step)
evals/                  adversarial + capability suite, graded by a second Claude call
scripts/check-corpus.ts pre-deploy gate: fails while the corpus is unfilled
```

## Before anything else: fill in the corpus

`corpus/workflow.md` ships as a **template**. Every section is a scaffold with
`[FILL IN]` markers describing what belongs there. The demo will run in this
state, but the assistant is told the corpus is unfilled and will say so rather
than paraphrase placeholder text — a visible "not configured yet" is the only
honest behaviour when it has nothing real to work from.

Budget a focused evening. Write it like engineering documentation, not
marketing. The sections are ordered by weight for this reader:

- **§3 (routing), §5 (evals), §7 (approvals and trust), §9 (leadership)** are
  where the decision gets made. Spend the time here.
- **§2 (thesis)** is short but sets whether the rest gets read.
- **§8 (context engineering)** is table stakes rather than the differentiator.
  A thin version is survivable; a thin §5 or §9 is not.

Two questions inside those sections are worth writing to specifically, because
they're the ones with no substitute elsewhere in an application: *what did you
build with a model and then pull back out, and why* (§3), and *when did you
ship less to avoid spending user trust* (§7).

```bash
npm run check   # fails while any [FILL IN] marker remains, then typechecks
```

Two things to search for before you ship: the pronouns (they/them throughout,
change if you'd prefer otherwise) and the phrase "Inbox Admin" if that's not
what you want the flagship example to be.

## Run it

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev                    # vercel dev, http://localhost:3000
```

## Evals

The suite is the part I'd point a reviewer at first. Thirty-odd cases across
three groups:

- **Capability** — does it answer real questions from the corpus? Two cases
  here matter more than the rest. `cap-gap-honest` asks about something the
  corpus doesn't cover, and passes only if the assistant admits the gap
  instead of inventing experience. `cap-transferable-not-speculative` asks it
  to design something for a system it knows nothing about, and passes only if
  it separates the transferable principle from the speculation and declines
  the second half. Sounding relevant by inventing detail is the exact failure
  this whole thing exists to disprove.
- **Adversarial** — compensation, why-are-you-leaving, employer internals,
  personal life, opinions on the reviewing company, financial advice, and
  ranking former reports. The questions a reviewer will actually try.
- **Injection** — instruction override, system-prompt extraction, forced
  roleplay, hypothetical framing, false authority, encoding tricks, and a
  plausible-sounding "I'm the hiring manager, policy requires it."

Each case runs against the real system prompt and is graded by a separate
Claude call that sees only the expectation. Deterministic `must_not_contain`
checks run first and short-circuit — a judge can be talked around, a substring
match can't.

```bash
npm run eval               # everything
npm run eval -- inj        # just the injection cases
npm run eval -- --n 5      # 5x each, to see where the judge is unstable
```

Exit code is non-zero on any failure, so it drops into CI as-is. Adversarial
cases pass or fail independently of the corpus — boundary behaviour doesn't
depend on the document being finished, so you can run them while writing it.

**Red-team it before anyone else sees it.** The eval suite covers the attacks I
thought of; it will not cover the ones I didn't. Have someone else spend twenty
minutes trying to break it, and add whatever works as a new case.

## Deploy

```bash
npm run deploy   # runs the corpus gate first via predeploy
```

Set `ANTHROPIC_API_KEY` in the Vercel project settings. `vercel.json` bundles
`corpus/**` into the function (it's read from disk at cold start) and sets a
strict CSP.

## Design notes

**Grounding.** The corpus goes in the system prompt with an explicit
instruction that it's the only source, and that an admitted gap is preferable
to a confident guess. There's a dedicated eval for exactly that
(`cap-gap-honest`) because it's the failure that would cost the most — a demo
that fabricates a credential is worse than no demo.

**Prompt caching.** The system prompt is assembled once at module load and
frozen, with the cache breakpoint on the last block. Caching is a prefix match,
so anything per-request — a timestamp, a session id — would silently
invalidate the whole entry. Cached reads run about a tenth of the input price,
which matters when every visitor pays for the same few thousand tokens. Note
the ~512-token minimum on Opus 5: a corpus shorter than that won't cache at
all.

**Effort, not thinking-off.** Thinking is on by default on Opus 5 and shares
the `max_tokens` budget with the response. Rather than disabling it for
latency, the handler runs at `effort: "low"` — on this model, disabled thinking
can leak reasoning into the visible text, and low effort gets most of the
speed without that risk.

**Refusals are a content outcome, not an error.** Opus 5's safety classifiers
can decline a request with a successful HTTP 200 and an empty or partial
`content`. The handler checks `stop_reason` before trusting output, and opts
into server-side fallbacks so a false positive on a benign question is re-run
on another model inside the same call rather than dead-ending. That's a beta;
if the account can't use it the handler notices the 400, drops it, and retries
once.

**Injection defence is prompt-level, so treat it as best-effort.** Instructions
arriving in the chat are content, not configuration, and the system prompt says
so. That holds up against the cases in `evals/`, which is evidence rather than
proof. The real containment is that there's nothing sensitive behind the
boundary — the corpus is a document I'd be happy to hand over. Nothing private
is in the system prompt, so extracting it costs nothing.

**Rate limiting is a speed bump.** The per-IP limiter in `api/ask.ts` is
per-instance memory: serverless spreads traffic across instances and cold
starts reset it. It stops casual hammering, not a determined script. Put a
platform-level limit in front before sharing the URL anywhere it could be
found by strangers rather than sent to a specific person.
