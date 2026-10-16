import { Suspense } from "react";
import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { auth } from "@/server/auth/auth";
import { readSetupLink } from "@/server/auth/service";

import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Choose your password", robots: { index: false, follow: false } };

type Params = Promise<{ token: string }>;

export default function SetupPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:justify-center sm:py-16">
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <Logo className="h-7 self-start" />
        <div className="ruled-sheet rounded-xl border border-rule py-7 pr-5 pl-[calc(var(--margin-x)+1.25rem)] shadow-sm [--margin-x:1.5rem] sm:py-9 sm:pr-8 sm:pl-[calc(var(--margin-x)+2rem)] sm:[--margin-x:2rem]">
          <Suspense fallback={<SetupSkeleton />}>
            <SetupContent params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SetupContent({ params }: { params: Params }) {
  const { token } = await params;
  // Reading the link changes nothing; only saving a password uses it up.
  const link = await readSetupLink({ auth, db }, token);
  if (!link.valid) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="type-title">This link doesn’t work any more</h1>
        <p className="text-muted-foreground">
          It was already used, has expired, or a newer link was sent. Ask the VoxLMS team for a new one, from your
          registered phone.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="mb-7 flex flex-col gap-1.5">
        <h1 className="type-title">Welcome, {link.name.split(" ").slice(-2).join(" ")}</h1>
        <p className="text-muted-foreground">
          {link.schools.length > 0 ? `${link.schools.join(" and ")}. ` : ""}You’ll sign in with{" "}
          <span className="font-semibold text-foreground type-figure">{link.phone}</span> and the password you choose now.
        </p>
      </div>
      <SetupForm token={token} isTeam={link.isTeam} />
    </>
  );
}

function SetupSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
