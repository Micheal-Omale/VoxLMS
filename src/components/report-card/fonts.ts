import "server-only";

import path from "node:path";

import { Font } from "@react-pdf/renderer";

// The report card's one font (spec 0012, AC-9): Atkinson Hyperlegible Next,
// static Regular and Bold TTFs that ship with the app (SIL Open Font License,
// see src/assets/fonts/OFL.txt). `outputFileTracingIncludes` in next.config.ts
// carries them into the server bundle.

export const CARD_FONT = "Atkinson Hyperlegible Next";

let registered = false;

export function registerCardFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "src", "assets", "fonts");
  Font.register({
    family: CARD_FONT,
    fonts: [
      { src: path.join(dir, "AtkinsonHyperlegibleNext-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "AtkinsonHyperlegibleNext-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // Custom fonts have no hyphenation dictionary: never break a word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
