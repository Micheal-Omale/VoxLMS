import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

import { SchoolMark } from "@/components/app-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listSchoolsForTeam } from "@/server/auth/admin-data";
import { requireTeam } from "@/server/auth/viewer";

export default function AdminHome() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="type-display">Schools</h1>
          <p className="text-muted-foreground">Open a school to finish its setup or manage its teachers’ logins.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/admin/schools/new" />}>
          <PlusIcon data-icon="inline-start" />
          New school
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
        <SchoolList />
      </Suspense>
    </>
  );
}

async function SchoolList() {
  await requireTeam();
  const schools = await listSchoolsForTeam();
  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
      {schools.map((s) => (
        <li key={s.id} className="border-b border-rule last:border-b-0">
          <Link href={`/admin/schools/${s.id}`} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent">
            <SchoolMark name={s.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold">{s.name}</span>
              <span className="type-caption text-muted-foreground">
                <span className="type-figure">{s.logins}</span> of <span className="type-figure">{s.staff}</span> staff have a login
              </span>
            </span>
            <span className="hidden type-caption text-muted-foreground sm:inline">/{s.slug}</span>
            <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
