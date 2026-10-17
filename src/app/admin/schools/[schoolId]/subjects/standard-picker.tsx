"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { addStandardSubjectsAction } from "../../curriculum-actions";

type Standard = { id: string; name: string; added: boolean };

/** Ticks subjects from the shared Nigerian list (spec 0006, AC-1). */
export function StandardPicker({ schoolId, standards }: { schoolId: string; standards: Standard[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const left = standards.filter((s) => !s.added);
  const shown = left.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));

  if (left.length === 0) {
    return <p className="text-muted-foreground">Every subject on the standard list is already on this school’s list.</p>;
  }

  const toggle = (id: string, on: boolean) => setTicked((t) => (on ? [...t, id] : t.filter((x) => x !== id)));

  function add() {
    // Keep the list's own order, not the order they were ticked in.
    const ids = left.filter((s) => ticked.includes(s.id)).map((s) => s.id);
    start(async () => {
      const result = await addStandardSubjectsAction(schoolId, ids);
      if (!result.ok) {
        toast.add({ title: result.error, type: "error" });
        return;
      }
      toast.add({ title: `Added ${result.added} ${result.added === 1 ? "subject" : "subjects"} at the end of the list`, type: "success" });
      setTicked([]);
      setQuery("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a subject"
          aria-label="Find a subject on the standard list"
          className="pl-9"
        />
      </div>
      <fieldset className="min-w-0">
        <legend className="sr-only">Standard subjects not on this school’s list yet</legend>
        <ul className="flex max-h-80 flex-col overflow-y-auto rounded-lg border border-rule">
          {shown.map((s) => (
            <li key={s.id} className="border-b border-rule last:border-b-0">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent">
                <Checkbox checked={ticked.includes(s.id)} onCheckedChange={(on) => toggle(s.id, on === true)} />
                <span>{s.name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-4 text-muted-foreground">No standard subject matches “{query.trim()}”. Add it as the school’s own below.</li>}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="type-caption text-muted-foreground" aria-live="polite">
          {ticked.length === 0 ? "Tick the subjects the school teaches." : `${ticked.length} ticked`}
        </span>
        <Button onClick={add} disabled={pending || ticked.length === 0}>
          {pending && <Spinner data-icon="inline-start" />}
          {ticked.length > 1 ? `Add ${ticked.length} subjects` : "Add subject"}
        </Button>
      </div>
    </div>
  );
}
