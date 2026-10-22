"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PhoneIcon, SearchIcon, TablePropertiesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNigerianPhone } from "@/lib/phone";
import { termLabel } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import type { ClassLaggingReport, PrincipalOverview } from "@/server/data";

type Filter = "all" | "behind" | "done";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The principal's home: how far every class is with scores and comments this
 * term, who its form teacher is, and a way into each class and its
 * broadsheet. Read only; nothing here changes a score.
 */
export function PrincipalDashboard({ data }: { data: PrincipalOverview }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const { summary } = data;

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .map((section) => ({
        ...section,
        classes: section.classes.filter(
          (c) =>
            (filter === "all" || (filter === "done") === (c.status === "up_to_date")) &&
            (!q || c.name.toLowerCase().includes(q) || (c.teacher?.fullName.toLowerCase().includes(q) ?? false)),
        ),
      }))
      .filter((s) => s.classes.length > 0);
  }, [data.sections, filter, search]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="type-display">{data.school.name}</h1>
        <p className="text-muted-foreground">
          {termLabel(data.term.number, data.session.name)} · {data.term.resultsReleasedAt ? "results are out to parents" : "results not released yet"}
        </p>
      </header>

      <section aria-label="This term so far" className="grid gap-5 rounded-xl border border-rule bg-card p-5 sm:grid-cols-3 sm:p-6">
        <Figure label="Subjects with every score in" done={summary.completedSubjectOfferings} of={summary.totalSubjectOfferings} />
        <Figure label="Form teacher comments written" done={summary.totalRemarksEntered} of={summary.totalRemarksExpected} />
        <div className="flex flex-col gap-1">
          <span className="type-caption text-muted-foreground">Classes still to finish</span>
          <span className={cn("type-title type-figure", summary.laggingClasses > 0 ? "text-foreground" : "text-success")}>
            {summary.laggingClasses} <span className="type-body text-muted-foreground">of {summary.totalClasses}</span>
          </span>
          <span className="type-caption text-muted-foreground">{plural(summary.totalStudents, "student", "students")} this term</span>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup variant="outline" size="sm" value={[filter]} onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} aria-label="Show">
          <ToggleGroupItem value="all">All classes</ToggleGroupItem>
          <ToggleGroupItem value="behind">Still to finish ({summary.laggingClasses})</ToggleGroupItem>
          <ToggleGroupItem value="done">Done ({summary.upToDateClasses})</ToggleGroupItem>
        </ToggleGroup>
        <InputGroup className="sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a class or teacher" aria-label="Find a class or teacher" />
        </InputGroup>
      </div>

      {sections.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-rule bg-card p-6">
          <p>No class matches.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Show every class
          </Button>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.id} aria-labelledby={`section-${section.id}`} className="flex flex-col gap-3">
            <h2 id={`section-${section.id}`} className="type-title">
              {section.name}
            </h2>
            <ul className="overflow-hidden rounded-xl border border-rule bg-card">
              {section.classes.map((cls) => (
                <ClassRow key={cls.id} cls={cls} slug={data.school.slug} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Figure({ label, done, of }: { label: string; done: number; of: number }) {
  const percent = of === 0 ? 0 : Math.round((done / of) * 100);
  return (
    <div className="flex flex-col gap-1">
      <span className="type-caption text-muted-foreground">{label}</span>
      <span className="type-title type-figure">
        {done} <span className="type-body text-muted-foreground">of {of}</span>
      </span>
      <Progress value={percent} aria-label={label} />
    </div>
  );
}

function ClassRow({ cls, slug }: { cls: ClassLaggingReport; slug: string }) {
  const teacher = cls.teacher ? [cls.teacher.title, cls.teacher.fullName].filter(Boolean).join(" ") : null;
  const done = cls.status === "up_to_date";
  return (
    <li className="flex flex-col gap-3 border-b border-rule px-4 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/${slug}/classes/${cls.id}`} className="type-heading text-primary hover:underline">
            {cls.name}
          </Link>
          <span className="type-caption text-muted-foreground">{plural(cls.totalStudents, "student", "students")}</span>
          {done && <Badge className="bg-success-wash text-success">Done</Badge>}
        </div>
        {teacher ? (
          <p className="type-caption text-muted-foreground">
            {teacher}
            {cls.teacher?.phone && (
              <>
                {" · "}
                <a href={`tel:${cls.teacher.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <PhoneIcon className="size-3.5" aria-hidden />
                  <span className="type-figure">{formatNigerianPhone(cls.teacher.phone)}</span>
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="type-caption text-destructive">No form teacher this session</p>
        )}
        <WhatIsLeft cls={cls} />
      </div>
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/${slug}/classes/${cls.id}/broadsheet`} />} className="w-fit shrink-0">
        <TablePropertiesIcon data-icon="inline-start" />
        Broadsheet
      </Button>
    </li>
  );
}

/** What is left for a class, in words. */
function WhatIsLeft({ cls }: { cls: ClassLaggingReport }) {
  if (cls.status === "no_students") return <p className="type-caption text-muted-foreground">No students this term.</p>;
  const lines: string[] = [];
  if (cls.scores.totalSubjects === 0) lines.push("No scores entered yet.");
  else if (cls.scores.unfinished.length > 0)
    lines.push(`Scores still missing in ${cls.scores.unfinished.map((u) => `${u.name} (${u.missingCount} ${u.missingCount === 1 ? "student" : "students"})`).join(", ")}.`);
  if (cls.remarks.pending > 0) lines.push(`${plural(cls.remarks.pending, "comment", "comments")} still to write.`);
  if (lines.length === 0) return <p className="type-caption text-muted-foreground">Every score and comment is in.</p>;
  return (
    <ul className="type-caption flex flex-col gap-0.5">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
