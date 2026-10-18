import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import {
  type Actor,
  getScoreHistory,
  getScoreProgress,
  getScoreSheet,
  listSubjectProgress,
  NotFound,
  ReadOnlySession,
  saveScores,
  schoolContext,
  setCurrentTerm,
  TermClosed,
} from "@/server/data";
import type { Executor } from "@/server/data/context";

import { type Fixture, inRollback, pool, setUpSchools } from "./db";

// Spec 0009 (score entry) data rules, against the dev branch. Every test rolls back.

const JSS = "JSS 2 Gold";
const SS = "SS 1 Science";

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const team: Actor = { kind: "admin", readOnly: false };
const teamCtx = (tx: Executor, userId = "team") => schoolContext({ schoolId: a.schoolId, userId, db: tx, actor: team });

async function staffNamed(tx: Executor, fullName: string) {
  const [row] = await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, a.schoolId), eq(t.staff.fullName, fullName)));
  return row;
}

/** Funke Adewale is form teacher of JSS 2 Gold; Ibrahim Musa of SS 1 Science. */
async function funke(tx: Executor, opts: { userId?: string; readOnly?: boolean } = {}) {
  const member = await staffNamed(tx, "Funke Adewale");
  return schoolContext({
    schoolId: a.schoolId,
    userId: opts.userId ?? "teacher",
    db: tx,
    actor: { kind: "teacher", staffId: member.id, readOnly: opts.readOnly ?? false },
  });
}

async function makeUser(tx: Executor, name: string, role: string | null = null) {
  const id = randomUUID();
  await tx.insert(t.user).values({ id, name, email: `${id}@users.voxlms.invalid`, role });
  return id;
}

const subjectOf = <T extends { name: string }>(rows: T[], name: string) => rows.find((r) => r.name === name)!;

