import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { classSortOrder, parseArms } from "@/lib/class-name";
import { bandTops, defaultScale, defaultSplit, partKey, scaleProblem, splitProblem } from "@/lib/grading-presets";
import { suggestShortName } from "@/lib/subject-short-name";
import { listHomeClasses, NotFound, schoolContext } from "@/server/data";
import type { Actor, Executor } from "@/server/data/context";
import {
  addStandardSubjects,
  copySessionSetup,
  createClasses,
  getClassesSetup,
  getCurriculumProgress,
  getSubjectsSetup,
  moveSubject,
  removeClass,
  removeSubject,
  restoreClass,
  restoreSubject,
  saveClass,
  saveClassOffer,
  saveLevelOffer,
  saveSubject,
} from "@/server/data/curriculum";
import { getGradingSetup, saveGradeScale, saveScoreSplit } from "@/server/data/grading";
import { saveSession } from "@/server/data/setup";

import { db, type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0006 acceptance criteria. Every test rolls back, except the lock test,
// which only runs a save that is refused (so nothing is written).

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor, schoolId = a.schoolId) => schoolContext({ schoolId, userId: "team", db: tx, actor: team });

async function subjectsOf(tx: Executor, schoolId = a.schoolId) {
  return tx.select().from(t.schoolSubject).where(eq(t.schoolSubject.schoolId, schoolId));
}
async function subjectId(tx: Executor, name: string, schoolId = a.schoolId) {
  const found = (await subjectsOf(tx, schoolId)).find((s) => s.name === name);
  if (!found) throw new Error(`no subject ${name}`);
  return found.id;
}
async function standardId(tx: Executor, name: string) {
  const [row] = await tx.select().from(t.standardSubject).where(eq(t.standardSubject.name, name));
  return row.id;
}
async function levelId(tx: Executor, code: string) {
  const [row] = await tx.select().from(t.standardLevel).where(eq(t.standardLevel.code, code));
  return row.id;
}
async function offerOf(tx: Executor, classId: string, sessionId = a.session.id) {
  const rows = await tx
    .select({ name: t.schoolSubject.name, isElective: t.classSubject.isElective })
    .from(t.classSubject)
    .innerJoin(t.schoolSubject, eq(t.schoolSubject.id, t.classSubject.subjectId))
    .where(and(eq(t.classSubject.classId, classId), eq(t.classSubject.sessionId, sessionId)));
  return rows.map((r) => r.name).sort();
}
async function classByName(tx: Executor, name: string) {
  const [row] = await tx.select().from(t.schoolClass).where(and(eq(t.schoolClass.schoolId, a.schoolId), eq(t.schoolClass.name, name)));
  return row;
}
const gradeFor = (bands: { grade: string; min: number }[], total: number) => [...bands].sort((x, y) => y.min - x.min).find((band) => total >= band.min)?.grade;

describe("AC-1: the school's subject list", () => {
  it("suggests short names: the standard code, then initials, then letters", () => {
    expect(suggestShortName("Mathematics", [], "MATH")).toBe("MATH");
    expect(suggestShortName("Christian Religious Studies", [])).toBe("CRS");
    expect(suggestShortName("Biology", ["BIO"])).toBe("BIOL");
    expect(suggestShortName("Mathematics", ["MATH", "MAT", "MATHE"], "MATH")).toBe("MATH2");
  });

  it("adds ticked standard subjects at the end with suggested short names, skipping ones already added", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const result = await addStandardSubjects(ctx, { standardSubjectIds: [await standardId(tx, "French"), await standardId(tx, "Biology")] });
      expect(result).toEqual({ ok: true, added: 1 });
      const setup = await getSubjectsSetup(ctx);
      const last = setup.subjects.at(-1)!;
      expect([last.name, last.shortName, last.standardName]).toEqual(["French", "FRE", "French"]);
      expect(setup.standards.find((s) => s.name === "French")?.added).toBe(true);
    });
  });

  it("adds and renames the school's own subjects, refusing taken names and bad short names", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      expect(await saveSubject(ctx, { name: "Hausa Studies", shortName: "hs" })).toMatchObject({ ok: true });
      expect(await saveSubject(ctx, { name: "mathematics", shortName: "MX" })).toMatchObject({ ok: false, field: "name" });
      expect(await saveSubject(ctx, { name: "Igbo Studies", shortName: "MTH" })).toMatchObject({ ok: false, field: "shortName", error: expect.stringMatching(/Mathematics/) });
      expect(await saveSubject(ctx, { name: "Igbo Studies", shortName: "M" })).toMatchObject({ ok: false, field: "shortName" });
      const english = await subjectId(tx, "English Studies");
      const renamed = await saveSubject(ctx, { id: english, name: "English Language Studies", shortName: "ENG", standardSubjectId: await standardId(tx, "English Language") });
      expect(renamed).toEqual({ ok: true, subjectId: english });
      const row = (await subjectsOf(tx)).find((s) => s.id === english)!;
      expect(row.standardSubjectId).toBe(await standardId(tx, "English Language"));
    });
  });
});

