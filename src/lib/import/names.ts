// Names in an imported sheet (spec 0013, AC-4, AC-7, AC-11). Pure.

/** Titles a teacher's or parent's name may start with. */
export const NAME_TITLES = ["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Rev", "Pastor", "Alhaji", "Alhaja", "Mallam", "Chief", "Engr", "Barr"];

const TITLE = new RegExp(`^(${NAME_TITLES.join("|")})\\.?(?:\\s+|$)`, "i");

/** "Mrs. Ngozi Okafor" → { title: "Mrs", name: "Ngozi Okafor" }; no title → title null. */
export function splitTitle(fullName: string): { title: string | null; name: string } {
  const match = TITLE.exec(fullName);
  if (!match) return { title: null, name: fullName };
  const title = NAME_TITLES.find((t) => t.toLowerCase() === match[1].toLowerCase())!;
  return { title, name: fullName.slice(match[0].length).trim() };
}

/**
 * One Name column split into surname and other names (AC-4): at the first
 * comma, else at the first space, so "OKAFOR Chinedu Emmanuel" gives surname
 * OKAFOR. One word gives a surname and no other names.
 */
export function splitStudentName(name: string): { surname: string; otherNames: string } {
  const comma = name.indexOf(",");
  const at = comma >= 0 ? comma : name.indexOf(" ");
  if (at < 0) return { surname: name.trim(), otherNames: "" };
  return { surname: name.slice(0, at).trim(), otherNames: name.slice(at + 1).replace(/^[\s,]+/, "").trim() };
}

/** A student's name for "probably here" (AC-6): case and spaces ignored. */
export const studentNameKey = (surname: string, otherNames: string) => `${surname.toUpperCase().replace(/\s/g, "")}|${otherNames.toUpperCase().replace(/\s/g, "")}`;

/** A parent's name for matching (AC-7): case, spaces, dots and a leading title ignored. */
export const parentNameKey = (fullName: string) =>
  splitTitle(fullName.trim())
    .name.toLowerCase()
    .replace(/[\s.]/g, "");
