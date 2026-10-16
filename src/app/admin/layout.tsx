import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";

import { AccountMenu } from "@/components/account-menu";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireTeam } from "@/server/auth/viewer";

export const metadata: Metadata = { title: { template: "%s · VoxLMS team", default: "VoxLMS team" }, robots: { index: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="h-16 w-full rounded-none" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  // Our team only; anyone else gets "not found" (spec 0004, AC-9).
  const viewer = await requireTeam();
  return (
    <>
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3">
            <Logo className="h-6" />
          </Link>
          <span className="hidden type-caption font-semibold text-muted-foreground sm:inline">Team area</span>
          <div className="flex-1" />
          <AccountMenu name={viewer.name} detail="VoxLMS team" canSwitchSchool={false} readOnly={false} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </>
  );
}
