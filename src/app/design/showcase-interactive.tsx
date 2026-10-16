"use client";

import { useState } from "react";

import { RedPenCircle } from "@/components/red-pen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: "Scores saved",
            description: "Mathematics, JSS 2 Gold",
            type: "success",
          })
        }
      >
        Show a saved message
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: "Report cards not ready",
            description: "3 students still have missing scores in Basic Science.",
            type: "error",
          })
        }
      >
        Show an error message
      </Button>
    </div>
  );
}

export function ConfirmDemo() {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Discard unsaved scores</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard scores for 4 students?</AlertDialogTitle>
          <AlertDialogDescription>
            The scores you typed since your last save will be removed from this device. Saved scores
            are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep typing</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Discard scores</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Replays the red-pen stroke so its timing can be judged. */
export function RedPenSpecimen() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative w-20">
        <input
          readOnly
          aria-label="CA 1, out of 20 (example)"
          aria-invalid
          value="25"
          className="h-12 w-full rounded-md border border-destructive/60 bg-card text-center type-score text-destructive outline-none"
        />
        <RedPenCircle key={run} />
      </div>
      <Button variant="ghost" size="sm" onClick={() => setRun((n) => n + 1)}>
        Replay the mark
      </Button>
    </div>
  );
}
