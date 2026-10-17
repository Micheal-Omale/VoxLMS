"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

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

import { setCurrentTermAction } from "../../setup-actions";

export function MakeCurrentButton({ schoolId, termId, label }: { schoolId: string; termId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>Make current</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Make {label} the current term?</AlertDialogTitle>
          <AlertDialogDescription>
            Every teacher at this school sees {label} straight away, and new scores go into it. Do this when the school
            confirms it has resumed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const result = await setCurrentTermAction(schoolId, termId);
                toast.add({ title: `${label} is now the current term`, description: result?.message || undefined, type: "success", timeout: result?.message ? 10000 : undefined });
                router.refresh();
              })
            }
          >
            Make it current
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
