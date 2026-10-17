"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, StarIcon, UserPlusIcon, UserRoundMinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNigerianPhone } from "@/lib/phone";
import type { GuardianMatch, ParentOf } from "@/server/data/guardians";
import type { ClassRoster } from "@/server/data/students";

import { addGuardianAction, makePrimaryGuardianAction, saveGuardianAction, unlinkGuardianAction } from "../../../enrol-actions";
import { ConfirmFix } from "../../confirm-fix";

type Student = ClassRoster["students"][number];
type Values = { fullName: string; phone: string; relationship: string };

const RELATIONSHIP = { mother: "Mother", father: "Father", guardian: "Guardian" } as const;
const childLabel = (c: { name: string; className: string | null }) => (c.className ? `${c.name} (${c.className})` : c.name);

/** A student's parents (spec 0008, AC-8): at most two, one primary; a shared phone offers the parent already here. */
export function Parents({ schoolId, student }: { schoolId: string; student: Student }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<ParentOf | null>(null);
  const [removing, setRemoving] = useState<ParentOf | null>(null);
  const [adding, setAdding] = useState(false);
  const name = `${student.surname} ${student.otherNames}`;

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.add({ title: result.error ?? "That didn’t work. Try again.", type: "error" });
        return;
      }
      toast.add({ title: done, type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="panel-parents" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="panel-parents" className="type-heading">
          Parents
        </h3>
        <span className="type-caption text-muted-foreground">At most two</span>
      </div>

      {student.parents.length === 0 && !adding && (
        <p className="rounded-lg border border-warning/30 bg-warning-wash p-3 text-foreground">No parent yet. Add the parent the school would call first.</p>
      )}

      {student.parents.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-rule">
          {student.parents.map((p) => (
            <li key={p.guardianId} className="flex flex-col gap-2 border-b border-rule p-3 last:border-b-0">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{p.fullName}</span>
                    {p.isPrimary && <Badge className="bg-success-wash text-success">Primary</Badge>}
                  </span>
                  <span className="type-caption text-muted-foreground">
                    {RELATIONSHIP[p.relationship]} · <span className="type-figure">{formatNigerianPhone(p.phone)}</span>
                  </span>
                  {p.alsoParentOf.length > 0 && <span className="type-caption text-foreground">Also parent of {p.alsoParentOf.map(childLabel).join(", ")}</span>}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Edit ${p.fullName}`} disabled={pending} onClick={() => setEditing(p)}>
                  <PencilIcon />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {!p.isPrimary && (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => act(() => makePrimaryGuardianAction(schoolId, student.studentId, p.guardianId), `${p.fullName} is now the primary parent`)}>
                    <StarIcon data-icon="inline-start" />
                    Make primary
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => setRemoving(p)} className="text-destructive hover:text-destructive">
                  <UserRoundMinusIcon data-icon="inline-start" />
                  Remove from this student
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {student.parents.length < 2 &&
        (adding ? (
          <AddParent schoolId={schoolId} studentId={student.studentId} first={student.parents.length === 0} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
            <UserPlusIcon data-icon="inline-start" />
            {student.parents.length === 0 ? "Add a parent" : "Add a second parent"}
          </Button>
        ))}

      <EditParent schoolId={schoolId} studentId={student.studentId} parent={editing} onClose={() => setEditing(null)} />
      <ConfirmFix
        confirm={
          removing
            ? {
                title: `Remove ${removing.fullName} from ${name}?`,
                description:
                  removing.alsoParentOf.length > 0
                    ? `They stay the parent of ${removing.alsoParentOf.map(childLabel).join(", ")}.`
                    : `${removing.fullName} has no other child at this school, so their record is deleted.`,
                action: "Remove parent",
                removes: true,
              }
            : null
        }
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const p = removing!;
          setRemoving(null);
          act(() => unlinkGuardianAction(schoolId, student.studentId, p.guardianId), `${p.fullName} removed from ${name}`);
        }}
      />
    </section>
  );
}

function ParentFields({ values, setValues, error, idPrefix }: { values: Values; setValues: (v: Values) => void; error: { field: string; error: string } | null; idPrefix: string }) {
  const fieldError = (field: string) => (error?.field === field ? error.error : null);
  return (
    <FieldGroup>
      <Field data-invalid={fieldError("fullName") ? true : undefined}>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Full name</FieldLabel>
        <Input id={`${idPrefix}-name`} value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} required minLength={3} maxLength={80} autoComplete="off" placeholder="Mrs Ngozi Okafor" aria-invalid={!!fieldError("fullName")} />
        {fieldError("fullName") && <FieldError>{fieldError("fullName")}</FieldError>}
      </Field>
      <Field data-invalid={fieldError("phone") ? true : undefined}>
        <FieldLabel htmlFor={`${idPrefix}-phone`}>Phone number</FieldLabel>
        <Input id={`${idPrefix}-phone`} value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} type="tel" inputMode="tel" required placeholder="0803 123 4567" className="type-figure" aria-invalid={!!fieldError("phone")} />
        {fieldError("phone") && <FieldError>{fieldError("phone")}</FieldError>}
      </Field>
      <Field data-invalid={fieldError("relationship") ? true : undefined}>
        <FieldLabel id={`${idPrefix}-relationship`}>Relationship</FieldLabel>
        <ToggleGroup aria-labelledby={`${idPrefix}-relationship`} value={values.relationship ? [values.relationship] : []} onValueChange={(v) => v[0] && setValues({ ...values, relationship: String(v[0]) })} variant="outline" className="w-full">
          {(Object.keys(RELATIONSHIP) as (keyof typeof RELATIONSHIP)[]).map((r) => (
            <ToggleGroupItem key={r} value={r} className="flex-1">
              {RELATIONSHIP[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {fieldError("relationship") && <FieldError>{fieldError("relationship")}</FieldError>}
      </Field>
    </FieldGroup>
  );
}

function AddParent({ schoolId, studentId, first, onDone }: { schoolId: string; studentId: string; first: boolean; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Values>({ fullName: "", phone: "", relationship: "" });
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const [matches, setMatches] = useState<GuardianMatch[] | null>(null);

  function save(choice: { linkTo?: string; newParent?: boolean } = {}) {
    if (!values.relationship) {
      setError({ field: "relationship", error: "Choose mother, father or guardian." });
      return;
    }
    start(async () => {
      const result = await addGuardianAction(schoolId, studentId, { ...values, ...choice });
      if (!result.ok) {
        if ("matches" in result) setMatches(result.matches);
        else {
          setMatches(null);
          setError({ field: result.field, error: result.error });
        }
        return;
      }
      setMatches(null);
      const linked = choice.linkTo ? matches?.find((m) => m.guardianId === choice.linkTo)?.fullName : null;
      toast.add({ title: linked ? `Linked to ${linked}` : `${values.fullName.trim()} added`, description: first ? "They are the primary parent." : undefined, type: "success" });
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="flex flex-col gap-4 rounded-lg border border-rule bg-muted/40 p-4"
      >
        <ParentFields values={values} setValues={setValues} error={error} idPrefix="add-parent" />
        {error && !["fullName", "phone", "relationship"].includes(error.field) && <FieldError>{error.error}</FieldError>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Save parent
          </Button>
        </div>
      </form>

      <Dialog open={matches !== null} onOpenChange={(o) => !o && setMatches(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Same person?</DialogTitle>
            <DialogDescription>A parent at this school already has this phone number. Brothers and sisters share one parent record, so a changed number is fixed once.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {matches?.map((m) => (
              <li key={m.guardianId} className="flex flex-col gap-2 rounded-lg border border-rule p-3">
                <span>
                  <strong>{m.fullName}</strong>, parent of {m.children.map(childLabel).join(", ")}
                </span>
                <Button size="sm" className="self-start" disabled={pending} onClick={() => save({ linkTo: m.guardianId })}>
                  Yes, link {m.fullName}
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => save({ newParent: true })}>
              No, save a new parent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditParent({ schoolId, studentId, parent, onClose }: { schoolId: string; studentId: string; parent: ParentOf | null; onClose: () => void }) {
  return (
    <Dialog open={parent !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{parent && <EditParentForm key={parent.guardianId} schoolId={schoolId} studentId={studentId} parent={parent} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditParentForm({ schoolId, studentId, parent, onClose }: { schoolId: string; studentId: string; parent: ParentOf; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Values>({ fullName: parent.fullName, phone: formatNigerianPhone(parent.phone), relationship: parent.relationship });
  const [error, setError] = useState<{ field: string; error: string } | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await saveGuardianAction(schoolId, studentId, parent.guardianId, values);
          if (!result.ok) {
            setError({ field: result.field, error: result.error });
            return;
          }
          toast.add({ title: "Parent saved", type: "success" });
          onClose();
          router.refresh();
        });
      }}
      className="flex flex-col gap-5"
    >
      <DialogHeader>
        <DialogTitle>Edit {parent.fullName}</DialogTitle>
        <DialogDescription>
          {parent.alsoParentOf.length > 0 ? `Also parent of ${parent.alsoParentOf.map(childLabel).join(", ")}. The name and phone change for every child.` : "Fix the name, phone or relationship."}
        </DialogDescription>
      </DialogHeader>
      <ParentFields values={values} setValues={setValues} error={error} idPrefix="edit-parent" />
      {error && !["fullName", "phone", "relationship"].includes(error.field) && <FieldError>{error.error}</FieldError>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Save parent
        </Button>
      </DialogFooter>
    </form>
  );
}
