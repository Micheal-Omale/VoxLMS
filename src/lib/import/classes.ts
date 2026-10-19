// Matching a class name typed in a sheet to one of the school's classes
// (spec 0013, AC-4). Both sides reduce to capital letters and digits only, so
// "jss2 gold" and "J.S.S 2 Gold" are JSS2GOLD; then a short arm ("JSS 2G")
// matches when only one arm of that level starts with it. Pure.

export type ClassOption = { id: string; name: string; arm: string | null; isActive: boolean };

export const classKey = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** JSS2GOLD → level JSS2, rest GOLD: everything up to and including the last digit is the level. */
function splitLevel(key: string): { level: string; rest: string } | null {
  const last = key.search(/\d(?!.*\d)/);
  if (last < 0) return null;
  return { level: key.slice(0, last + 1), rest: key.slice(last + 1) };
}

/** A class's level and arm keys, from its arm when it has one. */
function classParts(cls: ClassOption): { level: string; arm: string } | null {
  const key = classKey(cls.name);
  const arm = cls.arm ? classKey(cls.arm) : "";
  if (arm && key.endsWith(arm) && key.length > arm.length) return { level: key.slice(0, key.length - arm.length), arm };
  const parts = splitLevel(key);
  return parts && { level: parts.level, arm: parts.rest };
}

export type ClassMatch =
  | { kind: "match"; cls: ClassOption }
  | { kind: "off"; cls: ClassOption }
  | { kind: "unknown" }
  | { kind: "ambiguous"; candidates: ClassOption[] }
  /** Two of the school's classes reduce to the same key, so neither can be matched by name. */
  | { kind: "same_key"; candidates: ClassOption[] };

const found = (cls: ClassOption): ClassMatch => (cls.isActive ? { kind: "match", cls } : { kind: "off", cls });

/** Which class a cell means, among all the school's classes (a switched off match is "off", not unknown). */
export function matchClass(text: string, classes: ClassOption[]): ClassMatch {
  const key = classKey(text);
  if (!key) return { kind: "unknown" };
  const exact = classes.filter((c) => classKey(c.name) === key);
  if (exact.length === 1) return found(exact[0]);
  if (exact.length > 1) return { kind: "same_key", candidates: exact };

  const cell = splitLevel(key);
  if (!cell) return { kind: "unknown" };
  const candidates = classes.filter((c) => {
    const parts = classParts(c);
    return parts !== null && parts.level === cell.level && parts.arm.startsWith(cell.rest);
  });
  if (candidates.length === 1) return found(candidates[0]);
  if (candidates.length > 1) return { kind: "ambiguous", candidates };
  return { kind: "unknown" };
}

const names = (classes: ClassOption[]) => {
  const list = classes.map((c) => c.name);
  return list.length <= 2 ? list.join(" or ") : `${list.slice(0, -1).join(", ")} or ${list.at(-1)}`;
};

/** Why a class cell can't be used, in plain words; null when it matched an active class. */
export function classProblem(text: string, match: ClassMatch): string | null {
  switch (match.kind) {
    case "match":
      return null;
    case "off":
      return `${match.cls.name} is switched off. Switch it back on from the Classes page, or use another class.`;
    case "unknown":
      return `${text} is not a class at this school.`;
    case "ambiguous":
      return `${text} could be ${names(match.candidates)}. Write the class in full.`;
    case "same_key":
      return `${names(match.candidates).replace(/ or /, " and ")} look the same once spaces and dots are dropped, so neither can be matched. Rename one on the Classes page.`;
  }
}
