# How Billy builds and leads AI systems

> **STATUS: TEMPLATE — NOT YET FILLED IN.**
> Every section is a scaffold with `[FILL IN]` markers describing what belongs
> there. Replace them before deploying; `npm run check` fails while any remain.
>
> The sections are ordered by what this reader is actually evaluating, not by
> what's easiest to write. §2–§7 are the execution-layer material — routing,
> evals, recovery, approvals. §9 is leadership. Those carry the most weight.
> If you run out of evening, a thin §8 is survivable; a thin §5 or §9 is not.
>
> Write it as engineering documentation. Concrete beats impressive: name the
> decision, the tradeoff, the thing that broke. Delete this blockquote when done.

---

## 1. Scope

This document describes how Billy builds AI systems that take actions, and how
he leads engineers who do the same. It is the only source of truth for the
assistant answering questions about him.

> Pronouns are they/them throughout as a neutral default — search and replace
> if you'd prefer otherwise.

---

## 2. The thesis: AI as an execution layer

[FILL IN — State the belief plainly, in your own words, in a short paragraph.

The distinction worth drawing: the hard part of an agentic product is not
getting a good answer out of a model. It's everything that has to be true
before you let that answer become an action — and everything that has to
happen when the action turns out to be wrong.

Say what follows from that in practice. What do you build first? What do you
refuse to ship without? Where do most teams underinvest?

Don't hedge this section. It's the one a reader will use to decide whether the
rest is worth reading, and a clear position they can disagree with beats a
survey of considerations.]

---

## 3. Routing: model, code, human, or hybrid

The decision rule Billy applies when deciding what handles a given task:

[FILL IN — This is the highest-leverage section in the document. Give the
actual heuristic, then make it falsifiable.

A workable shape:

- **The criteria.** Is the task specifiable in advance? Is the output
  checkable, and by what? What does a wrong answer cost, and is that cost
  recoverable? Does the value justify latency and variance?
- **What each option is good for.** A model for the open-ended and
  hard-to-specify; deterministic code for anything you can write down and
  must be able to trust; a human for the irreversible, the high-cost-of-error,
  and the genuinely novel; hybrids where the model proposes and something
  else disposes.
- **Three worked examples**, and make the middle one the star:
  1. Where the model was clearly right.
  2. **Where you pulled the model back out** — something you first built with
     an LLM and replaced with plain code. What triggered it, what you learned.
  3. Where the answer was a hybrid: model drafts, code validates, human
     approves. Describe who holds the final say and why.

The second example is the one that lands hardest. Anyone can describe where AI
helped. Knowing where you removed it — and being able to say what evidence
made you remove it — is the actual signal of judgment.]

---

## 4. Track record

### 4a. What Billy has built