describe("AC-2: one school subject order", () => {
  it("moves a subject first and every class list follows", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const english = await subjectId(tx, "English Studies");
      for (let i = 0; i < 20; i++) expect(await moveSubject(ctx, { id: english, direction: "up" })).toEqual({ ok: true });
      const home = await listHomeClasses(ctx, { termId: a.term(1).id, sessionId: a.session.id });
      const jss2 = home.find((c) => c.name === "JSS 2 Gold")!;
      expect(jss2.subjects[0].name).toBe("English Studies");
      const top = (await getSubjectsSetup(ctx)).subjects.map((s) => s.name);
      expect(top[0]).toBe("English Studies");
      await moveSubject(ctx, { id: english, direction: "down" });
      const order = (await getSubjectsSetup(ctx)).subjects.map((s) => s.name);
      expect(order.slice(0, 2)).toEqual([top[1], "English Studies"]);
    });
  });
});

describe("AC-3: creating classes from levels and arms", () => {
  it("creates every level × arm, skips names that exist, and orders arms within levels", async () => {
    expect(parseArms("Gold, Blue,  gold\nRed")).toEqual(["Gold", "Blue", "Red"]);
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const jss1 = await levelId(tx, "JSS1");
      const first = await createClasses(ctx, { levelIds: [jss1, await levelId(tx, "JSS2")], arms: "Gold, Blue" });
      expect(first).toEqual({ ok: true, created: ["JSS 1 Gold", "JSS 1 Blue", "JSS 2 Blue"], skipped: ["JSS 2 Gold"] });
      const second = await createClasses(ctx, { levelIds: [jss1], arms: ["Gold", "Red"] });
      expect(second).toEqual({ ok: true, created: ["JSS 1 Red"], skipped: ["JSS 1 Gold"] });
      expect((await classByName(tx, "JSS 1 Red")).sortOrder).toBe(classSortOrder(11, 3));
      const plain = await createClasses(ctx, { levelIds: [await levelId(tx, "JSS3")], arms: "" });
      expect(plain).toEqual({ ok: true, created: ["JSS 3"], skipped: [] });
      expect(await createClasses(ctx, { levelIds: [await levelId(tx, "NUR1")], arms: "" })).toMatchObject({ ok: false, field: "levels" });
      const blue = await classByName(tx, "JSS 1 Blue");
      expect(await saveClass(ctx, { id: blue.id, name: "JSS 2 Gold" })).toMatchObject({ ok: false, field: "name" });
      expect(await saveClass(ctx, { id: blue.id, name: "JSS 1 Sapphire", arm: "Sapphire" })).toEqual({ ok: true });
      const renamed = await classByName(tx, "JSS 1 Sapphire");
      expect([renamed.standardLevelId, renamed.sectionId]).toEqual([blue.standardLevelId, blue.sectionId]);
    });
  });
});

