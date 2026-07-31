const transcript = document.getElementById("transcript");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const suggestionsBox = document.getElementById("suggestions");
const banner = document.getElementById("setup-banner");

/** Full conversation, replayed to the API each turn (the API is stateless). */
const history = [];
let busy = false;

// ---------- rendering ----------

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/**
 * Just enough markdown for what the assistant actually emits: paragraphs,
 * `code`, and dash lists. Escaping happens first, so nothing the model
 * produces can inject markup.
 */
function render(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .map((block) => {
      const withCode = block.replace(/`([^`\n]+)`/g, "<code>$1</code>");
      const lines = withCode.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`).join("")}</ul>`;
      }
      return `<p>${withCode.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function addTurn(who, kind) {
  const el = document.createElement("article");
  el.className = `turn ${kind}`;
  el.innerHTML = `<div class="who">${who}</div><div class="body"></div>`;
  transcript.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

// ---------- trace ----------

const railBody = document.getElementById("rail-body");
const railState = document.getElementById("rail-state");

/**
 * The server declares every stage before doing any work, so the whole
 * architecture is on screen from the first frame and then fills in. Durations
 * render as a waterfall scaled to the slowest stage in the run, which is what
 * turns a list into something you can actually read a bottleneck off.
 *
 * Skipped stages are struck through rather than hidden: the road not taken is
 * the most interesting thing this view has to show.
 */
const trace = { rows: new Map(), timings: new Map(), summary: {} };

function setRailState(state, label) {
  railState.dataset.state = state;
  railState.textContent = label;
}

function resetTrace(stages) {
  trace.rows.clear();
  trace.timings.clear();
  trace.summary = { modelCalls: 0, tokens: "—", cache: "—" };

  railBody.innerHTML =
    `<dl class="trace-summary">
       <div><dt>elapsed</dt><dd data-k="elapsed">0ms</dd></div>
       <div><dt>model calls</dt><dd data-k="modelCalls">0</dd></div>
       <div><dt>out tokens</dt><dd data-k="tokens">—</dd></div>
     </dl>
     <ol class="stages">${stages
       .map(
         (s) =>
           `<li class="stage" data-id="${escapeHtml(s.id)}" data-status="pending">
              <span class="stage-dot" aria-hidden="true"></span>
              <div class="stage-main">
                <div class="stage-head">
                  <span class="stage-label">${escapeHtml(s.label)}</span>
                  <span class="stage-kind kind-${escapeHtml(s.kind)}">${s.kind === "model" ? "model" : "code"}</span>
                  <span class="stage-ms"></span>
                </div>
                <div class="stage-bar"><i></i></div>
                <p class="stage-detail"></p>
                <div class="stage-meta"></div>
              </div>
            </li>`,
       )
       .join("")}</ol>`;

  for (const li of railBody.querySelectorAll(".stage")) {
    trace.rows.set(li.dataset.id, li);
  }
  setRailState("running", "running");
}

function setSummary(key, value) {
  const el = railBody.querySelector(`[data-k="${key}"]`);
  if (el) el.textContent = value;
}

/** Rescale every bar whenever a new slowest stage appears. */
function redrawBars() {
  const slowest = Math.max(1, ...trace.timings.values());
  for (const [id, ms] of trace.timings) {
    const bar = trace.rows.get(id)?.querySelector(".stage-bar i");
    if (bar) bar.style.setProperty("--w", `${Math.max(2, (ms / slowest) * 100)}%`);
  }
  const total = [...trace.timings.values()].reduce((a, b) => a + b, 0);
  setSummary("elapsed", `${total}ms`);
}

function applyStage(ev) {
  const li = trace.rows.get(ev.id);
  if (!li) return;

  li.dataset.status = ev.status;
  li.querySelector(".stage-detail").textContent = ev.detail ?? "";
  li.querySelector(".stage-ms").textContent =
    typeof ev.ms === "number" && ev.status !== "skip" ? `${ev.ms}ms` : "";

  li.querySelector(".stage-meta").innerHTML = Object.entries(ev.meta ?? {})
    .map(
      ([k, v]) =>
        `<span class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></span>`,
    )
    .join("");

  if (typeof ev.ms === "number" && ev.status !== "skip") {
    trace.timings.set(ev.id, ev.ms);
    redrawBars();
  }

  if (ev.id === "model" && ev.status === "ok") {
    trace.summary.modelCalls = 1;
    setSummary("modelCalls", "1");
  }
  if (ev.id === "route" && ev.meta?.["model calls"] === 0) setSummary("modelCalls", "0");
  if (ev.meta?.["output tokens"] != null) setSummary("tokens", String(ev.meta["output tokens"]));
}

// ---------- streaming ----------

async function ask(question) {
  if (busy) return;
  busy = true;
  sendBtn.disabled = true;
  transcript.setAttribute("aria-busy", "true");
  transcript.querySelector(".starter")?.remove();

  addTurn("You", "user").querySelector(".body").innerHTML = render(question);
  history.push({ role: "user", content: question });

  const turn = addTurn("Claude", "assistant");
  const body = turn.querySelector(".body");
  body.innerHTML = '<span class="cursor"></span>';

  let answer = "";
  let failed = false;

  const paint = () => {
    body.innerHTML = render(answer) + '<span class="cursor"></span>';
  };

  const fail = (message) => {
    const el = addTurn("Note", "error");
    el.querySelector(".body").innerHTML = render(message);
  };

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      throw new Error(error || `Request failed (${res.status}).`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // NDJSON: one JSON object per line. A chunk can split a line, so keep the
    // trailing fragment in the buffer until its newline arrives.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const ev = JSON.parse(line);

        if (ev.type === "pipeline") resetTrace(ev.stages);
        else if (ev.type === "stage") {
          applyStage(ev);
          if (ev.status === "fail") failed = true;
        } else if (ev.type === "delta") {
          answer += ev.text;
          paint();
        } else if (ev.type === "error") {
          failed = true;
          fail(ev.message);
        }
      }
    }

    body.innerHTML = answer ? render(answer) : "";
    if (answer) history.push({ role: "assistant", content: answer });
    else history.pop();
  } catch (err) {
    console.error(err);
    failed = true;
    fail(err.message || "Couldn't reach the assistant. Try again.");
    history.pop(); // drop the unanswered question so the next turn is valid
  } finally {
    document.querySelectorAll(".cursor").forEach((c) => c.remove());
    setRailState(failed ? "failed" : "done", failed ? "failed" : "complete");
    busy = false;
    sendBtn.disabled = false;
    transcript.setAttribute("aria-busy", "false");
  }
}

