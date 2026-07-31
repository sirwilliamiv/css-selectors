# Prompt: describe the UX steps

A reusable prompt for having an agent produce a precise, stage-by-stage
walkthrough of what a user experiences and what the system does underneath.

Written for this project, but the only project-specific parts are the
`<system>` block and the entry points — swap those and it works for any
agentic product.

Use it to: brief a designer, write the walkthrough section of a design doc,
onboard someone to the flow, or hand another agent enough context to change
the UI without breaking the model of how it works.

---

## The prompt

````text
You are documenting the user experience of an agentic product so that someone
who has never seen it can picture exactly what happens, in order, at every
step — both what the user perceives and what the system does underneath.

<system>
[Describe the product in 3–6 sentences. What it is, who uses it, what the
primary surface is, and what the user is trying to accomplish. If the agent
has access to the codebase, name the files that define the flow — for this
project: web/index.template.html, web/app.js, api/ask.ts, lib/pipeline.ts.]
</system>

<entry_points>
[List every way a user can start an interaction. For this project: typing a
question, dictating one, clicking a suggested question, clicking an "Ask"
button beside a résumé heading, clicking an inline chip in the letter.]
</entry_points>

<task>
Produce a walkthrough with one section per step. Order the steps by when the
user encounters them, not by how the code is organized.

For each step, cover exactly these five things, in this order:

1. TRIGGER — what causes this step to begin. A user action, a system event,
   or the completion of the previous step.
2. USER SEES — what is on screen, what changed, and what it looks like the
   system is doing. Describe it as a person would experience it, not as a
   component tree.
3. SYSTEM DOES — what actually executes. Name the real mechanism: which
   function, which network call, what runs deterministically versus what a
   model decides. If the step can end the interaction early, say so and say
   under what condition.
4. USER CAN — every action available at this moment, including the ones that
   abandon or interrupt the flow.
5. FAILURE — what the user sees if this step fails or is refused, and what
   they can do next. If there is no distinct failure mode, write "none
   distinct" rather than inventing one.

After the steps, add two short sections:

- SEAMS — the points where the user's mental model and the actual mechanism
  diverge. These are where confusion, mistrust, and support load come from,
  so name them plainly even when the divergence is intentional.
- DEAD ENDS — any state a user can reach with no obvious way forward.
</task>

<rules>
Ground every claim in the described system or the code you can read. If
something is not determinable, write "not determinable from what I can see"
and continue — do not fill the gap with what a product like this usually does.
An invented step is worse than an acknowledged gap, because it will be read as
documentation.

Distinguish what is decided by a model from what is decided by code, every
time it comes up. That boundary is the single most useful thing this document
can make legible, and it is the thing most walkthroughs blur.

Describe timing honestly: what is instant, what streams, what blocks, and
roughly how long a user waits before the first visible feedback.

Write plainly. No adjectives about quality — not "seamless", not "intuitive",
not "delightful". Describe what happens and let the reader judge. If a step
is awkward, describing it accurately is the useful contribution.
</rules>

<output_format>
Markdown. `## Step N — <short name>` for each step, with the five labelled
parts as a compact list. Aim for 8–14 steps; if you have more, you are
describing implementation rather than experience, and if you have fewer, you
are skipping states. Keep each step to roughly 120 words.
</output_format>
````

---

## Variants

**Reviewing rather than documenting.** Replace the `<task>` block with:

> For each step, identify the single highest-cost problem for the user —
> confusion, unnecessary wait, unclear state, or an action they'd want that
> isn't available. Rank all findings by how many users hit them times how
> costly it is when they do. Propose one concrete fix per finding. If a step
> has no real problem, say so and move on rather than manufacturing one.

**Narrating a specific path.** Append to `<task>`:

> Walk only the path taken by this input: "<the question or action>".
> Show which steps are skipped and why, and be explicit about what the user
> can and cannot tell about those skipped steps from the interface.

**Writing for a non-technical reader.** Append to `<rules>`:

> The reader is not an engineer. Keep SYSTEM DOES accurate but describe
> mechanisms in terms of their consequence for the user. Never simplify by
> saying something is decided by a model when it is decided by code, or the
> reverse — that distinction survives the translation.

---

## Why it's shaped this way

The five fixed parts per step are the point. Ask an agent to "describe the
UX" and you get prose that drifts into feature description; forcing TRIGGER /
USER SEES / SYSTEM DOES / USER CAN / FAILURE keeps the perceived and the
actual side by side, which is where the interesting gaps live.

`FAILURE` is mandatory for the same reason it's mandatory in the product:
walkthroughs that only describe the happy path are how failure states end up
undesigned.

The explicit permission to write "not determinable" is load-bearing. Without
it, an agent asked for a complete walkthrough will produce a complete-looking
one, and the invented steps are indistinguishable from the real ones.
