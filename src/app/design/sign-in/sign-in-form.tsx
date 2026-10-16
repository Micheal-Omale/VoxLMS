"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, EyeIcon, EyeOffIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

// Preview only: "password1" signs in, anything else shows the error state.
export function SignInForm() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (formData.get("password") === "password1") {
        router.push("/design/score-entry");
        return;
      }
      setFailed(true);
      if (passwordRef.current) {
        passwordRef.current.value = "";
        passwordRef.current.focus();
      }
    });
  }

  function trackCapsLock(event: React.KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return (
    <form action={submit} noValidate>
      <FieldGroup>
        {failed && (
          <Alert variant="destructive" className="border-destructive/25 bg-destructive-wash">
            <CircleAlertIcon />
            <AlertTitle>That phone number or password is not right</AlertTitle>
            <AlertDescription className="text-foreground/80">
              Check both and try again. Passwords are case sensitive.
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="username" className="type-label">
            Phone number or username
          </FieldLabel>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password" className="type-label">
            Password
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              onKeyUp={trackCapsLock}
              onKeyDown={trackCapsLock}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {capsLock && (
            <FieldDescription className="font-semibold text-warning">Caps Lock is on</FieldDescription>
          )}
        </Field>
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? "Signing in" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
