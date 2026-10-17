// Subject short names for broadsheet columns (spec 0006, AC-1): 2 to 5 capital
// letters or digits, unique within the school.

export const SHORT_NAME = /^[A-Z0-9]{2,5}$/;

const SMALL_WORDS = new Set(["and", "in", "of", "the", "for"]);

/**
 * Suggests a short name nobody in the school uses yet: the standard list's own
 * code first (MATH, ENG), then the initials (CRS), then the first letters (BIO),
 * then the first letters with a number (BIO2).
 */
export function suggestShortName(name: string, taken: Iterable<string>, standardCode?: string | null) {
  const used = new Set([...taken].map((s) => s.toUpperCase()));
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const initials = meaningful.map((w) => w[0]).join("").toUpperCase().slice(0, 5);
  const first = (meaningful[0] ?? words[0] ?? "SUB").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const candidates = [
    standardCode ?? "",
    initials.length >= 2 ? initials : "",
    first.slice(0, 3),
    first.slice(0, 4),
    first.slice(0, 5),
  ].filter((c) => SHORT_NAME.test(c));

  for (const c of candidates) if (!used.has(c)) return c;
  const base = (candidates[0] ?? "SUB").slice(0, 4);
  for (let n = 2; n < 100; n++) {
    const c = `${base.slice(0, 5 - String(n).length)}${n}`;
    if (!used.has(c)) return c;
  }
  return base;
}