describe("AC-6: only the current term takes scores", () => {
  it("refuses a save to a term that is not current, and writes nothing", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Mathematics");
      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      const attempt = saveScores(teamCtx(tx), {
        termId: a.term(1).id,
        classSubjectId: offer.id,
        saveId: randomUUID(),
        changes: [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "10" }],
      });
      await expect(attempt).rejects.toBeInstanceOf(TermClosed);
      const sheet = await getScoreSheet(teamCtx(tx), { termId: a.term(1).id, classSubjectId: offer.id });
      expect(sheet.scores[a.student("Ojo Precious").id]).toBeUndefined();
      expect(sheet.term.isCurrent).toBe(false);
    });
  });

  it("makes a save wait while a term switch holds the term row, then read the flag it finds (covers: AC-6)", async () => {
    // A second connection plays setCurrentTerm: it closes First Term but has not committed yet.
    const switcher = await pool.connect();
    try {
      await switcher.query("begin");
      await switcher.query("update term set is_current = false where id = $1", [a.term(1).id]);
      let landed = false;
      const saving = inRollback(async (tx) => {
        await saveScores(teamCtx(tx), {
          termId: a.term(1).id,
          classSubjectId: a.offer(JSS, "Basic Science").id,
          saveId: randomUUID(),
          changes: [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "10" }],
        });
        landed = true;
      });
      // Postgres itself must show the save waiting on the term row lock. Without the share
      // lock nothing waits: the save reads the old flag and carries on.
      const waitingOnTerm = async () =>
        (await pool.query(`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%from "term"%'`)).rows[0].n as number;
      let waited = false;
      for (let i = 0; i < 40 && !waited && !landed; i++) {
        waited = (await waitingOnTerm()) > 0;
        if (!waited) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(waited).toBe(true);
      expect(landed).toBe(false);

      await switcher.query("rollback"); // the switch is abandoned, so First Term is still current
      await saving;
      expect(landed).toBe(true);
    } finally {
      await switcher.query("rollback").catch(() => {});
      switcher.release();
    }
  });

  it("checks access before the term, so a teacher can't probe another class", async () => {
    await inRollback(async (tx) => {
      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      const attempt = saveScores(await funke(tx), {
        termId: a.term(1).id,
        classSubjectId: a.offer(SS, "Physics").id,
        saveId: randomUUID(),
        changes: [{ studentId: a.student("Udo Godswill").id, componentKey: "ca1", expected: null, value: "10" }],
      });
      await expect(attempt).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-2: terms that can be opened", () => {
  it("opens earlier terms of the session, and not a later term", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Mathematics");
      await expect(getScoreSheet(teamCtx(tx), { termId: a.term(2).id, classSubjectId: offer.id })).rejects.toBeInstanceOf(NotFound);
      await expect(listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id, termId: a.term(2).id })).rejects.toBeInstanceOf(NotFound);

      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      const progress = await listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id });
      expect(progress.terms.map((x) => x.number)).toEqual([2, 1]);
      expect(progress.term.id).toBe(a.term(2).id);
      const first = await listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id, termId: a.term(1).id });
      expect(first.term.isCurrent).toBe(false);
      await expect(listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id, termId: a.term(3).id })).rejects.toBeInstanceOf(NotFound);
      // A term id from another school is not found either.
      await expect(listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id, termId: b.term(1).id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-1, AC-3: subject progress and the sheet", () => {
  it("counts a student complete only with every part, and lists compulsory subjects before electives", async () => {
    await inRollback(async (tx) => {
      const before = await listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id });
      const maths = subjectOf(before.subjects, "Mathematics");
      const sheet = await getScoreSheet(teamCtx(tx), { termId: a.term(1).id, classSubjectId: maths.classSubjectId });
      expect(maths.takers).toBe(sheet.students.length);
      const complete = sheet.students.filter((s) => sheet.components.every((c) => sheet.scores[s.studentId]?.[c.key] !== undefined)).length;
      expect(maths.complete).toBe(complete);

      // A student with no Basic Science scores: two parts leave them incomplete, the third completes them.
      const science = subjectOf(before.subjects, "Basic Science");
      const ojo = a.student("Ojo Precious").id;
      const keys = sheet.components.map((c) => c.key);
      const write = (changes: { componentKey: string; value: string }[]) =>
        saveScores(teamCtx(tx), {
          termId: a.term(1).id,
          classSubjectId: science.classSubjectId,
          saveId: randomUUID(),
          changes: changes.map((c) => ({ studentId: ojo, expected: null, ...c })),
        });
      await write(keys.slice(0, -1).map((componentKey) => ({ componentKey, value: "5" })));
      let after = await listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id });
      expect(subjectOf(after.subjects, "Basic Science").complete).toBe(science.complete);
      await write([{ componentKey: keys.at(-1)!, value: "5" }]);
      after = await listSubjectProgress(teamCtx(tx), { classId: a.cls(JSS).id });
      expect(subjectOf(after.subjects, "Basic Science").complete).toBe(science.complete + 1);

      const senior = await listSubjectProgress(teamCtx(tx), { classId: a.cls(SS).id });
      const firstElective = senior.subjects.findIndex((s) => s.isElective);
      expect(firstElective).toBeGreaterThan(0);
      expect(senior.subjects.slice(firstElective).every((s) => s.isElective)).toBe(true);
    });
  });

  it("counts only registered students for an elective", async () => {
    await inRollback(async (tx) => {
      const progress = await listSubjectProgress(teamCtx(tx), { classId: a.cls(SS).id });
      expect(subjectOf(progress.subjects, "Further Mathematics").takers).toBe(3);
    });
  });

  it("gives the sheet its term, names, admission numbers and last save time", async () => {
    await inRollback(async (tx) => {
      const sheet = await getScoreSheet(teamCtx(tx), { termId: a.term(1).id, classSubjectId: a.offer(JSS, "Mathematics").id });
      expect(sheet.term).toMatchObject({ number: 1, isCurrent: true });
      expect(sheet.section.name).toBeTruthy();
      expect(sheet.session.name).toBe(a.session.name);
      expect(sheet.students[0]).toHaveProperty("studentNo");
      expect(sheet.lastSavedAt).toBeInstanceOf(Date);
      const empty = await getScoreSheet(teamCtx(tx), { termId: a.term(1).id, classSubjectId: a.offer(JSS, "Basic Science").id });
      expect(empty.lastSavedAt).toBeNull();
    });
  });
});

