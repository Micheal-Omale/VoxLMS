"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { saveLevelOfferAction } from "../../curriculum-actions";
import { ClassMenu } from "./class-menu";
import { ClassOfferDialog } from "./class-offer-dialog";
import { type Elective, type Offered, OfferRow } from "./offer-row";

type Subject = { id: string; name: string; isActive: boolean };
type Offer = { subjectId: string; isElective: boolean };
export type ClassRow = {
  id: string;
  name: string;
  arm: string | null;
  isActive: boolean;
  studentsNow: number;
  inUse: boolean;
  offer: Offer[];
};
type Session = { id: string; name: string } | null;
type State = Record<string, { offered: Offered; elective: Elective }>;

const MAX = 20;

/** Each subject's state across a level's active arms: all, some or none of them, and elective or mixed. */
function levelState(arms: ClassRow[], subjects: Subject[]): State {
  const state: State = {};
  for (const s of subjects) {
    const flags = arms.flatMap((a) => a.offer.filter((o) => o.subjectId === s.id).map((o) => o.isElective));
    state[s.id] = {
      offered: flags.length === 0 ? false : flags.length === arms.length ? true : "some",
      elective: flags.length === 0 ? false : flags.every(Boolean) ? true : flags.some(Boolean) ? "mixed" : false,
    };
  }
  return state;
}

