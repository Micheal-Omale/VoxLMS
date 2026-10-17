import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { SchoolDetailsForm } from "../../school-details-form";
import { updateDetailsAction } from "../../setup-actions";
import { principalFix } from "../fix-copy";
import { ImageUpload } from "../image-upload";
import { SetupHeader } from "../setup-header";
import { PrincipalForm } from "./principal-form";

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
      <SetupHeader schoolId={school.id} schoolName={school.name} title="Details" intro="What the school is called, where it is, who signs its report cards, and how they are branded." />
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
      <section id="principal" aria-labelledby="principal-heading" className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-5 sm:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="principal-heading" className="type-heading">
            Principal
          </h2>
          <p className="type-caption text-muted-foreground">
            Signs the report cards of every section, unless a section has its own head (set on{" "}
            <Link href={`/admin/schools/${school.id}/sections`} className="text-primary underline underline-offset-2">
              Sections
            </Link>
            ).
          </p>
        </div>
        <PrincipalForm schoolId={school.id} initial={{ title: school.principalTitle, name: school.principalName ?? "" }} />
        <div className="border-t border-rule pt-5">
          <ImageUpload
            schoolId={school.id}
            kind="signature"
            owner={{ signer: "principal" }}
            label="Principal’s signature"
            currentUrl={school.principalSignatureAssetId ? `/admin/schools/${school.id}/images/${school.principalSignatureAssetId}` : null}
            hint="Sign on plain white paper and take a photo. The paper becomes see-through. Never shown on the web."
            confirmReplace={principalFix("signature")}
          />
        </div>
      </section>
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
