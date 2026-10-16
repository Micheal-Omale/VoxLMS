"use client";

import { useActionState } from "react";
import { CircleCheckIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { saveSessionAction } from "../../setup-actions";

type TermValues = { startsOn: string; endsOn: string; nextTermBeginsOn: string; daysOpened: string };
const ORDINAL = ["First", "Second", "Third"];

export function SessionForm({
  schoolId,
  sessionId,
  name,
  terms,
  showAttendance,
  submitLabel,
}: {
  schoolId: string;
  sessionId: string | null;
  name: string;
  terms: TermValues[];
  showAttendance: boolean;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(saveSessionAction.bind(null, schoolId, sessionId), null);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  const prefix = sessionId ?? "new";
  // After a refused save, show what was typed rather than the original values.
  const v = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.ok && state.message && (
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      <Field data-invalid={err("name") ? true : undefined} className="max-w-48">
        <FieldLabel htmlFor={`${prefix}-name`} className="type-label">
          Session
        </FieldLabel>
        <Input id={`${prefix}-name`} name="name" required defaultValue={v("name", name)} placeholder="2026/2027" className="type-figure" />
        {err("name") && <FieldError>{err("name")}</FieldError>}
      </Field>

      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((n) => {
          const t = terms[n - 1];
          const fieldError = err(`term${n}`) ?? (n === 1 ? err("terms") : null);
          return (
            <fieldset key={n} className="flex flex-col gap-3 rounded-lg border border-rule p-4" aria-invalid={fieldError ? true : undefined}>
              <legend className="px-1 type-label">{ORDINAL[n - 1]} Term</legend>
              <div className={`grid gap-3 ${showAttendance ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-t${n}-start`} className="type-caption font-semibold">
                    Starts
                  </FieldLabel>
                  <Input id={`${prefix}-t${n}-start`} name={`term${n}Start`} type="date" required defaultValue={v(`term${n}Start`, t.startsOn)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-t${n}-end`} className="type-caption font-semibold">
                    Ends
                  </FieldLabel>
                  <Input id={`${prefix}-t${n}-end`} name={`term${n}End`} type="date" required defaultValue={v(`term${n}End`, t.endsOn)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-t${n}-next`} className="type-caption font-semibold">
                    Next term begins
                  </FieldLabel>
                  <Input id={`${prefix}-t${n}-next`} name={`term${n}Next`} type="date" defaultValue={v(`term${n}Next`, t.nextTermBeginsOn)} />
                </Field>
                {showAttendance && (
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-t${n}-days`} className="type-caption font-semibold">
                      Times school opened
                    </FieldLabel>
                    <Input
                      id={`${prefix}-t${n}-days`}
                      name={`term${n}Days`}
                      type="number"
                      min={0}
                      max={200}
                      inputMode="numeric"
                      defaultValue={v(`term${n}Days`, t.daysOpened)}
                    />
                  </Field>
                )}
              </div>
              {fieldError && <FieldError>{fieldError}</FieldError>}
            </fieldset>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
