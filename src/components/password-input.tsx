"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { FieldDescription } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/** Password field with show/hide and a Caps Lock warning. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  describedBy?: string;
}) {
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const track = (event: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  return (
    <>
      <InputGroup>
        <InputGroupInput
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onKeyUp={track}
          onKeyDown={track}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-sm"
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {capsLock && <FieldDescription className="font-semibold text-warning">Caps Lock is on</FieldDescription>}
    </>
  );
}
