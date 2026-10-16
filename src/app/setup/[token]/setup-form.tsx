"use client";

import { useActionState } from "react";
import { CircleAlertIcon } from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import { setPasswordAction, type SetupState } from "./actions";

export function SetupForm({ token, isTeam }: { token: string; isTeam: boolean }) {
  const [state, action, pending] = useActionState<SetupState, FormData>(setPasswordAction.bind(null, token), null);
  const min = isTeam ? 12 : 6;

  return (
    <form action={action}>
      <FieldGroup>
        {state?.field === "link" && (
          <Alert variant="destructive" className="border-destructive/25 bg-destructive-wash">
            <CircleAlertIcon />
            <AlertTitle>{state.error}</AlertTitle>
          </Alert>
        )}
        <Field data-invalid={state?.field === "password" || undefined}>
          <FieldLabel htmlFor="password" className="type-label">
            Choose a password
          </FieldLabel>
          <PasswordInput id="password" name="password" autoComplete="new-password" invalid={state?.field === "password"} describedBy="password-help" />
          {state?.field === "password" ? (
            <FieldError id="password-help">{state.error}</FieldError>
          ) : (
            <FieldDescription id="password-help">At least {min} characters. Not your phone number.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={state?.field === "repeat" || undefined}>
          <FieldLabel htmlFor="repeat" className="type-label">
            Type it again
          </FieldLabel>
          <PasswordInput id="repeat" name="repeat" autoComplete="new-password" invalid={state?.field === "repeat"} />
          {state?.field === "repeat" && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Saving password" : "Save password and sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
