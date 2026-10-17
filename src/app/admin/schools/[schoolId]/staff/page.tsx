import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { UsersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNigerianPhone } from "@/lib/phone";
import { type LoginStatus, listStaffWithLogins } from "@/server/auth/admin-data";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";
import { listStaffClasses } from "@/server/data/staff";

import { SetupHeader } from "../setup-header";
import { AddTeacher } from "./add-teacher";
import { StaffActions } from "./staff-actions";

export const metadata: Metadata = { title: "Staff" };

type Params = Promise<{ schoolId: string }>;

const STATUS: Record<LoginStatus, { label: string; className: string }> = {
  none: { label: "No login", className: "border-border bg-transparent text-muted-foreground" },
  waiting: { label: "Waiting for password", className: "bg-warning-wash text-warning" },
  active: { label: "Active", className: "bg-success-wash text-success" },
  off: { label: "Switched off", className: "bg-destructive-wash text-destructive" },
};

const lagos = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Lagos" });

export default function StaffPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Staff params={params} />
    </Suspense>
  );
}

async function Staff({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx, viewer } = await requireTeamSchoolContext(schoolId);
  const [{ school }, people, headed] = await Promise.all([getSchoolSetup(ctx), listStaffWithLogins(schoolId), listStaffClasses(ctx)]);
  const members = people?.staff ?? [];
  const active = members.filter((m) => m.status === "active");
  const left = members.filter((m) => m.status === "left");
  const signedIn = active.filter((m) => m.loginStatus === "active").length;
  const classesOf = (staffId: string) => headed.classes.filter((c) => c.staffId === staffId).map((c) => c.name);
  /** "Form master of JSS 2 Gold · Class teacher of Primary 4": each section's own title. */
  const headsLine = (staffId: string) => {
    const mine = headed.classes.filter((c) => c.staffId === staffId);
    const titles = [...new Set(mine.map((c) => c.teacherTitle))];
    return titles.map((t) => `${t} of ${mine.filter((c) => c.teacherTitle === t).map((c) => c.name).join(", ")}`).join(" · ");
  };

  const row = (m: (typeof members)[number]) => {
    const classes = classesOf(m.staffId);
    return (
      <li key={m.staffId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-bold">{[m.title, m.fullName].filter(Boolean).join(" ")}</span>
          <span className="type-caption text-muted-foreground">
            <span className="type-figure">{formatNigerianPhone(m.phone)}</span>
            {m.status === "active" && headed.session && (
              <>
                {" · "}
                {classes.length > 0 ? (
                  <span className="text-foreground">{headsLine(m.staffId)}</span>
                ) : (
                  `No class in ${headed.session.name}`
                )}
              </>
            )}
          </span>
        </div>
        <div className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:col-start-2 sm:row-start-1 sm:flex-col sm:items-end">
          <Badge className={STATUS[m.loginStatus].className}>{STATUS[m.loginStatus].label}</Badge>
          <span className="type-caption text-muted-foreground">
            {m.lastSignInAt ? `Last signed in ${lagos.format(m.lastSignInAt)}` : m.userId ? "Never signed in" : ""}
          </span>
        </div>
        <div className="col-start-2 row-start-1 sm:col-start-3">
        <StaffActions
          schoolId={school.id}
          staffId={m.staffId}
          userId={m.userId}
          title={m.title}
          fullName={m.fullName}
          phone={m.phone}
          loginStatus={m.loginStatus}
          isSelf={m.userId === viewer.userId}
          isTeam={m.isTeam}
          active={m.status === "active"}
          classes={classes}
        />
        </div>
      </li>
    );
  };

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Staff"
        intro="Teachers sign in with their own phone number and choose their own password. Add a teacher here and hand them their setup link straight away, by QR code in person or on WhatsApp."
      />

      <section aria-labelledby="add-teacher" className="flex flex-col gap-4 rounded-xl border border-rule bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="add-teacher" className="type-title">
            Add a teacher
          </h2>
          <p className="type-caption text-muted-foreground sm:text-sm">
            Then make them form master of their class on the{" "}
            <Link href={`/admin/schools/${school.id}/students`} className="font-semibold text-primary underline-offset-4 hover:underline">
              Students
            </Link>{" "}
            page.
          </p>
        </div>
        <AddTeacher schoolId={school.id} />
      </section>

      <section aria-labelledby="staff-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="staff-heading" className="type-heading">
            Teachers
          </h2>
          {active.length > 0 && (
            <p className="type-caption text-muted-foreground">
              <span className="type-figure">{active.length}</span> active · <span className="type-figure">{signedIn}</span> signed in with their own password
            </p>
          )}
        </div>
        {active.length > 0 ? (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">{active.map(row)}</ul>
        ) : (
          <Empty className="border border-dashed border-input bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle className="type-heading">No teachers yet</EmptyTitle>
              <EmptyDescription>Add the first teacher above. They get a setup link to choose their own password.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>

      {left.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="cursor-pointer type-label text-muted-foreground underline-offset-4 hover:underline">
            Left the school (<span className="type-figure">{left.length}</span>)
          </summary>
          <ul className="mt-3 flex flex-col overflow-hidden rounded-xl border border-rule bg-card">{left.map(row)}</ul>
        </details>
      )}
    </>
  );
}
