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

// ---------- pipeline ----------

/**
 * The pipeline is declared by the server before any work happens, so the whole
 * architecture is on screen from the first frame and then lights up stage by
 * stage. Seeing which stages are skipped is the interesting part: a canned
 * route or a rate-limit rejection never reaches the model at all.
 */
function mountPipeline(turnEl, stages) {
  const wrap = document.createElement("details");
  wrap.className = "pipeline";
  wrap.open = true;
  wrap.innerHTML =
    `<summary><span class="pipe-title">Request pipeline</span>` +
    `<span class="pipe-count" data-done="0">0/${stages.length}</span></summary>` +
    `<ol class="stages">${stages
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
               <p class="stage-detail"></p>
               <div class="stage-meta"></div>
             </div>
           </li>`,
      )
      .join("")}</ol>`;
  turnEl.insertBefore(wrap, turnEl.querySelector(".body"));
  return wrap;
}

function updateStage(pipeEl, ev) {
  const li = pipeEl?.querySelector(`.stage[data-id="${CSS.escape(ev.id)}"]`);
  if (!li) return;

  li.dataset.status = ev.status;
  li.querySelector(".stage-detail").textContent = ev.detail ?? "";
  li.querySelector(".stage-ms").textContent =
    typeof ev.ms === "number" && ev.status !== "skip" ? `${ev.ms}ms` : "";

  const meta = li.querySelector(".stage-meta");
  meta.innerHTML = Object.entries(ev.meta ?? {})
    .map(
      ([k, v]) =>
        `<span class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></span>`,
    )
    .join("");

  const counter = pipeEl.querySelector(".pipe-count");
  const done = pipeEl.querySelectorAll('.stage:not([data-status="pending"])').length;
  counter.textContent = `${done}/${pipeEl.querySelectorAll(".stage").length}`;
  counter.dataset.done = String(done);
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

  let pipeEl = null;
  let answer = "";

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

        if (ev.type === "pipeline") pipeEl = mountPipeline(turn, ev.stages);
        else if (ev.type === "stage") updateStage(pipeEl, ev);
        else if (ev.type === "delta") {
          answer += ev.text;
          paint();
        } else if (ev.type === "error") fail(ev.message);
      }
    }

    body.innerHTML = answer ? render(answer) : "";
    if (answer) history.push({ role: "assistant", content: answer });
    else history.pop();
  } catch (err) {
    console.error(err);
    fail(err.message || "Couldn't reach the assistant. Try again.");
    history.pop(); // drop the unanswered question so the next turn is valid
  } finally {
    document.querySelectorAll(".cursor").forEach((c) => c.remove());
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

setupMic();

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
