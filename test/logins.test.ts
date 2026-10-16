import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as t from "@/db/schema";
import { createAuth } from "@/server/auth/config";
import { passwordProblem } from "@/server/auth/password-rules";
import {
  type AuthDeps,
  changePhone,
  createLoginForStaff,
  makeSetupLink,
  readSetupLink,
  setLoginEnabled,
  setPasswordWithLink,
  signInWithPhone,
} from "@/server/auth/service";
import {
  getScoreSheet,
  getStudentSessionResults,
  listClassStudents,
  NotFound,
  ReadOnlySession,
  saveScores,
  schoolContext,
  setCurrentTerm,
} from "@/server/data";
import type { Executor } from "@/server/data/context";

import { type Fixture, inRollback, pool, refusedBy, setUpSchools } from "./db";

// Spec 0004 acceptance criteria for the login operations. Every test rolls back.

let a: Fixture;
let b: Fixture;

beforeAll(async () => {
  ({ a, b } = await setUpSchools());
});

afterAll(async () => {
  await pool.end();
});

const meta = (ip = "203.0.113.7") => ({ ip, userAgent: "vitest" });
const deps = (tx: Executor): AuthDeps => ({ auth: createAuth(tx, { withNextCookies: false }), db: tx });

/** Every test runs rolled back, with the demo phones free. */
const isolated = (fn: (tx: Executor) => Promise<void>) =>
  inRollback(async (tx) => {
    await freeDemoPhones(tx);
    await fn(tx);
  });

async function teamMember(tx: Executor) {
  const [admin] = await tx
    .insert(t.user)
    .values({ id: `team-${crypto.randomUUID()}`, name: "Team Member", email: `${crypto.randomUUID()}@users.voxlms.invalid`, username: "2348090000001", role: "admin" })
    .returning();
  return admin;
}

/**
 * The test schools reuse the demo school's phone numbers, which may already have
 * logins on the dev branch. Inside the rolled back test, move them aside.
 */
async function freeDemoPhones(tx: Executor) {
  await tx.execute(sql`update "user" set username = 'x' || substr(md5(random()::text), 1, 12) where username in ('2348031234567', '2348059876543', '2348125550000')`);
  await tx.update(t.staff).set({ userId: null }).where(eq(t.staff.schoolId, a.schoolId));
  await tx.update(t.staff).set({ userId: null }).where(eq(t.staff.schoolId, b.schoolId));
}

async function staffNamed(tx: Executor, f: Fixture, fullName: string) {
  const [row] = await tx.select().from(t.staff).where(and(eq(t.staff.schoolId, f.schoolId), eq(t.staff.fullName, fullName)));
  return row;
}

/** Creates Funke's login and sets her password through a first setup link. */
async function funkeWithPassword(tx: Executor, password = "kano26") {
  const d = deps(tx);
  const admin = await teamMember(tx);
  const funke = await staffNamed(tx, a, "Funke Adewale");
  const login = await createLoginForStaff(d, { schoolId: a.schoolId, staffId: funke.id, confirmSamePerson: false, actorUserId: admin.id });
  if (!login.ok) throw new Error("login not created");
  const link = await makeSetupLink(d, { userId: login.userId, kind: "first", actorUserId: admin.id });
  const set = await setPasswordWithLink(d, { token: link.token, password });
  return { d, admin, funke, userId: login.userId, link, set };
}

