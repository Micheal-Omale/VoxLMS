"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FieldDescription, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { setFormTeacherAction } from "../../../enrol-actions";

const NONE = "none";

/** The class's form master (or class teacher) for the current session, saved as soon as it is picked (spec 0008, AC-4). */
export function FormTeacherPicker({
  schoolId,
  classId,
  className,
  teacherTitle,
  sessionName,
  current,
  teachers,
  staffHref,
}: {
  schoolId: string;
  classId: string;
  className: string;
  teacherTitle: string;
  sessionName: string;
  current: { staffId: string; name: string } | null;
  teachers: { id: string; name: string }[];
  staffHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current?.staffId ?? NONE);
  const [error, setError] = useState<string | null>(null);
  // A form master who has since left still shows, so the choice is never silently blank.
  const items = [
    { value: NONE, label: "None yet" },
    ...teachers.map((t) => ({ value: t.id, label: t.name })),
    ...(current && !teachers.some((t) => t.id === current.staffId) ? [{ value: current.staffId, label: `${current.name} (has left)` }] : []),
  ];

  function pick(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    start(async () => {
      const result = await setFormTeacherAction(schoolId, classId, next === NONE ? null : next);
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
        return;
      }
      const name = items.find((i) => i.value === next)?.label;
      toast.add({ title: next === NONE ? `${className} has no ${teacherTitle.toLowerCase()} now` : `${name} heads ${className}`, type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="form-teacher" className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
      <div className="flex flex-col gap-0.5 sm:flex-1">
        <h2 id="form-teacher" className="type-heading">
          <label htmlFor="form-teacher-picker">{teacherTitle}</label>
        </h2>
        <FieldDescription>
          {teachers.length === 0 ? (
            <>
              No teachers yet.{" "}
              <Link href={staffHref} className="font-semibold text-primary underline-offset-4 hover:underline">
                Add them on the Staff page
              </Link>
              .
            </>
          ) : (
            `For ${sessionName}. They see ${className} as soon as they sign in.`
          )}
        </FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </div>
      <div className="flex items-center gap-2 sm:w-80">
        <Select items={items} value={value} onValueChange={(v) => v && v !== value && pick(String(v))} disabled={pending || teachers.length === 0}>
          <SelectTrigger id="form-teacher-picker" className="w-full" aria-invalid={!!error}>
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
        {pending && <Spinner aria-label="Saving" />}
      </div>
    </section>
  );
}