describe("AC-4: each level's subjects", () => {
  it("applies a level offer to every arm, keeps an arm's own difference, and caps a class at 20", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const ss1 = await levelId(tx, "SS1");
      await createClasses(ctx, { levelIds: [ss1], arms: "Arts" });
      const [science, arts] = [await classByName(tx, "SS 1 Science"), await classByName(tx, "SS 1 Arts")];
      const [maths, english, yoruba] = await Promise.all(["Mathematics", "English Studies", "Yoruba"].map((n) => subjectId(tx, n)));

      const level = await saveLevelOffer(ctx, {
        levelId: ss1,
        sessionId: a.session.id,
        changes: [
          { subjectId: maths, offered: true },
          { subjectId: english, offered: true },
          { subjectId: yoruba, offered: true, isElective: true },
        ],
      });
      expect(level).toMatchObject({ ok: true });
      expect(await offerOf(tx, arts.id)).toEqual(["English Studies", "Mathematics", "Yoruba"]);
      expect(await offerOf(tx, science.id)).toContain("Yoruba");

      // Science keeps Physics (its own); a level save that drops Yoruba leaves it alone.
      await saveLevelOffer(ctx, { levelId: ss1, sessionId: a.session.id, changes: [{ subjectId: yoruba, offered: false }] });
      expect(await offerOf(tx, arts.id)).toEqual(["English Studies", "Mathematics"]);
      expect(await offerOf(tx, science.id)).toContain("Physics");
      expect(await offerOf(tx, science.id)).not.toContain("Yoruba");

      const view = await getClassesSetup(ctx, { sessionId: a.session.id });
      expect(view.classes.find((c) => c.name === "SS 1 Arts")!.offer).toHaveLength(2);

      // A 21st subject is refused.
      const standards = await tx.select().from(t.standardSubject);
      const spare = standards.filter((s) => !["French", "Igbo"].includes(s.name)).slice(0, 30).map((s) => s.id);
      await addStandardSubjects(ctx, { standardSubjectIds: spare });
      const all = (await subjectsOf(tx)).slice(0, 21);
      const over = await saveClassOffer(ctx, { classId: arts.id, sessionId: a.session.id, subjects: all.map((s) => ({ subjectId: s.id, isElective: false })) });
      expect(over).toMatchObject({ ok: false, error: expect.stringMatching(/at most 20/) });
    });
  });
});

describe("AC-5: score splits", () => {
  it("checks the split rules", () => {
    expect(splitProblem(defaultSplit("junior_secondary").parts)).toBeNull();
    expect(splitProblem([{ label: "CA", max: 35 }, { label: "Exam", max: 60 }])?.error).toMatch(/add up to 95/);
    expect(splitProblem([{ label: "CA", max: 40 }, { label: "ca", max: 60 }])?.error).toMatch(/Two parts/);
    expect(splitProblem([{ label: "CA", max: 40.5 }, { label: "Exam", max: 59.5 }])?.error).toMatch(/whole number/);
    expect(splitProblem(Array.from({ length: 6 }, (_, i) => ({ label: `P${i}`, max: i === 0 ? 50 : 10 })))?.error).toMatch(/at most 5/);
    expect(partKey("CA 1", [])).toBe("ca1");
    expect(partKey("Exam", ["exam"])).toBe("exam_2");
  });

  it("saves a section's split from a preset, keeping keys of parts that stay", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const primary = a.section("primary");
      const saved = await saveScoreSplit(ctx, { sectionId: primary.id, sessionId: a.session.id, parts: [{ label: "CA", max: 30 }, { label: "Exam", max: 70 }] });
      expect(saved).toEqual({ ok: true });
      const grading = await getGradingSetup(ctx, { sessionId: a.session.id });
      expect(grading.sections.find((s) => s.id === primary.id)!.parts.map((p) => [p.key, p.label, p.max])).toEqual([
        ["ca", "CA", 30],
        ["exam", "Exam", 70],
      ]);
      const junior = grading.sections.find((s) => s.stage === "junior_secondary")!;
      const renamed = junior.parts.map((p) => ({ id: p.id, label: p.key === "ca1" ? "First test" : p.label, max: p.max }));
      expect(await saveScoreSplit(ctx, { sectionId: junior.id, sessionId: a.session.id, parts: renamed })).toEqual({ ok: true });
      const after = await getGradingSetup(ctx, { sessionId: a.session.id });
      expect(after.sections.find((s) => s.id === junior.id)!.parts[0]).toMatchObject({ key: "ca1", label: "First test" });
    });
  });
});

