"use client";

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

/** removes: the action deletes something, so its button is the red pen. */
export type FixConfirm = { title: string; description: string; action: string; removes?: boolean };

/**
 * Asked in the browser before a fix that reprints differently (spec 0007,
 * AC-2 to AC-4). It guards against slips, so the server needs no flag for it.
 */
export function ConfirmFix({ confirm, onConfirm, onCancel }: { confirm: FixConfirm | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        {confirm && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it as it was</AlertDialogCancel>
              <AlertDialogAction variant={confirm.removes ? "destructive" : "default"} onClick={onConfirm}>
                {confirm.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
