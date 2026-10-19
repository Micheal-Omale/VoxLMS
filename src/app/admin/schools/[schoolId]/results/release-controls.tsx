"use client";

import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { releaseTermAction, withdrawReleaseAction } from "../../results-actions";

// Release or withdraw a term's results (spec 0014, AC-2, AC-3), each behind a confirm.

export function ReleaseControls({
  schoolId,
  termId,
  termName,
  released,
  notReady,
}: {
  schoolId: string;
  termId: string;
  /** "First Term" */
  termName: string;
  released: boolean;
  /** "JSS 1 Gold: 4 students missing scores", one per class that isn't ready. */
  notReady: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setOpen(false);
    setError(null);
    start(async () => {
      const result = await (released ? withdrawReleaseAction : releaseTermAction)(schoolId, termId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant={released ? "outline" : "default"} disabled={pending} onClick={() => setOpen(true)}>
        {pending ? "Saving…" : released ? "Withdraw release" : `Release ${termName} results`}
      </Button>
      {error && (
        <p role="alert" className="type-caption text-destructive">
          {error}
        </p>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{released ? "Withdraw the release?" : `Release ${termName} results?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {released
                ? "Parents will see ‘results are not out yet’ at once. Slips keep working for when you release again."
                : "Parents with slips can see their child’s result at once, and these results can’t be changed until the release is withdrawn."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!released && notReady.length > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">Some classes are not ready:</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {notReady.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">Parents in these classes will see ‘not ready yet’ until every score is in.</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={released ? "destructive" : "default"} onClick={confirm}>
              {released ? "Withdraw release" : "Release results"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