describe("AC-6: grade scales", () => {
  it("checks the scale rules", () => {
    expect(scaleProblem(defaultScale("senior_secondary").bands)).toBeNull();
    expect(scaleProblem([{ grade: "A", min: 50, remark: "Good" }, { grade: "B", min: 10, remark: "Fair" }])?.error).toMatch(/start at 0/);
    expect(scaleProblem([{ grade: "A", min: 50, remark: "Good" }])?.error).toMatch(/at least 2/);
    expect(scaleProblem([{ grade: "A", min: 50, remark: "Good" }, { grade: "a", min: 0, remark: "Fail" }])?.error).toMatch(/twice/);
    const tops = bandTops(defaultScale("primary").bands);
    expect([...tops.values()].slice(0, 2)).toEqual([100, 69]);
  });

  it("changes the grade shown straight away, and never another session's", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const junior = a.section("junior_secondary");
      const next = await saveSession(ctx, { name: "2027/2028", terms: nextTerms });
      if (!next.ok) throw new Error(next.error);
      await copySessionSetup(ctx, { fromSessionId: a.session.id, toSessionId: next.sessionId });

      const before = await getGradingSetup(ctx, { sessionId: a.session.id });
      expect(gradeFor(before.sections.find((s) => s.id === junior.id)!.bands, 72)).toBe("A");
      const raised = defaultScale("junior_secondary").bands.map((band) => (band.grade === "A" ? { ...band, min: 75 } : band));
      expect(await saveGradeScale(ctx, { sectionId: junior.id, sessionId: a.session.id, bands: raised })).toEqual({ ok: true });

      const after = await getGradingSetup(ctx, { sessionId: a.session.id });
      expect(gradeFor(after.sections.find((s) => s.id === junior.id)!.bands, 72)).toBe("B");
      const other = await getGradingSetup(ctx, { sessionId: next.sessionId });
      expect(gradeFor(other.sections.find((s) => s.id === junior.id)!.bands, 72)).toBe("A");
      expect(await saveGradeScale(ctx, { sectionId: junior.id, sessionId: a.session.id, bands: raised.slice(0, 1) })).toMatchObject({ ok: false });
    });
  });
});

describe("AC-7: protecting saved scores", () => {
  it("refuses lowering a maximum below a saved score, or removing a part with scores", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const junior = (await getGradingSetup(ctx, { sessionId: a.session.id })).sections.find((s) => s.stage === "junior_secondary")!;
      const lowered = junior.parts.map((p) => ({ id: p.id, label: p.label, max: p.key === "ca1" ? 15 : p.key === "exam" ? 65 : p.max }));
      const refused = await saveScoreSplit(ctx, { sectionId: junior.id, sessionId: a.session.id, parts: lowered });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/5 saved scores for CA 1 are above 15/) });
      const dropped = [{ label: "CA", max: 40 }, { label: "Exam", max: 60 }];
      expect(await saveScoreSplit(ctx, { sectionId: junior.id, sessionId: a.session.id, parts: dropped })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/CA 1 has \d+ saved scores/),
      });
      const raised = junior.parts.map((p) => ({ id: p.id, label: p.label, max: p.key === "ca1" ? 25 : p.key === "exam" ? 55 : p.max }));
      expect(await saveScoreSplit(ctx, { sectionId: junior.id, sessionId: a.session.id, parts: raised })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/1 saved score for Exam is above 55/),
      });
    });
  });

  it("refuses removing a scored subject or making it elective, and saves nothing else from that change", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const gold = a.cls("JSS 2 Gold");
      await addStandardSubjects(ctx, { standardSubjectIds: [await standardId(tx, "French")] });
      const [maths, french] = [await subjectId(tx, "Mathematics"), await subjectId(tx, "French")];
      const refused = await saveLevelOffer(ctx, {
        levelId: gold.standardLevelId,
        sessionId: a.session.id,
        changes: [
          { subjectId: maths, offered: false },
          { subjectId: french, offered: true },
        ],
      });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/JSS 2 Gold: Mathematics has \d+ saved scores/) });
      expect(await offerOf(tx, gold.id)).not.toContain("French");
      const current = (await getClassesSetup(ctx, { sessionId: a.session.id })).classes.find((c) => c.id === gold.id)!.offer;
      const flipped = current.map((o) => ({ subjectId: o.subjectId, isElective: o.subjectId === maths }));
      expect(await saveClassOffer(ctx, { classId: gold.id, sessionId: a.session.id, subjects: flipped })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/can’t become an elective/),
      });
    });
  });

  it("makes a split save wait while a score save holds the parts", async () => {
    const junior = a.section("junior_secondary");
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => (locked = resolve));
    const scoreSave = db.transaction(async (tx) => {
      await tx
        .select({ id: t.assessmentComponent.id })
        .from(t.assessmentComponent)
        .where(and(eq(t.assessmentComponent.sectionId, junior.id), eq(t.assessmentComponent.sessionId, a.session.id)))
        .for("share");
      locked();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await held;
    const started = Date.now();
    const parts = (await getGradingSetup(teamCtx(db), { sessionId: a.session.id })).sections.find((s) => s.id === junior.id)!.parts;
    // Refused once it runs (CA 1 has scores above 15), so nothing is ever written.
    const splitSave = saveScoreSplit(teamCtx(db), {
      sectionId: junior.id,
      sessionId: a.session.id,
      parts: parts.map((p) => ({ id: p.id, label: p.label, max: p.key === "ca1" ? 15 : p.key === "exam" ? 65 : p.max })),
    });
    setTimeout(() => release(), 1500);
    const [result] = await Promise.all([splitSave, scoreSave]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
    expect(result).toMatchObject({ ok: false });
  });
});

