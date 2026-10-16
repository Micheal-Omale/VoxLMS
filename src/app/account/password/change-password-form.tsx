"use client";

import { useActionState } from "react";
import { CircleCheckIcon } from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm({ isTeam, home }: { isTeam: boolean; home: string }) {
  const [state, action, pending] = useActionState<ChangePasswordState, FormData>(changePasswordAction, null);
  const fieldError = (field: "current" | "password" | "repeat") =>
    state && !state.ok && state.field === field ? state.error : null;

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <Alert className="border-success/25 bg-success-wash">
          <CircleCheckIcon className="text-success" />
          <AlertTitle>Password changed. Other devices are signed out.</AlertTitle>
        </Alert>
        <Button nativeButton={false} render={<a href={home} />} size="lg">
          Back to VoxLMS
        </Button>
      </div>
    );
  }

  return (
    <form action={action}>
      <FieldGroup>
        <Field data-invalid={fieldError("current") ? true : undefined}>
          <FieldLabel htmlFor="current" className="type-label">
            Current password
          </FieldLabel>
          <PasswordInput id="current" name="current" autoComplete="current-password" invalid={!!fieldError("current")} />
          {fieldError("current") && <FieldError>{fieldError("current")}</FieldError>}
        </Field>
        <Field data-invalid={fieldError("password") ? true : undefined}>
          <FieldLabel htmlFor="password" className="type-label">
            New password
          </FieldLabel>
          <PasswordInput id="password" name="password" autoComplete="new-password" invalid={!!fieldError("password")} />
          {fieldError("password") ? (
            <FieldError>{fieldError("password")}</FieldError>
          ) : (
            <FieldDescription>At least {isTeam ? 12 : 6} characters. Not your phone number.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={fieldError("repeat") ? true : undefined}>
          <FieldLabel htmlFor="repeat" className="type-label">
            Type the new password again
          </FieldLabel>
          <PasswordInput id="repeat" name="repeat" autoComplete="new-password" invalid={!!fieldError("repeat")} />
          {fieldError("repeat") && <FieldError>{fieldError("repeat")}</FieldError>}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Changing password" : "Change password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
