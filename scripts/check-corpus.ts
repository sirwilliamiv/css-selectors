/**
 * Pre-deploy gate: fails while the corpus still contains template markers.
 *
 * Shipping a half-filled corpus is the failure mode that would actually cost
 * something here — an assistant that speaks confidently from placeholder text
 * is worse than no demo. `npm run predeploy` runs this automatically.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "corpus");
const MARKERS = [/\[FILL IN/, /^> \*\*STATUS: TEMPLATE/m];

let problems = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(join(dir, file), "utf8");
  const lines = text.split("\n");

  lines.forEach((line, i) => {
    if (MARKERS.some((m) => m.test(line))) {
      console.error(`  corpus/${file}:${i + 1}  ${line.trim().slice(0, 70)}`);
      problems++;
    }
  });
}

if (problems > 0) {
  console.error(
    `\n${problems} unfilled template marker${problems === 1 ? "" : "s"} in the corpus.\n` +
      "Replace them with real content before deploying — the assistant is only\n" +
      "as good as this document.\n",
  );
  process.exit(1);
}

console.log("corpus: no template markers remaining");
