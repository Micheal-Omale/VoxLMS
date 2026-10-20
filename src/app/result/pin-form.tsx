"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { checkPinAction, type PinFormState } from "./actions";

/** The one field (AC-12). `initialMessage` is a refusal found when the page loaded. */
export function PinForm({ initialMessage }: { initialMessage?: string }) {
  const [state, action, pending] = useActionState<PinFormState, FormData>(checkPinAction, null);
  const message = state?.message ?? initialMessage;

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field data-invalid={message ? true : undefined}>
        <FieldLabel htmlFor="pin" className="type-label">
          Result PIN
        </FieldLabel>
        <Input
          key={state?.n ?? 0}
          id="pin"
          name="pin"
          type="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={40}
          placeholder="e.g. GHS 3465 3155"
          defaultValue={state?.keep ?? ""}
          aria-describedby="pin-hint"
          aria-invalid={message ? true : undefined}
          className="h-12 type-figure text-lg tracking-wider"
        />
        <FieldDescription id="pin-hint">Code from the slip the school gave you, e.g. GHS 3465 3155</FieldDescription>
        {message && (
          <FieldError role="alert" className="text-sm">
            {message}
          </FieldError>
        )}
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? "Checking" : "Check result"}
      </Button>
    </form>
  );
}
