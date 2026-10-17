"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, EllipsisVerticalIcon, PencilIcon, PowerIcon, Trash2Icon } from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { moveSubjectAction, removeSubjectAction, restoreSubjectAction } from "../../curriculum-actions";
import { type StandardOption, SubjectForm } from "./subject-form";

export type SubjectRow = {
  id: string;
  name: string;
  shortName: string;
  standardSubjectId: string | null;
  standardName: string | null;
  isActive: boolean;
  offeredNow: number;
  inUse: boolean;
};

type Props = { schoolId: string; sessionName: string | null; subjects: SubjectRow[]; standards: StandardOption[] };

/** The school's one subject order, with move, edit and remove (spec 0006, AC-1, AC-2, AC-8). */
export function SubjectList({ schoolId, sessionName, subjects, standards }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [removing, setRemoving] = useState<SubjectRow | null>(null);
  const active = subjects.filter((s) => s.isActive);
  const off = subjects.filter((s) => !s.isActive);
  const taken = subjects.map((s) => s.shortName);

  function act(id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success?: string) {
    setBusy(id);
    start(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) toast.add({ title: result.error, type: "error" });
      else {
        if (success) toast.add({ title: success, type: "success" });
        router.refresh();
      }
    });
  }

  const detail = (s: SubjectRow) =>
    [
      s.standardName === null ? "Not on the standard list" : s.standardName !== s.name ? `Standard list: ${s.standardName}` : null,
      sessionName ? (s.offeredNow > 0 ? `${s.offeredNow} ${s.offeredNow === 1 ? "class" : "classes"} in ${sessionName}` : "No class takes it yet") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      {active.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-5 text-muted-foreground">
          No subjects yet. Tick the subjects this school teaches from the standard list, then put them in the school’s order here.
        </p>
      ) : (
        <ol className="flex flex-col overflow-hidden rounded-lg border border-rule" aria-label="The school’s subjects in order">
          {active.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 border-b border-rule py-2 pr-1 pl-3 last:border-b-0 sm:gap-3 sm:pl-4">
              <span className="w-6 shrink-0 text-right type-figure text-muted-foreground" aria-hidden="true">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col py-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold">{s.name}</span>
                  <abbr title={`Short name for ${s.name}`} className="rounded-sm border border-rule px-1.5 type-caption font-semibold no-underline type-figure">
                    {s.shortName}
                  </abbr>
                </span>
                <span className="type-caption text-muted-foreground">{detail(s)}</span>
              </div>
              {busy === s.id && pending && <Spinner className="text-muted-foreground" />}
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${s.name} up`}
                  disabled={i === 0 || pending}
                  onClick={() => act(s.id, () => moveSubjectAction(schoolId, s.id, "up"))}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${s.name} down`}
                  disabled={i === active.length - 1 || pending}
                  onClick={() => act(s.id, () => moveSubjectAction(schoolId, s.id, "down"))}
                >
                  <ArrowDownIcon />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`More for ${s.name}`} disabled={pending} />}>
                    <EllipsisVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setEditing(s)}>
                        <PencilIcon />
                        Rename or change short name
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setRemoving(s)}>
                        {s.inUse ? <PowerIcon /> : <Trash2Icon />}
                        {s.inUse ? "Switch off" : "Remove"}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ol>
      )}

      {off.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="type-label">Switched off</h3>
          <p className="type-caption text-muted-foreground">Still shown on past report cards. Not offered to classes.</p>
          <ul className="flex flex-col overflow-hidden rounded-lg border border-dashed border-input">
            {off.map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-b border-rule px-4 py-2 last:border-b-0">
                <span className="flex-1 text-muted-foreground">
                  {s.name} <span className="type-caption type-figure">({s.shortName})</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => act(s.id, () => restoreSubjectAction(schoolId, s.id), `${s.name} is back on, at the end of the list`)}
                >
                  Switch back on
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>Score sheets and report cards show the new name straight away. Scores stay as they are.</DialogDescription>
          </DialogHeader>
          {editing && (
            <SubjectForm schoolId={schoolId} standards={standards} takenShortNames={taken} subject={editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.inUse ? `Switch off ${removing?.name}?` : `Remove ${removing?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.inUse
                ? `${removing?.name} has been used, so it is kept on past report cards. It leaves the subject pickers, and you can switch it back on later.`
                : `Nothing uses ${removing?.name} yet, so it will be deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const s = removing!;
                setRemoving(null);
                act(s.id, async () => {
                  const result = await removeSubjectAction(schoolId, s.id);
                  if (result.ok) toast.add({ title: result.outcome === "deleted" ? `${s.name} removed` : `${s.name} switched off`, type: "success" });
                  return result;
                });
              }}
            >
              {removing?.inUse ? "Switch off" : "Remove subject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
