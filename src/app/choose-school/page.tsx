import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronRightIcon } from "lucide-react";

import { SchoolMark } from "@/components/app-bar";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { chooseSchoolAction } from "@/server/auth/actions";
import { requireViewer } from "@/server/auth/viewer";

export const metadata: Metadata = { title: "Choose a school" };

export default function ChooseSchoolPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:justify-center sm:py-16">
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <Logo className="h-7 self-start" />
        <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
          <SchoolList />
        </Suspense>
      </div>
    </main>
  );
}

async function SchoolList() {
  const viewer = await requireViewer();
  if (viewer.schools.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-rule bg-card p-6">
        <h1 className="type-title">You’re not linked to a school</h1>
        <p className="text-muted-foreground">
          Your login works, but no school has you as active staff right now. Message the VoxLMS team from your
          registered phone if this is a mistake.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="type-title">Which school today?</h1>
        <p className="text-muted-foreground">You teach at more than one. You can switch any time from your account menu.</p>
      </div>
      <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
        {viewer.schools.map((s) => (
          <li key={s.schoolId} className="border-b border-rule last:border-b-0">
            <form action={chooseSchoolAction.bind(null, s.slug)}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-accent"
              >
                <SchoolMark name={s.name} />
                <span className="flex-1 font-bold">{s.name}</span>
                <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
