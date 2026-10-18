import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveScoresAction, scoreHistoryAction } from "@/app/[school]/classes/score-actions";
import { getActionViewer, schoolContextFor } from "@/server/auth/viewer";
import {
  Conflict,
  getScoreHistory,
  getScoreSheet,
  InvalidScore,
  NoCurrentTerm,
  NotFound,
  NotTakingSubject,
  ReadOnlySession,
  saveScores,
  ScoreAboveMaximum,
  TermClosed,
} from "@/server/data";

// Spec 0009: the score actions never throw at the sheet. Every refusal comes
// back as a result it can act on (AC-5 to AC-8, AC-13). The viewer and the
// data layer are mocked; their own rules have tests in test/score-entry.test.ts.

vi.mock("@/server/auth/viewer", () => ({ getActionViewer: vi.fn(), schoolContextFor: vi.fn() }));
vi.mock("@/server/data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/data")>();
  return { ...real, saveScores: vi.fn(), getScoreSheet: vi.fn(), getScoreHistory: vi.fn() };
});

const viewer = vi.mocked(getActionViewer);
const resolve = vi.mocked(schoolContextFor);
const save = vi.mocked(saveScores);
const sheet = vi.mocked(getScoreSheet);
const history = vi.mocked(getScoreHistory);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  termId: ID(1),
  classSubjectId: ID(2),
  saveId: ID(3),
  changes: [{ studentId: ID(4), componentKey: "ca1", expected: "10", value: "12" }],
};
const ctx = { schoolId: "school", userId: "u", actor: { kind: "admin" as const, readOnly: false } };
const freshSheet = {
  students: [{ studentId: ID(4), studentNo: 7, admissionNo: null, surname: "Okon", otherNames: "Emem" }],
  components: [{ key: "ca1", label: "CA 1", max: 20 }],
  gradeBands: [],
  scores: { [ID(4)]: { ca1: "15" } },
};

beforeEach(() => {
  vi.resetAllMocks();
  viewer.mockResolvedValue({ userId: "u" } as Awaited<ReturnType<typeof getActionViewer>>);
  resolve.mockResolvedValue({ ctx, school: { code: "GHS" } } as unknown as Awaited<ReturnType<typeof schoolContextFor>>);
  sheet.mockResolvedValue(freshSheet as unknown as Awaited<ReturnType<typeof getScoreSheet>>);
});

describe("saveScoresAction: who is asking (AC-5, AC-13)", () => {
  it("answers signedOut, instead of redirecting, when the session has ended", async () => {
    viewer.mockResolvedValue(null);
    expect(await saveScoresAction("gracehigh", input)).toEqual({ kind: "signedOut" });
    expect(save).not.toHaveBeenCalled();
  });

  it("answers notFound for a school the viewer can't reach", async () => {
    resolve.mockResolvedValue(null);
    expect(await saveScoresAction("otherschool", input)).toEqual({ kind: "notFound" });
  });

  it("answers notFound for ids that are not ids, before any database work", async () => {
    for (const bad of [
      { ...input, termId: "1 or 1=1" },
      { ...input, saveId: "x" },
      { ...input, changes: "nope" as unknown as typeof input.changes },
      { ...input, changes: [{ ...input.changes[0], studentId: "x" }] },
      { ...input, changes: [{ ...input.changes[0], value: 12 as unknown as string }] },
    ]) {
      expect(await saveScoresAction("gracehigh", bad)).toEqual({ kind: "notFound" });
    }
    expect(save).not.toHaveBeenCalled();
  });
});