[FILL IN — The inventory. This is the section a reviewer reaches for first,
and the one the assistant has least to say without.

Split it into the two subsections below. They aren't the same kind of
evidence, they have different confidentiality rules, and a reviewer reads
them differently — keeping them separate is doing work for you.

For every item in either list, four lines is enough:

- **What it is** and what problem it solved
- **What Billy's actual role was** — built it, led the team that built it,
  designed it and handed it off. Be precise; see the note on scope below.
- **The decision worth knowing about** — the one non-obvious call
- **Where it ended up** — shipped, in production, sunset, superseded

Order by relevance to agentic systems and engineering leadership, not
chronologically. Three things with real specificity beats ten listed.

---

**Employed work — Playlist, and any prior roles that still matter.**

This is the depth evidence: sustained work inside a real organization, with
other people, on systems that had to keep running.

*Confidentiality.* Naming your employer is fine — it's on your résumé.
Describing what you built and how you decided to build it that way is your
professional record. What stays out: unreleased roadmap, internal metrics and
financials, security details, proprietary implementation specifics, non-public
incidents, and colleagues by name.

---

**Independent work — Untamed Theory, and anything else built outside a
full-time role.**

This is the range evidence, and it demonstrates things employed work often
can't: building from zero, owning the product decision and not just the
implementation, shipping under real constraints without an organization
absorbing the risk, and — if you've had anyone working with you — standing up
the practices for how work gets done from nothing. That last one is worth
foregrounding for a leadership role: creating an engineering operating system
from scratch is much easier to evidence from a thing you started than from a
team you inherited.

For each item, add two lines the employed-work entries don't need:

- **Why it exists** — what you were trying to prove, learn, or solve. An
  honest "I wanted to understand X by building it" is a fine answer.
- **What it taught you** that fed back into how you build or lead

*Confidentiality.* Your own work is yours to describe. **The exception is
clients.** If any of this was client work, their identity, their systems, and
their data are theirs, not yours — describe the engagement generically
("a logistics client's dispatch system") unless you have explicit permission
to name them, and treat anything about their business the same way you'd
treat an employer's internals. Check what you signed before writing this.

If Untamed Theory is a company you run rather than a project you built, say
that plainly and describe both the engineering and what running it taught you.

---

**On confidentiality generally.** If something in either list sits close to a
line, describe it one level more abstractly ("a system that reconciles two
sources of truth for X") or leave it out. Whatever you don't write here, the
assistant cannot say — the corpus is an allowlist, so this judgment gets made
once, deliberately, rather than under pressure at runtime.

**On scope.** State plainly what was yours and what was the team's, in both
lists. The assistant is instructed not to inflate, but it can only be as
accurate as this section. A reviewer who discovers in a follow-up that "built"
meant "led a team of six who built" will discount everything around it — and
for a leadership role, "led a team that built" is the stronger claim anyway.]

### 4b. One system, end to end

[FILL IN — Pick the strongest item from 4a — ideally one that takes real
actions on someone's behalf — and walk it end to end. `Inbox Admin` if that's
the one; swap it if not.

Cover, in roughly this order:

- **What it does**, in two sentences a non-engineer would follow.
- **Why it needed to be an agent.** What's genuinely open-ended here? If a
  rules engine would have worked, say so and name what pushed it over.
- **The tool surface.** Which tools it has — and more interestingly, which
  actions you promoted from "run a command" into a narrow, typed tool so the
  harness could gate, render, audit, or parallelize them. That promotion
  decision is where the design judgment lives.
- **What is deliberately not the model.** Routing, retries, idempotency, rate
  limits, state, validation. Be specific about where the boundary sits and
  why you drew it there.
- **What happens when it's wrong.** Detection, blast radius, recovery. Every
  real agent has a failure mode; naming yours is a credibility signal.
- **What you'd change on a rebuild.**

If the system sends messages to real people, or touches anything with money or
irreversibility in it, foreground that — it's the closest analogue to the work
this reader is hiring for.]

---

## 5. Evals and the quality bar

[FILL IN — Weight this section heavily. Cover:

- **What you measure, and against what dataset.** Be concrete about how the
  eval set was built. "Regression cases harvested from real failures" is the
  strongest possible answer if it's true.
- **How the set grows.** What's the ritual that turns an incident into a
  permanent test? Who owns it?
- **Grading.** Where you use deterministic checks and where you use a model
  as judge. How you keep the judge honest: variance across runs, drift,
  disagreement with human labels, and what you do when the judge and a human
  disagree.
- **What the eval gates.** Does anything actually block on it, or is it a
  dashboard? A suite that blocks a deploy is worth ten that inform one.
- **A specific catch.** One regression an eval caught before it shipped, or
  one it missed and what you added afterwards.

If your practice here is thinner than you'd like, say so plainly and describe
what you'd build first and why. An honest gap with a credible plan reads far
better than an inflated claim — and this demo ships with its own eval suite in
`evals/`, which is a fair thing to point at.]

---

## 6. Observability, failure, and recovery

[FILL IN — The unglamorous half of the product. Cover:

- **What you can see.** What's traced and logged for an agent run; how you
  reconstruct what happened after the fact; what you were blind to and had to
  add instrumentation for.
- **How failure is detected.** Does the system know it failed, or does a
  customer tell you? Closing that gap is usually the highest-value work.
- **Recovery paths.** What happens after a wrong action: rollback,
  compensation, escalation, or a human cleaning it up. What's automated and
  what isn't.
- **Fallbacks.** What the system does when the model is unavailable, slow, or
  refuses. Degrade to what?
- **Incident practice.** How you run a postmortem on a probabilistic system,
  where "it was nondeterministic" is not an acceptable root cause.

A worked incident — what broke, how you found out, what you changed
structurally afterwards — is worth more than any description of the tooling.]

---

## 7. Approvals, trust, and earning the right to act

[FILL IN — For any assistant acting on someone's behalf, this is the crux.

- **Where you put a human in the loop, and how you decide.** What's the rule
  for which actions need approval? Reversibility? Cost? Confidence? Something
  you can actually compute at runtime, ideally.
- **How confidence gets used.** Do you have a real signal for "the model
  isn't sure," and does anything act on it? Abstention is a feature.
- **Permissions and consent.** How a user grants and revokes the ability to
  act, and how the system behaves at the edge of what it was granted.
- **Explainability.** What the user is shown before and after an action. Can
  they tell what happened and why, well enough to trust it next time?
- **The trust ledger.** What you'd slow down for. A concrete example of
  choosing a smaller launch, a narrower scope, or a longer timeline because
  the alternative would spend trust you couldn't buy back.

That last one is the most valuable thing in this section if you have it.]

---

## 8. Context engineering for coding agents

The craft-level practice — how Billy gets good work out of coding agents day
to day.

[FILL IN — Keep this tighter than the sections above; it's table stakes for
this reader rather than the differentiator.

- **The layered `CLAUDE.md` system.** What lives at global vs. project vs.
  directory level, and why that split. What you deliberately keep *out* of
  context — pruning is the interesting half and few people do it.
- **Hooks.** Two or three you actually run, and for each, the failure that
  motivated it. Hooks are where you encode what a model shouldn't be trusted
  to remember; naming the incident beats listing the hook.
- **Verification loop.** What runs automatically on agent output before you
  look at it.

One before/after — a task that failed with flat context and worked with
layered context — is worth more than a full inventory.]

---

## 9. Leading engineers on this kind of work

[FILL IN — Weight this as heavily as §5. This is a leadership role, and this
section is the one with the least substitute elsewhere in the application.

- **How you grow senior engineers.** Not your 1:1 cadence — what you actually
  do. A specific person who got meaningfully better at something, what you
  did, and how you knew it worked.
- **The operating system for how the team builds.** Whatever you've created
  from scratch: review rituals, technical playbooks, onboarding, definition
  of done, quality frameworks, hiring loops. What existed before you and what
  exists now.
- **How technical direction gets set.** How much you decide vs. delegate, and
  how you keep enough context to have real judgment without becoming the
  bottleneck. Where you still write code, and why that specific place.
- **Process weight.** How you raise the bar without burying the team. Name
  something you deliberately did *not* add, and why.
- **Cross-functional work.** Working with product, design, data, ops, legal,
  or support in a domain where the stakes are personal. A time an engineering
  point of view changed what got built — or stopped something from getting
  built.
- **Ambiguity and urgency.** How you find the crux of a broad mandate,
  sequence the work, and move fast without the team confusing speed for
  panic. A decision you made without enough information, and how you set it
  up to be cheap to reverse.
- **Disagreement.** A time you were wrong and a member of your team changed
  your mind.]

---

## 10. What Billy is still working out

[FILL IN — Two or three real open questions in your practice. Not
humblebrags — things you'd genuinely enjoy arguing about.

This section does more for credibility than any other here, and a good
interviewer will pull directly on it. Only list what you'd want to spend
thirty minutes on.]

---

## Appendix: stack and environment

[FILL IN — Brief and factual. Languages, runtimes, models, infrastructure,
tooling. Nobody is impressed by a list, but it grounds everything above.]
