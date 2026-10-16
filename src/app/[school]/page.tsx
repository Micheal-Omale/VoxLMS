import { Suspense } from "react";
import type { Metadata } from "next";
import { BookOpenIcon, UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getCurrentTerm, listHomeClasses, NoCurrentTerm } from "@/server/data";

export const metadata: Metadata = { title: "Your classes" };

type Params = Promise<{ school: string }>;

export default function SchoolHome({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<HomeSkeleton />}>
        <Home params={params} />
      </Suspense>
    </main>
  );
}

async function Home({ params }: { params: Params }) {
  const { school: slug } = await params;
  const { ctx, viewer } = await requireSchoolContext(slug);
  const current = await getCurrentTerm(ctx).catch((error: unknown) => {
    if (error instanceof NoCurrentTerm) return null;
    throw error;
  });

  if (!current) {
    return (
      <Empty className="border border-dashed border-input bg-card">
        <EmptyHeader>
          <EmptyTitle className="type-heading">No current term yet</EmptyTitle>
          <EmptyDescription>
            The VoxLMS team sets the current term for your school. Message them if this is unexpected.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const classes = await listHomeClasses(ctx, { termId: current.term.id, sessionId: current.session.id });
  const term = termLabel(current.term.number, current.session.name);
  const firstName = viewer.name.split(" ").find((w) => !/^(mr|mrs|miss|ms|dr)\.?$/i.test(w));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="type-display">{viewer.isTeam ? "Classes" : `Good to see you, ${firstName}`}</h1>
        <p className="text-muted-foreground">
          {viewer.isTeam ? `Every class in ${term}.` : `Your ${classes.length === 1 ? "class" : "classes"} for ${term}.`}
        </p>
      </div>

      {classes.length === 0 ? (
        <Empty className="border border-dashed border-input bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle className="type-heading">No class assigned to you yet</EmptyTitle>
            <EmptyDescription>
              Once the school makes you form teacher of a class for this session, it appears here. Message the VoxLMS
              team if it should already be here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {classes.map((c) => (
            <li
              key={c.id}
              className="ruled-sheet flex flex-col gap-4 rounded-xl border border-rule py-5 pr-5 pl-[calc(var(--margin-x)+1rem)] [--margin-x:1.25rem]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="type-title">{c.name}</h2>
                <span className="flex items-center gap-1.5 type-caption text-muted-foreground">
                  <UsersIcon aria-hidden="true" className="size-3.5" />
                  <span className="type-figure">{c.students}</span> students
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5" aria-label={`Subjects in ${c.name}`}>
                {c.subjects.map((s) => (
                  <li key={s.id}>
                    <Badge variant="outline" className="h-7 gap-1.5 px-2.5 text-[0.8125rem] font-semibold">
                      <BookOpenIcon data-icon="inline-start" />
                      {s.name}
                      {s.isElective && <span className="font-normal text-muted-foreground">elective</span>}
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    </div>
  );
}
