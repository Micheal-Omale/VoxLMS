import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { DEFAULT_REMARK_BANDS, fromHundredths } from "@/lib/remarks";
import {
  type Actor,
  Conflict,
  getClassRemarks,
  getRemarkBands,
  InvalidRemark,
  NotFound,
  NotInClass,
  ReadOnlySession,
  type RemarkChangeInput,
  saveRemarkBands,
  saveRemarks,
  saveScores,
  schoolContext,
  setCurrentTerm,
  TermClosed,
} from "@/server/data";
import type { Executor, SchoolContext } from "@/server/data/context";
import { createSchool } from "@/server/data/setup";

import { db, type Fixture, inRollback, pool, refusedBy, setUpSchools } from "./db";

// Spec 0011 (remarks) data layer, against the dev branch. Every test rolls back.

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

/** Funke Adewale is form teacher of JSS 2 Gold. */
async function funke(tx: Executor) {
  const [member] = await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, a.schoolId), eq(t.staff.fullName, "Funke Adewale")));
  return schoolContext({ schoolId: a.schoolId, userId: "teacher", db: tx, actor: { kind: "teacher", staffId: member.id, readOnly: false } });
}

/** A clean start: no comments saved in the test school (a fresh seed adds a few). */
async function clear(tx: Executor) {
  await tx.delete(t.termReport).where(eq(t.termReport.schoolId, a.schoolId));
}

const jss = () => ({ classId: a.cls(JSS).id });
const id = (fullName: string) => a.student(fullName).id;

function save(ctx: SchoolContext, changes: RemarkChangeInput[], termId = a.term(1).id) {
  return saveRemarks(ctx, { termId, classId: a.cls(JSS).id, saveId: randomUUID(), changes });
}

async function rowOf(ctx: SchoolContext, fullName: string) {
  const { remarks } = await getClassRemarks(ctx, jss());
  return remarks.rows.find((r) => r.studentId === id(fullName))!;
}

/** Fills every JSS 2 Gold subject except Mathematics for one student with 10, 10, 30. */
async function completeStudent(tx: Executor, fullName: string) {
  const offers = await tx
    .select({ id: t.classSubject.id, name: t.schoolSubject.name })
    .from(t.classSubject)
    .innerJoin(t.schoolSubject, eq(t.schoolSubject.id, t.classSubject.subjectId))
    .where(eq(t.classSubject.classId, a.cls(JSS).id));
  for (const offer of offers.filter((o) => o.name !== "Mathematics")) {
    await saveScores(teamCtx(tx), {
      termId: a.term(1).id,
      classSubjectId: offer.id,
      saveId: randomUUID(),
      changes: ["ca1", "ca2", "exam"].map((componentKey, i) => ({ studentId: id(fullName), componentKey, expected: null, value: i === 2 ? "30" : "10" })),
    });
  }
}

