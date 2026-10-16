import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";

import { ImageUpload } from "../image-upload";
import { SetupHeader } from "../setup-header";
import { SectionForm } from "./section-form";

export const metadata: Metadata = { title: "Sections" };

type Params = Promise<{ schoolId: string }>;

const STAGES = [
  { stage: "primary", name: "Primary", teacherTitle: "Class teacher", headTitle: "Head teacher" },
  { stage: "junior_secondary", name: "Junior Secondary", teacherTitle: "Form master", headTitle: "Principal" },
  { stage: "senior_secondary", name: "Senior Secondary", teacherTitle: "Form master", headTitle: "Principal" },
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

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Sections"
        intro="Add only the sections the school runs. Each has its own grading, teacher title, and the head who signs its report cards."
      />
      {STAGES.map((s) => {
        const existing = sections.find((x) => x.stage === s.stage);
        return (
          <section key={s.stage} aria-labelledby={`${s.stage}-heading`} className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-5 sm:p-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`${s.stage}-heading`} className="type-title">
                {s.name}
              </h2>
              {!existing && <span className="type-caption text-muted-foreground">Not added</span>}
            </div>
            <SectionForm
              schoolId={school.id}
              stage={s.stage}
              sectionId={existing?.id ?? null}
              initial={{
                teacherTitle: existing?.teacherTitle ?? s.teacherTitle,
                headTitle: existing?.headTitle ?? s.headTitle,
                headName: existing?.headName ?? "",
              }}
            />
            {existing && (
              <ImageUpload
                schoolId={school.id}
                kind="signature"
                sectionId={existing.id}
                label={`${existing.headTitle}’s signature`}
                currentUrl={existing.headSignatureAssetId ? `/admin/schools/${school.id}/images/${existing.headSignatureAssetId}` : null}
                hint="Sign on plain white paper and take a photo. The paper becomes see-through. Never shown on the web."
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
