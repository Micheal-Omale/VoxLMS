"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeftIcon, DoorOpenIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassRoster } from "@/server/data/students";

import { moveStudentAction, removeStudentAction, saveStudentAction, setStudentLeftAction } from "../../../enrol-actions";
import { ConfirmFix } from "../../confirm-fix";
import { Parents } from "./parents";
import { PassportPhoto } from "./passport-photo";

type Student = ClassRoster["students"][number];

/** Today in Lagos as YYYY-MM-DD, for the "left on" date. */
const longDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const showDate = (iso: string) => (iso ? longDate.format(new Date(`${iso}T00:00:00Z`)) : iso);

const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * Everything about one student (spec 0008, AC-7 to AC-12): a side panel on a
 * computer, a full screen sheet on a phone. Photos and parents are our team's only.
 */
export function StudentPanel({ schoolId, roster, student, onClose }: { schoolId: string; roster: ClassRoster; student: Student | null; onClose: () => void }) {
  return (
    <Drawer open={student !== null} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:34rem] data-[swipe-direction=right]:rounded-l-none sm:data-[swipe-direction=right]:rounded-l-xl">
        {student && <PanelBody key={student.studentId} schoolId={schoolId} roster={roster} student={student} onClose={onClose} />}
      </DrawerContent>
    </Drawer>
  );
}

function PanelBody({ schoolId, roster, student, onClose }: { schoolId: string; roster: ClassRoster; student: Student; onClose: () => void }) {
  const left = student.withdrawnOn !== null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-rule px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DrawerTitle className="type-title text-foreground">
            <span className="font-extrabold">{student.surname}</span> <span className="font-normal">{student.otherNames}</span>
          </DrawerTitle>
          <DrawerDescription className="type-caption text-muted-foreground">
            <span className="type-figure">{student.studentNo}</span>
            {student.admissionNo && (
              <>
                {" · Admission no. "}
                <span className="type-figure">{student.admissionNo}</span>
              </>
            )}
            {" · "}
            {roster.cls.name}
            {left && " · Left this term"}
          </DrawerDescription>
        </div>
        <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
          <XIcon />
        </DrawerClose>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 py-5 sm:px-6">
        <Details schoolId={schoolId} student={student} />
        <PassportPhoto schoolId={schoolId} studentId={student.studentId} assetId={student.photoAssetId} name={`${student.surname} ${student.otherNames}`} />
        <Parents schoolId={schoolId} student={student} />
        {roster.electiveSubjects.length > 0 && (
          <section aria-labelledby="panel-electives" className="flex flex-col gap-2">
            <h3 id="panel-electives" className="type-heading">
              Electives in {roster.term?.sessionName}
            </h3>
            <p className="text-muted-foreground">{student.electives.length > 0 ? student.electives.map((e) => e.name).join(", ") : "None ticked yet."}</p>
            <p className="type-caption text-muted-foreground">Change them in the Electives grid under the register.</p>
          </section>
        )}
        {!left && <ClassActions schoolId={schoolId} roster={roster} student={student} onDone={onClose} />}
      </div>
    </div>
  );
}

