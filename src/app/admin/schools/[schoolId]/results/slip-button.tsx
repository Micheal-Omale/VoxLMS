"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmFix, type FixConfirm } from "../confirm-fix";

// Makes PIN slips and saves their PDF (spec 0014, AC-6, AC-11). Posts the
// form fields to the slip route with fetch, saves the file as a download,
// shows a refusal under the button, then refreshes the page's counts.

function fileNameFrom(disposition: string | null) {
  const exact = disposition?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  if (exact) return decodeURIComponent(exact);
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? "PIN slips.pdf";
}

export function SlipButton({
  schoolId,
  fields,
  label,
  disabledNote,
  confirm,
  after,
  variant = "default",
}: {
  schoolId: string;
  fields: Record<string, string>;
  label: string;
  /** Shown instead of a working button, e.g. "Every student has a slip." */
  disabledNote?: string;
  confirm?: FixConfirm;
  /** Said once the file has been sent. */
  after?: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  async function make() {
    setAsking(false);
    setPending(true);
    setNote(null);
    try {
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) body.set(name, value);
      const response = await fetch(`/admin/schools/${schoolId}/results/slips`, { method: "POST", body });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        setNote({ text: json?.message ?? "The slips couldn’t be made. Try again.", error: true });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileNameFrom(response.headers.get("content-disposition"));
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (after) setNote({ text: after, error: false });
    } catch {
      setNote({ text: "The slips couldn’t be made. Check your connection and try again.", error: true });
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={variant}
        disabled={pending || disabledNote !== undefined}
        onClick={() => (confirm ? setAsking(true) : make())}
      >
        {pending ? "Making slips…" : label}
      </Button>
      {disabledNote && <p className="type-caption text-muted-foreground">{disabledNote}</p>}
      {note && (
        <p role={note.error ? "alert" : "status"} className={note.error ? "type-caption text-destructive" : "type-caption text-muted-foreground"}>
          {note.text}
        </p>
      )}
      {confirm && <ConfirmFix confirm={asking ? confirm : null} onConfirm={make} onCancel={() => setAsking(false)} />}
    </div>
  );
}
