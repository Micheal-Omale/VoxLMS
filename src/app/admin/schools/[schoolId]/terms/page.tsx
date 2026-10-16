import { Suspense } from "react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { SetupHeader } from "../setup-header";
import { MakeCurrentButton } from "./make-current-button";
import { SessionForm } from "./session-form";

export const metadata: Metadata = { title: "Session and terms" };

type Params = Promise<{ schoolId: string }>;

const longDate = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const show = (iso: string | null) => (iso ? longDate.format(new Date(`${iso}T00:00:00Z`)) : "not set");

export default function TermsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Terms params={params} />
    </Suspense>
  );
}

function nextSessionName(names: string[]) {
  const years = names.map((n) => Number(n.slice(5))).filter(Boolean);
  const start = years.length ? Math.max(...years) : new Date().getFullYear();
  return `${start}/${start + 1}`;
}

async function Terms({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const { school, sessions } = await getSchoolSetup(ctx);
  const newest = [...sessions].reverse();
  const blank = { startsOn: "", endsOn: "", nextTermBeginsOn: "", daysOpened: "" };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Session and terms"
        intro="Term dates for each session, and which term teachers are working in now. Switch the current term when the school confirms it has resumed."
      />

      {newest.map((session) => (
        <section
          key={session.id}
          aria-labelledby={`s-${session.id}`}
          className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-5 sm:p-8"
        >
          <h2 id={`s-${session.id}`} className="type-title">
            {session.name}
          </h2>
          <ul className="flex flex-col overflow-hidden rounded-lg border border-rule">
            {session.terms.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-3 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{termLabel(t.number, session.name)}</span>
                  <span className="type-caption text-muted-foreground">
                    {show(t.startsOn)} to {show(t.endsOn)}
                  </span>
                </span>
                {t.isCurrent ? (
                  <Badge className="bg-success-wash text-success">Current term</Badge>
                ) : (
                  <MakeCurrentButton schoolId={school.id} termId={t.id} label={termLabel(t.number, session.name)} />
                )}
              </li>
            ))}
          </ul>
          <details className="group">
            <summary className="cursor-pointer type-label text-primary underline-offset-4 hover:underline">Edit dates</summary>
            <div className="pt-5">
              <SessionForm
                schoolId={school.id}
                sessionId={session.id}
                name={session.name}
                showAttendance={school.showAttendance}
                submitLabel="Save dates"
                terms={session.terms.map((t) => ({
                  startsOn: t.startsOn,
                  endsOn: t.endsOn,
                  nextTermBeginsOn: t.nextTermBeginsOn ?? "",
                  daysOpened: t.daysOpened?.toString() ?? "",
                }))}
              />
            </div>
          </details>
        </section>
      ))}

      <section aria-labelledby="new-session" className="flex flex-col gap-5 rounded-xl border border-dashed border-input bg-card p-5 sm:p-8">
        <h2 id="new-session" className="type-title">
          {sessions.length === 0 ? "Add the current session" : "Add the next session"}
        </h2>
        <SessionForm
          // A fresh form (and no stale "saved" message) once a session is added.
          key={sessions.length}
          schoolId={school.id}
          sessionId={null}
          name={nextSessionName(sessions.map((s) => s.name))}
          showAttendance={school.showAttendance}
          submitLabel="Add session"
          terms={[blank, blank, blank]}
        />
      </section>
    </div>
  );
}