describe("the Remarks sheet's read (AC-2, AC-4, AC-11)", () => {
  it("lists every open enrolment surname first, with nothing saved and every head's comment waiting", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      const { results, remarks } = await getClassRemarks(teamCtx(tx), jss());
      expect(results.term.id).toBe(a.term(1).id);
      expect(remarks.signerTitle).toBe("Principal");
      expect(remarks.rows).toHaveLength(16);
      expect(remarks.rows[0].studentId).toBe(id("Abubakar Sadiq"));
      expect(remarks.rows.at(-1)!.studentId).toBe(id("Okon Emem"));
      for (const row of remarks.rows) expect(row).toMatchObject({ teacherRemark: null, head: { kind: "waiting" }, lastChange: null });
    });
  });

  it("heads the column with the section's own head when it has one", async () => {
    await inRollback(async (tx) => {
      await tx.update(t.section).set({ headTitle: "Vice principal", headName: "Mrs Ada Obi" }).where(eq(t.section.id, a.section("junior_secondary").id));
      const { remarks } = await getClassRemarks(teamCtx(tx), jss());
      expect(remarks.signerTitle).toBe("Vice principal");
    });
  });

  it("gives a complete student the automatic comment, following the band edges and band changes", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await completeStudent(tx, "Abubakar Sadiq");
      const { results } = await getClassRemarks(teamCtx(tx), jss());
      const average = results.students.find((s) => s.studentId === id("Abubakar Sadiq"))!.average!;
      expect(average).not.toBeNull();

      // A band starting exactly at the average is reached; one hundredth above it is not.
      await saveRemarkBands(teamCtx(tx), { bands: [{ minAverage: "0", remark: "Low." }, { minAverage: fromHundredths(average), remark: "High." }] });
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).head).toEqual({ kind: "automatic", text: "High." });
      await saveRemarkBands(teamCtx(tx), { bands: [{ minAverage: "0", remark: "Low." }, { minAverage: fromHundredths(average + 1), remark: "High." }] });
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).head).toEqual({ kind: "automatic", text: "Low." });
      // Everyone still missing a score waits.
      expect((await rowOf(teamCtx(tx), "Okon Emem")).head).toEqual({ kind: "waiting" });
    });
  });

  it("keeps a typed head's comment through score and band changes", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "head", expected: null, value: "Typed by hand." }]);
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).head).toEqual({ kind: "typed", text: "Typed by hand." });
      await completeStudent(tx, "Abubakar Sadiq");
      await saveRemarkBands(teamCtx(tx), { bands: [{ minAverage: "0", remark: "Low." }, { minAverage: "50", remark: "High." }] });
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).head).toEqual({ kind: "typed", text: "Typed by hand." });
    });
  });

  it("leaves a withdrawn student out", async () => {
    await inRollback(async (tx) => {
      await tx
        .update(t.enrolment)
        .set({ withdrawnOn: "2026-10-01" })
        .where(and(eq(t.enrolment.studentId, id("Nwosu Ifeoma")), eq(t.enrolment.termId, a.term(1).id)));
      const { remarks } = await getClassRemarks(teamCtx(tx), jss());
      expect(remarks.rows).toHaveLength(15);
      expect(remarks.rows.some((r) => r.studentId === id("Nwosu Ifeoma"))).toBe(false);
    });
  });

  it("runs in a real read only snapshot on the shared client", async () => {
    const ctx = schoolContext({ schoolId: a.schoolId, userId: "team", db, actor: team });
    const { results, remarks } = await getClassRemarks(ctx, jss());
    expect(remarks.rows.map((r) => r.studentId).sort()).toEqual(results.students.map((s) => s.studentId).sort());
  });
});

describe("saving comments (AC-3, AC-5, AC-9)", () => {
  it("saves tidy text for both comments and records who last changed the row", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      const result = await save(teamCtx(tx), [
        { studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "  Hardworking\nand   well behaved. " },
        { studentId: id("Abubakar Sadiq"), field: "head", expected: null, value: "Well done." },
        { studentId: id("Bello Abdulrahman"), field: "teacher", expected: null, value: "Shows steady improvement." },
      ]);
      expect(result.changed).toBe(3);
      const row = await rowOf(teamCtx(tx), "Abubakar Sadiq");
      expect(row).toMatchObject({ teacherRemark: "Hardworking and well behaved.", head: { kind: "typed", text: "Well done." } });
      expect(row.lastChange).toMatchObject({ by: expect.any(String), at: expect.any(Date) });
    });
  });

  it("skips a resent save, and clears a comment emptied back to automatic", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      const changes: RemarkChangeInput[] = [{ studentId: id("Abubakar Sadiq"), field: "head", expected: null, value: "Well done." }];
      await save(teamCtx(tx), changes);
      expect((await save(teamCtx(tx), changes)).changed).toBe(0);
      await save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "head", expected: "Well done.", value: null }]);
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).head).toEqual({ kind: "waiting" });
    });
  });

  it("takes 200 characters, refuses 201 and a comment sent twice, and the database refuses 201 too", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "a".repeat(200) }]);
      await expect(save(teamCtx(tx), [{ studentId: id("Bello Abdulrahman"), field: "teacher", expected: null, value: "a".repeat(201) }])).rejects.toBeInstanceOf(InvalidRemark);
      await expect(
        save(teamCtx(tx), [
          { studentId: id("Bello Abdulrahman"), field: "teacher", expected: null, value: "One." },
          { studentId: id("Bello Abdulrahman"), field: "teacher", expected: null, value: "Two." },
        ]),
      ).rejects.toBeInstanceOf(InvalidRemark);
      const [enrolled] = await tx
        .select({ id: t.enrolment.id })
        .from(t.enrolment)
        .where(and(eq(t.enrolment.studentId, id("Bello Abdulrahman")), eq(t.enrolment.termId, a.term(1).id)));
      expect(
        await refusedBy(tx, (sp) => sp.insert(t.termReport).values({ schoolId: a.schoolId, enrolmentId: enrolled.id, teacherRemark: "a".repeat(201), updatedBy: "x" })),
      ).toBe("term_report_teacher_remark_length");
    });
  });
});

