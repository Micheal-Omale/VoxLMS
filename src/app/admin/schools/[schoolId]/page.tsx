import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNigerianPhone } from "@/lib/phone";
import { type LoginStatus, listStaffWithLogins } from "@/server/auth/admin-data";
import { requireTeam } from "@/server/auth/viewer";

import { StaffActions } from "./staff-actions";

type Params = Promise<{ schoolId: string }>;

const STATUS: Record<LoginStatus, { label: string; className: string }> = {
  none: { label: "No login", className: "border-border bg-transparent text-muted-foreground" },
  waiting: { label: "Waiting for password", className: "bg-warning-wash text-warning" },
  active: { label: "Active", className: "bg-success-wash text-success" },
  off: { label: "Switched off", className: "bg-destructive-wash text-destructive" },
};

const lagos = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Lagos" });

export default function SchoolStaffPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
      <StaffList params={params} />
    </Suspense>
  );
}

async function StaffList({ params }: { params: Params }) {
  const viewer = await requireTeam();
  const { schoolId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(schoolId)) notFound();
  const data = await listStaffWithLogins(schoolId);
  if (!data) notFound();

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          Schools
        </Button>
        <h1 className="type-display">{data.school.name}</h1>
        <p className="text-muted-foreground">Staff logins. Teachers choose their own passwords through a setup link.</p>
      </div>

      <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
        {data.staff.map((m) => (
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
              schoolId={data.school.id}
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
    </>
  );
}
