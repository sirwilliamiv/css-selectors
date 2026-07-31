const transcript = document.getElementById("transcript");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const suggestionsBox = document.getElementById("suggestions");
const banner = document.getElementById("setup-banner");

/** Full conversation, replayed to the API each turn (the API is stateless). */
const history = [];
let busy = false;

// ---------- rendering ----------

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

/**
 * Just enough markdown for what the assistant actually emits: paragraphs,
 * `code`, and dash lists. Escaping happens first, so nothing the model
 * produces can inject markup.
 */
function render(text) {
  const blocks = escapeHtml(text)
    .split(/\n{2,}/)
    .filter((b) => b.trim());

  return blocks
    .map((block) => {
      const withCode = block.replace(/`([^`\n]+)`/g, "<code>$1</code>");
      const lines = withCode.split("\n");

      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
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
  return el.querySelector(".body");
}

function clearStarter() {
  transcript.querySelector(".starter")?.remove();
}

// ---------- streaming ----------

async function ask(question) {
  if (busy) return;
  busy = true;
  sendBtn.disabled = true;
  transcript.setAttribute("aria-busy", "true");
  clearStarter();

  addTurn("You", "user").innerHTML = render(question);
  history.push({ role: "user", content: question });

  const body = addTurn("Claude", "assistant");
  body.innerHTML = '<span class="cursor"></span>';

  let answer = "";
  const paint = () => {
    body.innerHTML = render(answer) + '<span class="cursor"></span>';
    body.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const fail = (message) => {
    const target = answer ? addTurn("Note", "error") : body;
    if (!answer) body.parentElement.className = "turn error";
    target.innerHTML = render(message);
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
        const event = JSON.parse(line);
        if (event.type === "delta") {
          answer += event.text;
          paint();
        } else if (event.type === "error") {
          fail(event.message);
        }
      }
    }

    body.innerHTML = answer ? render(answer) : body.innerHTML.replace(/<span class="cursor"><\/span>/, "");
    if (answer) history.push({ role: "assistant", content: answer });
  } catch (err) {
    console.error(err);
    fail(err.message || "Couldn't reach the assistant. Try again.");
    history.pop(); // drop the unanswered question so the next turn is valid
  } finally {
    document.querySelectorAll(".cursor").forEach((c) => c.remove());
    busy = false;
    sendBtn.disabled = false;
    transcript.setAttribute("aria-busy", "false");
    input.focus();
  }
}

// ---------- wiring ----------

/**
 * Ask affordances are rendered into the letter and résumé at build time:
 * `.ask-chip` from an explicit [[Ask: …]] in the source, `.ask-more` next to
 * every résumé heading. Delegated so it covers both without per-node wiring.
 */
document.addEventListener("click", (e) => {
  const trigger = e.target.closest?.(".ask-chip, .ask-more");
  if (!trigger) return;
  const question = trigger.dataset.q;
  if (!question) return;

  document.getElementById("ask")?.scrollIntoView({ behavior: "smooth", block: "start" });
  ask(question);
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

fetch("/api/config")
  .then((r) => r.json())
  .then(({ suggestions, corpusIsTemplate }) => {
    if (corpusIsTemplate) banner.hidden = false;
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
