import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/server/auth/viewer";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:justify-center sm:py-16">
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <Logo className="h-7 self-start" />
        <div className="ruled-sheet rounded-xl border border-rule py-7 pr-5 pl-[calc(var(--margin-x)+1.25rem)] shadow-sm [--margin-x:1.5rem] sm:py-9 sm:pr-8 sm:pl-[calc(var(--margin-x)+2rem)] sm:[--margin-x:2rem]">
          <div className="mb-7 flex flex-col gap-1.5">
            <h1 className="type-title">Change password</h1>
            <p className="text-muted-foreground">Your other phones and computers will be signed out.</p>
          </div>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <Form />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Form() {
  const viewer = await requireViewer();
  const home = viewer.isTeam ? "/admin" : viewer.schools[0] ? `/${viewer.schools[0].slug}` : "/choose-school";
  return <ChangePasswordForm isTeam={viewer.isTeam} home={home} />;
}
