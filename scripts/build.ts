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

const render = (md: string, withHeadingAsks = false) => {
  const html = marked.parse(askChips(stripAuthorNotes(md)), { async: false }) as string;
  return withHeadingAsks ? headingAsks(html) : html;
};

const BANNER = CORPUS_IS_TEMPLATE
  ? `<div class="banner"><strong>Not configured yet.</strong> The corpus is still a
     template, so this page and the assistant both have placeholder content. Fill in
     <code>corpus/</code> and rebuild.</div>`
  : "";

const page = readFileSync(join(ROOT, "web/index.template.html"), "utf8")
  .replace("{{TITLE}}", "Billy — engineering leadership, agentic systems")
  .replace(
    "{{DESCRIPTION}}",
    "An interactive letter and résumé. Read it, then ask it questions.",
  )
  .replace("{{BANNER}}", BANNER)
  .replace("{{LETTER}}", render(LETTER))
  .replace("{{RESUME}}", render(RESUME, true))
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
