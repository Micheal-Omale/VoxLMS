"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileSpreadsheetIcon,
  MessageSquareIcon,
  PhoneIcon,
  SearchIcon,
  SparklesIcon,
  UserCheckIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { termLabel } from "@/lib/term-label";
import { cn } from "@/lib/utils";
import type { ClassLaggingReport, PrincipalOverview } from "@/server/data";

type Props = {
  data: PrincipalOverview;
};

type FilterStatus = "all" | "lagging" | "up_to_date";

export function PrincipalDashboard({ data }: { data: PrincipalOverview }) {
  const searchInputId = useId();
  const [activeTab, setActiveTab] = useState<"tracker" | "broadsheet">("tracker");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const termText = termLabel(data.term.number, data.session.name);
  const slug = data.school.slug;

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.sections
      .map((section) => {
        const matchingClasses = section.classes.filter((c) => {
          // Status filter
          if (filter === "lagging" && c.status === "up_to_date") return false;
          if (filter === "up_to_date" && c.status !== "up_to_date") return false;

          // Search query
          if (!q) return true;
          const matchName = c.name.toLowerCase().includes(q);
          const matchTeacher = c.teacher?.fullName.toLowerCase().includes(q) ?? false;
          const matchPhone = c.teacher?.phone.includes(q) ?? false;
          const matchUnfinished = c.scores.unfinished.some((u) => u.name.toLowerCase().includes(q));
          return matchName || matchTeacher || matchPhone || matchUnfinished;
        });

        return { ...section, classes: matchingClasses };
      })
      .filter((s) => s.classes.length > 0);
  }, [data.sections, filter, search]);

  const allFilteredClasses = useMemo(() => {
    return filteredSections.flatMap((s) => s.classes);
  }, [filteredSections]);

  return (
    <div className="flex flex-col gap-6">
      {/* Leadership Header */}
      <header className="flex flex-col gap-3 rounded-2xl border border-rule bg-card p-6 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <SparklesIcon className="size-3.5" />
              Principal’s Portal
            </span>
            <Badge variant="outline" className="text-xs">
              {termText}
            </Badge>
            {data.term.resultsReleasedAt ? (
              <Badge variant="default" className="bg-success text-white">
                Results Released
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-xs">
                <ClockIcon className="size-3" />
                Scores In Progress
              </Badge>
            )}
          </div>
          {data.school.principalName && (
            <p className="type-caption text-muted-foreground">
              {data.school.principalTitle}: <strong className="text-foreground">{data.school.principalName}</strong>
            </p>
          )}
        </div>

        <div>
          <h1 className="type-display">{data.school.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Academic oversight, teacher submission tracking, and instant master results webview.
          </p>
        </div>

        {/* Executive KPI Cards */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Card 1: Scores Submitted */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-rule bg-background p-4">
            <span className="type-caption flex items-center justify-between text-muted-foreground">
              Score Submissions
              <BookOpenIcon className="size-4 text-primary" />
            </span>
            <div className="flex items-baseline gap-2">
              <span className="type-title type-figure font-bold text-foreground">
                {data.summary.overallScorePercent}%
              </span>
              <span className="type-caption text-muted-foreground">
                {data.summary.completedSubjectOfferings}/{data.summary.totalSubjectOfferings} subjects
              </span>
            </div>
            <div
              className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-rule"
              role="progressbar"
              aria-label="Score submission progress"
              aria-valuenow={data.summary.overallScorePercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  data.summary.overallScorePercent === 100 ? "bg-success" : "bg-primary",
                )}
                style={{ width: `${data.summary.overallScorePercent}%` }}
              />
            </div>
          </div>

          {/* Card 2: Form Teacher Remarks */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-rule bg-background p-4">
            <span className="type-caption flex items-center justify-between text-muted-foreground">
              Teacher Remarks
              <MessageSquareIcon className="size-4 text-primary" />
            </span>
            <div className="flex items-baseline gap-2">
              <span className="type-title type-figure font-bold text-foreground">
                {data.summary.overallRemarkPercent}%
              </span>
              <span className="type-caption text-muted-foreground">
                {data.summary.totalRemarksEntered}/{data.summary.totalRemarksExpected} remarks
              </span>
            </div>
            <div
              className="relative mt-1 h-2 w-full overflow-hidden rounded-full bg-rule"
              role="progressbar"
              aria-label="Teacher remark progress"
              aria-valuenow={data.summary.overallRemarkPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${data.summary.overallRemarkPercent}%` }}
              />
            </div>
          </div>

          {/* Card 3: Lagging Classes Alert */}
          <div
            className={cn(
              "flex flex-col gap-1.5 rounded-xl border p-4",
              data.summary.laggingClasses > 0
                ? "border-warning/30 bg-warning-wash/50 text-foreground"
                : "border-rule bg-background",
            )}
          >
            <span className="type-caption flex items-center justify-between text-muted-foreground">
              Lagging Classes
              {data.summary.laggingClasses > 0 ? (
                <AlertTriangleIcon className="size-4 text-warning" />
              ) : (
                <CheckCircle2Icon className="size-4 text-success" />
              )}
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "type-title type-figure font-bold",
                  data.summary.laggingClasses > 0 ? "text-warning" : "text-foreground",
                )}
              >
                {data.summary.laggingClasses}
              </span>
              <span className="type-caption text-muted-foreground">
                of {data.summary.totalClasses} classes
              </span>
            </div>
            <span className="type-caption text-xs text-muted-foreground">
              {data.summary.laggingClasses > 0 ? "Require follow-up before term close" : "All classes fully ready"}
            </span>
          </div>

          {/* Card 4: Total Enrolled */}
          <div className="flex flex-col gap-1.5 rounded-xl border border-rule bg-background p-4">
            <span className="type-caption flex items-center justify-between text-muted-foreground">
              Active Enrolment
              <UsersIcon className="size-4 text-primary" />
            </span>
            <div className="flex items-baseline gap-2">
              <span className="type-title type-figure font-bold text-foreground">
                {data.summary.totalStudents}
              </span>
              <span className="type-caption text-muted-foreground">students</span>
            </div>
            <span className="type-caption text-xs text-muted-foreground">
              Across {data.summary.totalClasses} active arms
            </span>
          </div>
        </div>
      </header>

      {/* View Switcher Tabs & Filter Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation Tabs */}
        <div className="flex rounded-xl border border-rule bg-card p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab("tracker")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "tracker"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <UserCheckIcon className="size-4" />
            Teacher Lagging Tracker
            {data.summary.laggingClasses > 0 && (
              <span
                className={cn(
                  "ml-1 flex size-5 items-center justify-center rounded-full text-xs font-bold",
                  activeTab === "tracker" ? "bg-white text-primary" : "bg-warning text-white",
                )}
              >
                {data.summary.laggingClasses}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("broadsheet")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === "broadsheet"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileSpreadsheetIcon className="size-4" />
            Master Results (Broadsheets)
          </button>
        </div>

        {/* Search & Quick Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={searchInputId}
              type="search"
              placeholder="Search class or teacher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>

          {activeTab === "tracker" && (
            <div className="flex rounded-lg border border-rule bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  filter === "all" ? "bg-accent font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                All ({data.summary.totalClasses})
              </button>
              <button
                type="button"
                onClick={() => setFilter("lagging")}
                className={cn(
                  "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  filter === "lagging"
                    ? "bg-warning/20 font-semibold text-warning"
                    : "text-muted-foreground hover:text-warning",
                )}
              >
                Lagging ({data.summary.laggingClasses})
              </button>
              <button
                type="button"
                onClick={() => setFilter("up_to_date")}
                className={cn(
                  "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  filter === "up_to_date"
                    ? "bg-success/20 font-semibold text-success"
                    : "text-muted-foreground hover:text-success",
                )}
              >
                Up to Date ({data.summary.upToDateClasses})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {allFilteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-input bg-card p-10 text-center">
          <p className="type-heading">No classes match your filter</p>
          <p className="mt-1 type-caption text-muted-foreground">
            Try clearing your search term or switching the status filter to &ldquo;All&rdquo;.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Reset Filters
          </Button>
        </div>
      ) : activeTab === "tracker" ? (
        /* TAB 1: TEACHER LAGGING TRACKER */
        <div className="flex flex-col gap-8">
          {filteredSections.map((section) => (
            <section key={section.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-rule pb-2">
                <h2 className="type-title text-foreground">{section.name}</h2>
                <span className="type-caption text-muted-foreground">
                  {section.classes.length} {section.classes.length === 1 ? "class" : "classes"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {section.classes.map((cls) => {
                  const teacherDisplay = cls.teacher
                    ? `${cls.teacher.title ? cls.teacher.title + " " : ""}${cls.teacher.fullName}`
                    : "No Form Teacher Assigned";

                  return (
                    <article
                      key={cls.id}
                      className={cn(
                        "flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition-colors",
                        cls.status === "up_to_date"
                          ? "border-rule hover:border-success/40"
                          : "border-warning/30 bg-warning-wash/10 hover:border-warning/60",
                      )}
                    >
                      <div className="flex flex-col gap-3.5">
                        {/* Class Name + Status Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/${slug}/classes/${cls.id}`}
                              className="type-heading font-bold text-foreground hover:underline"
                            >
                              {cls.name}
                            </Link>
                            <span className="ml-2 type-caption text-muted-foreground">
                              {cls.totalStudents} {cls.totalStudents === 1 ? "student" : "students"}
                            </span>
                          </div>

                          {cls.status === "up_to_date" && (
                            <Badge variant="outline" className="gap-1 border-success/30 bg-success-wash text-success">
                              <CheckCircle2Icon className="size-3" />
                              All Caught Up
                            </Badge>
                          )}
                          {cls.status === "scores_lagging" && (
                            <Badge variant="outline" className="gap-1 border-warning/30 bg-warning-wash text-warning">
                              <AlertTriangleIcon className="size-3" />
                              Scores Pending
                            </Badge>
                          )}
                          {cls.status === "remarks_lagging" && (
                            <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              <MessageSquareIcon className="size-3" />
                              Remarks Pending
                            </Badge>
                          )}
                          {cls.status === "severely_lagging" && (
                            <Badge variant="destructive" className="gap-1">
                              <XCircleIcon className="size-3" />
                              Lagging Behind
                            </Badge>
                          )}
                          {cls.status === "no_teacher" && (
                            <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                              Unassigned Teacher
                            </Badge>
                          )}
                        </div>

                        {/* Form Teacher Details & Contact Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rule/60 bg-background/80 p-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <UserCheckIcon className="size-4" />
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-foreground">{teacherDisplay}</p>
                              <p className="text-[11px] text-muted-foreground">Form Master</p>
                            </div>
                          </div>

                          {cls.teacher?.phone && (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`tel:${cls.teacher.phone}`}
                                title={`Call ${teacherDisplay}`}
                                className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                              >
                                <PhoneIcon className="size-3" />
                                <span className="type-figure">{cls.teacher.phone}</span>
                              </a>
                              <button
                                type="button"
                                title="Copy phone number"
                                onClick={() => handleCopyPhone(cls.teacher!.phone)}
                                className="rounded-md border border-rule p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                {copiedPhone === cls.teacher.phone ? (
                                  <CheckCircle2Icon className="size-3 text-success" />
                                ) : (
                                  <CopyIcon className="size-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Score Submission Progress */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Scores submitted:</span>
                            <span className="font-semibold text-foreground">
                              {cls.scores.completedSubjects} of {cls.scores.totalSubjects} subjects ({cls.scores.percent}%)
                            </span>
                          </div>
                          <div
                            className="relative h-2 w-full overflow-hidden rounded-full bg-rule"
                            role="progressbar"
                            aria-label={`Score submission progress for ${cls.name}`}
                            aria-valuenow={cls.scores.percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                cls.scores.percent === 100 ? "bg-success" : "bg-primary",
                              )}
                              style={{ width: `${cls.scores.percent}%` }}
                            />
                          </div>

                          {/* Specific Lagging Subjects */}
                          {cls.scores.unfinished.length > 0 && (
                            <div className="mt-1 flex flex-col gap-1">
                              <span className="text-[11px] font-medium text-warning">
                                ⚠ {cls.scores.unfinished.length} unfinished {cls.scores.unfinished.length === 1 ? "subject" : "subjects"}:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {cls.scores.unfinished.map((u) => (
                                  <span
                                    key={u.classSubjectId}
                                    className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning-wash/80 px-2 py-0.5 text-[11px] font-medium text-foreground"
                                  >
                                    <span>{u.name}</span>
                                    <span className="text-warning font-semibold">
                                      ({u.complete}/{u.takers})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Remarks Progress */}
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Teacher remarks:</span>
                            <span className="font-semibold text-foreground">
                              {cls.remarks.entered} of {cls.remarks.totalStudents} ({cls.remarks.percent}%)
                            </span>
                          </div>
                          <div
                            className="relative h-1.5 w-full overflow-hidden rounded-full bg-rule"
                            role="progressbar"
                            aria-label={`Teacher remark progress for ${cls.name}`}
                            aria-valuenow={cls.remarks.percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-300",
                                cls.remarks.percent === 100 ? "bg-success" : "bg-primary",
                              )}
                              style={{ width: `${cls.remarks.percent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="mt-4 flex items-center justify-between border-t border-rule/60 pt-3">
                        <Link
                          href={`/${slug}/classes/${cls.id}`}
                          className="type-caption flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          Class roster <ChevronRightIcon className="size-3.5" />
                        </Link>

                        {/* Master Results Broadsheet Webview Button */}
                        <Link
                          href={`/${slug}/classes/${cls.id}/broadsheet`}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
                        >
                          <FileSpreadsheetIcon className="size-3.5" />
                          View Broadsheet
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* TAB 2: MASTER RESULTS (BROADSHEETS WEBVIEW ROSTER) */
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="type-title">Master Compilation Sheets (Webview)</h2>
            <p className="type-caption text-muted-foreground">
              Review entire class grades, CA 1, CA 2, Exams, totals, positions, and averages across all arms on screen.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-rule bg-card shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-rule bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <th scope="col" className="p-3.5 pl-4">Class Arm</th>
                    <th scope="col" className="p-3.5">Section</th>
                    <th scope="col" className="p-3.5">Form Master</th>
                    <th scope="col" className="p-3.5 text-center">Students</th>
                    <th scope="col" className="p-3.5 text-center">Scores</th>
                    <th scope="col" className="p-3.5 text-center">Remarks</th>
                    <th scope="col" className="p-3.5">Readiness</th>
                    <th scope="col" className="p-3.5 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule text-sm">
                  {allFilteredClasses.map((cls) => {
                    const isComplete = cls.status === "up_to_date";
                    const teacherDisplay = cls.teacher
                      ? `${cls.teacher.title ? cls.teacher.title + " " : ""}${cls.teacher.fullName}`
                      : "Unassigned";

                    return (
                      <tr key={cls.id} className="transition-colors hover:bg-accent/40">
                        <td className="p-3.5 pl-4 font-bold text-foreground">
                          <Link href={`/${slug}/classes/${cls.id}`} className="hover:underline">
                            {cls.name}
                          </Link>
                        </td>
                        <td className="p-3.5 type-caption text-muted-foreground">{cls.sectionName}</td>
                        <td className="p-3.5 text-xs text-foreground">
                          {teacherDisplay}
                          {cls.teacher?.phone && (
                            <span className="block type-caption text-muted-foreground">{cls.teacher.phone}</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center type-figure font-semibold">{cls.totalStudents}</td>
                        <td className="p-3.5 text-center">
                          <span
                            className={cn(
                              "type-figure font-semibold text-xs",
                              cls.scores.percent === 100 ? "text-success" : "text-primary",
                            )}
                          >
                            {cls.scores.percent}%
                          </span>
                          <span className="block type-caption text-[11px] text-muted-foreground">
                            {cls.scores.completedSubjects}/{cls.scores.totalSubjects}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={cn(
                              "type-figure font-semibold text-xs",
                              cls.remarks.percent === 100 ? "text-success" : "text-primary",
                            )}
                          >
                            {cls.remarks.percent}%
                          </span>
                          <span className="block type-caption text-[11px] text-muted-foreground">
                            {cls.remarks.entered}/{cls.remarks.totalStudents}
                          </span>
                        </td>
                        <td className="p-3.5">
                          {isComplete ? (
                            <Badge variant="outline" className="border-success/30 bg-success-wash text-success">
                              Complete
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-warning/30 bg-warning-wash text-warning">
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="p-3.5 pr-4 text-right">
                          {/* Broadsheet Webview Button */}
                          <Link
                            href={`/${slug}/classes/${cls.id}/broadsheet`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rule bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                          >
                            <ExternalLinkIcon className="size-3.5" />
                            Open Broadsheet
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
