"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

import { removeSectionAction, saveSectionAction } from "../../setup-actions";
import { ConfirmFix, type FixConfirm } from "../confirm-fix";
import { headFix, headOff } from "../fix-copy";

type Stage = "primary" | "junior_secondary" | "senior_secondary";

export function SectionForm({
  schoolId,
  stage,
  sectionName,
  sectionId,
  initial,
}: {
  schoolId: string;
  stage: Stage;
  sectionName: string;
  sectionId: string | null;
  /** headName is "" when the section has no own head, so the principal signs. */
  initial: { teacherTitle: string; headTitle: string; headName: string };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveSectionAction.bind(null, schoolId), null);
  const [removing, startRemove] = useTransition();
  const [ownHead, setOwnHead] = useState(initial.headName !== "");
  const [waiting, setWaiting] = useState<{ form: FormData; confirm: FixConfirm } | null>(null);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  const id = (name: string) => `${stage}-${name}`;
  const v = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  /** The confirm a save needs first, if any (spec 0007, AC-3 and AC-4). */
  function confirmFor(form: FormData): FixConfirm | null {
    if (!sectionId || !initial.headName) return null;
    if (!ownHead) return headOff(sectionName, initial.headName);
    const changed =
      String(form.get("headTitle") ?? "").trim() !== initial.headTitle || String(form.get("headName") ?? "").trim() !== initial.headName;
    return changed ? headFix(sectionName, "name") : null;
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const form = new FormData(event.currentTarget);
        const confirm = confirmFor(form);
        if (confirm) {
          event.preventDefault();
          setWaiting({ form, confirm });
        }
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="stage" value={stage} />
      {state?.ok && state.message && (
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={err("teacherTitle") ? true : undefined}>
          <FieldLabel htmlFor={id("teacher")} className="type-label">
            Teacher’s title
          </FieldLabel>
          <Input id={id("teacher")} name="teacherTitle" list="teacher-titles" required defaultValue={v("teacherTitle", initial.teacherTitle)} className="sm:max-w-xs" />
          {err("teacherTitle") && <FieldError>{err("teacherTitle")}</FieldError>}
        </Field>

        <Field orientation="horizontal" className="rounded-lg border border-rule p-4">
          <FieldContent>
            <FieldLabel htmlFor={id("own-head")} className="type-label">
              Has its own head
            </FieldLabel>
            <FieldDescription>
              {ownHead ? `This head signs ${sectionName}’s report cards instead of the principal.` : `Off: the principal signs ${sectionName}’s report cards.`}
            </FieldDescription>
          </FieldContent>
          {/* Sent from state: React resets the form after a refused save, which clears the switch's own hidden checkbox. */}
          <input type="hidden" name="hasOwnHead" value={ownHead ? "on" : ""} />
          <Switch id={id("own-head")} checked={ownHead} onCheckedChange={setOwnHead} />
        </Field>

        {ownHead && (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field data-invalid={err("headTitle") ? true : undefined}>
              <FieldLabel htmlFor={id("head-title")} className="type-label">
                Head’s title
              </FieldLabel>
              <Input
                id={id("head-title")}
                name="headTitle"
                list="head-titles"
                required
                minLength={2}
                maxLength={40}
                defaultValue={v("headTitle", initial.headTitle)}
                aria-invalid={err("headTitle") ? true : undefined}
              />
              {err("headTitle") && <FieldError>{err("headTitle")}</FieldError>}
            </Field>
            <Field data-invalid={err("headName") ? true : undefined}>
              <FieldLabel htmlFor={id("head-name")} className="type-label">
                Head’s name, as printed on report cards
              </FieldLabel>
              <Input
                id={id("head-name")}
                name="headName"
                required
                minLength={3}
                maxLength={80}
                defaultValue={v("headName", initial.headName)}
                aria-invalid={err("headName") ? true : undefined}
              />
              {err("headName") ? (
                <FieldError>{err("headName")}</FieldError>
              ) : (
                <FieldDescription>{sectionId && initial.headName ? "The signature is on this card, below." : "Upload the signature here once the section is saved."}</FieldDescription>
              )}
            </Field>
          </div>
        )}
      </FieldGroup>
      <datalist id="teacher-titles">
        <option value="Class teacher" />
        <option value="Form master" />
        <option value="Form teacher" />
      </datalist>
      <datalist id="head-titles">
        <option value="Head teacher" />
        <option value="Head mistress" />
        <option value="Headmaster" />
        <option value="Principal" />
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
      <ConfirmFix
        confirm={waiting?.confirm ?? null}
        onConfirm={() => {
          const form = waiting?.form;
          setWaiting(null);
          if (form) startTransition(() => action(form));
        }}
        onCancel={() => setWaiting(null)}
      />
    </form>
  );
}
