"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { addTeacherAction } from "../../enrol-actions";
import { PasswordDialog, SamePersonDialog, SetupLinkDialog, useLoginActions } from "./login-dialogs";
import { TITLES } from "./titles";

const empty = { title: "", fullName: "", phone: "" };

/**
 * Adds a teacher and their login in one step, then shows their setup link
 * (spec 0008, AC-1). A phone that already has a login asks "same person?" first.
 */
export function AddTeacher({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const login = useLoginActions();
  const { dialog, setDialog, sendLink } = login;
  const [saving, start] = useTransition();
  const [values, setValues] = useState(empty);
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pending = saving || login.pending;
  const name = [values.title.trim(), values.fullName.trim()].filter(Boolean).join(" ");

  function save(confirmSamePerson: boolean) {
    start(async () => {
      const result = await addTeacherAction(schoolId, { ...values, confirmSamePerson });
      if (!result.ok) {
        if ("needsConfirm" in result && "existing" in result) {
          setDialog({ kind: "existing", existing: result.existing });
          return;
        }
        setDialog({ kind: "none" });
        setError({ field: result.field, error: result.error });
        return;
      }
      setDialog({ kind: "none" });
      setError(null);
      setValues(empty);
      nameRef.current?.focus();
      router.refresh();
      if (result.login === "new" || result.login === "existing_waiting") {
        toast.add({ title: `${name} added`, description: "Now hand them their setup link.", type: "success" });
        sendLink(result.userId, "first", name);
      } else if (result.login === "existing_active") {
        toast.add({ title: `${name} added`, description: "Linked to their existing login. They sign in with their own password.", type: "success" });
      } else {
        toast.add({ title: `${name} added`, description: "Their login is switched off. Switch it back on from their menu when they should sign in.", type: "success", timeout: 10000 });
      }
    });
  }

  const set = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const fieldError = (field: string) => (error?.field === field ? error.error : null);

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save(false);
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_12rem] sm:items-start">
          <Field data-invalid={fieldError("title") ? true : undefined}>
            <FieldLabel htmlFor="new-title">Title</FieldLabel>
            <Input id="new-title" value={values.title} onChange={set("title")} list="new-staff-titles" maxLength={20} placeholder="Mrs" aria-invalid={!!fieldError("title")} />
          </Field>
          <Field data-invalid={fieldError("fullName") ? true : undefined}>
            <FieldLabel htmlFor="new-name">Full name</FieldLabel>
            <Input
              ref={nameRef}
              id="new-name"
              value={values.fullName}
              onChange={set("fullName")}
              required
              minLength={3}
              maxLength={80}
              autoComplete="off"
              placeholder="Funke Adewale"
              aria-invalid={!!fieldError("fullName")}
              aria-describedby={fieldError("fullName") ? "new-name-error" : undefined}
            />
          </Field>
          <Field data-invalid={fieldError("phone") ? true : undefined}>
            <FieldLabel htmlFor="new-phone">Phone number</FieldLabel>
            <Input
              id="new-phone"
              value={values.phone}
              onChange={set("phone")}
              type="tel"
              inputMode="tel"
              required
              placeholder="0803 123 4567"
              className="type-figure"
              aria-invalid={!!fieldError("phone")}
              aria-describedby={fieldError("phone") ? "new-phone-error" : undefined}
            />
          </Field>
        </div>
        {error && (
          <FieldError id={`new-${error.field === "phone" ? "phone" : "name"}-error`} className="-mt-1">
            {error.error}
          </FieldError>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-caption text-muted-foreground">They sign in with this phone number. Their login is made now, and the setup link comes next.</p>
          <Button type="submit" disabled={pending} className="shrink-0">
            {saving ? <Spinner data-icon="inline-start" /> : <UserPlusIcon data-icon="inline-start" />}
            Add teacher
          </Button>
        </div>
        <datalist id="new-staff-titles">
          {TITLES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </form>

      <PasswordDialog dialog={dialog} setDialog={setDialog} />
      <SamePersonDialog dialog={dialog} setDialog={setDialog} name={name || "this teacher"} pending={pending} onConfirm={() => save(true)} />
      <SetupLinkDialog dialog={dialog} setDialog={setDialog} />
    </>
  );
}
