import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultScale, defaultSplit } from "@/lib/grading-presets";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getGradingSetup } from "@/server/data/grading";
import { getSchoolSetup } from "@/server/data/setup";

import { CopyBanner } from "../copy-banner";
import { SessionSwitcher } from "../session-switcher";
import { SetupHeader } from "../setup-header";
import { ScaleEditor } from "./scale-editor";
import { SplitEditor } from "./split-editor";

export const metadata: Metadata = { title: "Score split and grades" };

type Params = Promise<{ schoolId: string }>;
type Search = Promise<{ session?: string | string[] }>;

export default function GradingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Grading params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Grading({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { schoolId } = await params;
  const requested = (await searchParams).session;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, setup] = await Promise.all([getSchoolSetup(ctx), getGradingSetup(ctx, { sessionId: typeof requested === "string" ? requested : null })]);
  const { sessions, session, currentSessionId, copyFrom, sections } = setup;
  const base = `/admin/schools/${school.id}`;

  const missing =
    sections.length === 0
      ? { title: "Add the school’s sections first", text: "Each section has its own score split and grade scale.", href: `${base}/sections`, action: "Go to sections" }
      : !session
        ? { title: "Add a session first", text: "Score splits and grade scales are set for each session.", href: `${base}/terms`, action: "Go to session and terms" }
        : null;

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Score split and grades"
        intro="How each section’s 100 marks are split, and which grade each total earns. Grades are worked out from the scale every time they are shown, so changing it never means entering scores again."
      />

      {missing || !session ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-input bg-card p-5 sm:p-8">
          <h2 className="type-title">{missing?.title}</h2>
          <p className="max-w-xl text-muted-foreground">{missing?.text}</p>
          {missing && (
            <Button nativeButton={false} render={<Link href={missing.href} />}>
              {missing.action}
            </Button>
          )}
        </div>
      ) : (
        <>
          <SessionSwitcher path={`${base}/grading`} sessions={sessions} selectedId={session.id} currentId={currentSessionId} />
          {copyFrom && <CopyBanner schoolId={school.id} from={copyFrom} to={session} />}
          {sections.map((s) => {
            const stage = s.stage === "nursery" ? "primary" : s.stage;
            const total = s.parts.reduce((sum, p) => sum + p.max, 0);
            const ready = s.parts.length > 0 && total === 100 && s.bands.length > 0;
            return (
              <section key={s.id} aria-labelledby={`grading-${s.id}`} className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-4 sm:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id={`grading-${s.id}`} className="type-title">
                    {s.name}
                  </h2>
                  {ready ? (
                    <Badge className="bg-success-wash text-success">Set for {session.name}</Badge>
                  ) : (
                    <Badge className="bg-warning-wash text-warning">
                      {s.parts.length === 0 && s.bands.length === 0 ? "Not set yet" : s.parts.length === 0 ? "Needs a score split" : "Needs a grade scale"}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-3">
                    <h3 className="type-heading">Score split</h3>
                    <SplitEditor
                      key={JSON.stringify(s.parts)}
                      schoolId={school.id}
                      sectionId={s.id}
                      sessionId={session.id}
                      sectionName={s.name}
                      saved={s.parts}
                      starter={defaultSplit(stage).parts}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-3">
                    <h3 className="type-heading">Grade scale</h3>
                    <ScaleEditor
                      key={JSON.stringify(s.bands)}
                      schoolId={school.id}
                      sectionId={s.id}
                      sessionId={session.id}
                      sectionName={s.name}
                      sessionName={session.name}
                      saved={s.bands}
                      starter={defaultScale(stage).bands}
                    />
                  </div>
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
