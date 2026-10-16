"use client";

import { useActionState, useState } from "react";
import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { suggestCode, suggestSlug } from "@/lib/reserved-slugs";

import type { SetupFormState } from "./setup-actions";

export type SchoolDetailsValues = {
  name: string;
  slug: string;
  code: string;
  address: string;
  motto: string;
  phone: string;
  email: string;
  plan: "basic" | "school_logo";
  showAttendance: boolean;
};

const empty: SchoolDetailsValues = {
  name: "",
  slug: "",
  code: "",
  address: "",
  motto: "",
  phone: "",
  email: "",
  plan: "basic",
  showAttendance: false,
};

export function SchoolDetailsForm({
  mode,
  initial = empty,
  action,
}: {
  mode: "create" | "edit";
  initial?: SchoolDetailsValues;
  action: (previous: SetupFormState, form: FormData) => Promise<SetupFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [code, setCode] = useState(initial.code);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [codeTouched, setCodeTouched] = useState(mode === "edit");
  const [plan, setPlan] = useState(initial.plan);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  const v = (name: string, fallback: string) => state?.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.ok && state.message && (
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={err("name") ? true : undefined}>
          <FieldLabel htmlFor="name" className="type-label">
            School name
          </FieldLabel>
          <Input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(suggestSlug(e.target.value));
              if (!codeTouched) setCode(suggestCode(e.target.value));
            }}
            placeholder="As it appears on report cards"
          />
          {err("name") && <FieldError>{err("name")}</FieldError>}
        </Field>

        <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
          <Field data-invalid={err("slug") ? true : undefined}>
            <FieldLabel htmlFor="slug" className="type-label">
              Web name
            </FieldLabel>
            <div className="flex items-center gap-1.5">
              <span className="type-caption text-muted-foreground">voxlms.ng/</span>
              <Input
                id="slug"
                name="slug"
                required
                value={slug}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                }}
              />
            </div>
            {err("slug") && !state?.needsConfirm ? (
              <FieldError>{err("slug")}</FieldError>
            ) : (
              <FieldDescription>Teachers see this in the address. Lowercase letters and digits.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={err("code") ? true : undefined}>
            <FieldLabel htmlFor="code" className="type-label">
              Code
            </FieldLabel>
            <Input
              id="code"
              name="code"
              required
              value={code}
              maxLength={6}
              className="type-figure uppercase"
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
              }}
            />
            {err("code") ? <FieldError>{err("code")}</FieldError> : <FieldDescription>For student numbers</FieldDescription>}
          </Field>
        </div>

        <Field data-invalid={err("address") ? true : undefined}>
          <FieldLabel htmlFor="address" className="type-label">
            Address
          </FieldLabel>
          <Textarea id="address" name="address" required defaultValue={v("address", initial.address)} rows={2} />
          {err("address") && <FieldError>{err("address")}</FieldError>}
        </Field>

        {mode === "edit" && (
          <>
            <Field>
              <FieldLabel htmlFor="motto" className="type-label">
                Motto <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="motto" name="motto" defaultValue={v("motto", initial.motto)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={err("phone") ? true : undefined}>
                <FieldLabel htmlFor="phone" className="type-label">
                  Phone <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Input id="phone" name="phone" type="tel" defaultValue={v("phone", initial.phone)} className="type-figure" />
                {err("phone") && <FieldError>{err("phone")}</FieldError>}
              </Field>
              <Field data-invalid={err("email") ? true : undefined}>
                <FieldLabel htmlFor="email" className="type-label">
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Input id="email" name="email" type="email" defaultValue={v("email", initial.email)} />
                {err("email") && <FieldError>{err("email")}</FieldError>}
              </Field>
            </div>
          </>
        )}

        <FieldSet>
          <FieldLegend variant="label" className="type-label">
            Plan
          </FieldLegend>
          <input type="hidden" name="plan" value={plan} />
          <ToggleGroup
            value={[plan]}
            onValueChange={(value) => value[0] && setPlan(value[0] as typeof plan)}
            variant="outline"
            className="w-full sm:w-auto"
          >
            <ToggleGroupItem value="basic" className="flex-1 sm:flex-none">
              Basic (VoxLMS branding)
            </ToggleGroupItem>
            <ToggleGroupItem value="school_logo" className="flex-1 sm:flex-none">
              School logo
            </ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            {plan === "basic" ? "Report cards say “Powered by VoxLMS”." : "Report cards carry the school’s own logo and signatures."}
          </FieldDescription>
        </FieldSet>

        {mode === "edit" && (
          <Field orientation="horizontal">
            <Checkbox id="showAttendance" name="showAttendance" defaultChecked={initial.showAttendance} />
            <FieldLabel htmlFor="showAttendance" className="font-normal">
              Report cards show attendance (times school opened, present, absent)
            </FieldLabel>
          </Field>
        )}
      </FieldGroup>

      {state?.needsConfirm && (
        <Alert className="border-warning/30 bg-warning-wash">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>Change the web name?</AlertTitle>
          <AlertDescription className="text-foreground/80">{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.needsConfirm && <input type="hidden" name="confirmSlugChange" value="yes" />}

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending && <Spinner data-icon="inline-start" />}
          {mode === "create" ? "Create school" : state?.needsConfirm ? "Yes, change the web name" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
