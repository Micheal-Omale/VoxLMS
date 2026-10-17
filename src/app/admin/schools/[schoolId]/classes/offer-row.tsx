"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";

export type Offered = boolean | "some";
export type Elective = boolean | "mixed";

/**
 * One subject in an offer editor: ticked, partly ticked (some arms), or not,
 * and whether it is an elective (spec 0006, AC-4).
 */
export function OfferRow({
  name,
  note,
  offered,
  elective,
  changed,
  onOffered,
  onElective,
}: {
  name: string;
  note?: string | null;
  offered: Offered;
  elective: Elective;
  changed: boolean;
  onOffered: (next: boolean) => void;
  onElective: (next: boolean) => void;
}) {
  return (
    <li className="relative flex min-h-11 items-center gap-3 border-b border-rule pr-2 pl-3 last:border-b-0 data-[changed=true]:bg-warning-wash/60" data-changed={changed}>
      {changed && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-warning-mark" />}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2">
        <Checkbox checked={offered === true} indeterminate={offered === "some"} onCheckedChange={() => onOffered(offered !== true)} />
        <span className="flex min-w-0 flex-col">
          <span className={offered === false ? "text-muted-foreground" : undefined}>{name}</span>
          {note && <span className="type-caption text-muted-foreground">{note}</span>}
        </span>
      </label>
      {offered !== false && (
        <Toggle
          size="sm"
          variant="outline"
          pressed={elective === true}
          disabled={offered === "some"}
          onPressedChange={onElective}
          aria-label={`${name}: elective`}
          className="aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-primary"
        >
          {elective === "mixed" ? "Elective in some" : "Elective"}
        </Toggle>
      )}
    </li>
  );
}
