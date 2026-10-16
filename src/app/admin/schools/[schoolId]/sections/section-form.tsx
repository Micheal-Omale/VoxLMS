"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { removeSectionAction, saveSectionAction } from "../../setup-actions";

type Stage = "primary" | "junior_secondary" | "senior_secondary";

export function SectionForm({
  schoolId,
  stage,
  sectionId,
  initial,
}: {
  schoolId: string;
  stage: Stage;
  sectionId: string | null;
  initial: { teacherTitle: string; headTitle: string; headName: string };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSectionAction.bind(null, schoolId), null);
  const [removing, startRemove] = useTransition();
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  const id = (name: string) => `${stage}-${name}`;
  const v = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="stage" value={stage} />
      {state?.ok && state.message && (
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={err("teacherTitle") ? true : undefined}>
            <FieldLabel htmlFor={id("teacher")} className="type-label">
              Teacher’s title
            </FieldLabel>
            <Input id={id("teacher")} name="teacherTitle" list="teacher-titles" required defaultValue={v("teacherTitle", initial.teacherTitle)} />
            {err("teacherTitle") && <FieldError>{err("teacherTitle")}</FieldError>}
          </Field>
          <Field data-invalid={err("headTitle") ? true : undefined}>
            <FieldLabel htmlFor={id("head-title")} className="type-label">
              Head’s title
            </FieldLabel>
            <Input id={id("head-title")} name="headTitle" list="head-titles" required defaultValue={v("headTitle", initial.headTitle)} />
            {err("headTitle") && <FieldError>{err("headTitle")}</FieldError>}
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={id("head-name")} className="type-label">
            Head’s name, as printed on report cards
          </FieldLabel>
          <Input id={id("head-name")} name="headName" defaultValue={v("headName", initial.headName)} />
        </Field>
      </FieldGroup>
      <datalist id="teacher-titles">
        <option value="Class teacher" />
        <option value="Form master" />
        <option value="Form teacher" />
      </datalist>
      <datalist id="head-titles">
        <option value="Head teacher" />
        <option value="Principal" />
        <option value="Head mistress" />
      </datalist>
      <div className="flex flex-wrap justify-between gap-3">
        {sectionId ? (
          <Button
            type="button"
            variant="ghost"
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                const result = await removeSectionAction(schoolId, sectionId);
                if (result && !result.ok) toast.add({ title: result.error, type: "error" });
                else {
                  toast.add({ title: "Section removed", type: "success" });
                  router.refresh();
                }
              })
            }
          >
            Remove section
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {sectionId ? "Save section" : "Add section"}
        </Button>
      </div>
    </form>
  );
}
