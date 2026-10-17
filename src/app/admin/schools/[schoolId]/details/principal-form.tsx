"use client";

import { startTransition, useActionState, useState } from "react";
import { CircleCheckIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { savePrincipalAction } from "../../setup-actions";
import { ConfirmFix } from "../confirm-fix";
import { principalFix } from "../fix-copy";

/** The school's one principal (spec 0007, AC-1 and AC-2). */
export function PrincipalForm({ schoolId, initial }: { schoolId: string; initial: { title: string; name: string } }) {
  const [state, action, pending] = useActionState(savePrincipalAction.bind(null, schoolId), null);
  const [waiting, setWaiting] = useState<FormData | null>(null);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  const v = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        const changed =
          String(form.get("principalTitle") ?? "").trim() !== initial.title ||
          String(form.get("principalName") ?? "").trim() !== initial.name;
        // A fix asks first; setting the name for the first time doesn't.
        if (initial.name && changed) {
          event.preventDefault();
          setWaiting(form);
        }
      }}
      className="flex flex-col gap-5"
    >
      {state?.ok && state.message && (
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Field data-invalid={err("principalTitle") ? true : undefined}>
            <FieldLabel htmlFor="principal-title" className="type-label">
              Title
            </FieldLabel>
            <Input
              id="principal-title"
              name="principalTitle"
              list="principal-titles"
              required
              minLength={2}
              maxLength={40}
              defaultValue={v("principalTitle", initial.title)}
              aria-invalid={err("principalTitle") ? true : undefined}
            />
            {err("principalTitle") ? <FieldError>{err("principalTitle")}</FieldError> : <FieldDescription>Printed under the signature.</FieldDescription>}
          </Field>
          <Field data-invalid={err("principalName") ? true : undefined}>
            <FieldLabel htmlFor="principal-name" className="type-label">
              Name, as printed on report cards
            </FieldLabel>
            <Input
              id="principal-name"
              name="principalName"
              required
              minLength={3}
              maxLength={80}
              defaultValue={v("principalName", initial.name)}
              aria-invalid={err("principalName") ? true : undefined}
            />
            {err("principalName") && <FieldError>{err("principalName")}</FieldError>}
          </Field>
        </div>
      </FieldGroup>
      <datalist id="principal-titles">
        <option value="Principal" />
        <option value="Head teacher" />
        <option value="Proprietor" />
        <option value="Proprietress" />
        <option value="Head of school" />
      </datalist>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Save principal
        </Button>
      </div>
      <ConfirmFix
        confirm={waiting ? principalFix("name") : null}
        onConfirm={() => {
          const form = waiting;
          setWaiting(null);
          if (form) startTransition(() => action(form));
        }}
        onCancel={() => setWaiting(null)}
      />
    </form>
  );
}
