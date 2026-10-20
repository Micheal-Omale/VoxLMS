import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PrincipalDashboard } from "@/components/principal/principal-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolContext } from "@/server/auth/viewer";
import { getCurrentTerm, getPrincipalOverview, NoCurrentTerm } from "@/server/data";

export const metadata: Metadata = { title: "Principal Portal · Overview" };

type Params = Promise<{ school: string }>;

export default function PrincipalOverviewPage({ params }: { params: Params }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <Suspense fallback={<Skeleton className="h-96 rounded-2xl" />}>
        <PrincipalOverviewContent params={params} />
      </Suspense>
    </main>
  );
}

async function PrincipalOverviewContent({ params }: { params: Params }) {
  const { school: slug } = await params;
  const { ctx, viewer } = await requireSchoolContext(slug);

  const isLeadership = ctx.actor.kind === "principal" || viewer.isTeam;
  if (!isLeadership) {
    redirect(`/${slug}`);
  }

  const current = await getCurrentTerm(ctx).catch((error: unknown) => {
    if (error instanceof NoCurrentTerm) return null;
    throw error;
  });

  if (!current) {
    redirect(`/${slug}`);
  }

  const overview = await getPrincipalOverview(ctx);
  return <PrincipalDashboard data={overview} />;
}
