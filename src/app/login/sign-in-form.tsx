"use client";

import { useActionState } from "react";
import { CircleAlertIcon } from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { signInAction, type SignInState } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, null);

  return (
    <form action={action}>
      <FieldGroup>
        {state?.error && (
          <Alert variant="destructive" className="border-destructive/25 bg-destructive-wash" aria-live="assertive">
            <CircleAlertIcon />
            <AlertTitle>{state.error}</AlertTitle>
            <AlertDescription>Passwords are case sensitive.</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="phone" className="type-label">
            Phone number
          </FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            required
            defaultValue={state?.phone}
            className="type-figure"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password" className="type-label">
            Password
          </FieldLabel>
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="shared" name="shared" />
          <FieldLabel htmlFor="shared" className="font-normal">
            This is a shared computer
          </FieldLabel>
        </Field>
        <FieldDescription className="-mt-3 pl-7">You’ll be signed out when you close the browser.</FieldDescription>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Signing in" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