describe("AC-8: removing or switching off", () => {
  it("deletes unused subjects, switches off used ones, and won't switch off one offered now", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      await addStandardSubjects(ctx, { standardSubjectIds: [await standardId(tx, "French")] });
      expect(await removeSubject(ctx, { id: await subjectId(tx, "French") })).toEqual({ ok: true, outcome: "deleted" });
      expect(await removeSubject(ctx, { id: await subjectId(tx, "Mathematics") })).toMatchObject({ ok: false, error: expect.stringMatching(/offered by 2 classes in 2026\/2027/) });

      // Economics: dropped from SS 1 Science this session, but students chose it, so it's used.
      const science = a.cls("SS 1 Science");
      const economics = await subjectId(tx, "Economics");
      const offer = (await getClassesSetup(ctx, { sessionId: a.session.id })).classes.find((c) => c.id === science.id)!.offer;
      await saveClassOffer(ctx, { classId: science.id, sessionId: a.session.id, subjects: offer.filter((o) => o.subjectId !== economics) });
      expect(await removeSubject(ctx, { id: economics })).toEqual({ ok: true, outcome: "switched_off" });
      expect((await getSubjectsSetup(ctx)).subjects.find((s) => s.id === economics)!.isActive).toBe(false);
      expect(await saveLevelOffer(ctx, { levelId: science.standardLevelId, sessionId: a.session.id, changes: [{ subjectId: economics, offered: true }] })).toMatchObject({
        ok: false,
        error: expect.stringMatching(/switched off/),
      });
      expect(await restoreSubject(ctx, { id: economics })).toEqual({ ok: true });
      expect((await getSubjectsSetup(ctx)).subjects.at(-1)!.id).toBe(economics);
    });
  });

  it("deletes unused classes, won't switch off one with students this term, switches off one used before", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      await createClasses(ctx, { levelIds: [await levelId(tx, "JSS3")], arms: "" });
      expect(await removeClass(ctx, { id: (await classByName(tx, "JSS 3")).id })).toEqual({ ok: true, outcome: "deleted" });
      expect(await removeClass(ctx, { id: a.cls("JSS 2 Gold").id })).toMatchObject({ ok: false, error: expect.stringMatching(/16 students are in JSS 2 Gold/) });
      const science = a.cls("SS 1 Science");
      await tx.update(t.enrolment).set({ withdrawnOn: "2026-10-01" }).where(eq(t.enrolment.classId, science.id));
      expect(await removeClass(ctx, { id: science.id })).toEqual({ ok: true, outcome: "switched_off" });
      expect((await classByName(tx, "SS 1 Science")).isActive).toBe(false);
      const home = await listHomeClasses(ctx, { termId: a.term(1).id, sessionId: a.session.id });
      expect(home.map((c) => c.name)).not.toContain("SS 1 Science");
      expect(await restoreClass(ctx, { id: science.id })).toEqual({ ok: true });
    });
  });
});

const nextTerms = [
  { number: 1 as const, startsOn: "2027-09-13", endsOn: "2027-12-10" },
  { number: 2 as const, startsOn: "2028-01-10", endsOn: "2028-04-07" },
  { number: 3 as const, startsOn: "2028-04-24", endsOn: "2028-07-21" },
];

