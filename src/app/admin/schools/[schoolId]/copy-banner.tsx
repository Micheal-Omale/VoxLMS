"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { copySessionSetupAction } from "../curriculum-actions";

/** "Copy from <earlier session>" while the session being edited has nothing set (spec 0006, AC-9). */
export function CopyBanner({ schoolId, from, to }: { schoolId: string; from: { id: string; name: string }; to: { id: string; name: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function copy() {
    start(async () => {
      const result = await copySessionSetupAction(schoolId, from.id, to.id);
      if (!result.ok) {
        toast.add({ title: result.error, type: "error" });
        return;
      }
      const parts = [
        result.classes > 0 && `subjects for ${result.classes} ${result.classes === 1 ? "class" : "classes"}`,
        result.splits > 0 && `${result.splits} score ${result.splits === 1 ? "split" : "splits"}`,
        result.scales > 0 && `${result.scales} grade ${result.scales === 1 ? "scale" : "scales"}`,
      ].filter(Boolean);
      toast.add({ title: `Copied from ${from.name}`, description: `${parts.join(", ")}. Change anything that is different this session.`, type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="copy-heading" className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-accent p-4 sm:flex-row sm:items-center sm:p-5">
      <CopyIcon aria-hidden="true" className="hidden size-6 shrink-0 text-primary sm:block" />
      <div className="flex flex-1 flex-col gap-1">
        <h2 id="copy-heading" className="type-heading">
          {to.name} has nothing set up yet
        </h2>
        <p className="type-caption text-muted-foreground sm:text-sm">
          Copy {from.name}’s class subjects, score splits and grade scales, then change what is different. Only empty parts are filled; nothing is overwritten.
        </p>
      </div>
      <Button onClick={copy} disabled={pending} className="self-start sm:self-center">
        {pending && <Spinner data-icon="inline-start" />}
        Copy from {from.name}
      </Button>
    </section>
  );
}
