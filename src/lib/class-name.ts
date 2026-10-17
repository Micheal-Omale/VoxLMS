// How classes are named and ordered (spec 0006, AC-3). Shared by the data
// layer, the seed and the "Add classes" preview so all three agree.

/** "JSS 2" + "Gold" → "JSS 2 Gold"; no arm → "JSS 2". */
export function className(levelName: string, arm: string | null) {
  return arm ? `${levelName} ${arm}` : levelName;
}

/**
 * Lists run level by level, then arm by arm: JSS 1 Gold, JSS 1 Blue, JSS 2 Gold.
 * A class with no arm is position 0; past nine arms, ties fall back to the name.
 */
export function classSortOrder(levelOrder: number, armPosition: number) {
  return levelOrder * 10 + Math.min(Math.max(armPosition, 0), 9);
}

/** "Gold, Blue,  gold" → ["Gold", "Blue"]: trimmed, blanks dropped, repeats dropped. */
export function parseArms(text: string) {
  const seen = new Set<string>();
  const arms: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const arm = raw.trim().replace(/\s+/g, " ");
    if (!arm || seen.has(arm.toLowerCase())) continue;
    seen.add(arm.toLowerCase());
    arms.push(arm);
  }
  return arms;
}
