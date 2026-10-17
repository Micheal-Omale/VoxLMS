"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVerticalIcon, PencilIcon, PowerIcon, Trash2Icon } from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { removeClassAction, restoreClassAction, saveClassAction } from "../../curriculum-actions";

type Cls = { id: string; name: string; arm: string | null; isActive: boolean; inUse: boolean; studentsNow: number };

/** Rename, remove or switch off one class (spec 0006, AC-3, AC-8). */
export function ClassMenu({ schoolId, cls }: { schoolId: string; cls: Cls }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"none" | "rename" | "remove">("none");
  const [name, setName] = useState(cls.name);
  const [arm, setArm] = useState(cls.arm ?? "");
  const [error, setError] = useState<{ field: string; error: string } | null>(null);

  if (!cls.isActive) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await restoreClassAction(schoolId, cls.id);
            if (result.ok) {
              toast.add({ title: `${cls.name} is back on`, type: "success" });
              router.refresh();
            }
          })
        }
      >
        {pending && <Spinner data-icon="inline-start" />}
        Switch back on
      </Button>
    );
  }

  function rename(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await saveClassAction(schoolId, cls.id, name, arm || null);
      if (!result.ok) {
        setError({ field: result.field, error: result.error });
        return;
      }
      setDialog("none");
      toast.add({ title: `Renamed to ${name.trim()}`, type: "success" });
      router.refresh();
    });
  }

  function remove() {
    setDialog("none");
    start(async () => {
      const result = await removeClassAction(schoolId, cls.id);
      if (!result.ok) toast.add({ title: result.error, type: "error" });
      else {
        toast.add({ title: result.outcome === "deleted" ? `${cls.name} removed` : `${cls.name} switched off`, type: "success" });
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${cls.name}`} disabled={pending} />}>
          {pending ? <Spinner /> : <EllipsisVerticalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setName(cls.name);
                setArm(cls.arm ?? "");
                setError(null);
                setDialog("rename");
              }}
            >
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("remove")}>
              {cls.inUse ? <PowerIcon /> : <Trash2Icon />}
              {cls.inUse ? "Switch off" : "Remove"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => !open && setDialog("none")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename {cls.name}</DialogTitle>
            <DialogDescription>The class keeps its level, section, students and scores.</DialogDescription>
          </DialogHeader>
          <form onSubmit={rename} className="flex flex-col gap-5">
            <FieldGroup>
              <Field data-invalid={error?.field === "name" ? true : undefined}>
                <FieldLabel htmlFor={`name-${cls.id}`} className="type-label">
                  Class name
                </FieldLabel>
                <Input id={`name-${cls.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
                {error?.field === "name" && <FieldError>{error.error}</FieldError>}
              </Field>
              <Field data-invalid={error?.field === "arm" ? true : undefined}>
                <FieldLabel htmlFor={`arm-${cls.id}`} className="type-label">
                  Arm
                </FieldLabel>
                <Input id={`arm-${cls.id}`} value={arm} onChange={(e) => setArm(e.target.value)} maxLength={20} placeholder="None" className="sm:max-w-48" />
                {error?.field === "arm" && <FieldError>{error.error}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog("none")}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "remove"} onOpenChange={(open) => !open && setDialog("none")}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{cls.inUse ? `Switch off ${cls.name}?` : `Remove ${cls.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {cls.studentsNow > 0
                ? `${cls.name} has ${cls.studentsNow} ${cls.studentsNow === 1 ? "student" : "students"} this term. Move them to another class first.`
                : cls.inUse
                  ? `${cls.name} has had students or a form teacher, so it stays on past records. It leaves this session’s lists, and you can switch it back on.`
                  : `Nothing uses ${cls.name} yet, so it will be deleted with its subjects.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            {cls.studentsNow === 0 && (
              <AlertDialogAction variant="destructive" onClick={remove}>
                {cls.inUse ? "Switch off" : "Remove class"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
