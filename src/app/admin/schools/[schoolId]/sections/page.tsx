import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PenLineIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { headFix } from "../fix-copy";
import { ImageUpload } from "../image-upload";
import { SetupHeader } from "../setup-header";
import { SectionForm } from "./section-form";

export const metadata: Metadata = { title: "Sections" };

type Params = Promise<{ schoolId: string }>;

const STAGES = [
  { stage: "primary", name: "Primary", teacherTitle: "Class teacher" },
  { stage: "junior_secondary", name: "Junior Secondary", teacherTitle: "Form master" },
  { stage: "senior_secondary", name: "Senior Secondary", teacherTitle: "Form master" },
] as const;

export default function SectionsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Sections params={params} />
    </Suspense>
  );
}

async function Sections({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const { school, sections } = await getSchoolSetup(ctx);
  const detailsHref = `/admin/schools/${school.id}/details#principal`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Sections"
        intro="Add only the sections the school runs. Each has its own grading and teacher title. The principal signs every section’s report cards, unless you give a section its own head."
      />
      {STAGES.map((s) => {
        const existing = sections.find((x) => x.stage === s.stage);
        return (
          <section key={s.stage} aria-labelledby={`${s.stage}-heading`} className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-5 sm:p-8">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`${s.stage}-heading`} className="type-title">
                  {s.name}
                </h2>
                {!existing && <span className="type-caption text-muted-foreground">Not added</span>}
              </div>
              {/* Who signs this section's report cards (spec 0007, AC-5). */}
              {existing && (
                <p className="flex items-start gap-2 text-muted-foreground">
                  <PenLineIcon aria-hidden className="mt-1 size-4 shrink-0" />
                  {existing.headName ? (
                    <span>
                      Own head: <span className="font-bold text-foreground">{existing.headName}</span>, {existing.headTitle}
                    </span>
                  ) : school.principalName ? (
                    <span>
                      Signed by the principal:{" "}
                      <Link href={detailsHref} className="text-primary underline underline-offset-2">
                        {school.principalName}, {school.principalTitle}
                      </Link>
                    </span>
                  ) : (
                    <span>
                      Signed by the principal, who has no name yet.{" "}
                      <Link href={detailsHref} className="text-primary underline underline-offset-2">
                        Add the principal on School details
                      </Link>
                    </span>
                  )}
                </p>
              )}
            </div>
            <SectionForm
              schoolId={school.id}
              stage={s.stage}
              sectionName={s.name}
              sectionId={existing?.id ?? null}
              initial={{
                teacherTitle: existing?.teacherTitle ?? s.teacherTitle,
                headTitle: existing?.headTitle ?? "Head teacher",
                headName: existing?.headName ?? "",
              }}
            />
            {existing?.headName && (
              <div className="border-t border-rule pt-5">
                <ImageUpload
                  schoolId={school.id}
                  kind="signature"
                  owner={{ signer: "section", sectionId: existing.id }}
                  label={`${existing.headTitle}’s signature`}
                  currentUrl={existing.headSignatureAssetId ? `/admin/schools/${school.id}/images/${existing.headSignatureAssetId}` : null}
                  hint="Sign on plain white paper and take a photo. The paper becomes see-through. Never shown on the web."
                  confirmReplace={headFix(s.name, "signature")}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
