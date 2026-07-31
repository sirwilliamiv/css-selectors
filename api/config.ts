import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SUGGESTED_QUESTIONS, CORPUS_IS_TEMPLATE } from "../lib/prompt.js";

/** Lets the page render suggested questions and the setup banner from one source. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.status(200).json({
    suggestions: SUGGESTED_QUESTIONS,
    corpusIsTemplate: CORPUS_IS_TEMPLATE,
  });
}