describe("AC-12: our team's Scores page", () => {
  it("shows each class's subjects done and names the unfinished ones", async () => {
    await inRollback(async (tx) => {
      const progress = await getScoreProgress(teamCtx(tx));
      const jss = progress.sections.flatMap((s) => s.classes).find((c) => c.name === JSS)!;
      expect(jss.subjects).toBeGreaterThan(0);
      expect(jss.done + jss.unfinished.length).toBe(jss.subjects);
      expect(jss.unfinished.map((u) => u.name)).toContain("Basic Science");
      expect(jss.unfinished.every((u) => u.complete < u.takers)).toBe(true);
    });
  });

  it("is for our team only", async () => {
    await inRollback(async (tx) => {
      await expect(getScoreProgress(await funke(tx))).rejects.toBeInstanceOf(NotFound);
      const viewing = schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: true } });
      await expect(getScoreProgress(viewing)).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("AC-11: score history", () => {
  it("shows each change newest first, naming staff and our team", async () => {
    await inRollback(async (tx) => {
      const offer = a.offer(JSS, "Basic Science");
      const ojo = a.student("Ojo Precious").id;
      const teacherUser = await makeUser(tx, "Funke A.");
      await tx.update(t.staff).set({ userId: teacherUser }).where(eq(t.staff.id, (await staffNamed(tx, "Funke Adewale")).id));
      const teamUser = await makeUser(tx, "Ada Team", "admin");
      const teacher = await funke(tx, { userId: teacherUser });

      // Every save in one test transaction shares now(), so each gets its own time, minutes apart.
      let minutesAgo = 10;
      const save = async (ctx: typeof teacher, expected: string | null, value: string) => {
        const saveId = randomUUID();
        await saveScores(ctx, { termId: a.term(1).id, classSubjectId: offer.id, saveId, changes: [{ studentId: ojo, componentKey: "ca1", expected, value }] });
        await tx.update(t.scoreChange).set({ changedAt: new Date(Date.now() - minutesAgo-- * 60_000) }).where(eq(t.scoreChange.saveId, saveId));
      };
      await save(teacher, null, "10");
      await save(teacher, "10", "12");
      await save(teamCtx(tx, teamUser), "12", "15");

      const history = await getScoreHistory(teacher, { termId: a.term(1).id, classSubjectId: offer.id, studentId: ojo });
      const ca1 = history.find((p) => p.key === "ca1")!;
      expect(ca1.changes.map((c) => [c.oldValue, c.newValue, c.by])).toEqual([
        ["12", "15", "VoxLMS team (Ada Team)"],
        ["10", "12", "Mrs Funke Adewale"],
        [null, "10", "Mrs Funke Adewale"],
      ]);
      expect(history.filter((p) => p.key !== "ca1").every((p) => p.changes.length === 0)).toBe(true);
    });
  });

  it("opens in an earlier term too", async () => {
    await inRollback(async (tx) => {
      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      const history = await getScoreHistory(teamCtx(tx), {
        termId: a.term(1).id,
        classSubjectId: a.offer(JSS, "Mathematics").id,
        studentId: a.student("Danjuma Zainab").id,
      });
      expect(history.find((p) => p.key === "ca1")!.changes).toHaveLength(1);
    });
  });
});

describe("AC-13: who may do what", () => {
  it("gives a teacher not found for another class's progress, sheet and history", async () => {
    await inRollback(async (tx) => {
      const teacher = await funke(tx);
      const physics = a.offer(SS, "Physics");
      await expect(listSubjectProgress(teacher, { classId: a.cls(SS).id })).rejects.toBeInstanceOf(NotFound);
      await expect(getScoreSheet(teacher, { termId: a.term(1).id, classSubjectId: physics.id })).rejects.toBeInstanceOf(NotFound);
      await expect(
        getScoreHistory(teacher, { termId: a.term(1).id, classSubjectId: physics.id, studentId: a.student("Udo Godswill").id }),
      ).rejects.toBeInstanceOf(NotFound);
      expect((await listSubjectProgress(teacher, { classId: a.cls(JSS).id })).subjects.length).toBeGreaterThan(0);
    });
  });

  it("refuses a save while viewing as, and checks every id within the school", async () => {
    await inRollback(async (tx) => {
      const viewing = await funke(tx, { readOnly: true });
      const offer = a.offer(JSS, "Mathematics");
      await expect(
        saveScores(viewing, { termId: a.term(1).id, classSubjectId: offer.id, saveId: randomUUID(), changes: [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "1" }] }),
      ).rejects.toBeInstanceOf(ReadOnlySession);

      const otherSchool = schoolContext({ schoolId: b.schoolId, userId: "team", db: tx, actor: team });
      await expect(listSubjectProgress(otherSchool, { classId: a.cls(JSS).id })).rejects.toBeInstanceOf(NotFound);
      await expect(
        getScoreHistory(otherSchool, { termId: b.term(1).id, classSubjectId: offer.id, studentId: a.student("Ojo Precious").id }),
      ).rejects.toBeInstanceOf(NotFound);
      // A student of another class is not found in this subject's history.
      await expect(
        getScoreHistory(teamCtx(tx), { termId: a.term(1).id, classSubjectId: offer.id, studentId: a.student("Udo Godswill").id }),
      ).rejects.toBeInstanceOf(NotFound);
    });
  });
});
