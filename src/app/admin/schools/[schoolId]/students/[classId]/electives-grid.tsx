"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { saveClassElectivesAction } from "../../../enrol-actions";

type Row = { id: string; surname: string; otherNames: string; electives: string[] };
type Subject = { id: string; name: string; shortName: string };

const key = (studentId: string, subjectId: string) => `${studentId}:${subjectId}`;

/**
 * One tick per student per elective for this session (spec 0008, AC-9).
 * Saving replaces this class's elective ticks; unticking one with scores
 * refuses the whole save.
 */
export function ElectivesGrid({
  schoolId,
  classId,
  className,
  sessionName,
  subjects,
  students,
}: {
  schoolId: string;
  classId: string;
  className: string;
  sessionName: string;
  subjects: Subject[];
  students: Row[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = new Set(students.flatMap((s) => s.electives.filter((id) => subjects.some((x) => x.id === id)).map((id) => key(s.id, id))));
  const [ticked, setTicked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const changed = [...new Set([...ticked, ...initial])].filter((k) => ticked.has(k) !== initial.has(k)).length;

  function toggle(k: string) {
    setTicked((t) => {
      const next = new Set(t);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function save() {
    const ticks = [...ticked].map((k) => {
      const [studentId, subjectId] = k.split(":");
      return { studentId, subjectId };
    });
    start(async () => {
      const result = await saveClassElectivesAction(schoolId, classId, ticks);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.add({ title: `${className} electives saved`, type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="electives-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="electives-heading" className="type-heading">
          Electives in {sessionName}
        </h2>
        <p className="type-caption text-muted-foreground sm:text-sm">Tick what each student takes. A student may take none. Score entry lists only the students ticked for a subject.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-rule bg-card">
        <table className="w-full border-collapse">
          <caption className="sr-only">Electives for {className}</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left type-caption font-semibold text-muted-foreground">
                Student
              </th>
              {subjects.map((s) => (
                <th key={s.id} scope="col" className="min-w-20 px-2 py-2.5 text-center type-caption font-semibold">
                  <abbr title={s.name} className="no-underline">
                    {s.shortName}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((st) => (
              <tr key={st.id} className="border-b border-rule last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 max-w-56 truncate bg-card px-4 py-1.5 text-left font-normal">
                  <span className="font-bold">{st.surname}</span> {st.otherNames}
                </th>
                {subjects.map((sub) => {
                  const k = key(st.id, sub.id);
                  const dirty = ticked.has(k) !== initial.has(k);
                  return (
                    <td key={sub.id} className={cn("p-0 text-center", dirty && "bg-warning-wash/70")}>
                      <label className="flex min-h-11 cursor-pointer items-center justify-center">
                        <Checkbox checked={ticked.has(k)} onCheckedChange={() => toggle(k)} aria-label={`${st.surname} ${st.otherNames}: ${sub.name}`} />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash p-3 text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex-1 type-caption type-figure text-muted-foreground" aria-live="polite">
          {ticked.size} {ticked.size === 1 ? "tick" : "ticks"}
          {changed > 0 && ` · ${changed} not saved yet`}
        </span>
        {changed > 0 && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setTicked(initial);
                setError(null);
              }}
            >
              Undo changes
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Save electives
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