describe("AC-3, AC-4: setup links and passwords", () => {
  it("lets a teacher choose their own password through a one time link, then sign in", async () => {
    await isolated(async (tx) => {
      const { d, userId, link, set } = await funkeWithPassword(tx);
      expect(set.ok).toBe(true);
      expect(link.whatsappUrl).toMatch(/^https:\/\/wa\.me\/2348031234567\?text=/);
      expect(link.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);

      const result = await signInWithPhone(d, { phone: "0803 123 4567", password: "kano26", sharedDevice: false, meta: meta(), headers: new Headers() });
      expect(result).toMatchObject({ ok: true, userId, isTeam: false });
      // The token is stored hashed, never as itself.
      const rows = await tx.select().from(t.verification);
      expect(rows.some((r) => r.identifier.includes(link.token))).toBe(false);
    });
  });

  it("refuses a link used twice, a replaced link, and an expired link", async () => {
    await isolated(async (tx) => {
      const { d, admin, userId, link } = await funkeWithPassword(tx);
      expect((await setPasswordWithLink(d, { token: link.token, password: "another1" })).ok).toBe(false);

      const older = await makeSetupLink(d, { userId, kind: "reset", actorUserId: admin.id });
      const newer = await makeSetupLink(d, { userId, kind: "reset", actorUserId: admin.id });
      expect((await readSetupLink(d, older.token)).valid).toBe(false);
      expect((await readSetupLink(d, newer.token)).valid).toBe(true);
      expect(newer.expiresAt.getTime() - Date.now()).toBeLessThan(48.1 * 3600 * 1000);

      await tx.update(t.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(t.verification.value, userId));
      expect((await setPasswordWithLink(d, { token: newer.token, password: "another1" })).ok).toBe(false);
    });
  });

  it("reading a link changes nothing", async () => {
    await isolated(async (tx) => {
      const d = deps(tx);
      const admin = await teamMember(tx);
      const funke = await staffNamed(tx, a, "Funke Adewale");
      const login = await createLoginForStaff(d, { schoolId: a.schoolId, staffId: funke.id, confirmSamePerson: false, actorUserId: admin.id });
      if (!login.ok) throw new Error("no login");
      const link = await makeSetupLink(d, { userId: login.userId, kind: "first", actorUserId: admin.id });
      for (let i = 0; i < 3; i++) expect((await readSetupLink(d, link.token)).valid).toBe(true);
      expect((await setPasswordWithLink(d, { token: link.token, password: "kano26" })).ok).toBe(true);
    });
  });

  it("refuses weak passwords with a reason", async () => {
    expect(passwordProblem("12345", { phoneDigits: null, isTeam: false })).toMatch(/at least 6/);
    expect(passwordProblem("123456", { phoneDigits: null, isTeam: false })).toMatch(/too easy/);
    expect(passwordProblem("08031234567", { phoneDigits: "2348031234567", isTeam: false })).toMatch(/phone number/);
    expect(passwordProblem("kano26", { phoneDigits: "2348031234567", isTeam: false })).toBeNull();
    expect(passwordProblem("kano2026abc", { phoneDigits: null, isTeam: true })).toMatch(/at least 12/);
    await isolated(async (tx) => {
      const { set } = await funkeWithPassword(tx, "123456");
      expect(set).toMatchObject({ ok: false, reason: "rule" });
    });
  });
});

describe("AC-2, AC-6: signing in and throttling", () => {
  it("gives one answer for a wrong password and an unknown phone", async () => {
    await isolated(async (tx) => {
      const { d } = await funkeWithPassword(tx);
      const wrong = await signInWithPhone(d, { phone: "08031234567", password: "nope99", sharedDevice: false, meta: meta(), headers: new Headers() });
      const unknown = await signInWithPhone(d, { phone: "08099999999", password: "nope99", sharedDevice: false, meta: meta(), headers: new Headers() });
      expect(wrong).toEqual({ ok: false, reason: "wrong" });
      expect(unknown).toEqual({ ok: false, reason: "wrong" });
    });
  });

  it("makes a device wait after 5 wrong tries, but not another device", async () => {
    await isolated(async (tx) => {
      const { d } = await funkeWithPassword(tx);
      for (let i = 0; i < 5; i++) {
        await signInWithPhone(d, { phone: "08031234567", password: `wrong${i}x`, sharedDevice: false, meta: meta(), headers: new Headers() });
      }
      const sixth = await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: false, meta: meta(), headers: new Headers() });
      expect(sixth.ok).toBe(false);
      expect(sixth).toMatchObject({ reason: "throttled" });
      const elsewhere = await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: false, meta: meta("198.51.100.9"), headers: new Headers() });
      expect(elsewhere.ok).toBe(true);
    });
  });

  it("marks a shared computer session", async () => {
    await isolated(async (tx) => {
      const { d, userId } = await funkeWithPassword(tx);
      await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: true, meta: meta(), headers: new Headers() });
      const [row] = await tx.select().from(t.session).where(eq(t.session.userId, userId));
      expect(row.sharedDevice).toBe(true);
    });
  });
});

describe("AC-9, AC-13: our team's login tools", () => {
  it("asks before linking a phone that already has a login", async () => {
    await isolated(async (tx) => {
      const { d, admin, userId } = await funkeWithPassword(tx);
      // School B has a staff member with the same phone (Funke teaches at both).
      const funkeB = await staffNamed(tx, b, "Funke Adewale");
      const first = await createLoginForStaff(d, { schoolId: b.schoolId, staffId: funkeB.id, confirmSamePerson: false, actorUserId: admin.id });
      expect(first).toMatchObject({ ok: false, reason: "confirm", existing: { name: "Mrs Funke Adewale", schools: ["Test School A"] } });
      const second = await createLoginForStaff(d, { schoolId: b.schoolId, staffId: funkeB.id, confirmSamePerson: true, actorUserId: admin.id });
      expect(second).toEqual({ ok: true, userId, reused: true });
    });
  });

  it("switching a login off ends its sessions and links and stops sign in", async () => {
    await isolated(async (tx) => {
      const { d, admin, userId } = await funkeWithPassword(tx);
      await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: false, meta: meta(), headers: new Headers() });
      await makeSetupLink(d, { userId, kind: "reset", actorUserId: admin.id });
      await setLoginEnabled(d, { userId, enabled: false, actorUserId: admin.id });
      expect(await tx.select().from(t.session).where(eq(t.session.userId, userId))).toHaveLength(0);
      expect(await tx.select().from(t.verification).where(eq(t.verification.value, userId))).toHaveLength(0);
      const attempt = await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: false, meta: meta("192.0.2.1"), headers: new Headers() });
      expect(attempt).toEqual({ ok: false, reason: "wrong" });
    });
  });

  it("changing a phone moves the login and ends everything open", async () => {
    await isolated(async (tx) => {
      const { d, admin, userId } = await funkeWithPassword(tx);
      await signInWithPhone(d, { phone: "08031234567", password: "kano26", sharedDevice: false, meta: meta(), headers: new Headers() });
      expect(await changePhone(d, { userId, newPhone: "0812 555 0000", actorUserId: admin.id })).toEqual({ ok: true });
      expect(await tx.select().from(t.session).where(eq(t.session.userId, userId))).toHaveLength(0);
      const moved = await signInWithPhone(d, { phone: "08125550000", password: "kano26", sharedDevice: false, meta: meta("192.0.2.2"), headers: new Headers() });
      expect(moved.ok).toBe(true);
    });
  });
});

