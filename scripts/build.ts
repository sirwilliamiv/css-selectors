/**
 * Renders the corpus into a static page.
 *
 * The point of generating rather than hand-writing `index.html` is that the
 * letter and résumé a reviewer reads are the same files the assistant answers
 * from. Two copies would drift, and the moment they drift the whole premise
 * ("it only knows what's in the corpus") stops being true.
 *
 * Output is a plain static page: the document reads fine with JavaScript off,
 * and prints cleanly. Only the chat needs JS.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { LETTER, RESUME, CORPUS_IS_TEMPLATE } from "../lib/prompt.js";

const ROOT = process.cwd();
const OUT = join(ROOT, "public");

const REPO_URL = process.env.REPO_URL ?? "https://github.com/sirwilliamiv/css-selectors";
const REPO_LABEL = REPO_URL.replace(/^https?:\/\/(www\.)?/, "");

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Strips the leading `> **STATUS: TEMPLATE …` guidance blockquote and the `#`
 * title from a corpus document. Both are notes to the author, not page content.
 */
function stripAuthorNotes(md: string): string {
  return md
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n")
    .replace(/^#\s+.*$/m, "")
    .trim();
}

/**
 * `[[Ask: question]]` becomes an inline chip that sends `question` to the
 * assistant. Runs before markdown so the emitted HTML passes through intact.
 */
function askChips(md: string): string {
  // Protect inline code spans first, so writing *about* the syntax in a
  // document doesn't silently turn into a live control.
  // A sentinel that cannot occur in a source document. A plainer token like
  // " 3 " would collide with ordinary prose — "led 6 engineers" would restore
  // as an undefined span.
  const MARK = "\u241a";
  const spans: string[] = [];
  const guarded = md.replace(/`[^`\n]*`/g, (span) => {
    spans.push(span);
    return `${MARK}${spans.length - 1}${MARK}`;
  });

  const chipped = guarded.replace(/\[\[Ask:\s*([^\]]+?)\s*\]\]/g, (_m, q: string) => {
    const question = q.trim();
    return `<button type="button" class="ask-chip" data-q="${escapeAttr(question)}">${escapeAttr(question)}</button>`;
  });

  return chipped.replace(
    new RegExp(`${MARK}(\\d+)${MARK}`, "g"),
    (_m, i: string) => spans[Number(i)] ?? "",
  );
}

/**
 * Every `###` in the résumé — a role, a project — gets an affordance to pull
 * it open. "Tell me more about this one" is the reflex a résumé creates, so
 * the page should answer it rather than make the reader compose a question.
 */
function headingAsks(html: string): string {
  return html.replace(/<h3([^>]*)>([\s\S]*?)<\/h3>/g, (_m, attrs: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    const question = `Tell me more about ${label}.`;
    return (
      `<div class="entry-head"><h3${attrs}>${inner}</h3>` +
      `<button type="button" class="ask-more" data-q="${escapeAttr(question)}" ` +
      `aria-label="Ask about ${escapeAttr(label)}">Ask</button></div>`
    );
  });
}

/**
 * Slugs every `##` and records it, so the rail can carry a contents list.
 * Without it the right gutter sits empty until someone asks a question, which
 * on a wide screen just reads as a layout mistake.
 */
const toc: { id: string; label: string }[] = [];

function sectionIds(html: string): string {
  return html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    const id = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    toc.push({ id, label });
    return `<h2 id="${escapeAttr(id)}"${attrs}>${inner}</h2>`;
  });
}

const render = (md: string, withHeadingAsks = false) => {
  let html = marked.parse(askChips(stripAuthorNotes(md)), { async: false }) as string;
  html = sectionIds(html);
  return withHeadingAsks ? headingAsks(html) : html;
};

/**
 * Pulls name / title / contacts out of the résumé's Identity section so the
 * masthead has a single source too. Falls back to placeholders rather than
 * throwing — a half-written corpus should still build and be viewable.
 */
function identity(md: string) {
  const section = md.split(/^##\s+/m).find((s) => s.startsWith("Identity")) ?? "";

  // Parse by paragraph, not by line: a wrapped title is still one field.
  // The first paragraph is the section heading itself, so it's dropped.
  const paras = section
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .filter((l) => !l.trim().startsWith(">"))
        .join(" ")
        .trim(),
    )
    .filter(Boolean)
    .slice(1);

  const nameIdx = paras.findIndex((p) => p.startsWith("# "));
  const name = nameIdx >= 0 ? paras[nameIdx].slice(2).trim() : "Your name";
  const after = paras.slice(nameIdx + 1);

  return {
    name,
    title: after[0] ?? "",
    contacts: (after[1] ?? "")
      .split("·")
      .map((c) => c.trim())
      .filter(Boolean),
  };
}

const ID = identity(RESUME);

const MASTHEAD =
  `<header class="masthead">` +
  `<div class="masthead-main">` +
  `<h1 class="name">${escapeAttr(ID.name)}</h1>` +
  (ID.title ? `<p class="title">${escapeAttr(ID.title)}</p>` : "") +
  (ID.contacts.length
    ? `<p class="contacts">${ID.contacts
        .map((c) => {
          const href = c.includes("@")
            ? `mailto:${c}`
            : /^https?:/.test(c)
              ? c
              : `https://${c}`;
          return `<a href="${escapeAttr(href)}">${escapeAttr(c)}</a>`;
        })
        .join("<span class='sep'>/</span>")}</p>`
    : "") +
  `</div>` +
  // A quiet nod to what the page actually is: a running system, not a PDF.
  `<div class="sysbadge" aria-label="This page is backed by a live model">` +
  `<span class="sysbadge-dot"></span>` +
  `<span class="sysbadge-text">claude opus 5<br><span>grounded · scoped</span></span>` +
  `</div>` +
  `</header>`;

const BANNER = CORPUS_IS_TEMPLATE
  ? `<div class="banner"><strong>Not configured yet.</strong> The corpus is still a
     template, so this page and the assistant both have placeholder content. Fill in
     <code>corpus/</code> and rebuild.</div>`
  : "";

/** The Identity section is consumed by the masthead; don't render it twice. */
const resumeBody = RESUME.replace(/^##\s+Identity[\s\S]*?(?=^##\s)/m, "");

const page = readFileSync(join(ROOT, "web/index.template.html"), "utf8")
  .replace("{{TITLE}}", `${ID.name} — ${ID.title || "engineering leadership"}`)
  .replace(
    "{{DESCRIPTION}}",
    "An interactive letter and résumé. Read it, then ask it questions.",
  )
  .replace("{{MASTHEAD}}", MASTHEAD)
  .replace("{{BANNER}}", BANNER)
  .replace("{{LETTER}}", render(LETTER))
  .replace("{{RESUME}}", render(resumeBody, true))
  .replace(
    "{{CONTENTS}}",
    toc
      .map(
        (t) =>
          `<a href="#${escapeAttr(t.id)}" class="toc-link">${escapeAttr(t.label)}</a>`,
      )
      .join(""),
  )
  .replace(/\{\{REPO_URL\}\}/g, escapeAttr(REPO_URL))
  .replace(/\{\{REPO_LABEL\}\}/g, escapeAttr(REPO_LABEL));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), page);
for (const asset of ["styles.css", "app.js"]) {
  copyFileSync(join(ROOT, "web", asset), join(OUT, asset));
}

console.log(
  `built public/ — ${(page.length / 1024).toFixed(1)}kb page` +
    (CORPUS_IS_TEMPLATE ? " (corpus still a template)" : ""),
);