describe("conflicts and stale sheets (AC-6, AC-8)", () => {
  it("writes nothing when someone saved the same comment first", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await save(teamCtx(tx, "first"), [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "First." }]);
      const second = save(teamCtx(tx, "second"), [
        { studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "Second." },
        { studentId: id("Bello Abdulrahman"), field: "teacher", expected: null, value: "Also mine." },
      ]);
      await expect(second).rejects.toMatchObject({ constructor: Conflict, studentIds: [id("Abubakar Sadiq")] });
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).teacherRemark).toBe("First.");
      expect((await rowOf(teamCtx(tx), "Bello Abdulrahman")).teacherRemark).toBeNull();
    });
  });

  it("does not conflict when the other person changed the other comment", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "head", expected: null, value: "Head." }]);
      await save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "Teacher." }]);
      expect(await rowOf(teamCtx(tx), "Abubakar Sadiq")).toMatchObject({ teacherRemark: "Teacher.", head: { kind: "typed", text: "Head." } });
    });
  });

  it("refuses a student no longer in the class, writing nothing", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      await tx
        .update(t.enrolment)
        .set({ withdrawnOn: "2026-10-01" })
        .where(and(eq(t.enrolment.studentId, id("Okon Emem")), eq(t.enrolment.termId, a.term(1).id)));
      const attempt = save(teamCtx(tx), [
        { studentId: id("Okon Emem"), field: "teacher", expected: null, value: "Gone." },
        { studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "Here." },
      ]);
      await expect(attempt).rejects.toMatchObject({ constructor: NotInClass, studentIds: [id("Okon Emem")] });
      expect((await rowOf(teamCtx(tx), "Abubakar Sadiq")).teacherRemark).toBeNull();
    });
  });
});

describe("only the current term (AC-7)", () => {
  it("refuses a save for an earlier term", async () => {
    await inRollback(async (tx) => {
      await setCurrentTerm(teamCtx(tx), { termId: a.term(2).id });
      await expect(save(teamCtx(tx), [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "Late." }], a.term(1).id)).rejects.toBeInstanceOf(TermClosed);
    });
  });
});