// ---------- voice input ----------

/**
 * Browser-native dictation. Deliberately not a server-side transcription
 * pipeline: this is one input affordance, and shipping audio to a model to
 * save a reviewer some typing would be exactly the reflex the rest of this
 * site argues against. Hidden entirely where the API isn't available.
 */
function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !micBtn) {
    micBtn?.remove();
    return;
  }

  const recognition = new SR();
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.lang = document.documentElement.lang || "en-US";

  let listening = false;
  let base = "";

  const setListening = (on) => {
    listening = on;
    micBtn.classList.toggle("listening", on);
    micBtn.setAttribute("aria-pressed", String(on));
    micBtn.title = on ? "Stop dictating" : "Dictate your question";
  };

  micBtn.addEventListener("click", () => {
    if (listening) {
      recognition.stop();
      return;
    }
    base = input.value ? input.value.trim() + " " : "";
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  });

  recognition.addEventListener("result", (e) => {
    let text = "";
    for (const result of e.results) text += result[0].transcript;
    input.value = base + text;
    input.dispatchEvent(new Event("input"));
  });

  recognition.addEventListener("end", () => setListening(false));
  recognition.addEventListener("error", () => setListening(false));
  setListening(false);
}

// ---------- wiring ----------

/**
 * Ask affordances are rendered into the letter and résumé at build time:
 * `.ask-chip` from an explicit [[Ask: …]] in the source, `.ask-more` next to
 * every résumé heading. Delegated so it covers both without per-node wiring.
 */
document.addEventListener("click", (e) => {
  const trigger = e.target.closest?.(".ask-chip, .ask-more");
  if (!trigger?.dataset.q) return;
  document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
  ask(trigger.dataset.q);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  input.style.height = "auto";
  ask(question);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

/** Marks the contents entry for whichever section is currently in view. */
function setupScrollSpy() {
  const links = new Map(
    [...document.querySelectorAll(".toc-link")].map((a) => [a.getAttribute("href").slice(1), a]),
  );
  const headings = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!headings.length) return;

  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target.id);
        else seen.delete(e.target.id);
      }
      // The topmost visible heading wins, so the marker doesn't jitter when
      // several sections are on screen at once.
      const current = headings.find((h) => seen.has(h.id));
      for (const [id, a] of links) a.classList.toggle("current", id === current?.id);
    },
    { rootMargin: "-10% 0px -70% 0px" },
  );

  for (const h of headings) observer.observe(h);
}

setupMic();
setupScrollSpy();

fetch("/api/config")
  .then((r) => r.json())
  .then(({ suggestions, corpusIsTemplate }) => {
    if (corpusIsTemplate && banner) banner.hidden = false;
    for (const q of suggestions ?? []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion";
      btn.textContent = q;
      btn.addEventListener("click", () => ask(q));
      suggestionsBox.appendChild(btn);
    }
  })
  .catch(() => {
    /* suggestions are a nicety; the composer works regardless */
  });