/** One level (JSS 1) with its arms and the subjects every arm offers (spec 0006, AC-3, AC-4, AC-8). */
export function LevelCard({
  schoolId,
  session,
  level,
  classes,
  previous,
  subjects,
}: {
  schoolId: string;
  session: Session;
  level: { id: string; name: string };
  classes: ClassRow[];
  /** The level before this one in the same section, if the school runs it. */
  previous: { name: string; classes: ClassRow[] } | null;
  subjects: Subject[];
}) {
  const arms = classes.filter((c) => c.isActive);
  const off = classes.filter((c) => !c.isActive);
  const initial = levelState(arms, subjects);
  // What the level before gives every one of its arms: the subjects a copy would tick.
  const before = previous ? levelState(previous.classes.filter((c) => c.isActive), subjects) : null;
  const copyable =
    previous && before
      ? { name: previous.name, subjects: subjects.filter((s) => s.isActive && before[s.id].offered === true).map((s) => ({ id: s.id, elective: before[s.id].elective === true })) }
      : null;
  const full = subjects.filter((s) => initial[s.id].offered === true).length;
  const students = arms.reduce((n, a) => n + a.studentsNow, 0);
  const [open, setOpen] = useState(false);

  const status = !session
    ? "Add a session to give it subjects"
    : arms.length === 0
      ? "Every class is switched off"
      : full === 0 && subjects.every((s) => initial[s.id].offered === false)
        ? "No subjects yet"
        : `${full} ${full === 1 ? "subject" : "subjects"}${subjects.some((s) => initial[s.id].offered === "some") ? ", some arms differ" : ""}`;
  const needsSubjects = session !== null && arms.length > 0 && arms.some((a) => a.offer.length === 0);

  return (
    <li className="overflow-hidden rounded-xl border border-rule bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`level-${level.id}`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent sm:px-5"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="type-heading">{level.name}</span>
            <span className="type-caption text-muted-foreground">
              {arms.length === 0
                ? "No active classes"
                : arms.every((a) => a.arm === null && a.name === level.name)
                  ? "One class"
                  : arms.map((a) => a.arm ?? a.name).join(" · ")}
            </span>
          </span>
          <span className={`type-caption ${needsSubjects ? "font-semibold text-warning" : "text-muted-foreground"}`}>
            {status}
            {students > 0 && ` · ${students} ${students === 1 ? "student" : "students"} this term`}
          </span>
        </span>
        <ChevronDownIcon aria-hidden="true" className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={`level-${level.id}`} className="flex flex-col gap-6 border-t border-rule px-4 py-5 sm:px-5">
          <section aria-label={`${level.name} classes`} className="flex flex-col gap-2">
            <h3 className="type-label">Classes</h3>
            <ul className="flex flex-col overflow-hidden rounded-lg border border-rule">
              {[...arms, ...off].map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-rule py-1.5 pr-1 pl-3 last:border-b-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={c.isActive ? "font-bold" : "font-bold text-muted-foreground"}>{c.name}</span>
                    <span className="type-caption text-muted-foreground">
                      {!c.isActive
                        ? "Switched off"
                        : c.studentsNow > 0
                          ? `${c.studentsNow} ${c.studentsNow === 1 ? "student" : "students"} this term`
                          : "No students this term"}
                    </span>
                  </span>
                  <ClassMenu schoolId={schoolId} cls={c} />
                </li>
              ))}
            </ul>
          </section>

          {session && arms.length > 0 ? (
            <LevelOffer
              // Fresh state whenever the saved offer changes.
              key={JSON.stringify(arms.map((a) => a.offer))}
              schoolId={schoolId}
              session={session}
              level={level}
              arms={arms}
              subjects={subjects}
              initial={initial}
              previous={copyable}
            />
          ) : (
            <p className="text-muted-foreground">
              {session ? `Switch one of ${level.name}’s classes back on to give it subjects.` : "Add a session on the Session and terms page, then give this level its subjects."}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function LevelOffer({
  schoolId,
  session,
  level,
  arms,
  subjects,
  initial,
  previous,
}: {
  schoolId: string;
  session: { id: string; name: string };
  level: { id: string; name: string };
  arms: ClassRow[];
  subjects: Subject[];
  initial: State;
  previous: { name: string; subjects: { id: string; elective: boolean }[] } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<State>(initial);
  const [error, setError] = useState<string | null>(null);
  const [onlyFor, setOnlyFor] = useState<ClassRow | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Subjects the level before has that this draft doesn't tick for every arm yet.
  const toCopy = previous?.subjects.filter((p) => state[p.id]?.offered !== true) ?? [];

  /** Ticks the level before's subjects in this draft. It only adds, and nothing is saved until Save is pressed. */
  function copyPrevious() {
    if (!previous || toCopy.length === 0) return;
    setState((st) => {
      const next = { ...st };
      for (const p of toCopy) next[p.id] = { offered: true, elective: p.elective };
      return next;
    });
    setCopied(
      `Ticked ${toCopy.length} ${toCopy.length === 1 ? "subject" : "subjects"} from ${previous.name}. Check them, then save.`,
    );
  }

  // Switched off subjects show only while some arm still offers them.
  const shown = subjects.filter((s) => s.isActive || initial[s.id].offered !== false);
  const changedIds = shown.filter((s) => state[s.id].offered !== initial[s.id].offered || state[s.id].elective !== initial[s.id].elective).map((s) => s.id);
  const forAll = shown.filter((s) => state[s.id].offered === true).length;
  // The biggest arm once these changes are saved, so going over 20 shows before saving.
  const anyArmCount = Math.max(
    ...arms.map((a) => {
      const ids = new Set(a.offer.map((o) => o.subjectId));
      for (const id of changedIds) {
        if (state[id].offered === true) ids.add(id);
        else if (state[id].offered === false) ids.delete(id);
      }
      return ids.size;
    }),
  );
  const multiArm = arms.length > 1;

  // What makes each arm different from the level: subjects only some arms take, and mixed electives.
  const differences = arms
    .map((a) => {
      const extra = shown.filter((s) => initial[s.id].offered === "some" && a.offer.some((o) => o.subjectId === s.id)).map((s) => s.name);
      const elective = shown
        .filter((s) => initial[s.id].elective === "mixed" && a.offer.some((o) => o.subjectId === s.id && o.isElective))
        .map((s) => `${s.name} as an elective`);
      return { arm: a, notes: [...extra.map((n) => `also ${n}`), ...elective] };
    })
    .filter((d) => d.notes.length > 0);

  function save() {
    const changes = changedIds.map((id) => {
      const s = state[id];
      return { subjectId: id, offered: s.offered === true, ...(s.offered === true && s.elective !== "mixed" ? { isElective: s.elective } : {}) };
    });
    start(async () => {
      const result = await saveLevelOfferAction(schoolId, level.id, session.id, changes);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.add({ title: `${level.name} subjects saved`, description: multiArm ? `Applied to ${arms.map((a) => a.name).join(", ")}.` : undefined, type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby={`offer-${level.id}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 id={`offer-${level.id}`} className="type-label">
            Subjects in {session.name}
          </h3>
          <p className="type-caption text-muted-foreground sm:text-sm">
            {multiArm
              ? `Ticked for every arm of ${level.name}. A dash means only some arms take it; tick it to give it to all.`
              : `Tick the subjects ${arms[0].name} takes. Mark electives, which students choose one by one.`}
          </p>
        </div>
        {previous && previous.subjects.length > 0 && shown.length > 0 && (
          <Button variant="outline" size="sm" className="shrink-0 self-start" onClick={copyPrevious} disabled={toCopy.length === 0}>
            <CopyIcon data-icon="inline-start" />
            {toCopy.length === 0 ? `Has all of ${previous.name}’s subjects` : `Copy ${previous.name}’s subjects`}
          </Button>
        )}
      </div>
      {copied && (
        <p aria-live="polite" className="rounded-lg border border-warning/30 bg-warning-wash p-3 type-caption text-foreground">
          {copied}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-4 text-muted-foreground">Add the school’s subjects on the Subjects page first.</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-lg border border-rule sm:grid sm:grid-cols-2 sm:[&>li]:border-r sm:[&>li:nth-child(2n)]:border-r-0">
          {shown.map((s) => (
            <OfferRow
              key={s.id}
              name={s.name}
              note={s.isActive ? null : "Switched off"}
              offered={state[s.id].offered}
              elective={state[s.id].elective}
              changed={changedIds.includes(s.id)}
              onOffered={(on) =>
                setState((st) => ({
                  ...st,
                  [s.id]: { offered: on, elective: on ? (initial[s.id].offered === false ? false : initial[s.id].elective) : false },
                }))
              }
              onElective={(on) => setState((st) => ({ ...st, [s.id]: { ...st[s.id], elective: on } }))}
            />
          ))}
        </ul>
      )}

      {multiArm && differences.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3">
          <h4 className="type-caption font-semibold">Arms that differ</h4>
          <ul className="flex flex-col gap-0.5 type-caption">
            {differences.map((d) => (
              <li key={d.arm.id}>
                <strong>{d.arm.name}</strong>: {d.notes.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-wash p-3 text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className={`flex-1 type-caption type-figure ${anyArmCount > MAX ? "font-semibold text-destructive" : "text-muted-foreground"}`} aria-live="polite">
          {forAll} {forAll === 1 ? "subject" : "subjects"} for every arm · at most {MAX} per class
          {changedIds.length > 0 && ` · ${changedIds.length} not saved yet`}
        </span>
        <div className="flex flex-wrap gap-2">
          {multiArm &&
            arms.map((a) => (
              <Button key={a.id} variant="outline" size="sm" onClick={() => setOnlyFor(a)} disabled={changedIds.length > 0}>
                {a.arm ?? a.name} only
              </Button>
            ))}
          {changedIds.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setState(initial);
                setError(null);
                setCopied(null);
              }}
            >
              Undo changes
            </Button>
          )}
          <Button onClick={save} disabled={pending || changedIds.length === 0}>
            {pending && <Spinner data-icon="inline-start" />}
            {multiArm ? `Save for all ${arms.length} arms` : `Save ${arms[0].name}`}
          </Button>
        </div>
      </div>

      {onlyFor && (
        <ClassOfferDialog
          key={onlyFor.id}
          schoolId={schoolId}
          sessionId={session.id}
          sessionName={session.name}
          cls={onlyFor}
          subjects={subjects}
          open
          onOpenChange={(o) => !o && setOnlyFor(null)}
        />
      )}
    </section>
  );
}
