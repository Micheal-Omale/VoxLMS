import { Suspense } from "react";
import { ChevronRightIcon } from "lucide-react";

import { SchoolMark } from "@/components/app-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { listSchoolsForTeam } from "@/server/auth/admin-data";
import { requireTeam } from "@/server/auth/viewer";

export default function AdminHome() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="type-display">Schools</h1>
        <p className="text-muted-foreground">Open a school to manage its teachers’ logins.</p>
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
          <a href={`/admin/schools/${s.id}`} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent">
            <SchoolMark name={s.name} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-bold">{s.name}</span>
              <span className="type-caption text-muted-foreground">
                <span className="type-figure">{s.logins}</span> of <span className="type-figure">{s.staff}</span> staff have a login
              </span>
            </span>
            <span className="hidden type-caption text-muted-foreground sm:inline">/{s.slug}</span>
            <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </a>
        </li>
      ))}
    </ul>
  );
}
