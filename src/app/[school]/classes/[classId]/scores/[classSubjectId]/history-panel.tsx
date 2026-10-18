"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, CircleAlertIcon, XIcon } from "lucide-react";

import { noticeName } from "@/components/score-sheet/score-sheet";
import type { SheetStudent } from "@/components/score-sheet/types";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";

import { type HistoryResult, scoreHistoryAction } from "../../../score-actions";

type HistoryPanelProps = {
  slug: string;
  termId: string;
  classSubjectId: string;
  subjectName: string;
  termName: string;
  student: SheetStudent | null;
  onClose: () => void;
};

const when = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Africa/Lagos",
});

/**
 * Every change to one student's scores in this subject and term, newest first
 * (spec 0009, AC-11): a side panel on a computer, full screen on a phone.
 */
export function HistoryPanel({ student, onClose, ...props }: HistoryPanelProps) {
  return (
    <Drawer open={student !== null} onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:30rem] data-[swipe-direction=right]:rounded-l-none sm:data-[swipe-direction=right]:rounded-l-xl">
        {student && <HistoryBody key={student.id} student={student} {...props} />}
      </DrawerContent>
    </Drawer>
  );
}

type Loaded = { result: HistoryResult } | { error: true };

function HistoryBody({ slug, termId, classSubjectId, subjectName, termName, student }: Omit<HistoryPanelProps, "student" | "onClose"> & { student: SheetStudent }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    scoreHistoryAction(slug, { termId, classSubjectId, studentId: student.id })
      .then((result) => live && setLoaded({ result }))
      .catch(() => live && setLoaded({ error: true }));
    return () => {
      live = false;
    };
  }, [slug, termId, classSubjectId, student.id, attempt]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-rule px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <DrawerTitle className="type-title text-foreground">
            <span className="font-extrabold">{student.surname}</span> <span className="font-normal">{student.otherNames}</span>
          </DrawerTitle>
          <DrawerDescription className="type-caption text-muted-foreground">
            Score history · {subjectName} · {termName}
            {student.number && (
              <>
                {" · "}
                <span className="type-figure">{student.number}</span>
              </>
            )}
          </DrawerDescription>
        </div>
        <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
          <XIcon />
        </DrawerClose>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6" aria-busy={loaded === null}>
        {loaded === null ? (
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : "error" in loaded ? (
          <Problem
            text="Couldn't load the history. Check your connection and try again."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoaded(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            }
          />
        ) : !loaded.result.ok ? (
          <Problem
            text={
              loaded.result.kind === "signedOut"
                ? "You were signed out. Sign in again to see the history."
                : `${noticeName(student)} is no longer on this sheet. Reload the page.`
            }
          />
        ) : loaded.result.parts.every((p) => p.changes.length === 0) ? (
          <p className="text-muted-foreground">No changes yet.</p>
        ) : (
          loaded.result.parts.map((part) => (
            <section key={part.key} aria-labelledby={`history-${part.key}`} className="flex flex-col gap-2">
              <h3 id={`history-${part.key}`} className="type-heading">
                {part.label}
              </h3>
              {part.changes.length === 0 ? (
                <p className="type-caption text-muted-foreground">No changes</p>
              ) : (
                <ol className="ruled-sheet flex flex-col rounded-xl border border-rule [--margin-x:0px]">
                  {part.changes.map((change, i) => (
                    <li key={i} className="flex flex-col gap-0.5 border-b border-rule px-3 py-2.5 last:border-b-0">
                      <span className="flex items-center gap-2 type-score">
                        <span className={change.oldValue === null ? "text-muted-foreground/60" : "text-muted-foreground"}>{change.oldValue ?? "–"}</span>
                        <ArrowRightIcon aria-label="changed to" className="size-4 text-muted-foreground" />
                        <span>{change.newValue ?? "–"}</span>
                        {change.newValue === null && <span className="type-caption font-normal text-muted-foreground">(cleared)</span>}
                      </span>
                      <span className="type-caption text-muted-foreground">
                        {change.by} ·{" "}
                        <time dateTime={change.changedAt} suppressHydrationWarning>
                          {when.format(new Date(change.changedAt))}
                        </time>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function Problem({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="flex items-start gap-2 font-semibold text-destructive">
        <CircleAlertIcon aria-hidden="true" className="mt-1 size-4 shrink-0" />
        {text}
      </p>
      {action}
    </div>
  );
}
