// Web names a school can never take, because the app uses them as top level
// paths (spec 0003, spec 0005). Add a word here whenever a new top level route
// is created.
export const RESERVED_SLUGS = new Set([
  "account", "admin", "api", "app", "assets", "auth", "brand", "choose-school", "design",
  "favicon", "help", "icon", "login", "logout", "new", "privacy", "result", "results",
  "school-logo", "settings", "setup", "sign-in", "signin", "signup", "static", "support",
  "team", "terms", "voxlms", "www",
]);

export type SlugProblem = string | null;

/** Returns what's wrong with a web name, or null if it's fine (uniqueness is checked separately). */
export function slugProblem(slug: string): SlugProblem {
  if (slug.length < 3) return "Use at least 3 letters or digits.";
  if (slug.length > 30) return "Use 30 letters or digits at most.";
  if (!/^[a-z0-9]+$/.test(slug)) return "Use only lowercase letters and digits, with no spaces.";
  if (RESERVED_SLUGS.has(slug)) return "That web name is reserved by VoxLMS. Choose another.";
  return null;
}

/** "Grace High School, Ikeja" → "gracehigh" */
export function suggestSlug(name: string) {
  const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !["the", "of", "and", "school", "schools", "college", "academy", "international", "nursery", "primary", "secondary", "group"].includes(w));
  return (kept.length ? kept : words).join("").slice(0, 30);
}

/** "Grace High School" → "GHS" */
export function suggestCode(name: string) {
  const words = name.replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const code = words.map((w) => w[0].toUpperCase()).join("").slice(0, 6);
  return code.length >= 2 ? code : (name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SCH");
}
