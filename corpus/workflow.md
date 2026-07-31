# How Billy works with AI

> **STATUS: TEMPLATE — NOT YET FILLED IN.**
> Every section below is a scaffold with placeholder text marked `[FILL IN]`.
> Replace them with your actual practices before deploying. Run `npm run check`
> to verify no markers remain — it exits non-zero while any are left, and the
> deploy script gates on it.
>
> Write this like internal engineering documentation, not like a cover letter.
> Concrete beats impressive: name the tool, show the decision rule, give the
> example. A reviewer can tell the difference in one paragraph.
>
> Delete this whole blockquote when you're done.

---

## Who this document is about

Billy is an engineer who builds with AI coding agents daily. This document
describes their actual working practices — how they structure context, where
they draw the line between model and deterministic code, and how they verify
output. It is the only source of truth for the assistant answering questions
about them.

> Pronouns are they/them throughout this document as a neutral default.
> Replace with your own if you'd prefer something else — it appears in
> roughly a dozen places, so search for "they" before you ship.

---

## 1. Context engineering for coding agents

**The layered `CLAUDE.md` system.**

[FILL IN — Describe the actual layering. Suggested shape:
- What lives at the user/global level (`~/.claude/CLAUDE.md`) vs. project root
  vs. per-directory. Why that split.
- What belongs in each layer: invariants and preferences at the top, project
  architecture in the middle, directory-local conventions at the leaves.
- What you deliberately keep *out* of context and why. This is usually the
  most interesting part — everyone adds context, few people prune it.
- A concrete before/after: a task that failed with flat context and worked
  with layered context.]

**How context gets refreshed.**

[FILL IN — Is it manual? Generated from the codebase? Regenerated on a
schedule or on structural change? How do you keep it from going stale, and
how do you notice when it has?]

---

## 2. Hooks and deterministic guardrails

[FILL IN — The hooks you actually run. For each one worth mentioning:
- The trigger (PreToolUse, PostToolUse, Stop, etc.)
- What it does
- The failure it was written in response to

The through-line a reviewer is looking for: hooks are where you encode the
things a model shouldn't be trusted to remember. Naming the specific incident
that motivated each hook is more convincing than listing the hooks.]

**Example hook, described concretely:**

[FILL IN — Pick one. Walk through it end to end: what fires it, what it
checks, what happens on failure, and what it caught that review didn't.]

---

## 3. Agent anatomy: Inbox Admin

[FILL IN — This is the flagship example, so give it the most room. Cover:

- **What it does.** One or two sentences a non-engineer would follow.
- **Why an agent and not a script.** What about the task is genuinely
  open-ended? If a rules engine would have worked, say so and explain what
  pushed it over the line.
- **The tool surface.** Which tools it has, and — more interesting — which
  ones you deliberately promoted from "run a bash command" to a dedicated,
  typed tool, and why. Gating? Rendering? Auditability?
- **The parts that are NOT the model.** Routing, retries, idempotency,
  rate limiting, state. Be specific about the boundary.
- **How it fails, and what happens then.** Every real agent has a failure
  mode. Naming yours is a credibility signal, not a weakness.
- **What you'd change if you rebuilt it.**]

---

## 4. When to use a model vs. deterministic code

This is the decision rule Billy applies:

[FILL IN — State the actual heuristic, then make it falsifiable with examples.

A useful shape is a short list of criteria (is the task specifiable in
advance? is the output checkable? what does an error cost? does the value
justify the latency?) followed by two worked examples:

- **A case where the LLM won.** What made deterministic code a bad fit.
- **A case where you pulled the LLM back out.** Something you initially built
  with a model and replaced with plain code, and what triggered that.

The second example is the one that lands. Anyone can list where AI helps;
knowing where you removed it is the signal.]

---

## 5. Verification and evals

**How Billy knows the output is right.**

[FILL IN — The verification stack, from cheapest to most expensive:
- What's automated (types, tests, linters, hooks) and what runs when
- What gets human review, and what triggers escalation to it
- Where you use a model to check a model, and how you keep that honest]

**Eval practice.**

[FILL IN — For a team whose job posting says evals are the product, this
section carries the most weight. Cover:
- What you actually measure, and on what dataset
- How the eval set was built, and how it grows (regression cases from real
  failures are the strongest answer here)
- How you handle the graded-by-a-model problem: variance, judge drift,
  disagreement with human labels
- A specific case where an eval caught a regression before it shipped

If your eval practice is lighter than you'd like, say that plainly and
describe what you'd build first. An honest gap reads better than an
overstated capability — and this demo itself ships with an eval suite
(`evals/`), which is a fair thing to point at.]

---

## 6. Orchestration patterns

[FILL IN — How you decompose work across agents or steps. Sub-agents vs. one
loop; where you fan out; what stays sequential and why. If you keep things
deliberately simple and single-loop, say that and explain the reasoning —
resisting unnecessary orchestration is itself a defensible position.]

---

## 7. What Billy is still working out

[FILL IN — Two or three genuine open questions. Not humblebrags — actual
unresolved problems in your practice.

This section does more for credibility than any other. It's also the one a
strong interviewer will pull on, so only list things you'd enjoy discussing.]

---

## Appendix: tools and environment

[FILL IN — Brief. Models, editor, languages, anything relevant to how the
above is carried out. Keep it factual; nobody is impressed by a tool list,
but it grounds the rest.]
