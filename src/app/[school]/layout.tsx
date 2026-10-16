import { Suspense } from "react";
import { EyeIcon } from "lucide-react";

import { AppBar } from "@/components/app-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getCurrentTerm, NoCurrentTerm } from "@/server/data";

import { StopViewingButton } from "./stop-viewing-button";

type Params = Promise<{ school: string }>;

export default function SchoolLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <SchoolShell params={params}>{children}</SchoolShell>
    </Suspense>
  );
}

async function SchoolShell({ params, children }: { params: Params; children: React.ReactNode }) {
  const { school: slug } = await params;
  // Not found unless this person is active staff here, or on our team (spec 0004, AC-7).
  const { viewer, school, ctx } = await requireSchoolContext(slug);
  const current = await getCurrentTerm(ctx).catch((error: unknown) => {
    if (error instanceof NoCurrentTerm) return null;
    throw error;
  });
  const readOnly = viewer.viewingAsBy !== null;

  return (
    <>
      {readOnly && (
        <div role="status" className="border-b border-warning/30 bg-warning-wash">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
            <EyeIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
            <p className="flex-1 type-caption font-semibold sm:text-sm">
              You are viewing as {viewer.name}. Nothing can be saved.
            </p>
            <StopViewingButton />
          </div>
        </div>
      )}
      <AppBar
        school={{ name: school.name }}
        term={current ? termLabel(current.term.number, current.session.name) : "No current term set"}
        account={{
          name: viewer.name,
          detail: viewer.isTeam ? "VoxLMS team" : readOnly ? "Viewing as" : "Teacher",
          canSwitchSchool: !readOnly && viewer.schools.length > 1,
          readOnly,
        }}
      />
      {children}
    </>
  );
}

function ShellSkeleton() {
  return (
    <div aria-hidden="true" className="border-b border-rule bg-card">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Skeleton className="size-10" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </div>
  );
}
