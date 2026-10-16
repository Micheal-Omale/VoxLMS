import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { SchoolDetailsForm } from "../../school-details-form";
import { updateDetailsAction } from "../../setup-actions";
import { ImageUpload } from "../image-upload";
import { SetupHeader } from "../setup-header";

export const metadata: Metadata = { title: "School details" };

type Params = Promise<{ schoolId: string }>;

export default function DetailsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Details params={params} />
    </Suspense>
  );
}

async function Details({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const { school } = await getSchoolSetup(ctx);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SetupHeader schoolId={school.id} schoolName={school.name} title="Details" intro="What the school is called, where it is, and how its report cards are branded." />
      <div className="rounded-xl border border-rule bg-card p-5 sm:p-8">
        <SchoolDetailsForm
          mode="edit"
          action={updateDetailsAction.bind(null, school.id)}
          initial={{
            name: school.name,
            slug: school.slug,
            code: school.code,
            address: school.address,
            motto: school.motto ?? "",
            phone: school.phone ?? "",
            email: school.email ?? "",
            plan: school.plan,
            showAttendance: school.showAttendance,
          }}
        />
      </div>
      <section id="logo" aria-labelledby="logo-heading" className="flex flex-col gap-3 rounded-xl border border-rule bg-card p-5 sm:p-8">
        <h2 id="logo-heading" className="type-heading">
          Logo
        </h2>
        <ImageUpload
          schoolId={school.id}
          kind="logo"
          label="School logo"
          currentUrl={school.logoAssetId ? `/school-logo/${school.logoAssetId}` : null}
          hint={
            school.plan === "basic"
              ? "Only printed on the School logo plan. A clear photo or scan works; it is shrunk before upload."
              : "A clear photo or scan works; it is shrunk before upload."
          }
        />
      </section>
    </div>
  );
}