describe("AC-11: the audit log", () => {
  it("records events and refuses changes to them", async () => {
    await isolated(async (tx) => {
      const { userId } = await funkeWithPassword(tx);
      const events = await tx.select({ kind: t.authEvent.kind }).from(t.authEvent).where(eq(t.authEvent.userId, userId));
      expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["login_created", "setup_link_created", "password_set"]));
      const failure = await refusedBy(tx, (sp) => sp.execute(sql`update auth_event set kind = 'sign_in' where user_id = ${userId}`)).catch((e: Error) => e.message);
      // The trigger raises a plain error rather than a named constraint.
      expect(String(failure)).toMatch(/add only|auth_event/);
    });
  });
});

describe("AC-8, AC-9: teachers reach only their class; view as is read only", () => {
  async function teacherCtx(tx: Executor, f: Fixture, fullName: string, readOnly = false) {
    const member = await staffNamed(tx, f, fullName);
    return schoolContext({ schoolId: f.schoolId, userId: "teacher-user", db: tx, actor: { kind: "teacher", staffId: member.id, readOnly } });
  }

  it("lets a form teacher read and save their own class only", async () => {
    await isolated(async (tx) => {
      const funke = await teacherCtx(tx, a, "Funke Adewale"); // form teacher of JSS 2 Gold
      const maths = a.offer("JSS 2 Gold", "Mathematics");
      const sheet = await getScoreSheet(funke, { termId: a.term(1).id, classSubjectId: maths.id });
      expect(sheet.students).toHaveLength(16);
      const saved = await saveScores(funke, {
        termId: a.term(1).id,
        classSubjectId: maths.id,
        saveId: crypto.randomUUID(),
        changes: [{ studentId: a.student("Ojo Precious").id, componentKey: "ca1", expected: null, value: "12" }],
      });
      expect(saved.changed).toBe(1);

      // SS 1 Science belongs to Mr Ibrahim Musa.
      const physics = a.offer("SS 1 Science", "Physics");
      await expect(getScoreSheet(funke, { termId: a.term(1).id, classSubjectId: physics.id })).rejects.toBeInstanceOf(NotFound);
      await expect(
        saveScores(funke, {
          termId: a.term(1).id,
          classSubjectId: physics.id,
          saveId: crypto.randomUUID(),
          changes: [{ studentId: a.student("Udo Godswill").id, componentKey: "ca1", expected: null, value: "10" }],
        }),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(listClassStudents(funke, { termId: a.term(1).id, classId: a.cls("SS 1 Science").id })).rejects.toBeInstanceOf(NotFound);
      await expect(getStudentSessionResults(funke, { studentId: a.student("Udo Godswill").id, sessionId: a.session.id })).rejects.toBeInstanceOf(NotFound);
      expect((await getStudentSessionResults(funke, { studentId: a.student("Ojo Precious").id, sessionId: a.session.id }))[0].enrolment).not.toBeNull();
      // School setup is not a teacher's job in Release 1.
      await expect(setCurrentTerm(funke, { termId: a.term(2).id })).rejects.toBeInstanceOf(NotFound);
    });
  });

  it("refuses every save while viewing as, and changes nothing", async () => {
    await isolated(async (tx) => {
      const viewingAs = await teacherCtx(tx, a, "Funke Adewale", true);
      const maths = a.offer("JSS 2 Gold", "Mathematics");
      // Reading works, so our team sees exactly what the teacher sees.
      await getScoreSheet(viewingAs, { termId: a.term(1).id, classSubjectId: maths.id });
      await expect(
        saveScores(viewingAs, {
          termId: a.term(1).id,
          classSubjectId: maths.id,
          saveId: crypto.randomUUID(),
          changes: [{ studentId: a.student("Okon Emem").id, componentKey: "ca1", expected: "15", value: "1" }],
        }),
      ).rejects.toBeInstanceOf(ReadOnlySession);
      const sheet = await getScoreSheet(viewingAs, { termId: a.term(1).id, classSubjectId: maths.id });
      expect(sheet.scores[a.student("Okon Emem").id].ca1).toBe("15");
    });
  });
});
