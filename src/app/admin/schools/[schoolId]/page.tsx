import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, CircleIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNigerianPhone } from "@/lib/phone";
import { termLabel } from "@/lib/term-label";
import { type LoginStatus, listStaffWithLogins } from "@/server/auth/admin-data";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { StaffActions } from "./staff-actions";

type Params = Promise<{ schoolId: string }>;

const STATUS: Record<LoginStatus, { label: string; className: string }> = {
  none: { label: "No login", className: "border-border bg-transparent text-muted-foreground" },
  waiting: { label: "Waiting for password", className: "bg-warning-wash text-warning" },
  active: { label: "Active", className: "bg-success-wash text-success" },
  off: { label: "Switched off", className: "bg-destructive-wash text-destructive" },
};

const lagos = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Lagos" });

export default function SchoolTeamPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SchoolOverview params={params} />
    </Suspense>
  );
}

async function SchoolOverview({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx, viewer } = await requireTeamSchoolContext(schoolId);
  const [setup, people] = await Promise.all([getSchoolSetup(ctx), listStaffWithLogins(schoolId)]);
  const { school, sections, sessions, currentTerm, checklist } = setup;
  const currentSession = sessions.find((s) => s.id === currentTerm?.sessionId);
  const missingSignatures = sections.filter((s) => !s.headSignatureAssetId || !s.headName).length;
  const base = `/admin/schools/${school.id}`;

  const items = [
    {
      title: "Details",
      href: `${base}/details`,
      done: checklist.details,
      status: `/${school.slug}, code ${school.code}, ${school.plan === "basic" ? "Basic plan" : "School logo plan"}`,
    },
    {
      title: "Logo",
      href: `${base}/details#logo`,
      done: checklist.logo,
      status: school.plan === "basic" ? "Not needed on the Basic plan" : school.logoAssetId ? "Uploaded" : "Not uploaded yet",
    },
    {
      title: "Sections",
      href: `${base}/sections`,
      done: checklist.sections,
      status:
        sections.length === 0
          ? "None added yet"
          : missingSignatures > 0
            ? `${sections.map((s) => s.name).join(", ")}. ${missingSignatures} still ${missingSignatures === 1 ? "needs" : "need"} a head’s name or signature.`
            : sections.map((s) => s.name).join(", "),
    },
    {
      title: "Session and terms",
      href: `${base}/terms`,
      done: checklist.terms,
      status: currentTerm && currentSession ? `${termLabel(currentTerm.number, currentSession.name)} is current` : "No current term yet",
    },
  ];
  const remaining = items.filter((i) => !i.done).length;

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          Schools
        </Button>
        <h1 className="type-display">{school.name}</h1>
        <p className="text-muted-foreground">
          {remaining === 0 ? "Setup is complete." : `${remaining} setup ${remaining === 1 ? "step" : "steps"} left.`}
        </p>
      </div>

      <section aria-labelledby="setup-heading" className="flex flex-col gap-3">
        <h2 id="setup-heading" className="type-heading">
          Setup
        </h2>
        <ol className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
          {items.map((item) => (
            <li key={item.title} className="border-b border-rule last:border-b-0">
              <Link href={item.href} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent">
                {item.done ? (
                  <CircleCheckIcon aria-label="Done" className="size-5 shrink-0 text-success" />
                ) : (
                  <CircleIcon aria-label="Not done" className="size-5 shrink-0 text-input" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{item.title}</span>
                  <span className="type-caption text-muted-foreground">{item.status}</span>
                </span>
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="staff-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="staff-heading" className="type-heading">
            Staff logins
          </h2>
          <p className="type-caption text-muted-foreground sm:text-sm">Teachers choose their own passwords through a setup link.</p>
        </div>
        {people && people.staff.length > 0 ? (
          <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
            {people.staff.map((m) => (
              <li key={m.staffId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-4 last:border-b-0">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-bold">{[m.title, m.fullName].filter(Boolean).join(" ")}</span>
                  <span className="type-caption text-muted-foreground">
                    <span className="type-figure">{formatNigerianPhone(m.phone)}</span>
                    {m.status === "left" ? ", has left the school" : ""}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <Badge className={STATUS[m.loginStatus].className}>{STATUS[m.loginStatus].label}</Badge>
                  <span className="type-caption text-muted-foreground">
                    {m.lastSignInAt ? `Last signed in ${lagos.format(m.lastSignInAt)}` : m.userId ? "Never signed in" : ""}
                  </span>
                </div>
                <StaffActions
                  schoolId={school.id}
                  staffId={m.staffId}
                  userId={m.userId}
                  name={[m.title, m.fullName].filter(Boolean).join(" ")}
                  loginStatus={m.loginStatus}
                  isSelf={m.userId === viewer.userId}
                  isTeam={m.isTeam}
                  active={m.status === "active"}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-input bg-card p-5 text-muted-foreground">
            No staff yet. Teachers are added by the next setup feature (enrol teachers and students).
          </p>
        )}
      </section>
    </>
  );
}
