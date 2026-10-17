"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { className, parseArms } from "@/lib/class-name";

import { createClassesAction } from "../../curriculum-actions";

type Level = { id: string; name: string; stage: string };
type Section = { stage: string; name: string };

/** Creates every level × arm class in one save (spec 0006, AC-3). */
export function AddClasses({ schoolId, sections, levels, existing }: { schoolId: string; sections: Section[]; levels: Level[]; existing: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ticked, setTicked] = useState<string[]>([]);
  const [armsText, setArmsText] = useState("");
  const [error, setError] = useState<{ field: string; error: string } | null>(null);

  const arms = parseArms(armsText);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const names = levels.filter((l) => ticked.includes(l.id)).flatMap((l) => (arms.length > 0 ? arms : [null]).map((arm) => className(l.name, arm)));
  const fresh = names.filter((n) => !taken.has(n.toLowerCase()));
  const skipped = names.filter((n) => taken.has(n.toLowerCase()));

  function create() {
    start(async () => {
      const result = await createClassesAction(schoolId, ticked, armsText);
      if (!result.ok) {
        setError({ field: result.field, error: result.error });
        return;
      }
      setError(null);
      setTicked([]);
      setArmsText("");
      toast.add({
        title: result.created.length === 1 ? `${result.created[0]} created` : `${result.created.length} classes created`,
        description: result.skipped.length > 0 ? `Already there, so skipped: ${result.skipped.join(", ")}.` : "Now give each level its subjects below.",
        type: "success",
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <fieldset key={section.stage} className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 type-label">{section.name}</legend>
            <ul className="flex flex-col overflow-hidden rounded-lg border border-rule">
              {levels
                .filter((l) => l.stage === section.stage)
                .map((l) => (
                  <li key={l.id} className="border-b border-rule last:border-b-0">
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent">
                      <Checkbox
                        checked={ticked.includes(l.id)}
                        onCheckedChange={(on) => setTicked((t) => (on ? [...t, l.id] : t.filter((x) => x !== l.id)))}
                      />
                      <span>{l.name}</span>
                    </label>
                  </li>
                ))}
            </ul>
          </fieldset>
        ))}
      </div>
      {error?.field === "levels" && <p className="type-caption font-semibold text-destructive" role="alert">{error.error}</p>}

      <Field data-invalid={error?.field === "arms" ? true : undefined}>
        <FieldLabel htmlFor="arms" className="type-label">
          Arms
        </FieldLabel>
        <Input
          id="arms"
          value={armsText}
          onChange={(e) => setArmsText(e.target.value)}
          autoComplete="off"
          className="sm:max-w-md"
          aria-describedby="arms-hint"
          aria-invalid={error?.field === "arms" ? true : undefined}
        />
        <FieldDescription id="arms-hint">Separate arms with commas, like Gold, Blue or A, B, C. Leave it empty if each level is one class.</FieldDescription>
        {error?.field === "arms" && <FieldError>{error.error}</FieldError>}
      </Field>

      <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center">
        <p className="flex-1 type-caption sm:text-sm" aria-live="polite">
          {names.length === 0 ? (
            <span className="text-muted-foreground">Tick a level to see the classes that will be made.</span>
          ) : (
            <>
              {fresh.length > 0 ? (
                <>
                  Makes <strong>{fresh.join(", ")}</strong>.
                </>
              ) : (
                "Every one of these classes already exists."
              )}
              {skipped.length > 0 && <span className="text-muted-foreground"> {skipped.join(", ")} already {skipped.length === 1 ? "exists" : "exist"} and will be skipped.</span>}
            </>
          )}
        </p>
        <Button onClick={create} disabled={pending || fresh.length === 0} className="self-start sm:self-center">
          {pending && <Spinner data-icon="inline-start" />}
          {fresh.length > 1 ? `Create ${fresh.length} classes` : "Create class"}
        </Button>
      </div>
    </div>
  );
}