describe("who may save (AC-12)", () => {
  it("lets the form teacher save their class, and nothing else", async () => {
    await inRollback(async (tx) => {
      await clear(tx);
      const ctx = await funke(tx);
      await expect(save(ctx, [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "Mine." }])).resolves.toMatchObject({ changed: 1 });
      const ss = await tx.select({ id: t.enrolment.studentId }).from(t.enrolment).where(eq(t.enrolment.classId, a.cls(SS).id)).limit(1);
      await expect(
        saveRemarks(ctx, { termId: a.term(1).id, classId: a.cls(SS).id, saveId: randomUUID(), changes: [{ studentId: ss[0].id, field: "teacher", expected: null, value: "No." }] }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(getClassRemarks(ctx, { classId: a.cls(SS).id })).rejects.toBeInstanceOf(NotFound);
    });
  });

  it("refuses a save while viewing as someone", async () => {
    await inRollback(async (tx) => {
      const viewing = schoolContext({ schoolId: a.schoolId, userId: "team", db: tx, actor: { kind: "admin", readOnly: true } });
      await expect(save(viewing, [{ studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "No." }])).rejects.toBeInstanceOf(ReadOnlySession);
    });
  });

  it("looks the class, term and students up within the school", async () => {
    await inRollback(async (tx) => {
      const change: RemarkChangeInput = { studentId: id("Abubakar Sadiq"), field: "teacher", expected: null, value: "No." };
      await expect(saveRemarks(teamCtx(tx), { termId: a.term(1).id, classId: b.cls(JSS).id, saveId: randomUUID(), changes: [change] })).rejects.toBeInstanceOf(NotFound);
      await expect(saveRemarks(teamCtx(tx), { termId: b.term(1).id, classId: a.cls(JSS).id, saveId: randomUUID(), changes: [change] })).rejects.toBeInstanceOf(NotFound);
      const other = { ...change, studentId: b.student("Abubakar Sadiq").id };
      await expect(save(teamCtx(tx), [other])).rejects.toBeInstanceOf(NotInClass);
      await expect(getClassRemarks(teamCtx(tx), { classId: b.cls(JSS).id })).rejects.toBeInstanceOf(NotFound);
    });
  });
});

describe("principal's comment bands (AC-10)", () => {
  it("gives every school the defaults, a new school included", async () => {
    await inRollback(async (tx) => {
      expect(await getRemarkBands(teamCtx(tx))).toEqual(DEFAULT_REMARK_BANDS);
      const created = await createSchool(tx, { kind: "system" }, { name: "Bands Test School", slug: "bandstestschool", code: "BTS", address: "1 Test Road, Lagos" });
      if (!created.ok) throw new Error(created.error);
      const fresh = schoolContext({ schoolId: created.schoolId, userId: "team", db: tx, actor: team });
      expect(await getRemarkBands(fresh)).toEqual(DEFAULT_REMARK_BANDS);
    });
  });

  it("replaces the whole set, tidied, highest first", async () => {
    await inRollback(async (tx) => {
      const result = await saveRemarkBands(teamCtx(tx), {
        bands: [
          { minAverage: "0", remark: "  Work   harder. " },
          { minAverage: "62.50", remark: "Good." },
        ],
      });
      expect(result).toEqual({ ok: true });
      expect(await getRemarkBands(teamCtx(tx))).toEqual([
        { minAverage: "62.5", remark: "Good." },
        { minAverage: "0", remark: "Work harder." },
      ]);
    });
  });

  it("refuses each broken rule, naming the band, and saves nothing", async () => {
    await inRollback(async (tx) => {
      const ok = { minAverage: "0", remark: "Fine." };
      const cases = [
        { bands: [{ minAverage: "10", remark: "A." }, { minAverage: "50", remark: "B." }], field: "bands" },
        { bands: [ok, { minAverage: "50", remark: "A." }, { minAverage: "50", remark: "B." }], field: "band-2" },
        { bands: [ok], field: "bands" },
        { bands: Array.from({ length: 11 }, (_, i) => ({ minAverage: String(i * 5), remark: "A." })), field: "bands" },
        { bands: [ok, { minAverage: "101", remark: "A." }], field: "band-1" },
        { bands: [ok, { minAverage: "50", remark: "   " }], field: "band-1" },
      ];
      for (const c of cases) expect(await saveRemarkBands(teamCtx(tx), { bands: c.bands })).toMatchObject({ ok: false, field: c.field });
      expect(await getRemarkBands(teamCtx(tx))).toEqual(DEFAULT_REMARK_BANDS);
    });
  });

  it("is for our team only", async () => {
    await inRollback(async (tx) => {
      const ctx = await funke(tx);
      await expect(getRemarkBands(ctx)).rejects.toBeInstanceOf(NotFound);
      await expect(saveRemarkBands(ctx, { bands: DEFAULT_REMARK_BANDS })).rejects.toBeInstanceOf(NotFound);
    });
  });
});
