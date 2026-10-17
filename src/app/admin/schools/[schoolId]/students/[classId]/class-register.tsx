"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, PlusIcon, UndoIcon, UserRoundXIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassRoster } from "@/server/data/students";

import { addStudentAction, setStudentLeftAction } from "../../../enrol-actions";
import { StudentPanel } from "./student-panel";

type Student = ClassRoster["students"][number];

const dayMonth = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "UTC" });

/** The class register for the current term (spec 0008, AC-5 to AC-8, AC-11): tap a student for their panel. */
export function ClassRegister({ schoolId, roster }: { schoolId: string; roster: ClassRoster }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const open = roster.students.filter((s) => !s.withdrawnOn);
  const left = roster.students.filter((s) => s.withdrawnOn);
  const selected = roster.students.find((s) => s.studentId === selectedId) ?? null;
  const noParent = open.filter((s) => s.parents.length === 0).length;
  const boys = open.filter((s) => s.gender === "male").length;

  return (
    <section aria-labelledby="register-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="register-heading" className="type-heading">
          Register
        </h2>
        {open.length > 0 && (
          <p className="type-caption text-muted-foreground">
            <span className="type-figure">{boys}</span> {boys === 1 ? "boy" : "boys"} · <span className="type-figure">{open.length - boys}</span>{" "}
            {open.length - boys === 1 ? "girl" : "girls"}
            {noParent > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-warning">
                  <span className="type-figure">{noParent}</span> with no parent yet
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="ruled-sheet border-y border-rule sm:rounded-xl sm:border-x">
        <div
          aria-hidden="true"
          className="hidden grid-cols-[var(--margin-x)_minmax(0,1fr)_10rem_5rem] items-end gap-x-3 border-b border-rule py-2.5 pr-4 type-caption font-semibold text-muted-foreground md:grid"
        >
          <span />
          <span className="pl-3">Student</span>
          <span>Admission no.</span>
          <span>Gender</span>
        </div>

        {open.length === 0 ? (
          <p className="py-8 pr-4 pl-[calc(var(--margin-x)+0.75rem)] text-muted-foreground">
            No students in {roster.cls.name} yet. Add them one at a time below: type the surname, other names and gender, then press Enter.
          </p>
        ) : (
          <ol aria-label={`${roster.cls.name} students`}>
            {open.map((s, i) => (
              <li key={s.studentId} className="border-b border-rule">
                <button
                  type="button"
                  onClick={() => setSelectedId(s.studentId)}
                  className="grid min-h-12 w-full grid-cols-[var(--margin-x)_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 pr-4 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none md:grid-cols-[var(--margin-x)_minmax(0,1fr)_10rem_5rem]"
                >
                  <span aria-hidden="true" className="pr-2.5 text-right type-caption type-figure text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col pl-3">
                    <span className="truncate">
                      <span className="font-bold">{s.surname}</span> {s.otherNames}
                    </span>
                    <span className="type-caption type-figure text-muted-foreground md:hidden">
                      {s.admissionNo ?? s.studentNo} · {s.gender === "male" ? "Boy" : "Girl"}
                    </span>
                  </span>
                  <span className="hidden type-figure text-muted-foreground md:block">{s.admissionNo ?? <span className="type-caption">{s.studentNo}</span>}</span>
                  <span className="flex items-center justify-end gap-2 md:justify-between">
                    <span className="hidden md:inline">{s.gender === "male" ? "Boy" : "Girl"}</span>
                    <span className="flex items-center gap-1.5">
                      {s.photoAssetId && <CameraIcon aria-label="Has a photo" className="size-3.5 text-muted-foreground" />}
                      {s.parents.length === 0 && (
                        <Badge className="bg-warning-wash text-warning">
                          <UserRoundXIcon data-icon="inline-start" aria-hidden="true" />
                          <span className="md:sr-only">No parent yet</span>
                        </Badge>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {roster.cls.isActive && <QuickAdd schoolId={schoolId} classId={roster.cls.id} className={roster.cls.name} next={open.length + 1} />}
      </div>

      {left.length > 0 && <LeftThisTerm schoolId={schoolId} students={left} />}

      <StudentPanel schoolId={schoolId} roster={roster} student={selected} onClose={() => setSelectedId(null)} />
    </section>
  );
}

const blank = { surname: "", otherNames: "", gender: "", admissionNo: "" };

/**
 * One row under the register for typing the next student (AC-5, AC-6). Enter
 * saves; the row clears and the cursor goes back to surname. A save that fails
 * keeps what was typed.
 */
function QuickAdd({ schoolId, classId, className, next }: { schoolId: string; classId: string; className: string; next: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState(blank);
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const surnameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function save(confirmDuplicate: boolean) {
    if (!values.gender) {
      setError({ field: "gender", error: "Choose boy or girl." });
      return;
    }
    start(async () => {
      const result = await addStudentAction(schoolId, classId, { ...values, confirmDuplicate });
      if (!result.ok) {
        if ("needsConfirm" in result) setDuplicate(result.error);
        else setError({ field: result.field, error: result.error });
        return;
      }
      setDuplicate(null);
      setError(null);
      setValues(blank);
      toast.add({ title: `${values.surname.trim()} ${values.otherNames.trim()} added`, description: `Student number ${result.studentNo}.`, type: "success" });
      router.refresh();
      surnameRef.current?.focus();
    });
  }

  const set = (key: keyof typeof blank) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    if (error?.field === key) setError(null);
  };
  const invalid = (field: string) => (error?.field === field ? true : undefined);
  const label = "mb-1 block type-caption font-semibold text-muted-foreground";

  return (
    <>
      <form
        ref={formRef}
        aria-label={`Add a student to ${className}`}
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
        className="grid grid-cols-[var(--margin-x)_minmax(0,1fr)] gap-x-3 bg-accent/40 py-3 pr-4 sm:rounded-b-xl"
      >
        <span aria-hidden="true" className="row-span-2 flex items-start justify-end gap-0.5 pt-7 pr-2.5 type-caption type-figure text-primary">
          <PlusIcon className="size-3" />
          {next}
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 pl-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto_9rem_auto] md:items-end">
          <div>
            <label htmlFor="add-surname" className={label}>
              Surname
            </label>
            <Input ref={surnameRef} id="add-surname" value={values.surname} onChange={set("surname")} required autoComplete="off" autoCapitalize="words" enterKeyHint="next" aria-invalid={invalid("surname")} aria-describedby={error ? "add-error" : undefined} />
          </div>
          <div>
            <label htmlFor="add-other" className={label}>
              Other names
            </label>
            <Input id="add-other" value={values.otherNames} onChange={set("otherNames")} required autoComplete="off" autoCapitalize="words" enterKeyHint="next" aria-invalid={invalid("otherNames")} />
          </div>
          <div role="group" aria-labelledby="add-gender-label" className="col-span-2 md:col-span-1">
            <span id="add-gender-label" className={label}>
              Gender
            </span>
            <ToggleGroup
              value={values.gender ? [values.gender] : []}
              onValueChange={(v) => {
                if (v[0]) setValues((x) => ({ ...x, gender: String(v[0]) }));
                if (error?.field === "gender") setError(null);
              }}
              variant="outline"
              aria-invalid={invalid("gender")}
              onKeyDown={(event) => {
                // Typing B or G picks it, and Enter saves, so the hands stay on the keyboard.
                const key = event.key.toLowerCase();
                if (key === "b" || key === "m") setValues((x) => ({ ...x, gender: "male" }));
                else if (key === "g" || key === "f") setValues((x) => ({ ...x, gender: "female" }));
                else if (event.key === "Enter") {
                  event.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              className="w-full md:w-auto"
            >
              <ToggleGroupItem value="male" className="flex-1 md:flex-none">
                Boy
              </ToggleGroupItem>
              <ToggleGroupItem value="female" className="flex-1 md:flex-none">
                Girl
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="col-span-2 md:col-span-1">
            <label htmlFor="add-admission" className={label}>
              Admission no. <span className="font-normal">(optional)</span>
            </label>
            <Input id="add-admission" value={values.admissionNo} onChange={set("admissionNo")} autoComplete="off" autoCapitalize="characters" enterKeyHint="done" maxLength={30} className="type-figure" aria-invalid={invalid("admissionNo")} />
          </div>
          <Button type="submit" disabled={pending} className="col-span-2 md:col-span-1">
            {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            Add student
          </Button>
        </div>
        <div className="col-start-2 pl-3" aria-live="polite">
          {error && (
            <FieldError id="add-error" className="pt-2">
              {error.error}
            </FieldError>
          )}
        </div>
      </form>

      <AlertDialog open={duplicate !== null} onOpenChange={(o) => !o && setDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Same name in {className}</AlertDialogTitle>
            <AlertDialogDescription>{duplicate}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don’t add</AlertDialogCancel>
            <AlertDialogAction onClick={() => save(true)}>Add anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Students who left this term, with Undo (AC-11). */
function LeftThisTerm({ schoolId, students }: { schoolId: string; students: Student[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function undo(s: Student) {
    setBusyId(s.studentId);
    start(async () => {
      const result = await setStudentLeftAction(schoolId, s.studentId, null);
      setBusyId(null);
      if (!result.ok) {
        toast.add({ title: result.error, type: "error" });
        return;
      }
      toast.add({ title: `${s.surname} ${s.otherNames} is back in the class`, type: "success" });
      router.refresh();
    });
  }

  return (
    <details className="rounded-xl border border-rule bg-card">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 type-label text-muted-foreground">
        Left this term (<span className="type-figure">{students.length}</span>)
      </summary>
      <ul className="border-t border-rule">
        {students.map((s) => (
          <li key={s.studentId} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 last:border-b-0">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-muted-foreground">
                <span className="font-bold">{s.surname}</span> {s.otherNames}
              </span>
              {s.withdrawnOn && (
                <span className="type-caption text-muted-foreground">
                  Left on <time dateTime={s.withdrawnOn}>{dayMonth.format(new Date(`${s.withdrawnOn}T00:00:00Z`))}</time>
                </span>
              )}
            </span>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => undo(s)}>
              {busyId === s.studentId ? <Spinner data-icon="inline-start" /> : <UndoIcon data-icon="inline-start" />}
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
