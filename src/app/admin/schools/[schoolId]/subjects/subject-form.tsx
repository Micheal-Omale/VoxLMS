"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { suggestShortName } from "@/lib/subject-short-name";

import { saveSubjectAction } from "../../curriculum-actions";

export type StandardOption = { id: string; code: string; name: string };
type Subject = { id: string; name: string; shortName: string; standardSubjectId: string | null };

const NONE = "none";

/** Adds a subject of the school's own, or edits one (spec 0006, AC-1). */
export function SubjectForm({
  schoolId,
  standards,
  takenShortNames,
  subject,
  onDone,
}: {
  schoolId: string;
  standards: StandardOption[];
  takenShortNames: string[];
  subject?: Subject;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(subject?.name ?? "");
  const [shortName, setShortName] = useState(subject?.shortName ?? "");
  const [shortEdited, setShortEdited] = useState(Boolean(subject));
  const [standardId, setStandardId] = useState(subject?.standardSubjectId ?? NONE);
  const [error, setError] = useState<{ field: string; error: string } | null>(null);
  const prefix = subject ? `edit-${subject.id}` : "own";
  const taken = takenShortNames.filter((s) => s !== subject?.shortName);
  const standard = standards.find((s) => s.id === standardId);
  const items = [{ value: NONE, label: "Not on the standard list" }, ...standards.map((s) => ({ value: s.id, label: s.name }))];
  const err = (field: string) => (error?.field === field ? error.error : null);

  const suggest = (nextName: string, code = standard?.code) => {
    if (!shortEdited) setShortName(nextName.trim() ? suggestShortName(nextName, taken, code) : "");
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveSubjectAction(schoolId, {
        id: subject?.id ?? null,
        name,
        shortName,
        standardSubjectId: standardId === NONE ? null : standardId,
      });
      if (!result.ok) {
        setError({ field: result.field, error: result.error });
        return;
      }
      setError(null);
      toast.add({ title: subject ? `${name.trim()} saved` : `${name.trim()} added at the end of the list`, type: "success" });
      if (!subject) {
        setName("");
        setShortName("");
        setShortEdited(false);
        setStandardId(NONE);
      }
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup>
        <Field data-invalid={err("name") ? true : undefined}>
          <FieldLabel htmlFor={`${prefix}-name`} className="type-label">
            Subject name, as the school writes it
          </FieldLabel>
          <Input
            id={`${prefix}-name`}
            value={name}
            maxLength={40}
            required
            autoComplete="off"
            placeholder="Hausa Studies"
            aria-invalid={err("name") ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              suggest(e.target.value);
            }}
          />
          {err("name") && <FieldError>{err("name")}</FieldError>}
        </Field>
        <Field data-invalid={err("shortName") ? true : undefined}>
          <FieldLabel htmlFor={`${prefix}-short`} className="type-label">
            Short name
          </FieldLabel>
          <Input
            id={`${prefix}-short`}
            value={shortName}
            maxLength={5}
            required
            autoComplete="off"
            className="type-figure w-32 uppercase"
            aria-invalid={err("shortName") ? true : undefined}
            aria-describedby={`${prefix}-short-hint`}
            onChange={(e) => {
              setShortEdited(true);
              setShortName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
          <FieldDescription id={`${prefix}-short-hint`}>2 to 5 capital letters or digits. Heads the subject’s column on broadsheets.</FieldDescription>
          {err("shortName") && <FieldError>{err("shortName")}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-standard`} className="type-label">
            Same subject on the standard list
          </FieldLabel>
          <Select
            items={items}
            value={standardId}
            onValueChange={(value) => {
              const next = String(value ?? NONE);
              setStandardId(next);
              const picked = standards.find((s) => s.id === next);
              if (picked && !name.trim()) {
                setName(picked.name);
                suggest(picked.name, picked.code);
              }
            }}
          >
            <SelectTrigger id={`${prefix}-standard`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>Lets VoxLMS match this subject across schools. Optional.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          {subject ? "Save subject" : "Add subject"}
        </Button>
      </div>
    </form>
  );
}