describe("AC-9: copying from the last session", () => {
  it("offers the copy only while the new session is empty, fills only what is empty, and copies nothing twice", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const next = await saveSession(ctx, { name: "2027/2028", terms: nextTerms });
      if (!next.ok) throw new Error(next.error);
      const view = await getClassesSetup(ctx, { sessionId: next.sessionId });
      expect(view.session?.id).toBe(next.sessionId);
      expect(view.copyFrom?.id).toBe(a.session.id);

      // One section already has its own scale in the new session; it must survive the copy.
      const senior = a.section("senior_secondary");
      await saveGradeScale(ctx, { sectionId: senior.id, sessionId: next.sessionId, bands: defaultScale("primary").bands });
      const copied = await copySessionSetup(ctx, { fromSessionId: a.session.id, toSessionId: next.sessionId });
      expect(copied).toEqual({ ok: true, classes: 2, splits: 3, scales: 2 });
      expect(await offerOf(tx, a.cls("JSS 2 Gold").id, next.sessionId)).toHaveLength(8);
      const grading = await getGradingSetup(ctx, { sessionId: next.sessionId });
      expect(grading.sections.find((s) => s.id === senior.id)!.bands[0].grade).toBe("A");
      expect(await copySessionSetup(ctx, { fromSessionId: a.session.id, toSessionId: next.sessionId })).toMatchObject({ ok: false, field: "copy" });
      expect((await getClassesSetup(ctx, { sessionId: next.sessionId })).copyFrom).toBeNull();
    });
  });
});

describe("AC-10: the setup checklist", () => {
  it("shows subjects, classes, and score split and grades", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const progress = await getCurriculumProgress(ctx);
      expect(progress.subjects).toMatchObject({ done: true, count: 14 });
      // Primary 4 has no subjects yet.
      expect(progress.classes).toMatchObject({ done: false, count: 3, withoutSubjects: 1 });
      expect(progress.grading).toMatchObject({ done: true, sections: 3 });
      await saveLevelOffer(ctx, { levelId: a.cls("Primary 4").standardLevelId, sessionId: a.session.id, changes: [{ subjectId: await subjectId(tx, "Mathematics"), offered: true }] });
      expect((await getCurriculumProgress(ctx)).classes.done).toBe(true);
      await tx.delete(t.gradeBand).where(and(eq(t.gradeBand.sectionId, a.section("primary").id), eq(t.gradeBand.sessionId, a.session.id)));
      expect((await getCurriculumProgress(ctx)).grading).toMatchObject({ done: false, unready: ["Primary"] });
    });
  });
});

describe("AC-11: our team only, inside one school", () => {
  it("gives teachers and read only viewers not found", async () => {
    await inRollback(async (tx) => {
      const teacher = schoolContext({ schoolId: a.schoolId, userId: "t", db: tx, actor: { kind: "teacher", staffId: "x", readOnly: false } });
      const viewing = schoolContext({ schoolId: a.schoolId, userId: "t", db: tx, actor: { kind: "admin", readOnly: true } });
      for (const ctx of [teacher, viewing]) {
        await expect(getSubjectsSetup(ctx)).rejects.toBeInstanceOf(NotFound);
        await expect(getClassesSetup(ctx)).rejects.toBeInstanceOf(NotFound);
        await expect(getGradingSetup(ctx)).rejects.toBeInstanceOf(NotFound);
        await expect(saveSubject(ctx, { name: "Hausa", shortName: "HAU" })).rejects.toBeInstanceOf(NotFound);
        await expect(createClasses(ctx, { levelIds: ["x"], arms: "" })).rejects.toBeInstanceOf(NotFound);
        await expect(saveGradeScale(ctx, { sectionId: "x", sessionId: "x", bands: [] })).rejects.toBeInstanceOf(NotFound);
      }
    });
  });

  it("treats another school's ids as not found", async () => {
    await inRollback(async (tx) => {
      const ctx = teamCtx(tx);
      const theirs = await subjectId(tx, "Mathematics", b.schoolId);
      await expect(
        saveLevelOffer(ctx, { levelId: a.cls("JSS 2 Gold").standardLevelId, sessionId: a.session.id, changes: [{ subjectId: theirs, offered: true }] }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(moveSubject(ctx, { id: theirs, direction: "up" })).rejects.toBeInstanceOf(NotFound);
      await expect(removeClass(ctx, { id: b.cls("JSS 2 Gold").id })).rejects.toBeInstanceOf(NotFound);
      await expect(saveScoreSplit(ctx, { sectionId: b.section("primary").id, sessionId: a.session.id, parts: [{ label: "Exam", max: 100 }] })).rejects.toBeInstanceOf(NotFound);
      await expect(saveGradeScale(ctx, { sectionId: a.section("primary").id, sessionId: b.session.id, bands: defaultScale("primary").bands })).rejects.toBeInstanceOf(NotFound);
      await expect(copySessionSetup(ctx, { fromSessionId: b.session.id, toSessionId: a.session.id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});