function Details({ schoolId, student }: { schoolId: string; student: Student }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = { surname: student.surname, otherNames: student.otherNames, gender: student.gender as string, admissionNo: student.admissionNo ?? "", house: student.house ?? "" };
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => values[k] !== initial[k]);
  const set = (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const fieldError = (field: string) => (error?.field === field ? error.error : null);

  function save(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveStudentAction(schoolId, student.studentId, values);
      if (!result.ok) {
        setError({ field: result.field, error: result.error });
        return;
      }
      setError(null);
      toast.add({ title: "Details saved", type: "success" });
      router.refresh();
    });
  }

  const field = (key: "surname" | "otherNames" | "admissionNo" | "house", label: string, extra: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <Field data-invalid={fieldError(key) ? true : undefined}>
      <FieldLabel htmlFor={`panel-${key}`}>{label}</FieldLabel>
      <Input id={`panel-${key}`} value={values[key]} onChange={set(key)} autoComplete="off" aria-invalid={!!fieldError(key)} {...extra} />
      {fieldError(key) ? <FieldError>{fieldError(key)}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );

  return (
    <section aria-labelledby="panel-details" className="flex flex-col gap-4">
      <h3 id="panel-details" className="type-heading">
        Details
      </h3>
      <form onSubmit={save} className="flex flex-col gap-5">
        <FieldGroup>
          <div className="grid gap-5 sm:grid-cols-2">
            {field("surname", "Surname", { required: true, maxLength: 40 })}
            {field("otherNames", "Other names", { required: true, maxLength: 80 })}
          </div>
          <Field data-invalid={fieldError("gender") ? true : undefined}>
            <FieldLabel id="panel-gender">Gender</FieldLabel>
            <ToggleGroup aria-labelledby="panel-gender" value={[values.gender]} onValueChange={(v) => v[0] && setValues((x) => ({ ...x, gender: String(v[0]) }))} variant="outline" className="w-full sm:w-auto">
              <ToggleGroupItem value="male" className="flex-1 sm:flex-none">
                Boy
              </ToggleGroupItem>
              <ToggleGroupItem value="female" className="flex-1 sm:flex-none">
                Girl
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            {field("admissionNo", "Admission no.", { maxLength: 30, className: "type-figure" }, "The school’s own number, if it has one.")}
            {field("house", "House", { maxLength: 30 }, "Optional, like Blue or Aggrey.")}
          </div>
        </FieldGroup>
        {changed && (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setValues(initial);
                setError(null);
              }}
            >
              Undo changes
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Save details
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}

/** Move, left and remove (AC-10 to AC-12). */
function ClassActions({ schoolId, roster, student, onDone }: { schoolId: string; roster: ClassRoster; student: Student; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [leftOn, setLeftOn] = useState(lagosToday());
  const [confirm, setConfirm] = useState<"none" | "leave" | "remove">("none");
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const name = `${student.surname} ${student.otherNames}`;
  const target = roster.otherClasses.find((c) => c.id === moveTo);
  const items = roster.otherClasses.map((c) => ({ value: c.id, label: c.name }));
  const termStart = roster.term?.startsOn;

  function act(fn: () => Promise<{ ok: boolean; field?: string; error?: string }>, done: string) {
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        setError({ field: result.field ?? "", error: result.error ?? "That didn’t work. Try again." });
        return;
      }
      toast.add({ title: done, type: "success" });
      onDone();
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="panel-class" className="flex flex-col gap-5 border-t border-rule pt-6">
      <h3 id="panel-class" className="type-heading">
        Class
      </h3>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="move-to">Move to another class</FieldLabel>
        {student.scores > 0 ? (
          <p className="type-caption text-muted-foreground">
            {name} has <span className="type-figure">{student.scores}</span> {student.scores === 1 ? "score" : "scores"} in {roster.cls.name} this term, so stays in this class. Clear those scores first to move them.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select items={items} value={moveTo} onValueChange={(v) => setMoveTo(v ? String(v) : null)}>
              <SelectTrigger id="move-to" className="w-full sm:flex-1">
                <SelectValue placeholder="Choose a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!moveTo || pending} onClick={() => moveTo && act(() => moveStudentAction(schoolId, student.enrolmentId, moveTo), `${name} moved to ${target?.name}`)}>
              <ArrowRightLeftIcon data-icon="inline-start" />
              Move
            </Button>
          </div>
        )}
        {error?.field === "class" && <FieldError>{error.error}</FieldError>}
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel htmlFor="left-on">Left the school</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="left-on" type="date" value={leftOn} min={termStart} max={lagosToday()} onChange={(e) => setLeftOn(e.target.value)} className="type-figure sm:flex-1" aria-invalid={error?.field === "leftOn"} />
          <Button variant="outline" disabled={!leftOn || pending} onClick={() => setConfirm("leave")}>
            <DoorOpenIcon data-icon="inline-start" />
            Mark as left
          </Button>
        </div>
        {error?.field === "leftOn" ? (
          <FieldError>{error.error}</FieldError>
        ) : (
          <FieldDescription>They leave this term’s list and position counts. Earlier terms stay as they were.</FieldDescription>
        )}
      </div>

      {student.canRemove && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-input p-4">
          <p className="type-caption text-muted-foreground">Added by mistake, or twice? Nothing has been recorded for {name} yet, so they can be removed completely.</p>
          <Button variant="destructive" disabled={pending} onClick={() => setConfirm("remove")}>
            <Trash2Icon data-icon="inline-start" />
            Remove, added by mistake
          </Button>
          {error?.field === "student" && <FieldError>{error.error}</FieldError>}
        </div>
      )}

      {error && !["class", "leftOn", "student"].includes(error.field) && <FieldError>{error.error}</FieldError>}

      {pending && (
        <p role="status" className="flex items-center gap-2 type-caption text-muted-foreground">
          <Spinner /> Saving
        </p>
      )}

      <ConfirmFix
        confirm={
          confirm === "leave"
            ? { title: `Mark ${name} as left?`, description: `From ${showDate(leftOn)}. They drop off ${roster.cls.name}’s list, the teacher’s list and position counts. You can undo this from “Left this term”.`, action: "Mark as left", removes: true }
            : confirm === "remove"
              ? { title: `Remove ${name} completely?`, description: "Their enrolment, electives, parent links and photo are deleted too. Their student number is never used again.", action: "Remove student", removes: true }
              : null
        }
        onCancel={() => setConfirm("none")}
        onConfirm={() => {
          const which = confirm;
          setConfirm("none");
          setError(null);
          if (which === "leave") act(() => setStudentLeftAction(schoolId, student.studentId, leftOn), `${name} is marked as left`);
          else act(() => removeStudentAction(schoolId, student.studentId), `${name} removed`);
        }}
      />
    </section>
  );
}