describe("saveScoresAction: results the sheet acts on", () => {
  it("returns the save time when the save lands (AC-5)", async () => {
    save.mockResolvedValue({ changed: 1, updatedAt: new Date("2026-10-17T13:14:00Z") });
    expect(await saveScoresAction("gracehigh", input)).toEqual({ kind: "saved", updatedAt: "2026-10-17T13:14:00.000Z" });
    expect(save).toHaveBeenCalledWith(ctx, input);
  });

  it("returns a conflict with the students and a freshly read sheet (AC-7)", async () => {
    save.mockRejectedValue(new Conflict([ID(4)]));
    const result = await saveScoresAction("gracehigh", input);
    expect(result).toEqual({
      kind: "conflict",
      studentIds: [ID(4)],
      sheet: { students: [{ id: ID(4), surname: "Okon", otherNames: "Emem", number: "GHS-0007" }], columns: freshSheet.components, scale: [], scores: freshSheet.scores },
    });
    expect(sheet).toHaveBeenCalledWith(ctx, { termId: ID(1), classSubjectId: ID(2) });
  });

  it("returns stale with the removed students when someone left the subject (AC-8)", async () => {
    save.mockRejectedValue(new NotTakingSubject([ID(9)]));
    const result = await saveScoresAction("gracehigh", input);
    expect(result).toMatchObject({ kind: "stale", removedStudentIds: [ID(9)] });
  });

  it("returns stale with no removals when a maximum was lowered (AC-8)", async () => {
    save.mockRejectedValue(new ScoreAboveMaximum(ID(4), "CA 1", "10", "12"));
    expect(await saveScoresAction("gracehigh", input)).toMatchObject({ kind: "stale", removedStudentIds: [] });
  });

  it("answers notFound when the sheet can no longer be read for a reload", async () => {
    save.mockRejectedValue(new Conflict([ID(4)]));
    sheet.mockRejectedValue(new NotFound("Class"));
    expect(await saveScoresAction("gracehigh", input)).toEqual({ kind: "notFound" });
  });

  it.each([
    ["closed", new TermClosed(), { kind: "closed" }],
    ["readOnly", new ReadOnlySession(), { kind: "readOnly" }],
    ["invalid", new InvalidScore(ID(4), "ca1", "999", "bad"), { kind: "invalid", studentId: ID(4), componentKey: "ca1" }],
    ["notFound (lost the class)", new NotFound("Class"), { kind: "notFound" }],
    ["notFound (no current term)", new NoCurrentTerm(), { kind: "notFound" }],
  ])("turns a refusal into %s (AC-6, AC-13)", async (_name, error, expected) => {
    save.mockRejectedValue(error);
    expect(await saveScoresAction("gracehigh", input)).toEqual(expected);
  });

  it("lets an unexpected error through, so the sheet reports a failed save", async () => {
    save.mockRejectedValue(new Error("connection reset"));
    await expect(saveScoresAction("gracehigh", input)).rejects.toThrow("connection reset");
  });
});

describe("scoreHistoryAction (AC-11, AC-13)", () => {
  const ref = { termId: ID(1), classSubjectId: ID(2), studentId: ID(4) };

  it("returns each part's changes with times as text", async () => {
    history.mockResolvedValue([
      { key: "ca1", label: "CA 1", changes: [{ oldValue: null, newValue: "12", changedAt: new Date("2026-10-17T13:14:00Z"), by: "Mrs Funke Adewale" }] },
    ]);
    expect(await scoreHistoryAction("gracehigh", ref)).toEqual({
      ok: true,
      parts: [{ key: "ca1", label: "CA 1", changes: [{ oldValue: null, newValue: "12", changedAt: "2026-10-17T13:14:00.000Z", by: "Mrs Funke Adewale" }] }],
    });
  });

  it("answers signedOut and notFound instead of throwing", async () => {
    viewer.mockResolvedValueOnce(null);
    expect(await scoreHistoryAction("gracehigh", ref)).toEqual({ ok: false, kind: "signedOut" });
    expect(await scoreHistoryAction("gracehigh", { ...ref, studentId: "x" })).toEqual({ ok: false, kind: "notFound" });
    history.mockRejectedValue(new NotFound("Student"));
    expect(await scoreHistoryAction("gracehigh", ref)).toEqual({ ok: false, kind: "notFound" });
  });
});
