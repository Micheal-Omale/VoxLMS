"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { saveClassOfferAction } from "../../curriculum-actions";
import { OfferRow } from "./offer-row";

type Subject = { id: string; name: string; isActive: boolean };
type Offer = { subjectId: string; isElective: boolean };

const MAX = 20;

/** Changes one arm's subjects only, so it can differ from its level (spec 0006, AC-4). */
export function ClassOfferDialog({
  schoolId,
  sessionId,
  sessionName,
  cls,
  subjects,
  open,
  onOpenChange,
}: {
  schoolId: string;
  sessionId: string;
  sessionName: string;
  cls: { id: string; name: string; offer: Offer[] };
  subjects: Subject[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [offer, setOffer] = useState<Offer[]>(cls.offer);
  const [error, setError] = useState<string | null>(null);
  // Switched off subjects show only while this class still offers them.
  const shown = subjects.filter((s) => s.isActive || cls.offer.some((o) => o.subjectId === s.id));
  const has = (id: string) => offer.find((o) => o.subjectId === id);
  const was = (id: string) => cls.offer.find((o) => o.subjectId === id);

  function save() {
    start(async () => {
      const result = await saveClassOfferAction(schoolId, cls.id, sessionId, offer);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      onOpenChange(false);
      toast.add({ title: `${cls.name}’s subjects saved`, type: "success" });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOffer(cls.offer);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{cls.name} only</DialogTitle>
          <DialogDescription>
            Subjects for {cls.name} in {sessionName}. Other arms stay as they are.
          </DialogDescription>
        </DialogHeader>
        <ul className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-rule">
          {shown.map((s) => {
            const now = has(s.id);
            const before = was(s.id);
            return (
              <OfferRow
                key={s.id}
                name={s.name}
                note={s.isActive ? null : "Switched off"}
                offered={Boolean(now)}
                elective={now?.isElective ?? false}
                changed={Boolean(now) !== Boolean(before) || (now !== undefined && before !== undefined && now.isElective !== before.isElective)}
                onOffered={(on) => setOffer((o) => (on ? [...o, { subjectId: s.id, isElective: false }] : o.filter((x) => x.subjectId !== s.id)))}
                onElective={(on) => setOffer((o) => o.map((x) => (x.subjectId === s.id ? { ...x, isElective: on } : x)))}
              />
            );
          })}
        </ul>
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash p-3 text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className={`type-caption type-figure ${offer.length > MAX ? "font-semibold text-destructive" : "text-muted-foreground"}`} aria-live="polite">
            {offer.length} of {MAX} subjects
          </span>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || offer.length > MAX}>
              {pending && <Spinner data-icon="inline-start" />}
              Save {cls.name}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
