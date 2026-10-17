import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getClassesSetup } from "@/server/data/curriculum";
import { getSchoolSetup } from "@/server/data/setup";

import { CopyBanner } from "../copy-banner";
import { SessionSwitcher } from "../session-switcher";
import { SetupHeader } from "../setup-header";
import { AddClasses } from "./add-classes";
import { LevelCard } from "./level-card";

export const metadata: Metadata = { title: "Classes" };

type Params = Promise<{ schoolId: string }>;
type Search = Promise<{ session?: string | string[] }>;

export default function ClassesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Classes params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Classes({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { schoolId } = await params;
  const requested = (await searchParams).session;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, setup] = await Promise.all([
    getSchoolSetup(ctx),
    getClassesSetup(ctx, { sessionId: typeof requested === "string" ? requested : null }),
  ]);
  const { sessions, session, currentSessionId, copyFrom, sections, levels, classes, subjects } = setup;
  const base = `/admin/schools/${school.id}`;

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Classes"
        intro="Classes carry over from session to session. What each class takes is set per session: give a level its subjects once and every arm gets them, then change one arm only where it differs."
      />

      {sections.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-input bg-card p-5 sm:p-8">
          <h2 className="type-title">Add the school’s sections first</h2>
          <p className="max-w-xl text-muted-foreground">Every class belongs to a section (Primary, Junior Secondary or Senior Secondary), which sets its grading and who signs its report cards.</p>
          <Button nativeButton={false} render={<Link href={`${base}/sections`} />}>
            Go to sections
          </Button>
        </div>
      ) : (
        <>
          {session && <SessionSwitcher path={`${base}/classes`} sessions={sessions} selectedId={session.id} currentId={currentSessionId} />}
          {session && copyFrom && <CopyBanner schoolId={school.id} from={copyFrom} to={session} />}
          {!session && (
            <p className="rounded-xl border border-warning/30 bg-warning-wash p-4 text-warning">
              This school has no session yet. Classes can be made now; their subjects are set per session, so{" "}
              <Link href={`${base}/terms`} className="font-semibold underline underline-offset-4">
                add the session
              </Link>{" "}
              first to give them subjects.
            </p>
          )}

          <section aria-labelledby="add-heading" className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 id="add-heading" className="type-title">
                Add classes
              </h2>
              <p className="type-caption text-muted-foreground sm:text-sm">Tick the levels, type the arms once, and every class is made in one go.</p>
            </div>
            <AddClasses
              schoolId={school.id}
              sections={sections.map((s) => ({ stage: s.stage, name: s.name }))}
              levels={levels}
              existing={classes.map((c) => c.name)}
            />
          </section>

          {classes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">
              No classes yet. Tick the levels {school.name} runs above, and type its arms.
            </p>
          ) : (
            sections.map((section) => {
              const sectionLevels = levels.filter((l) => l.stage === section.stage && classes.some((c) => c.levelId === l.id));
              if (sectionLevels.length === 0) return null;
              return (
                <section key={section.id} aria-labelledby={`section-${section.id}`} className="flex flex-col gap-3">
                  <h2 id={`section-${section.id}`} className="type-title">
                    {section.name}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {sectionLevels.map((level, i) => {
                      // The level before, within this section only: Primary 6 never feeds JSS 1.
                      const before = sectionLevels[i - 1];
                      return (
                        <LevelCard
                          key={level.id}
                          schoolId={school.id}
                          session={session ? { id: session.id, name: session.name } : null}
                          level={{ id: level.id, name: level.name }}
                          classes={classes.filter((c) => c.levelId === level.id)}
                          previous={before ? { name: before.name, classes: classes.filter((c) => c.levelId === before.id) } : null}
                          subjects={subjects}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}
